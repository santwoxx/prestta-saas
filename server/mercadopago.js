'use strict';
/**
 * ---------------------------------------------------------------------------
 * Integracao Mercado Pago (Checkout Pro via API REST)
 * ---------------------------------------------------------------------------
 * Sem dependencia de SDK: usa fetch() nativo (Node 22+).
 *
 * Fluxo:
 *   1. O backend cria uma Preference (POST /checkout/preferences) com os
 *      dados do plano e do cliente, incluindo external_reference = tenant id.
 *   2. O usuario e redirecionado para o checkout do Mercado Pago.
 *   3. O MP envia um webhook (POST /api/webhooks/mercadopago) com o id do
 *      pagamento. O backend consulta GET /v1/payments/{id} para confirmar.
 *   4. O status do pagamento e traduzido para a acao do Prestta
 *      (ativar / suspender / cancelar / registrar).
 *
 * Variaveis de ambiente:
 *   MP_ACCESS_TOKEN        - Access Token de producao (obrigatorio)
 *   MP_WEBHOOK_SECRET      - Segredo do webhook (obrigatorio em producao)
 */
const crypto = require('node:crypto');
const plans = require('./plans');

const CFG = () => ({
  accessToken: process.env.MP_ACCESS_TOKEN || '',
  apiBase: 'https://api.mercadopago.com',
  secret: process.env.MP_WEBHOOK_SECRET || '',
  appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, ''),
});

const isConfigured = () => Boolean(CFG().accessToken);

/* ------------------------------------------------------------------ *
 * API generica
 * ------------------------------------------------------------------ */
/** Chamada HTTP ao Mercado Pago. Nunca lanca: retorna null em caso de falha. */
async function apiRequest(method, endpoint, body) {
  const cfg = CFG();
  if (!cfg.accessToken) return null;
  const url = `${cfg.apiBase}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${cfg.accessToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* resposta nao-JSON */ }
    if (!res.ok) {
      console.warn(`[mercadopago] ${method} ${endpoint} -> ${res.status}`, text.slice(0, 300));
      return null;
    }
    return json;
  } catch (err) {
    console.warn('[mercadopago] falha na chamada de API:', err.message);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Checkout (Preferences)
 * ------------------------------------------------------------------ */
/**
 * Cria uma Preference no Mercado Pago (Checkout Pro).
 * Retorna { url, id, raw } ou null se falhar.
 */
async function createPreference({ planId, cycle, tenant, user }) {
  const cfg = CFG();
  if (!cfg.accessToken) return null;

  const plan = plans.byId(planId);
  if (!plan) return null;

  const amount = plans.amountFor(planId, cycle);
  const unitPrice = amount / 100; // MP trabalha em reais, nao centavos

  const body = {
    items: [{
      id: `${planId}_${cycle}`,
      title: `Prestta ${plan.name} (${cycle})`,
      description: `Plano ${plan.name} - cobrança ${cycle}`,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: unitPrice,
    }],
    payer: {
      name: user?.name || tenant.name || '',
      email: user?.email || tenant.email || '',
      ...(tenant.doc ? {
        identification: {
          type: tenant.doc.replace(/\D/g, '').length <= 11 ? 'CPF' : 'CNPJ',
          number: tenant.doc.replace(/\D/g, ''),
        },
      } : {}),
    },
    external_reference: tenant.id,
    metadata: {
      tenant_id: tenant.id,
      plan_id: planId,
      cycle,
    },
    back_urls: {
      success: `${cfg.appUrl}/app.html#assinatura?status=sucesso`,
      failure: `${cfg.appUrl}/app.html#assinatura?status=falhou`,
      pending: `${cfg.appUrl}/app.html#assinatura?status=pendente`,
    },
    auto_return: 'approved',
    notification_url: `${cfg.appUrl}/api/webhooks/mercadopago`,
    statement_descriptor: 'PRESTTA',
    expires: false,
  };

  const data = await apiRequest('POST', '/checkout/preferences', body);
  if (!data) return null;

  // init_point = URL de producao; sandbox_init_point = URL de testes
  const url = data.init_point || data.sandbox_init_point;
  return url ? { url, id: data.id, raw: data } : null;
}

/* ------------------------------------------------------------------ *
 * Consulta de pagamento
 * ------------------------------------------------------------------ */
/** Busca os dados completos de um pagamento. */
async function getPayment(paymentId) {
  return apiRequest('GET', `/v1/payments/${paymentId}`);
}

/* ------------------------------------------------------------------ *
 * Webhook
 * ------------------------------------------------------------------ */
/**
 * Valida o webhook do Mercado Pago.
 *
 * O MP envia os headers:
 *   x-signature: ts=...,v1=...
 *   x-request-id: ...
 *
 * A validacao usa HMAC-SHA256 sobre:
 *   id:{data.id};request-id:{x-request-id};ts:{ts};
 */
function verifyWebhook(req) {
  const expected = CFG().secret;
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, verified: false, reason: 'MP_WEBHOOK_SECRET nao configurado' };
    }
    return { ok: true, verified: false, reason: 'MP_WEBHOOK_SECRET nao configurado (dev mode)' };
  }

  const xSignature = req.headers['x-signature'] || '';
  const xRequestId = req.headers['x-request-id'] || '';
  const dataId = req.query?.['data.id'] || req.body?.data?.id || '';

  if (!xSignature) {
    // Fallback: alguns webhooks mais simples nao enviam x-signature.
    // Nesse caso, verificamos se ha um query param 'secret' ou header custom.
    const candidates = [
      req.query?.secret,
      req.headers['x-webhook-secret'],
      (req.headers.authorization || '').replace(/^Bearer\s+/i, ''),
    ].filter(Boolean).map(String);

    for (const value of candidates) {
      if (safeEqual(value, expected)) return { ok: true, verified: true };
    }
    return { ok: false, verified: false, reason: 'assinatura ausente' };
  }

  // Parse x-signature: "ts=1234567890,v1=abcdef..."
  const parts = {};
  for (const part of xSignature.split(',')) {
    const [key, ...rest] = part.split('=');
    parts[key.trim()] = rest.join('=').trim();
  }

  const ts = parts.ts || '';
  const v1 = parts.v1 || '';

  if (!ts || !v1) {
    return { ok: false, verified: false, reason: 'x-signature incompleto' };
  }

  // Template de validacao do MP:
  // "id:{data.id};request-id:{x-request-id};ts:{ts};"
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const hmac = crypto.createHmac('sha256', expected).update(manifest).digest('hex');

  if (safeEqual(hmac, v1)) {
    return { ok: true, verified: true };
  }

  return { ok: false, verified: false, reason: 'assinatura HMAC invalida' };
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

/* ------------------------------------------------------------------ *
 * Normalizacao de evento
 * ------------------------------------------------------------------ */
const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '') ?? null;

/**
 * Normaliza o payload de um pagamento do MP para formato interno.
 * Recebe o objeto de pagamento retornado por GET /v1/payments/{id}.
 */
function normalizePayment(payment = {}) {
  const payer = payment.payer || {};
  const meta = payment.metadata || {};

  return {
    event: payment.status || 'unknown',
    action: mapAction(payment.status, payment.status_detail),
    externalId: String(payment.id || ''),
    subscriptionId: null,
    reference: pick(payment.external_reference, meta.tenant_id),
    email: pick(payer.email, payer.identification?.number)?.toLowerCase() || null,
    name: pick(payer.first_name, payer.last_name)
      ? `${payer.first_name || ''} ${payer.last_name || ''}`.trim()
      : null,
    phone: payer.phone?.number || null,
    amount: toCents(payment.transaction_amount),
    offerRef: pick(meta.plan_id, payment.additional_info?.items?.[0]?.id),
    offerName: payment.additional_info?.items?.[0]?.title || payment.description || null,
    cycle: meta.cycle || guessCycle(payment.description),
    periodEnd: null, // MP nao envia data de proxima cobranca em pagamentos avulsos
    raw: payment,
  };
}

function toCents(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100); // MP envia em reais
}

function guessCycle(v) {
  const s = String(v || '').toLowerCase();
  if (/(ano|anual|year|annual|12)/.test(s)) return 'anual';
  return 'mensal';
}

/**
 * Traduz o status do MP para a acao do Prestta.
 * https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/payment-status
 */
function mapAction(status, statusDetail) {
  const s = `${status || ''} ${statusDetail || ''}`.toLowerCase();

  // Pagamento aprovado
  if (/(approved|accredited)/.test(s)) return 'ativar';

  // Reembolso / chargeback / cancelado
  if (/(refunded|charged_back|cancelled)/.test(s)) return 'cancelar';

  // Rejeitado / falhou
  if (/(rejected|cc_rejected|declined|failed)/.test(s)) return 'suspender';

  // Pendente / em processamento
  if (/(pending|in_process|in_mediation|authorized)/.test(s)) return 'registrar';

  return 'registrar';
}

/**
 * Descobre o plano a partir da metadata ou do item do pagamento.
 */
function planFromPayment(payment = {}) {
  const meta = payment.metadata || {};
  if (meta.plan_id && plans.byId(meta.plan_id)) return meta.plan_id;

  // Tenta via item
  const items = payment.additional_info?.items || [];
  for (const item of items) {
    const id = (item.id || '').toLowerCase();
    for (const p of plans.PLANS) {
      if (id.includes(p.id)) return p.id;
    }
    const title = (item.title || '').toLowerCase();
    for (const p of plans.PLANS) {
      if (title.includes(p.id) || title.includes(p.name.toLowerCase())) return p.id;
    }
  }

  // Tenta na description
  const desc = (payment.description || '').toLowerCase();
  for (const p of plans.PLANS) {
    if (desc.includes(p.id) || desc.includes(p.name.toLowerCase())) return p.id;
  }

  return null;
}

module.exports = {
  isConfigured, createPreference, getPayment, apiRequest,
  verifyWebhook, normalizePayment, planFromPayment, mapAction, CFG,
};

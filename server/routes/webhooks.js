'use strict';
const express = require('express');
const { all, get, insert, update } = require('../db');
const U = require('../util');
const cakto = require('../cakto');
const plans = require('../plans');

const router = express.Router();
const { wrap, uid, nowISO } = U;

/**
 * ---------------------------------------------------------------------------
 * POST /api/webhooks/cakto
 * ---------------------------------------------------------------------------
 * Configure esta URL no painel da Cakto (Ferramentas -> Webhooks):
 *   https://SEU-DOMINIO/api/webhooks/cakto
 *
 * Sempre respondemos 200 quando o payload e valido - mesmo para eventos que
 * nao sabemos tratar - para a Cakto nao ficar reenviando indefinidamente.
 * Tudo fica registrado em `webhook_events` e visivel no painel do SaaS.
 */
router.post('/webhooks/cakto', wrap(async (req, res) => {
  const payload = req.body || {};
  const check = cakto.verifyWebhook(req);

  const eventId = uid('wh');
  const evt = cakto.normalizeEvent(payload);

  const record = {
    id: eventId,
    provider: 'cakto',
    event: evt.event || 'desconhecido',
    external_id: evt.externalId || null,
    tenant_id: null,
    status: 'recebido',
    detail: null,
    payload: JSON.stringify(payload).slice(0, 20000),
    created_at: nowISO(),
  };

  if (!check.ok) {
    record.status = 'erro';
    record.detail = 'Assinatura do webhook invalida.';
    insert('webhook_events', record);
    return res.status(401).json({ error: 'assinatura invalida' });
  }

  // Idempotencia: mesma transacao + mesmo evento nao processa duas vezes.
  if (evt.externalId) {
    const dup = get(
      "SELECT id FROM webhook_events WHERE provider='cakto' AND external_id=? AND event=? AND status='processado'",
      [evt.externalId, record.event],
    );
    if (dup) {
      record.status = 'ignorado';
      record.detail = 'Evento duplicado (ja processado).';
      insert('webhook_events', record);
      return res.json({ ok: true, duplicated: true });
    }
  }

  const tenant = findTenant(evt);
  record.tenant_id = tenant?.id || null;

  if (!tenant) {
    record.status = 'ignorado';
    record.detail = `Nao foi possivel identificar a conta (ref=${evt.reference || '-'}, email=${evt.email || '-'}).`;
    insert('webhook_events', record);
    return res.json({ ok: true, matched: false });
  }

  try {
    const detail = applyEvent(tenant, evt, check.verified);
    record.status = 'processado';
    record.detail = detail;
  } catch (err) {
    record.status = 'erro';
    record.detail = err.message;
  }
  insert('webhook_events', record);

  res.json({ ok: true, tenant: tenant.id, action: evt.action, detail: record.detail });
}));

/** Casa o pagamento com a conta: external_reference -> e-mail do dono. */
function findTenant(evt) {
  if (evt.reference) {
    const byRef = get('SELECT * FROM tenants WHERE id=?', [evt.reference]);
    if (byRef) return byRef;
  }
  if (evt.email) {
    const owner = get(
      "SELECT tenant_id FROM users WHERE email=? AND role IN ('dono','admin') AND tenant_id IS NOT NULL ORDER BY role='dono' DESC LIMIT 1",
      [evt.email],
    );
    if (owner?.tenant_id) return get('SELECT * FROM tenants WHERE id=?', [owner.tenant_id]);
    const byTenantEmail = get('SELECT * FROM tenants WHERE email=? LIMIT 1', [evt.email]);
    if (byTenantEmail) return byTenantEmail;
  }
  return null;
}

/** Aplica o efeito do evento na assinatura do tenant. */
function applyEvent(tenant, evt, verified) {
  const planId = cakto.planFromOffer(evt.offerRef) || tenant.plan;
  const cycle = evt.cycle || tenant.cycle || 'mensal';
  const now = nowISO();

  // Reaproveita a assinatura pendente criada no checkout, se existir.
  const existing = get(
    "SELECT * FROM subscriptions WHERE tenant_id=? AND (provider_ref=? OR status='pendente') ORDER BY created_at DESC LIMIT 1",
    [tenant.id, evt.externalId || ''],
  );

  const statusMap = { ativar: 'ativa', suspender: 'atrasada', cancelar: 'cancelada', registrar: 'pendente' };
  const subStatus = statusMap[evt.action] || 'pendente';

  const periodEnd = evt.periodEnd
    ? new Date(evt.periodEnd).toISOString()
    : (evt.action === 'ativar'
      ? U.addDays(new Date(), cycle === 'anual' ? 365 : 30).toISOString()
      : null);

  const data = {
    provider_ref: evt.externalId || existing?.provider_ref || null,
    plan: planId,
    cycle,
    amount: evt.amount || plans.amountFor(planId, cycle),
    status: subStatus,
    customer_email: evt.email || existing?.customer_email || tenant.email,
    period_end: periodEnd,
    raw: JSON.stringify(evt.raw).slice(0, 20000),
    updated_at: now,
  };

  if (existing) {
    update('subscriptions', existing.id, data, tenant.id);
  } else {
    insert('subscriptions', {
      id: uid('sub'), tenant_id: tenant.id, provider: 'cakto',
      checkout_url: null, created_at: now, ...data,
    });
  }

  const tenantStatus = {
    ativar: 'ativo', suspender: 'atrasado', cancelar: 'cancelado',
  }[evt.action];

  if (tenantStatus) {
    update('tenants', tenant.id, {
      status: tenantStatus,
      plan: planId,
      cycle,
      ...(evt.action === 'ativar' ? { trial_ends_at: null } : {}),
    });
  }

  return `${evt.event} -> ${evt.action} (plano ${planId}/${cycle}${verified ? '' : ', SEM validacao de segredo'})`;
}

/**
 * Endpoint de teste: simula um evento da Cakto sem depender do painel deles.
 * Fica disponivel apenas fora de producao ou para o superadmin.
 */
router.post('/webhooks/cakto/simular', wrap(async (req, res) => {
  const isSuper = req.user?.role === 'superadmin';
  if (process.env.NODE_ENV === 'production' && !isSuper) {
    return res.status(403).json({ error: 'Disponivel apenas para o administrador do SaaS.' });
  }
  const body = {
    secret: process.env.CAKTO_WEBHOOK_SECRET || undefined,
    event: req.body?.event || 'purchase_approved',
    data: {
      id: req.body?.id || `sim_${uid()}`,
      amount: req.body?.amount ?? 189,
      status: req.body?.status || 'paid',
      external_reference: req.body?.tenant_id,
      customer: { email: req.body?.email, name: 'Simulacao Cakto' },
      offer: { id: req.body?.offer || req.body?.plan || 'pro', name: req.body?.plan || 'pro' },
      interval: req.body?.cycle || 'mensal',
    },
  };
  const fake = { body, headers: {}, query: {}, rawBody: JSON.stringify(body) };
  const evt = cakto.normalizeEvent(body);
  const tenant = findTenant(evt);
  if (!tenant) return res.status(404).json({ error: 'Conta nao encontrada para simulacao.' });

  const detail = applyEvent(tenant, evt, cakto.verifyWebhook(fake).verified);
  insert('webhook_events', {
    id: uid('wh'), provider: 'cakto', event: evt.event, external_id: evt.externalId,
    tenant_id: tenant.id, status: 'processado', detail: `[simulado] ${detail}`,
    payload: JSON.stringify(body), created_at: nowISO(),
  });
  res.json({ ok: true, detail, tenant: tenant.id });
}));

module.exports = { router };

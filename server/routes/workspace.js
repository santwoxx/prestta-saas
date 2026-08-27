'use strict';
const express = require('express');
const { all, get, insert, update } = require('../db');
const U = require('../util');
const plans = require('../plans');
const cakto = require('../cakto');
const authLib = require('../auth');
const calc = require('../calc');

const router = express.Router();
const { wrap, uid, nowISO, clean, bad, forbidden } = U;

function assertOwner(req) {
  if (!['dono', 'admin', 'superadmin'].includes(req.user.role)) {
    throw forbidden('Apenas o administrador da conta pode alterar estas configuracoes.');
  }
}

/* ------------------------------------------------------------------ *
 * Dados e preferencias da empresa
 * ------------------------------------------------------------------ */
router.get('/workspace', wrap(async (req, res) => {
  const t = req.tenant;
  res.json({
    tenant: { ...t, settings: calc.safeParse(t.settings, {}) },
    plan: plans.byId(t.plan),
    trial_days_left: t.status === 'trial' && t.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(t.trial_ends_at) - Date.now()) / 864e5))
      : null,
    usage: {
      users: get('SELECT COUNT(*) AS n FROM users WHERE tenant_id=? AND active=1', [t.id])?.n || 0,
      orders_month: get(
        'SELECT COUNT(*) AS n FROM orders WHERE tenant_id=? AND created_at>=?',
        [t.id, U.monthRange()[0]],
      )?.n || 0,
    },
  });
}));

router.patch('/workspace', wrap(async (req, res) => {
  assertOwner(req);
  const b = req.body || {};
  const data = {};
  const text = { name: 140, doc: 24, phone: 20, email: 160, city: 80, uf: 2, segment: 60 };
  for (const [k, max] of Object.entries(text)) if (b[k] !== undefined) data[k] = clean(b[k], max);

  if (b.settings && typeof b.settings === 'object') {
    const current = calc.safeParse(req.tenant.settings, {});
    const merged = { ...current };
    const flags = ['require_client_signature', 'require_before_photo', 'require_after_photo', 'ask_rating'];
    for (const f of flags) if (b.settings[f] !== undefined) merged[f] = !!b.settings[f];
    if (b.settings.default_commission_pct !== undefined) merged.default_commission_pct = U.pct(b.settings.default_commission_pct);
    if (b.settings.service_types !== undefined && Array.isArray(b.settings.service_types)) {
      merged.service_types = b.settings.service_types.map((s) => clean(s, 40)).filter(Boolean).slice(0, 30);
    }
    if (b.settings.checklist_template !== undefined && Array.isArray(b.settings.checklist_template)) {
      merged.checklist_template = b.settings.checklist_template.map((s) => clean(s, 80)).filter(Boolean).slice(0, 20);
    }
    if (b.settings.receipt_message !== undefined) merged.receipt_message = clean(b.settings.receipt_message, 300);
    data.settings = JSON.stringify(merged);
  }

  update('tenants', req.tenant.id, data);
  const t = get('SELECT * FROM tenants WHERE id=?', [req.tenant.id]);
  res.json({ tenant: { ...t, settings: calc.safeParse(t.settings, {}) } });
}));

/* ================================================================== *
 * ASSINATURA (Cakto)
 * ================================================================== */
router.get('/subscription', wrap(async (req, res) => {
  const t = req.tenant;
  const sub = get(
    'SELECT * FROM subscriptions WHERE tenant_id=? ORDER BY created_at DESC LIMIT 1',
    [t.id],
  );
  res.json({
    status: t.status,
    plan: plans.byId(t.plan),
    cycle: t.cycle,
    trial_ends_at: t.trial_ends_at,
    trial_days_left: t.status === 'trial' && t.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(t.trial_ends_at) - Date.now()) / 864e5))
      : null,
    grace: authLib.graceInfo(t),
    subscription: sub ? { ...sub, raw: undefined } : null,
    plans: plans.PLANS,
    integration: {
      provider: 'cakto',
      api: cakto.isConfigured(),
      links: Object.fromEntries(plans.PLANS.map((p) => [
        p.id,
        { mensal: !!cakto.offerLink(p.id, 'mensal'), anual: !!cakto.offerLink(p.id, 'anual') },
      ])),
    },
    history: all(
      'SELECT id, plan, cycle, amount, status, created_at FROM subscriptions WHERE tenant_id=? ORDER BY created_at DESC LIMIT 12',
      [t.id],
    ),
  });
}));

/**
 * Gera o checkout do plano escolhido.
 * 1) tenta a API da Cakto (se houver CAKTO_API_KEY);
 * 2) cai para o link de checkout configurado no .env.
 */
router.post('/subscription/checkout', wrap(async (req, res) => {
  assertOwner(req);
  const t = req.tenant;
  const planId = plans.byId(req.body?.plan)?.id;
  if (!planId) throw bad('Escolha um plano valido.');
  const cycle = req.body?.cycle === 'anual' ? 'anual' : 'mensal';

  let url = null;
  let ref = null;

  const viaApi = await cakto.createCheckoutViaApi({ planId, cycle, tenant: t, user: req.user });
  if (viaApi) { url = viaApi.url; ref = viaApi.ref; }
  if (!url) url = cakto.buildCheckoutUrl({ planId, cycle, tenant: t, user: req.user });

  if (!url) {
    throw bad(
      'O checkout da Cakto ainda nao foi configurado. Cole o link da oferta em '
      + `CAKTO_CHECKOUT_${planId.toUpperCase()}_${cycle.toUpperCase()} no arquivo .env.`,
      { missing_config: true },
    );
  }

  const id = uid('sub');
  insert('subscriptions', {
    id,
    tenant_id: t.id,
    provider: 'cakto',
    provider_ref: ref,
    plan: planId,
    cycle,
    amount: plans.amountFor(planId, cycle),
    status: 'pendente',
    checkout_url: url,
    customer_email: req.user.email,
    created_at: nowISO(),
    updated_at: nowISO(),
  });

  // Guarda a intencao: o webhook confirma e ativa.
  update('tenants', t.id, { plan: planId, cycle });

  res.json({ ok: true, checkout_url: url, subscription_id: id, plan: plans.byId(planId), cycle });
}));

router.post('/subscription/cancel', wrap(async (req, res) => {
  assertOwner(req);
  update('tenants', req.tenant.id, { status: 'cancelado' });
  const sub = get('SELECT id FROM subscriptions WHERE tenant_id=? ORDER BY created_at DESC LIMIT 1', [req.tenant.id]);
  if (sub) update('subscriptions', sub.id, { status: 'cancelada', updated_at: nowISO() }, req.tenant.id);
  res.json({ ok: true, message: 'Assinatura cancelada. Voce pode reativar quando quiser.' });
}));

module.exports = { router };

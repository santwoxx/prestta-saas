'use strict';
const express = require('express');
const { all, get, update, run } = require('../db');
const U = require('../util');
const auth = require('../auth');
const plans = require('../plans');

const router = express.Router();
const { wrap, nowISO, clean, notFound, bad } = U;

/* ------------------------------------------------------------------ *
 * Painel do dono do SaaS
 * ------------------------------------------------------------------ */
router.get('/saas/overview', wrap(async (_req, res) => {
  const tenants = get(`
    SELECT COUNT(*) AS total,
           SUM(status = 'trial')     AS trial,
           SUM(status = 'ativo')     AS ativos,
           SUM(status = 'atrasado')  AS atrasados,
           SUM(status = 'cancelado') AS cancelados
      FROM tenants`) || {};

  // MRR: normaliza o ciclo anual para valor mensal.
  const ativos = all("SELECT plan, cycle FROM tenants WHERE status = 'ativo'");
  const mrr = ativos.reduce((sum, t) => {
    const p = plans.byId(t.plan);
    if (!p) return sum;
    return sum + (t.cycle === 'anual' ? p.price_anual : p.price_mensal);
  }, 0);

  const leads = get(`
    SELECT COUNT(*) AS total,
           SUM(stage = 'novo') AS novos,
           SUM(stage = 'convertido') AS convertidos
      FROM leads`) || {};

  const serie = [];
  for (let i = 5; i >= 0; i--) {
    const ref = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    const [s, e] = U.monthRange(ref);
    serie.push({
      mes: ref.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      contas: get('SELECT COUNT(*) AS n FROM tenants WHERE created_at >= ? AND created_at < ?', [s, e]).n,
      leads: get('SELECT COUNT(*) AS n FROM leads WHERE created_at >= ? AND created_at < ?', [s, e]).n,
    });
  }

  const uso = get(`
    SELECT (SELECT COUNT(*) FROM orders) AS ordens,
           (SELECT COUNT(*) FROM order_signatures) AS assinaturas,
           (SELECT COUNT(*) FROM order_photos) AS fotos,
           (SELECT COUNT(*) FROM users WHERE role != 'superadmin') AS usuarios`);

  res.json({
    tenants: {
      total: tenants.total || 0, trial: tenants.trial || 0, ativos: tenants.ativos || 0,
      atrasados: tenants.atrasados || 0, cancelados: tenants.cancelados || 0,
    },
    receita: { mrr, arr: mrr * 12, ticket_medio: ativos.length ? Math.round(mrr / ativos.length) : 0 },
    leads: { total: leads.total || 0, novos: leads.novos || 0, convertidos: leads.convertidos || 0,
      conversao: leads.total ? Math.round(((leads.convertidos || 0) / leads.total) * 100) : 0 },
    uso,
    serie,
    webhooks_recentes: all('SELECT id, event, status, detail, tenant_id, created_at FROM webhook_events ORDER BY created_at DESC LIMIT 15'),
  });
}));

/* ------------------------------------------------------------------ *
 * Contas (tenants)
 * ------------------------------------------------------------------ */
router.get('/saas/tenants', wrap(async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status && req.query.status !== 'todos') { where.push('t.status = ?'); params.push(req.query.status); }
  if (req.query.q) {
    where.push('(t.name LIKE ? OR t.email LIKE ?)');
    const like = `%${clean(req.query.q, 60)}%`;
    params.push(like, like);
  }
  const sql = `
    SELECT t.*,
           (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.active = 1) AS usuarios,
           (SELECT COUNT(*) FROM orders o WHERE o.tenant_id = t.id) AS ordens,
           (SELECT name FROM users u WHERE u.tenant_id = t.id AND u.role = 'dono' LIMIT 1) AS dono,
           (SELECT email FROM users u WHERE u.tenant_id = t.id AND u.role = 'dono' LIMIT 1) AS dono_email,
           (SELECT MAX(last_login) FROM users u WHERE u.tenant_id = t.id) AS ultimo_acesso
      FROM tenants t
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY t.created_at DESC LIMIT 200`;
  res.json({ tenants: all(sql, params), plans: plans.PLANS });
}));

router.patch('/saas/tenants/:id', wrap(async (req, res) => {
  const t = get('SELECT * FROM tenants WHERE id=?', [req.params.id]);
  if (!t) throw notFound('Conta nao encontrada.');
  const data = {};
  if (req.body?.status) {
    if (!['trial', 'ativo', 'atrasado', 'cancelado'].includes(req.body.status)) throw bad('Status invalido.');
    data.status = req.body.status;
  }
  if (req.body?.plan && plans.byId(req.body.plan)) data.plan = req.body.plan;
  if (req.body?.extend_trial_days) {
    const base = t.trial_ends_at && new Date(t.trial_ends_at) > new Date() ? new Date(t.trial_ends_at) : new Date();
    data.trial_ends_at = U.addDays(base, U.int(req.body.extend_trial_days, 7)).toISOString();
    data.status = 'trial';
  }
  update('tenants', t.id, data);
  res.json(get('SELECT * FROM tenants WHERE id=?', [t.id]));
}));

/** Suporte: entra na conta do cliente como o dono (auditado no log do servidor). */
router.post('/saas/tenants/:id/acessar', wrap(async (req, res) => {
  const owner = get("SELECT * FROM users WHERE tenant_id=? AND role='dono' LIMIT 1", [req.params.id]);
  if (!owner) throw notFound('Conta sem usuario dono.');
  console.log(`[saas] ${req.user.email} acessou a conta ${req.params.id} como ${owner.email}`);
  auth.setSession(res, owner);
  res.json({ ok: true, redirect: '/app.html' });
}));

/* ------------------------------------------------------------------ *
 * Leads do funil
 * ------------------------------------------------------------------ */
router.get('/saas/leads', wrap(async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.stage && req.query.stage !== 'todos') { where.push('stage = ?'); params.push(req.query.stage); }
  res.json({
    leads: all(`SELECT * FROM leads ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                ORDER BY created_at DESC LIMIT 300`, params),
  });
}));

router.patch('/saas/leads/:id', wrap(async (req, res) => {
  const data = {};
  if (req.body?.stage) data.stage = clean(req.body.stage, 20);
  if (req.body?.message !== undefined) data.message = clean(req.body.message, 800);
  update('leads', req.params.id, data);
  res.json(get('SELECT * FROM leads WHERE id=?', [req.params.id]));
}));

/* ------------------------------------------------------------------ *
 * Webhooks recebidos da Cakto
 * ------------------------------------------------------------------ */
router.get('/saas/webhooks', wrap(async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status && req.query.status !== 'todos') { where.push('status = ?'); params.push(req.query.status); }
  res.json({
    events: all(`SELECT * FROM webhook_events ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY created_at DESC LIMIT 100`, params),
    config: {
      url: `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '')}/api/webhooks/cakto`,
      secret_configurado: !!process.env.CAKTO_WEBHOOK_SECRET,
      api_configurada: !!process.env.CAKTO_API_KEY,
    },
  });
}));

module.exports = { router };

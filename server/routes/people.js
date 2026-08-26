'use strict';
const express = require('express');
const { all, get, insert, update, run } = require('../db');
const U = require('../util');
const authLib = require('../auth');
const plans = require('../plans');
const { revenueSQL } = require('../calc');

const router = express.Router();
const { wrap, uid, nowISO, clean, toCents, bad, notFound, forbidden } = U;

const isManager = (req) => ['dono', 'admin', 'superadmin'].includes(req.user.role);
function assertManager(req) {
  if (!isManager(req)) throw forbidden('Apenas o administrador pode fazer isso.');
}

/* ================================================================== *
 * CLIENTES / PARCEIROS (lojas)
 * ================================================================== */
function customerPayload(b) {
  const out = {};
  const text = {
    name: 140, doc: 24, contact: 120, phone: 20, email: 160, address: 200,
    district: 80, city: 80, uf: 2, zip: 12, payment_terms: 80, notes: 1000,
  };
  for (const [k, max] of Object.entries(text)) if (b[k] !== undefined) out[k] = clean(b[k], max);
  if (b.kind !== undefined) out.kind = b.kind === 'pf' ? 'pf' : 'pj';
  if (b.commission_pct !== undefined) out.commission_pct = U.pct(b.commission_pct);
  if (b.active !== undefined) out.active = b.active ? 1 : 0;
  return out;
}

router.get('/customers', wrap(async (req, res) => {
  const tid = req.user.tenant_id;
  const rows = all(`
    SELECT c.*,
           (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orders_count,
           (SELECT COALESCE(SUM(${revenueSQL('o')}), 0) FROM orders o
             WHERE o.customer_id = c.id AND o.status = 'concluida') AS revenue_total,
           (SELECT COALESCE(SUM(${revenueSQL('o')}), 0) FROM orders o
             WHERE o.customer_id = c.id AND o.received = 0 AND o.status != 'cancelada') AS open_amount
      FROM customers c
     WHERE c.tenant_id = ?
     ORDER BY c.active DESC, c.name`, [tid]);
  res.json({ customers: rows });
}));

router.post('/customers', wrap(async (req, res) => {
  assertManager(req);
  const data = customerPayload(req.body || {});
  if (!data.name) throw bad('Informe o nome do cliente ou da loja.');
  const id = uid('cli');
  insert('customers', {
    id, tenant_id: req.user.tenant_id, kind: 'pj', commission_pct: 0,
    active: 1, created_at: nowISO(), ...data,
  });
  res.status(201).json(get('SELECT * FROM customers WHERE id=?', [id]));
}));

router.patch('/customers/:id', wrap(async (req, res) => {
  assertManager(req);
  const data = customerPayload(req.body || {});
  const changed = update('customers', req.params.id, data, req.user.tenant_id);
  if (!changed) throw notFound('Cliente nao encontrado.');
  res.json(get('SELECT * FROM customers WHERE id=?', [req.params.id]));
}));

router.delete('/customers/:id', wrap(async (req, res) => {
  assertManager(req);
  const used = get('SELECT COUNT(*) AS n FROM orders WHERE customer_id=?', [req.params.id])?.n || 0;
  if (used) {
    update('customers', req.params.id, { active: 0 }, req.user.tenant_id);
    return res.json({ ok: true, archived: true, message: 'Cliente possui OS no historico e foi arquivado.' });
  }
  run('DELETE FROM customers WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
}));

/* ================================================================== *
 * EQUIPE (colaboradores em campo + administradores)
 * ================================================================== */
router.get('/team', wrap(async (req, res) => {
  const tid = req.user.tenant_id;
  const rows = all(`
    SELECT u.id, u.name, u.email, u.phone, u.doc, u.role, u.commission_pct, u.pay_mode,
           u.pay_fixed, u.skills, u.color, u.active, u.last_login, u.created_at,
           (SELECT COUNT(*) FROM orders o WHERE o.assignee_id = u.id AND o.status = 'concluida') AS done_count,
           (SELECT COUNT(*) FROM orders o WHERE o.assignee_id = u.id
             AND o.status IN ('pendente','agendada','em_andamento','pausada')) AS open_count,
           (SELECT COALESCE(SUM(o.assignee_pay), 0) FROM orders o
             WHERE o.assignee_id = u.id AND o.status = 'concluida' AND o.paid_assignee = 0) AS pending_pay,
           (SELECT COALESCE(AVG(o.rating), 0) FROM orders o
             WHERE o.assignee_id = u.id AND o.rating IS NOT NULL) AS avg_rating
      FROM users u
     WHERE u.tenant_id = ?
     ORDER BY u.active DESC, u.role = 'campo', u.name`, [tid]);
  res.json({ team: rows.map((u) => ({ ...u, active: !!u.active })), limit: plans.userLimit(req.tenant?.plan) });
}));

const PALETTE = ['#F2A63B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#06B6D4', '#F59E0B', '#EC4899'];

router.post('/team', wrap(async (req, res) => {
  assertManager(req);
  const tid = req.user.tenant_id;
  const b = req.body || {};
  const name = clean(b.name, 120);
  const email = clean(b.email, 160).toLowerCase();
  const password = String(b.password || '');

  if (!name) throw bad('Informe o nome do colaborador.');
  if (!U.isEmail(email)) throw bad('Informe um e-mail valido - e com ele que o colaborador acessa o app.');
  if (password.length < 6) throw bad('Defina uma senha de acesso com ao menos 6 caracteres.');
  if (get('SELECT id FROM users WHERE tenant_id=? AND email=?', [tid, email])) {
    throw bad('Ja existe um usuario com este e-mail na sua equipe.');
  }

  const limit = plans.userLimit(req.tenant?.plan);
  const active = get('SELECT COUNT(*) AS n FROM users WHERE tenant_id=? AND active=1', [tid])?.n || 0;
  if (active >= limit) {
    throw bad(`Seu plano permite ${limit} usuarios ativos. Faca upgrade para adicionar mais colaboradores.`, { upgrade: true });
  }

  const role = ['admin', 'campo'].includes(b.role) ? b.role : 'campo';
  const id = uid('u');
  insert('users', {
    id, tenant_id: tid, name, email,
    phone: U.digits(b.phone).slice(0, 15),
    doc: U.digits(b.doc).slice(0, 18),
    password_hash: authLib.hashPassword(password),
    role,
    commission_pct: U.pct(b.commission_pct),
    pay_mode: b.pay_mode === 'fixo' ? 'fixo' : 'pct',
    pay_fixed: toCents(b.pay_fixed),
    skills: clean(b.skills, 200),
    color: PALETTE[active % PALETTE.length],
    active: 1,
    created_at: nowISO(),
  });
  res.status(201).json(get('SELECT id,name,email,role,commission_pct,pay_mode,pay_fixed,color,active FROM users WHERE id=?', [id]));
}));

router.patch('/team/:id', wrap(async (req, res) => {
  const tid = req.user.tenant_id;
  const target = get('SELECT * FROM users WHERE id=? AND tenant_id=?', [req.params.id, tid]);
  if (!target) throw notFound('Colaborador nao encontrado.');
  // O proprio usuario pode editar seus dados; o resto exige gestor.
  if (target.id !== req.user.id) assertManager(req);

  const b = req.body || {};
  const data = {};
  if (b.name !== undefined) data.name = clean(b.name, 120);
  if (b.phone !== undefined) data.phone = U.digits(b.phone).slice(0, 15);
  if (b.doc !== undefined) data.doc = U.digits(b.doc).slice(0, 18);
  if (b.skills !== undefined) data.skills = clean(b.skills, 200);
  if (b.password) {
    if (String(b.password).length < 6) throw bad('A senha precisa ter ao menos 6 caracteres.');
    data.password_hash = authLib.hashPassword(b.password);
  }
  if (isManager(req)) {
    if (b.commission_pct !== undefined) data.commission_pct = U.pct(b.commission_pct);
    if (b.pay_mode !== undefined) data.pay_mode = b.pay_mode === 'fixo' ? 'fixo' : 'pct';
    if (b.pay_fixed !== undefined) data.pay_fixed = toCents(b.pay_fixed);
    if (b.color !== undefined) data.color = clean(b.color, 9);
    if (b.role !== undefined && target.role !== 'dono') {
      data.role = ['admin', 'campo'].includes(b.role) ? b.role : target.role;
    }
    if (b.active !== undefined) {
      if (target.role === 'dono' && !b.active) throw bad('O dono da conta nao pode ser desativado.');
      data.active = b.active ? 1 : 0;
    }
  }

  update('users', target.id, data, tid);
  res.json(get('SELECT id,name,email,phone,role,commission_pct,pay_mode,pay_fixed,color,active FROM users WHERE id=?', [target.id]));
}));

router.delete('/team/:id', wrap(async (req, res) => {
  assertManager(req);
  const target = get('SELECT * FROM users WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
  if (!target) throw notFound('Colaborador nao encontrado.');
  if (target.role === 'dono') throw bad('O dono da conta nao pode ser removido.');

  const used = get('SELECT COUNT(*) AS n FROM orders WHERE assignee_id=?', [target.id])?.n || 0;
  if (used) {
    update('users', target.id, { active: 0 }, req.user.tenant_id);
    return res.json({ ok: true, archived: true, message: 'Colaborador possui OS no historico e foi desativado.' });
  }
  run('DELETE FROM users WHERE id=? AND tenant_id=?', [target.id, req.user.tenant_id]);
  res.json({ ok: true });
}));

module.exports = { router };

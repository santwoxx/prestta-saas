'use strict';
const express = require('express');
const { all, get, insert, update, transaction } = require('../db');
const U = require('../util');
const auth = require('../auth');
const firebase = require('../firebase');
const plans = require('../plans');
const { decorate } = require('../calc');

const router = express.Router();
const { wrap, uid, nowISO, clean, isEmail, bad, notFound } = U;

/* ------------------------------------------------------------------ *
 * Planos
 * ------------------------------------------------------------------ */
router.get('/plans', (_req, res) => {
  res.json({ plans: plans.PLANS });
});

/* ------------------------------------------------------------------ *
 * Funil: captura de lead da landing page
 * ------------------------------------------------------------------ */
router.post('/leads', wrap(async (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 120);
  const email = clean(b.email, 160).toLowerCase();
  const phone = U.digits(b.phone).slice(0, 15);

  if (!name) throw bad('Informe seu nome.');
  if (!isEmail(email)) throw bad('Informe um e-mail valido.');
  if (phone.length < 10) throw bad('Informe um WhatsApp com DDD.');

  const lead = {
    id: uid('lead'),
    name,
    email,
    phone,
    company: clean(b.company, 140),
    segment: clean(b.segment, 60),
    team_size: clean(b.team_size || b.teamSize, 30),
    message: clean(b.message, 800),
    stage: 'novo',
    source: clean(b.source || 'landing', 60),
    utm: JSON.stringify(b.utm || {}),
    created_at: nowISO(),
  };
  insert('leads', lead);
  res.status(201).json({ ok: true, id: lead.id });
}));

/* ------------------------------------------------------------------ *
 * Cadastro (trial) - cria tenant + usuario dono
 * ------------------------------------------------------------------ */
router.post('/signup', wrap(async (req, res) => {
  const b = req.body || {};
  const company = clean(b.company, 140);
  const name = clean(b.name, 120);
  const email = clean(b.email, 160).toLowerCase();
  const password = String(b.password || '');
  const phone = U.digits(b.phone).slice(0, 15);

  if (!company) throw bad('Informe o nome da sua empresa.');
  if (!name) throw bad('Informe seu nome.');
  if (!isEmail(email)) throw bad('Informe um e-mail valido.');
  if (password.length < 6) throw bad('A senha precisa ter ao menos 6 caracteres.');

  if (get('SELECT id FROM users WHERE email=? AND role!=?', [email, 'campo'])) {
    throw bad('Ja existe uma conta com este e-mail. Faca login ou use outro e-mail.');
  }

  const planId = plans.byId(b.plan)?.id || 'pro';
  const cycle = b.cycle === 'anual' ? 'anual' : 'mensal';
  const trialDays = U.int(process.env.TRIAL_DAYS, 14);

  let slug = U.slugify(company);
  if (get('SELECT id FROM tenants WHERE slug=?', [slug])) slug = `${slug}-${uid().slice(0, 4)}`;

  const tenantId = uid('t');
  const userId = uid('u');

  transaction(() => {
    insert('tenants', {
      id: tenantId,
      name: company,
      slug,
      segment: clean(b.segment, 60) || 'servicos',
      doc: U.digits(b.doc).slice(0, 18),
      phone,
      email,
      city: clean(b.city, 80),
      uf: clean(b.uf, 2).toUpperCase(),
      team_size: clean(b.team_size || b.teamSize, 30),
      plan: planId,
      cycle,
      status: 'trial',
      trial_ends_at: U.addDays(new Date(), trialDays).toISOString(),
      settings: JSON.stringify({
        default_commission_pct: 0,
        require_client_signature: true,
        require_before_photo: false,
        require_after_photo: true,
        currency: 'BRL',
      }),
      created_at: nowISO(),
    });

    insert('users', {
      id: userId,
      tenant_id: tenantId,
      name,
      email,
      phone,
      password_hash: auth.hashPassword(password),
      role: 'dono',
      commission_pct: 0,
      color: '#F2A63B',
      active: 1,
      created_at: nowISO(),
    });

    insert('leads', {
      id: uid('lead'),
      name, email, phone,
      company,
      segment: clean(b.segment, 60),
      team_size: clean(b.team_size || b.teamSize, 30),
      stage: 'convertido',
      source: clean(b.source || 'cadastro', 60),
      utm: JSON.stringify(b.utm || {}),
      tenant_id: tenantId,
      created_at: nowISO(),
    });
  });

  if (b.demo) {
    try { require('../demo').seedDemoData(tenantId, userId); }
    catch (err) { console.warn('[signup] falha ao gerar dados de exemplo:', err.message); }
  }

  const user = get('SELECT * FROM users WHERE id=?', [userId]);
  auth.setSession(res, user);
  auth.touchLogin(userId);

  res.status(201).json({
    ok: true,
    tenant: get('SELECT * FROM tenants WHERE id=?', [tenantId]),
    user: safeUser(user),
    redirect: '/app.html',
  });
}));

/* ------------------------------------------------------------------ *
 * Login / logout / sessao
 * ------------------------------------------------------------------ */
router.post('/login', wrap(async (req, res) => {
  const email = clean(req.body?.email, 160).toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw bad('Informe e-mail e senha.');

  const candidates = all('SELECT * FROM users WHERE email=? ORDER BY created_at', [email]);
  const user = candidates.find((u) => auth.verifyPassword(password, u.password_hash));
  if (!user) throw U.unauthorized('E-mail ou senha incorretos.');
  if (!user.active) throw U.forbidden('Seu acesso foi desativado. Fale com o administrador da conta.');

  auth.setSession(res, user);
  auth.touchLogin(user.id);

  res.json({
    ok: true,
    user: safeUser(user),
    tenant: user.tenant_id ? get('SELECT * FROM tenants WHERE id=?', [user.tenant_id]) : null,
    redirect: redirectFor(user),
  });
}));

router.post('/login/google', wrap(async (req, res) => {
  const token = req.body?.token;
  if (!token) throw bad('Token do Google ausente.');

  const decodedToken = await firebase.verifyToken(token);
  const email = decodedToken.email.toLowerCase();

  const candidates = all('SELECT * FROM users WHERE email=? ORDER BY created_at', [email]);
  const user = candidates[0]; // Pega a conta principal com este e-mail
  
  if (!user) throw bad('Usuário não encontrado. Por favor, crie uma conta primeiro.');
  if (!user.active) throw U.forbidden('Seu acesso foi desativado. Fale com o administrador da conta.');

  auth.setSession(res, user);
  auth.touchLogin(user.id);

  res.json({
    ok: true,
    user: safeUser(user),
    tenant: user.tenant_id ? get('SELECT * FROM tenants WHERE id=?', [user.tenant_id]) : null,
    redirect: redirectFor(user),
  });
}));

router.post('/signup/google', wrap(async (req, res) => {
  const b = req.body || {};
  const token = b.token;
  if (!token) throw bad('Token do Google ausente.');

  const decodedToken = await firebase.verifyToken(token);
  const email = decodedToken.email.toLowerCase();
  const name = decodedToken.name || clean(b.name, 120) || 'Usuário Google';

  const company = clean(b.company, 140);
  const phone = U.digits(b.phone).slice(0, 15);

  if (!company) throw bad('Informe o nome da sua empresa.');

  if (get('SELECT id FROM users WHERE email=? AND role!=?', [email, 'campo'])) {
    throw bad('Já existe uma conta com este e-mail. Faça login.');
  }

  const planId = plans.byId(b.plan)?.id || 'pro';
  const cycle = b.cycle === 'anual' ? 'anual' : 'mensal';
  const trialDays = U.int(process.env.TRIAL_DAYS, 14);

  let slug = U.slugify(company);
  if (get('SELECT id FROM tenants WHERE slug=?', [slug])) slug = `${slug}-${uid().slice(0, 4)}`;

  const tenantId = uid('t');
  const userId = uid('u');

  transaction(() => {
    insert('tenants', {
      id: tenantId,
      name: company,
      slug,
      segment: clean(b.segment, 60) || 'servicos',
      doc: U.digits(b.doc).slice(0, 18),
      phone,
      email,
      city: clean(b.city, 80),
      uf: clean(b.uf, 2).toUpperCase(),
      team_size: clean(b.team_size || b.teamSize, 30),
      plan: planId,
      cycle,
      status: 'trial',
      trial_ends_at: U.addDays(new Date(), trialDays).toISOString(),
      settings: JSON.stringify({
        default_commission_pct: 0,
        require_client_signature: true,
        require_before_photo: false,
        require_after_photo: true,
        currency: 'BRL',
      }),
      created_at: nowISO(),
    });

    insert('users', {
      id: userId,
      tenant_id: tenantId,
      name,
      email,
      phone,
      password_hash: auth.hashPassword(uid()), // Senha aleatória para quem loga com google
      role: 'dono',
      commission_pct: 0,
      color: '#F2A63B',
      active: 1,
      created_at: nowISO(),
    });

    insert('leads', {
      id: uid('lead'),
      name, email, phone,
      company,
      segment: clean(b.segment, 60),
      team_size: clean(b.team_size || b.teamSize, 30),
      stage: 'convertido',
      source: clean(b.source || 'cadastro_google', 60),
      utm: JSON.stringify(b.utm || {}),
      tenant_id: tenantId,
      created_at: nowISO(),
    });
  });

  const user = get('SELECT * FROM users WHERE id=?', [userId]);
  auth.setSession(res, user);
  auth.touchLogin(userId);

  res.status(201).json({
    ok: true,
    tenant: get('SELECT * FROM tenants WHERE id=?', [tenantId]),
    user: safeUser(user),
    redirect: '/app.html',
  });
}));

router.post('/logout', (req, res) => {
  auth.clearSession(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Nao autenticado' });
  const tenant = req.tenant ? { ...req.tenant, settings: JSON.parse(req.tenant.settings || '{}') } : null;
  res.json({
    user: safeUser(req.user),
    tenant,
    plan: tenant ? plans.byId(tenant.plan) : null,
    redirect: redirectFor(req.user),
    trial_days_left: trialDaysLeft(tenant),
  });
});

/* ------------------------------------------------------------------ *
 * Comprovante publico da OS (link enviado ao cliente / parceiro)
 * ------------------------------------------------------------------ */
router.get('/public/orders/:token', wrap(async (req, res) => {
  const order = get('SELECT * FROM orders WHERE public_token=?', [req.params.token]);
  if (!order) throw notFound('Comprovante nao encontrado ou link expirado.');

  const tenant = get('SELECT name, phone, email, city, uf FROM tenants WHERE id=?', [order.tenant_id]);
  const assignee = order.assignee_id ? get('SELECT name FROM users WHERE id=?', [order.assignee_id]) : null;
  const customer = order.customer_id ? get('SELECT name FROM customers WHERE id=?', [order.customer_id]) : null;

  const d = decorate(order);
  res.json({
    empresa: tenant,
    os: {
      code: d.code,
      title: d.title,
      description: d.description,
      service_type: d.service_type,
      status: d.status,
      client_name: d.client_name,
      address: [d.address, d.district, d.city, d.uf].filter(Boolean).join(', '),
      scheduled_at: d.scheduled_at,
      started_at: d.started_at,
      finished_at: d.finished_at,
      duration_min: d.duration_min,
      rating: d.rating,
      client_feedback: d.client_feedback,
      field_notes: d.field_notes,
      checklist: d.checklist,
      parceiro: customer?.name || null,
      colaborador: assignee?.name || null,
    },
    itens: all('SELECT description, qty, unit_value, done FROM order_items WHERE order_id=?', [order.id]),
    fotos: all('SELECT kind, url, caption, created_at FROM order_photos WHERE order_id=? ORDER BY created_at', [order.id]),
    assinaturas: all(
      'SELECT role, name, doc, url, hash, signed_at FROM order_signatures WHERE order_id=? ORDER BY signed_at',
      [order.id],
    ),
  });
}));

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
function safeUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return { ...rest, active: !!rest.active };
}

function redirectFor(user) {
  if (user.role === 'superadmin') return '/saas.html';
  if (user.role === 'campo') return '/campo.html';
  return '/app.html';
}

function trialDaysLeft(tenant) {
  if (!tenant || tenant.status !== 'trial' || !tenant.trial_ends_at) return null;
  const ms = new Date(tenant.trial_ends_at) - Date.now();
  return Math.max(0, Math.ceil(ms / 864e5));
}

module.exports = { router, safeUser, trialDaysLeft };

'use strict';
const crypto = require('node:crypto');
const { get, update } = require('./db');
const { unauthorized, forbidden, nowISO } = require('./util');

const SECRET = () => process.env.APP_SECRET || 'servio-dev-secret';
const COOKIE = 'servio_session';
const MAX_AGE_DAYS = 30;

/* ------------------------------------------------------------------ *
 * Senhas (scrypt - nativo, sem dependencias)
 * ------------------------------------------------------------------ */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const test = crypto.scryptSync(String(password), salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return test.length === ref.length && crypto.timingSafeEqual(test, ref);
}

/* ------------------------------------------------------------------ *
 * Token de sessao (JWT-like HS256, sem dependencias)
 * ------------------------------------------------------------------ */
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET()).update(data).digest('base64url');

function issueToken(user) {
  const payload = {
    uid: user.id,
    tid: user.tenant_id,
    role: user.role,
    exp: Date.now() + MAX_AGE_DAYS * 864e5,
  };
  const body = b64(payload);
  return `${body}.${sign(body)}`;
}

function readToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = sign(body);
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function setSession(res, user) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE, issueToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: MAX_AGE_DAYS * 864e5,
    path: '/',
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

/* ------------------------------------------------------------------ *
 * Middlewares
 * ------------------------------------------------------------------ */
/** Popula req.user / req.tenant quando houver sessao valida. Nunca bloqueia. */
function attachUser(req, _res, next) {
  const raw = req.cookies?.[COOKIE]
    || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const payload = readToken(raw);
  if (!payload) return next();

  const user = get('SELECT * FROM users WHERE id=?', [payload.uid]);
  if (!user || !user.active) return next();

  req.user = user;
  if (user.tenant_id) {
    req.tenant = get('SELECT * FROM tenants WHERE id=?', [user.tenant_id]) || null;
  }
  next();
}

/** Exige sessao. */
function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

/** Exige um dos papeis informados. */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === 'superadmin') return next();
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

/** Exige conta de gestao (dono/admin) - colaborador de campo nao acessa. */
const requireManager = requireRole('dono', 'admin');

/** Exige superadmin do SaaS. */
function requireSuperadmin(req, _res, next) {
  if (!req.user || req.user.role !== 'superadmin') return next(forbidden());
  next();
}

/* ------------------------------------------------------------------ *
 * Carencia de pagamento
 * ------------------------------------------------------------------ */
/** Dias de acesso mantido depois que a cobranca falha. */
const graceDays = () => {
  const n = parseInt(process.env.GRACE_DAYS, 10);
  return Number.isFinite(n) && n >= 0 ? n : 7;
};

/**
 * Situacao da carencia de um tenant em atraso.
 * @returns {{inGrace:boolean, daysLeft:number, until:string}|null}
 *   null quando o tenant nao esta em atraso.
 */
function graceInfo(tenant) {
  if (!tenant || tenant.status !== 'atrasado') return null;
  // Sem overdue_since (registro antigo) contamos a partir de agora, para nao
  // bloquear ninguem retroativamente.
  const since = tenant.overdue_since ? new Date(tenant.overdue_since) : new Date();
  const until = new Date(since.getTime() + graceDays() * 864e5);
  const msLeft = until - Date.now();
  return {
    inGrace: msLeft > 0,
    daysLeft: Math.max(0, Math.ceil(msLeft / 864e5)),
    until: until.toISOString(),
  };
}

/** Exige tenant com assinatura valida (trial dentro do prazo ou ativa). */
function requireActiveTenant(req, _res, next) {
  if (req.user?.role === 'superadmin') return next();
  const t = req.tenant;
  if (!t) return next(unauthorized());

  if (t.status === 'cancelado') {
    return next(Object.assign(new Error('Assinatura cancelada. Reative para continuar usando o Prestta.'), { status: 402 }));
  }

  if (t.status === 'trial' && t.trial_ends_at && new Date(t.trial_ends_at) < new Date()) {
    return next(Object.assign(new Error('Seu periodo de teste terminou. Escolha um plano para continuar.'), { status: 402 }));
  }

  // Pagamento em atraso: mantemos o acesso durante a carencia e so entao
  // bloqueamos. Antes disso, `atrasado` dava acesso ilimitado para sempre.
  if (t.status === 'atrasado') {
    const grace = graceInfo(t);
    if (!grace.inGrace) {
      return next(Object.assign(
        new Error('Nao conseguimos confirmar seu pagamento e o prazo de regularizacao terminou. Atualize a forma de pagamento para reativar - seus dados continuam guardados.'),
        { status: 402 },
      ));
    }
  }

  return next();
}

function touchLogin(userId) {
  update('users', userId, { last_login: nowISO() });
}

module.exports = {
  COOKIE, hashPassword, verifyPassword, issueToken, readToken,
  setSession, clearSession, attachUser, requireAuth, requireRole,
  requireManager, requireSuperadmin, requireActiveTenant, touchLogin,
  graceInfo, graceDays,
};

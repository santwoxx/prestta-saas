'use strict';
const path = require('node:path');
const express = require('express');

const U = require('./util');
U.loadEnv();

const auth = require('./auth');
const publicRoutes = require('./routes/public');
const orderRoutes = require('./routes/orders');
const peopleRoutes = require('./routes/people');
const dashboardRoutes = require('./routes/dashboard');
const financeRoutes = require('./routes/finance');
const workspaceRoutes = require('./routes/workspace');
const webhookRoutes = require('./routes/webhooks');
const saasRoutes = require('./routes/saas');

const app = express();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.set('trust proxy', true);

/* ------------------------------------------------------------------ *
 * Body parsing (guardamos o corpo cru para validar o HMAC do webhook)
 * ------------------------------------------------------------------ */
app.use(express.json({
  limit: '12mb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

/** Leitura de cookies (evita a dependencia cookie-parser). */
app.use((req, _res, next) => {
  req.cookies = {};
  const header = req.headers.cookie;
  if (header) {
    for (const part of header.split(';')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const k = part.slice(0, i).trim();
      try { req.cookies[k] = decodeURIComponent(part.slice(i + 1).trim()); }
      catch { req.cookies[k] = part.slice(i + 1).trim(); }
    }
  }
  next();
});

/* Cabecalhos de seguranca basicos. */
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use(auth.attachUser);

/* ------------------------------------------------------------------ *
 * Rate limit simples nas rotas sensiveis (login / cadastro / leads)
 * ------------------------------------------------------------------ */
const hits = new Map();
function rateLimit({ windowMs = 60_000, max = 20 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
    entry.count += 1;
    hits.set(key, entry);
    if (entry.count > max) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto e tente novamente.' });
    }
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) if (now > entry.reset) hits.delete(key);
}, 120_000).unref();

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */
const api = express.Router();

api.use('/login', rateLimit({ max: 12 }));
api.use('/signup', rateLimit({ max: 8 }));
api.use('/leads', rateLimit({ max: 15 }));

// Publicas (landing, cadastro, login, comprovante da OS)
api.use('/', publicRoutes.router);

// Webhooks (autenticados pelo segredo da Cakto, nao por sessao)
api.use('/', webhookRoutes.router);

// Area logada da empresa
const workspaceGuard = [auth.requireAuth, auth.requireActiveTenant];
api.use('/', workspaceGuard, dashboardRoutes.router);
api.use('/', workspaceGuard, orderRoutes.router);
api.use('/', workspaceGuard, peopleRoutes.router);
api.use('/', workspaceGuard, financeRoutes.router);

// Configuracoes e assinatura continuam acessiveis mesmo com plano vencido,
// caso contrario o cliente nao conseguiria pagar para reativar.
api.use('/', auth.requireAuth, workspaceRoutes.router);

// Painel do dono do SaaS
api.use('/', auth.requireAuth, auth.requireSuperadmin, saasRoutes.router);

app.use('/api', api);

/* ------------------------------------------------------------------ *
 * Arquivos estaticos + rotas amigaveis
 * ------------------------------------------------------------------ */
app.use(express.static(PUBLIC_DIR, {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}uploads${path.sep}`)) {
      res.setHeader('Cache-Control', 'private, max-age=31536000');
    }
  },
}));

const page = (file) => (_req, res) => res.sendFile(path.join(PUBLIC_DIR, file));
app.get('/', page('index.html'));
app.get('/entrar', page('login.html'));
app.get('/cadastro', page('cadastro.html'));
app.get('/precos', (_req, res) => res.redirect('/#precos'));
app.get('/app', page('app.html'));
app.get('/campo', page('campo.html'));
app.get('/saas', page('saas.html'));
app.get('/os/:token', page('os.html'));

/* ------------------------------------------------------------------ *
 * 404 + tratamento de erros
 * ------------------------------------------------------------------ */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint nao encontrado.' });
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[erro]', req.method, req.originalUrl, err);
  res.status(status).json({
    error: err.message || 'Erro inesperado.',
    ...(err.details ? { details: err.details } : {}),
  });
});

const PORT = U.int(process.env.PORT, 3000);
app.listen(PORT, () => {
  console.log(`\n  Servio rodando em http://localhost:${PORT}`);
  console.log(`  Landing:        http://localhost:${PORT}/`);
  console.log(`  Painel admin:   http://localhost:${PORT}/app`);
  console.log(`  App do campo:   http://localhost:${PORT}/campo`);
  console.log(`  Painel do SaaS: http://localhost:${PORT}/saas`);
  console.log(`  Webhook Cakto:  ${(process.env.APP_URL || `http://localhost:${PORT}`)}/api/webhooks/cakto\n`);
});

module.exports = app;

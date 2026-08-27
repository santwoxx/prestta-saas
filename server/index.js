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
const uploadRoutes = require('./routes/uploads');
const jobs = require('./jobs');

/* ------------------------------------------------------------------ *
 * Guardas de configuracao: em producao nao subimos com segredo padrao.
 * ------------------------------------------------------------------ */
if (process.env.NODE_ENV === 'production') {
  const problems = [];
  const secret = process.env.APP_SECRET || '';
  if (!secret || secret.length < 32 || secret.includes('troque-este-segredo')) {
    problems.push('APP_SECRET ausente ou fraco (use 32+ caracteres aleatorios).');
  }
  if (!process.env.APP_URL || !/^https:\/\//i.test(process.env.APP_URL)) {
    problems.push('APP_URL deve ser a URL publica https:// do sistema.');
  }
  if (!process.env.CAKTO_WEBHOOK_SECRET) {
    problems.push('CAKTO_WEBHOOK_SECRET ausente: o webhook de pagamento ficaria aberto a qualquer um.');
  }
  if (problems.length) {
    console.error('\n[FATAL] Configuracao invalida para producao:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\nAjuste as variaveis de ambiente e suba novamente.\n');
    process.exit(1);
  }
}

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
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
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

// Health check do provedor de hospedagem (sem sessao, sem banco pesado).
api.get('/health', (_req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()) }));

api.use('/login', rateLimit({ max: 12 }));
api.use('/signup', rateLimit({ max: 8 }));
api.use('/leads', rateLimit({ max: 15 }));

/**
 * Os guards sao montados por PREFIXO de rota, nao em '/'.
 * Montar um middleware em '/' faria ele rodar em TODA requisicao /api/*,
 * inclusive nas rotas de assinatura - e o cliente com plano vencido ficaria
 * sem conseguir pagar para reativar.
 */
const OPERATION_PATHS = [
  '/dashboard', '/route', '/reports',   // dashboard.js
  '/orders',                            // orders.js
  '/customers', '/team',                // people.js
  '/finance',                           // finance.js
];
// Configuracoes e assinatura continuam acessiveis mesmo com plano vencido.
const ACCOUNT_PATHS = ['/workspace', '/subscription'];

api.use(OPERATION_PATHS, auth.requireAuth, auth.requireActiveTenant);
api.use(ACCOUNT_PATHS, auth.requireAuth);
api.use('/saas', auth.requireAuth, auth.requireSuperadmin);

// Publicas (landing, cadastro, login, comprovante da OS)
api.use('/', publicRoutes.router);

// Webhooks (autenticados pelo segredo da Cakto, nao por sessao)
api.use('/', webhookRoutes.router);

// Area logada da empresa
api.use('/', dashboardRoutes.router);
api.use('/', orderRoutes.router);
api.use('/', peopleRoutes.router);
api.use('/', financeRoutes.router);

// Conta: dados da empresa e assinatura
api.use('/', workspaceRoutes.router);

// Painel do dono do SaaS
api.use('/', saasRoutes.router);

app.use('/api', api);

/* ------------------------------------------------------------------ *
 * Arquivos estaticos + rotas amigaveis
 * ------------------------------------------------------------------ */
/**
 * Fotos e assinaturas passam pelo guard de /uploads ANTES do express.static.
 * A ordem importa: com UPLOAD_DIR no padrao (public/uploads), o static
 * serviria os mesmos arquivos sem qualquer verificacao.
 */
app.use('/', uploadRoutes.router);

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

const page = (file) => (_req, res) => res.sendFile(path.join(PUBLIC_DIR, file));
app.get('/', page('index.html'));
app.get('/entrar', page('login.html'));
app.get('/cadastro', page('cadastro.html'));
app.get('/precos', (_req, res) => res.redirect('/#precos'));
app.get('/app', page('app.html'));
app.get('/campo', page('campo.html'));
app.get('/saas', page('saas.html'));
app.get('/os/:token', page('os.html'));
app.get('/termos', page('termos.html'));
app.get('/privacidade', page('privacidade.html'));

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
  jobs.start();
});

module.exports = app;

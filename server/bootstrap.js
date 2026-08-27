'use strict';
/**
 * ---------------------------------------------------------------------------
 * Bootstrap de PRODUCAO - cria (ou promove) o superadmin do SaaS.
 * ---------------------------------------------------------------------------
 * Diferente de `npm run seed`, este script NAO cria dados de demonstracao.
 * Ele so garante que existe uma conta com papel `superadmin` para voce acessar
 * o painel /saas (contas, MRR, leads e webhooks da Cakto).
 *
 *   SUPERADMIN_EMAIL=voce@dominio.com npm run bootstrap
 *   npm run bootstrap -- voce@dominio.com "Seu Nome"
 *
 * Como o login e feito pelo Google, basta o e-mail bater com a sua conta
 * Google. A senha gerada aqui e aleatoria e nunca precisa ser usada.
 */
const U = require('./util');
U.loadEnv();

const { db, get, insert, update } = require('./db');
const auth = require('./auth');

const email = String(process.argv[2] || process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
const name = String(process.argv[3] || process.env.SUPERADMIN_NAME || 'Administrador').trim();

if (!U.isEmail(email)) {
  console.error('\n  Informe o e-mail do superadmin:');
  console.error('    npm run bootstrap -- voce@dominio.com "Seu Nome"');
  console.error('  ou defina SUPERADMIN_EMAIL no .env\n');
  process.exit(1);
}

const existing = get('SELECT * FROM users WHERE email=? ORDER BY created_at LIMIT 1', [email]);

if (existing) {
  if (existing.role === 'superadmin' && existing.active) {
    console.log(`  ${email} ja e superadmin. Nada a fazer.`);
  } else {
    update('users', existing.id, { role: 'superadmin', active: 1 });
    console.log(`  ${email} promovido a superadmin.`);
  }
} else {
  const id = U.uid('u');
  insert('users', {
    id,
    tenant_id: null,
    name,
    email,
    password_hash: auth.hashPassword(U.token(24)), // login e via Google
    role: 'superadmin',
    active: 1,
    created_at: U.nowISO(),
  });
  console.log(`  Superadmin criado: ${email}`);
}

console.log('  Entre em /entrar usando o Google com esse e-mail -> voce cai no painel /saas.\n');
db.close();

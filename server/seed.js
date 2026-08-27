'use strict';
/**
 * Popula o banco para desenvolvimento / demonstracao.
 *   npm run seed          -> cria (se ainda nao existir)
 *   npm run reset         -> apaga tudo e recria do zero
 */
const fs = require('node:fs');
const path = require('node:path');
const U = require('./util');
U.loadEnv();

const { db, get, insert, run } = require('./db');
const auth = require('./auth');
const { seedDemoData } = require('./demo');

const RESET = process.argv.includes('--reset');

if (RESET) {
  const tables = ['order_events', 'order_signatures', 'order_photos', 'order_items', 'finance_entries',
    'orders', 'customers', 'subscriptions', 'webhook_events', 'leads', 'users', 'tenants'];
  for (const t of tables) run(`DELETE FROM ${t}`);
  const uploads = path.join(__dirname, '..', 'public', 'uploads');
  for (const entry of fs.readdirSync(uploads)) {
    if (entry === '.gitkeep') continue;
    fs.rmSync(path.join(uploads, entry), { recursive: true, force: true });
  }
  console.log('Banco limpo.');
}

/* ------------------------------------------------------------------ *
 * Superadmin do SaaS
 * ------------------------------------------------------------------ */
const SUPER_EMAIL = (process.env.SUPERADMIN_EMAIL || 'admin@prestta.com.br').toLowerCase();
if (!get('SELECT id FROM users WHERE email=?', [SUPER_EMAIL])) {
  insert('users', {
    id: U.uid('u'), tenant_id: null, name: 'Administrador Prestta',
    email: SUPER_EMAIL, password_hash: auth.hashPassword('prestta123'),
    role: 'superadmin', active: 1, created_at: U.nowISO(),
  });
  console.log(`Superadmin criado: ${SUPER_EMAIL} / prestta123`);
}

/* ------------------------------------------------------------------ *
 * Conta de demonstracao
 * ------------------------------------------------------------------ */
const DEMO_EMAIL = 'brisasofc@gmail.com';
let owner = get('SELECT * FROM users WHERE email=?', [DEMO_EMAIL]);

if (!owner) {
  const tenantId = U.uid('t');
  const ownerId = U.uid('u');

  insert('tenants', {
    id: tenantId, name: 'MontaFacil Servicos', slug: 'montafacil',
    segment: 'montagem-de-moveis', doc: '41988776000155',
    phone: '4732221010', email: DEMO_EMAIL, city: 'Joinville', uf: 'SC',
    team_size: '5-10', plan: 'pro', cycle: 'mensal', status: 'ativo',
    trial_ends_at: null,
    settings: JSON.stringify({
      default_commission_pct: 8,
      require_client_signature: true,
      require_before_photo: false,
      require_after_photo: true,
      ask_rating: true,
      service_types: ['Montagem de moveis', 'Cozinha planejada', 'Assistencia tecnica', 'Instalacao de eletro'],
      checklist_template: [
        'Conferir volumes e avarias na entrega',
        'Proteger o piso e o ambiente',
        'Montagem conforme manual do fabricante',
        'Nivelamento e fixacao na parede',
        'Limpeza do local e retirada das embalagens',
        'Conferencia final com o cliente',
      ],
      receipt_message: 'Obrigado por confiar na MontaFacil. Qualquer duvida, fale com a gente no WhatsApp.',
    }),
    created_at: U.addDays(new Date(), -210).toISOString(),
  });

  insert('users', {
    id: ownerId, tenant_id: tenantId, name: 'Natan Oliveira',
    email: DEMO_EMAIL, phone: '47999887766',
    password_hash: auth.hashPassword('demo1234'),
    role: 'superadmin', commission_pct: 0, color: '#F2A63B', active: 1,
    created_at: U.addDays(new Date(), -210).toISOString(),
  });

  console.log('Gerando operacao de demonstracao (ordens, fotos e assinaturas)...');
  const result = seedDemoData(tenantId, ownerId, { orders: 52 });

  insert('subscriptions', {
    id: U.uid('sub'), tenant_id: tenantId, provider: 'cakto', provider_ref: 'demo_cakto_001',
    plan: 'pro', cycle: 'mensal', amount: 18900, status: 'ativa',
    customer_email: DEMO_EMAIL,
    period_end: U.addDays(new Date(), 21).toISOString(),
    created_at: U.addDays(new Date(), -30).toISOString(), updated_at: U.nowISO(),
  });

  // Alguns leads no funil para o painel do SaaS.
  const leadsDemo = [
    ['Ricardo Menezes', 'ricardo@moveisplanejados.com', '4899112233', 'Menezes Planejados', 'montagem-de-moveis', '3-5', 'novo'],
    ['Aline Prado', 'aline@climatec.com.br', '4198223344', 'ClimaTec Refrigeracao', 'climatizacao', '6-10', 'contato'],
    ['Fabio Rangel', 'fabio@eletrorangel.com', '5199334455', 'Eletro Rangel', 'assistencia-tecnica', '1-2', 'demo'],
    ['Sueli Barreto', 'sueli@limpezatotal.com', '4899445566', 'Limpeza Total', 'limpeza', '11-20', 'novo'],
    ['Marcos Aurelio', 'marcos@instalafacil.com', '4799556677', 'InstalaFacil', 'instalacoes', '3-5', 'perdido'],
  ];
  leadsDemo.forEach(([name, email, phone, company, segment, team, stage], i) => {
    insert('leads', {
      id: U.uid('lead'), name, email, phone, company, segment, team_size: team, stage,
      source: 'landing', utm: JSON.stringify({ utm_source: 'google', utm_campaign: 'gestao-servicos' }),
      created_at: U.addDays(new Date(), -i * 3 - 1).toISOString(),
    });
  });

  owner = get('SELECT * FROM users WHERE id=?', [ownerId]);
  console.log(`Conta demo criada: ${result.orders} ordens, ${result.team} colaboradores, ${result.customers} parceiros.`);
  console.log('\n  Acessos:');
  console.log(`   Administrador : ${DEMO_EMAIL} / demo1234`);
  console.log(`   Colaborador   : ${result.equipe[0].email} / campo123`);
  console.log(`   Dono do SaaS  : ${SUPER_EMAIL} / prestta123\n`);
} else {
  console.log('Conta demo ja existe. Use "npm run reset" para recriar do zero.');
}

db.close();

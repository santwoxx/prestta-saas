'use strict';
/**
 * Gera uma operacao ficticia completa para o tenant: parceiros, equipe,
 * ordens em todos os status, fotos, assinaturas, eventos e financeiro.
 * Usado no "criar conta com dados de exemplo" e no `npm run seed`.
 */
const zlib = require('node:zlib');
const { get, insert, update, transaction } = require('./db');
const U = require('./util');
const auth = require('./auth');
const calc = require('./calc');
const storage = require('./storage');

/* ------------------------------------------------------------------ *
 * Gerador de PNG (sem dependencias) para simular fotos e assinaturas
 * ------------------------------------------------------------------ */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** paint(x, y) -> [r, g, b] */
function makePng(width, height, paint) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      raw[p++] = r; raw[p++] = g; raw[p++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;

/** "Foto" do servico: composicao suave de tons de ambiente. */
function fakePhoto(seed) {
  const base = [
    [212, 198, 178], [186, 178, 170], [204, 210, 206], [222, 214, 196], [176, 186, 196],
  ][seed % 5];
  return dataUrl(makePng(320, 240, (x, y) => {
    const band = Math.sin((x + seed * 40) / 46) * 12 + Math.cos((y + seed * 17) / 38) * 10;
    const vig = 1 - (Math.hypot(x - 160, y - 120) / 320) * 0.35;
    const shade = y > 168 ? -26 : 0; // "chao"
    return base.map((c) => Math.max(0, Math.min(255, Math.round((c + band + shade) * vig))));
  }));
}

/** Assinatura: traco cursivo sobre fundo branco. */
function fakeSignature(seed) {
  const w = 360; const h = 140;
  const rnd = (n) => Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453 % 1;
  return dataUrl(makePng(w, h, (x, y) => {
    const t = x / w;
    const curve = 70
      + Math.sin(t * Math.PI * (3 + rnd(1) * 2)) * (26 + rnd(2) * 10)
      + Math.sin(t * Math.PI * 9 + seed) * 6;
    const thickness = 2.2 + Math.sin(t * Math.PI) * 1.6;
    const onStroke = Math.abs(y - curve) < thickness && x > 24 && x < w - 24;
    const baseline = y === h - 26 && x > 16 && x < w - 16;
    if (onStroke) return [22, 32, 56];
    if (baseline) return [214, 219, 228];
    return [255, 255, 255];
  }));
}

/* ------------------------------------------------------------------ *
 * Dados ficticios
 * ------------------------------------------------------------------ */
const PARCEIROS = [
  { name: 'Central Moveis', commission_pct: 8, contact: 'Marcia Prado', payment_terms: '30 dias apos a montagem' },
  { name: 'Casa & Cia Decoracoes', commission_pct: 12, contact: 'Rodrigo Alencar', payment_terms: 'Quinzenal' },
  { name: 'MegaLar Moveis Planejados', commission_pct: 10, contact: 'Simone Ferraz', payment_terms: '15 dias' },
  { name: 'Eletro Sul Assistencia', commission_pct: 0, contact: 'Paulo Vieira', payment_terms: 'A vista' },
  { name: 'Bela Casa Home', commission_pct: 9, contact: 'Tatiane Lopes', payment_terms: '30 dias' },
];

const COLABORADORES = [
  { name: 'Anderson Ribeiro', commission_pct: 55, skills: 'Montagem, planejados, eletrica' },
  { name: 'Willian Souza', commission_pct: 50, skills: 'Montagem, marcenaria' },
  { name: 'Diego Martins', commission_pct: 52, skills: 'Assistencia tecnica, ajustes' },
  { name: 'Rafael Nunes', commission_pct: 48, skills: 'Montagem, instalacao de eletro' },
  { name: 'Bruno Carvalho', commission_pct: 50, skills: 'Planejados, cozinha' },
];

const CLIENTES = [
  'Joelma Silva Santos', 'Carlos Eduardo Prado', 'Fernanda Muller', 'Rita de Cassia Alves',
  'Marcelo Tavares', 'Juliana Beatriz Rocha', 'Antonio Ferreira Lima', 'Patricia Gomes',
  'Roberto Nascimento', 'Vanessa Duarte', 'Sergio Kruger', 'Amanda Peixoto',
  'Luiz Henrique Barros', 'Camila Fontes', 'Gustavo Assis', 'Elaine Cristina Moura',
  'Marcos Vinicius Reis', 'Daniela Camargo', 'Thiago Bittencourt', 'Larissa Antunes',
  'Paulo Cesar Dias', 'Bianca Ramos', 'Everton Schmitt', 'Natalia Cordeiro',
];

const RUAS = [
  'Rua das Acacias', 'Av. Getulio Vargas', 'Rua Sete de Setembro', 'Rua Duque de Caxias',
  'Av. Brasil', 'Rua Sao Jorge', 'Rua Coronel Bento', 'Av. das Palmeiras',
  'Rua Ipiranga', 'Rua Marechal Deodoro', 'Rua Bento Goncalves', 'Av. Presidente Vargas',
];
const BAIRROS = ['Centro', 'Jardim America', 'Vila Nova', 'Sao Cristovao', 'Boa Vista', 'Alto da Colina', 'Industrial'];

// value = valor da NOTA / do servico (centavos). Quando o parceiro trabalha por
// comissao, a receita da empresa e um percentual desse valor.
const SERVICOS = [
  { type: 'Montagem de guarda-roupa', items: ['Guarda-roupa 6 portas', 'Espelho interno'], value: [180000, 450000] },
  { type: 'Cozinha planejada', items: ['Modulo aereo', 'Balcao', 'Torre quente'], value: [820000, 2400000] },
  { type: 'Montagem de sofa retratil', items: ['Sofa 3 lugares retratil'], value: [150000, 420000] },
  { type: 'Instalacao de eletrodomestico', items: ['Coifa', 'Cooktop'], value: [200000, 580000] },
  { type: 'Assistencia tecnica', items: ['Troca de corredicas', 'Ajuste de portas'], value: [14000, 38000] },
  { type: 'Montagem de escritorio', items: ['Mesa em L', 'Gaveteiro', 'Estante'], value: [260000, 690000] },
  { type: 'Painel e rack de TV', items: ['Painel 2,20m', 'Rack suspenso'], value: [120000, 330000] },
  { type: 'Home theater e prateleiras', items: ['Prateleiras', 'Suporte de TV'], value: [95000, 240000] },
];

const CHECKLIST = [
  'Conferir volumes e avarias no ato da entrega',
  'Proteger o piso e o ambiente',
  'Montagem conforme o manual do fabricante',
  'Nivelamento e fixacao na parede',
  'Limpeza do local e retirada das embalagens',
  'Conferencia final com o cliente',
];

const FEEDBACKS = [
  'Servico impecavel, montador pontual e caprichoso.',
  'Muito bom, deixou tudo limpo no final.',
  'Rapido e educado. Recomendo.',
  'Atendeu no horario combinado e explicou tudo.',
  'Excelente acabamento, superou a expectativa.',
  'Bom servico, so demorou um pouco para chegar.',
];

const rand = (n) => Math.floor(Math.random() * n);
const pickOne = (arr) => arr[rand(arr.length)];
const between = (a, b) => a + rand(b - a);

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */
function seedDemoData(tenantId, ownerId, { orders = 46, password = 'campo123' } = {}) {
  const tenant = get('SELECT * FROM tenants WHERE id=?', [tenantId]);
  if (!tenant) throw new Error('Tenant nao encontrado para gerar demonstracao.');

  const now = new Date();
  const parceiros = [];
  const equipe = [];

  transaction(() => {
    for (const p of PARCEIROS) {
      const id = U.uid('cli');
      insert('customers', {
        id, tenant_id: tenantId, kind: 'pj', name: p.name,
        doc: String(between(10000000000000, 99999999999999)),
        contact: p.contact,
        phone: `47${between(90000000, 99999999)}`,
        email: `contato@${U.slugify(p.name)}.com.br`,
        address: `${pickOne(RUAS)}, ${between(100, 2400)}`,
        district: pickOne(BAIRROS), city: tenant.city || 'Joinville', uf: tenant.uf || 'SC',
        commission_pct: p.commission_pct, payment_terms: p.payment_terms,
        active: 1, created_at: U.addDays(now, -180).toISOString(),
      });
      parceiros.push({ id, ...p });
    }

    const palette = ['#F2A63B', '#3B82F6', '#10B981', '#8B5CF6', '#06B6D4'];
    COLABORADORES.forEach((c, i) => {
      const id = U.uid('u');
      const email = `${U.slugify(c.name).split('-')[0]}@${U.slugify(tenant.name)}.com.br`;
      insert('users', {
        id, tenant_id: tenantId, name: c.name, email,
        phone: `47${between(90000000, 99999999)}`,
        password_hash: auth.hashPassword(password),
        role: 'campo', commission_pct: c.commission_pct, pay_mode: 'pct', pay_fixed: 0,
        skills: c.skills, color: palette[i % palette.length], active: 1,
        created_at: U.addDays(now, -150 + i * 8).toISOString(),
      });
      equipe.push({ id, ...c, email });
    });
  });

  const criadas = [];

  for (let i = 0; i < orders; i++) {
    // Distribuicao: passado concluido, hoje/amanha em aberto, futuro agendado.
    const offset = i < orders * 0.62 ? -between(1, 75) : (i < orders * 0.78 ? 0 : between(1, 14));
    const scheduled = new Date(now);
    scheduled.setDate(scheduled.getDate() + offset);
    scheduled.setHours(between(8, 17), pickOne([0, 30]), 0, 0);

    const servico = pickOne(SERVICOS);
    const parceiro = Math.random() < 0.8 ? pickOne(parceiros) : null;
    const colaborador = Math.random() < 0.78 ? pickOne(equipe) : null;
    const valor = between(servico.value[0], servico.value[1]);

    let status;
    if (offset < 0) status = Math.random() < 0.9 ? 'concluida' : 'cancelada';
    else if (offset === 0) status = pickOne(['em_andamento', 'agendada', 'concluida']);
    else status = colaborador ? 'agendada' : 'pendente';
    if (!colaborador && status !== 'concluida' && status !== 'cancelada') status = 'pendente';

    const id = U.uid('os');
    const createdAt = U.addDays(scheduled, -between(2, 12)).toISOString();

    const order = {
      id, tenant_id: tenantId,
      code: calc.nextOrderCode(tenantId),
      public_token: U.token(12),
      customer_id: parceiro?.id || null,
      assignee_id: colaborador?.id || null,
      client_name: pickOne(CLIENTES),
      client_phone: `47${between(90000000, 99999999)}`,
      title: servico.type,
      description: `${servico.items.join(', ')}. Cliente da ${parceiro?.name || 'venda direta'}.`,
      service_type: servico.type,
      status,
      priority: Math.random() < 0.12 ? 'alta' : 'normal',
      scheduled_at: scheduled.toISOString(),
      window_label: scheduled.getHours() < 12 ? 'Manha' : 'Tarde',
      address: `${pickOne(RUAS)}, ${between(50, 2800)}`,
      district: pickOne(BAIRROS),
      city: tenant.city || 'Joinville',
      uf: tenant.uf || 'SC',
      zip: `892${between(10000, 99999)}`,
      reference: pickOne(['Portao azul', 'Apto 302', 'Casa dos fundos', 'Condominio Vila Real', '']),
      invoice_ref: `NF ${between(10000, 99999)}`,
      value_total: valor,
      commission_pct: parceiro?.commission_pct || 0,
      extra_value: Math.random() < 0.22 ? between(3000, 15000) : 0,
      expenses: Math.random() < 0.3 ? between(1500, 9000) : 0,
      pay_mode: 'pct',
      assignee_pay: 0,
      received: 0, paid_assignee: 0,
      checklist: JSON.stringify(CHECKLIST.map((text) => ({ text, done: status === 'concluida' }))),
      source: Math.random() < 0.25 ? 'importacao' : 'manual',
      created_by: ownerId,
      created_at: createdAt,
      updated_at: createdAt,
    };

    insert('orders', order);

    const pay = calc.assigneePayFor(order, colaborador ? { commission_pct: colaborador.commission_pct, pay_mode: 'pct' } : null);
    update('orders', id, { assignee_pay: pay });
    order.assignee_pay = pay;

    for (const item of servico.items) {
      insert('order_items', {
        id: U.uid('it'), order_id: id, tenant_id: tenantId,
        description: item, qty: 1, unit_value: Math.round(valor / servico.items.length),
        done: status === 'concluida' ? 1 : 0,
      });
    }

    insert('order_events', {
      id: U.uid('ev'), order_id: id, tenant_id: tenantId, type: 'criada',
      message: `OS ${order.code} criada.`, user_id: ownerId, user_name: 'Sistema',
      created_at: createdAt,
    });

    if (status === 'concluida') {
      finishDemoOrder(order, colaborador, scheduled, tenantId, ownerId);
    } else if (status === 'em_andamento') {
      update('orders', id, { started_at: new Date(now.getTime() - between(20, 90) * 60000).toISOString() });
      insert('order_events', {
        id: U.uid('ev'), order_id: id, tenant_id: tenantId, type: 'inicio',
        message: `Servico iniciado por ${colaborador?.name || 'colaborador'}.`,
        user_id: colaborador?.id, user_name: colaborador?.name, created_at: now.toISOString(),
      });
      addPhoto(order, 'antes', i, colaborador?.id);
    }

    criadas.push(id);
  }

  // Algumas despesas fixas para o financeiro nao ficar vazio.
  const despesas = [
    ['Combustivel da frota', 68000, 'operacional'],
    ['Aluguel do deposito', 180000, 'fixo'],
    ['Ferramentas e insumos', 42000, 'operacional'],
    ['Telefonia e internet', 22000, 'fixo'],
  ];
  for (const [descricao, valor, categoria] of despesas) {
    insert('finance_entries', {
      id: U.uid('fin'), tenant_id: tenantId, kind: 'despesa', category: categoria,
      description: descricao, amount: valor,
      due_date: new Date().toISOString().slice(0, 10),
      paid_at: new Date().toISOString(), created_by: ownerId, created_at: new Date().toISOString(),
    });
  }

  return { orders: criadas.length, team: equipe.length, customers: parceiros.length, equipe };
}

function finishDemoOrder(order, colaborador, scheduled, tenantId, ownerId) {
  const started = new Date(scheduled);
  const duration = between(45, 240);
  const finished = new Date(started.getTime() + duration * 60000);
  const rating = Math.random() < 0.75 ? 5 : pickOne([4, 4, 5, 3]);
  const seed = rand(1000);

  addPhoto(order, 'antes', seed, colaborador?.id, started);
  addPhoto(order, 'depois', seed + 1, colaborador?.id, finished);
  if (Math.random() < 0.18) addPhoto(order, 'avaria', seed + 2, colaborador?.id, started);

  const sigColab = storage.saveDataUrl(fakeSignature(seed), {
    tenantId, orderId: order.id, prefix: 'assinatura-colaborador',
  });
  insert('order_signatures', {
    id: U.uid('sig'), order_id: order.id, tenant_id: tenantId, role: 'colaborador',
    name: colaborador?.name || 'Equipe', url: sigColab.url,
    hash: U.sha256(`${order.id}|colaborador|${finished.toISOString()}|${sigColab.hash}`),
    ip: '127.0.0.1', user_agent: 'Servio App/1.0 (demo)', signed_at: finished.toISOString(),
  });

  const sigCliente = storage.saveDataUrl(fakeSignature(seed + 7), {
    tenantId, orderId: order.id, prefix: 'assinatura-cliente',
  });
  insert('order_signatures', {
    id: U.uid('sig'), order_id: order.id, tenant_id: tenantId, role: 'cliente',
    name: order.client_name, url: sigCliente.url,
    hash: U.sha256(`${order.id}|cliente|${finished.toISOString()}|${sigCliente.hash}`),
    ip: '127.0.0.1', user_agent: 'Servio App/1.0 (demo)', signed_at: finished.toISOString(),
  });

  const recebido = Math.random() < 0.72;
  const pago = Math.random() < 0.68;

  update('orders', order.id, {
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    duration_min: duration,
    rating,
    client_feedback: pickOne(FEEDBACKS),
    field_notes: pickOne(['Montagem concluida sem intercorrencias.', 'Cliente solicitou reposicionar o movel apos a montagem.', 'Peca com pequeno risco: registrado em foto e comunicado a loja.', '']),
    received: recebido ? 1 : 0,
    received_at: recebido ? finished.toISOString() : null,
    paid_assignee: pago ? 1 : 0,
    paid_at: pago ? finished.toISOString() : null,
    updated_at: finished.toISOString(),
  });

  insert('order_events', {
    id: U.uid('ev'), order_id: order.id, tenant_id: tenantId, type: 'conclusao',
    message: `Servico concluido por ${colaborador?.name || 'colaborador'} em ${duration} min.`,
    user_id: colaborador?.id, user_name: colaborador?.name, created_at: finished.toISOString(),
  });

  const revenue = calc.revenueOf(order);
  if (revenue > 0) {
    insert('finance_entries', {
      id: U.uid('fin'), tenant_id: tenantId, order_id: order.id, kind: 'receita', category: 'servico',
      description: `Receita da ${order.code} - ${order.client_name}`, amount: revenue,
      due_date: finished.toISOString().slice(0, 10),
      paid_at: recebido ? finished.toISOString() : null,
      created_by: ownerId, created_at: finished.toISOString(),
    });
  }
  if (order.assignee_pay > 0) {
    insert('finance_entries', {
      id: U.uid('fin'), tenant_id: tenantId, order_id: order.id, kind: 'repasse', category: 'mao-de-obra',
      description: `Repasse da ${order.code}`, amount: order.assignee_pay,
      due_date: finished.toISOString().slice(0, 10),
      paid_at: pago ? finished.toISOString() : null,
      party: colaborador?.name || null,
      created_by: ownerId, created_at: finished.toISOString(),
    });
  }
}

function addPhoto(order, kind, seed, userId, when) {
  const saved = storage.saveDataUrl(fakePhoto(seed), {
    tenantId: order.tenant_id, orderId: order.id, prefix: kind,
  });
  insert('order_photos', {
    id: U.uid('ph'), order_id: order.id, tenant_id: order.tenant_id, kind,
    url: saved.url,
    caption: { antes: 'Ambiente antes do servico', depois: 'Servico concluido', avaria: 'Avaria registrada', documento: 'Documento' }[kind],
    user_id: userId || null,
    created_at: (when || new Date()).toISOString(),
  });
}

module.exports = { seedDemoData, fakePhoto, fakeSignature };

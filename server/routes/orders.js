'use strict';
const express = require('express');
const { all, get, insert, update, run, transaction } = require('../db');
const U = require('../util');
const auth = require('../auth');
const calc = require('../calc');
const storage = require('../storage');

const router = express.Router();
const { wrap, uid, nowISO, clean, toCents, bad, notFound, forbidden } = U;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
function logEvent(order, type, message, req, meta) {
  insert('order_events', {
    id: uid('ev'),
    order_id: order.id,
    tenant_id: order.tenant_id,
    type,
    message,
    user_id: req?.user?.id || null,
    user_name: req?.user?.name || 'Sistema',
    meta: meta ? JSON.stringify(meta) : null,
    created_at: nowISO(),
  });
}

/** Busca a OS garantindo escopo do tenant e, para campo, a atribuicao. */
function loadOrder(req, id) {
  const order = get('SELECT * FROM orders WHERE id=? AND tenant_id=?', [id, req.user.tenant_id]);
  if (!order) throw notFound('Ordem de servico nao encontrada.');
  if (req.user.role === 'campo' && order.assignee_id !== req.user.id) {
    throw forbidden('Esta OS nao esta atribuida a voce.');
  }
  return order;
}

const isManager = (req) => ['dono', 'admin', 'superadmin'].includes(req.user.role);

function assertManager(req) {
  if (!isManager(req)) throw forbidden('Apenas o administrador pode fazer isso.');
}

/** Campos que o gestor pode gravar diretamente na OS. */
function orderPayload(b, tenantId) {
  const out = {};
  const text = {
    client_name: 140, client_phone: 20, client_doc: 24, title: 160, description: 2000,
    service_type: 60, address: 200, district: 80, city: 80, uf: 2, zip: 12,
    reference: 160, window_label: 40, invoice_ref: 60, field_notes: 2000,
  };
  for (const [key, max] of Object.entries(text)) {
    if (b[key] !== undefined) out[key] = clean(b[key], max);
  }
  if (b.status !== undefined) {
    if (!calc.STATUSES.includes(b.status)) throw bad('Status invalido.');
    out.status = b.status;
  }
  if (b.priority !== undefined) out.priority = ['baixa', 'normal', 'alta', 'urgente'].includes(b.priority) ? b.priority : 'normal';
  if (b.scheduled_at !== undefined) out.scheduled_at = b.scheduled_at ? new Date(b.scheduled_at).toISOString() : null;
  if (b.value_total !== undefined) out.value_total = toCents(b.value_total);
  if (b.extra_value !== undefined) out.extra_value = toCents(b.extra_value);
  if (b.expenses !== undefined) out.expenses = toCents(b.expenses);
  if (b.commission_pct !== undefined) out.commission_pct = U.pct(b.commission_pct);
  if (b.pay_mode !== undefined) out.pay_mode = b.pay_mode === 'fixo' ? 'fixo' : 'pct';
  if (b.checklist !== undefined) out.checklist = JSON.stringify(Array.isArray(b.checklist) ? b.checklist : []);
  if (b.customer_id !== undefined) {
    out.customer_id = b.customer_id
      ? (get('SELECT id FROM customers WHERE id=? AND tenant_id=?', [b.customer_id, tenantId])?.id || null)
      : null;
  }
  if (b.assignee_id !== undefined) {
    out.assignee_id = b.assignee_id
      ? (get('SELECT id FROM users WHERE id=? AND tenant_id=?', [b.assignee_id, tenantId])?.id || null)
      : null;
  }
  return out;
}

/** Recalcula o repasse do colaborador apos qualquer mudanca de valor. */
function refreshAssigneePay(orderId, override) {
  const order = get('SELECT * FROM orders WHERE id=?', [orderId]);
  const assignee = order.assignee_id ? get('SELECT * FROM users WHERE id=?', [order.assignee_id]) : null;
  const pay = calc.assigneePayFor(order, assignee, override);
  update('orders', orderId, { assignee_pay: pay, updated_at: nowISO() });
  return pay;
}

/* ------------------------------------------------------------------ *
 * Listagem
 * ------------------------------------------------------------------ */
router.get('/orders', wrap(async (req, res) => {
  const tid = req.user.tenant_id;
  const where = ['o.tenant_id = ?'];
  const params = [tid];
  const q = req.query;

  if (req.user.role === 'campo') { where.push('o.assignee_id = ?'); params.push(req.user.id); }
  else if (q.assignee) {
    if (q.assignee === 'sem') where.push('o.assignee_id IS NULL');
    else { where.push('o.assignee_id = ?'); params.push(q.assignee); }
  }
  if (q.status && q.status !== 'todas') {
    const list = String(q.status).split(',').filter((s) => calc.STATUSES.includes(s));
    if (list.length) { where.push(`o.status IN (${list.map(() => '?').join(',')})`); params.push(...list); }
  }
  if (q.customer) { where.push('o.customer_id = ?'); params.push(q.customer); }
  if (q.from) { where.push('o.scheduled_at >= ?'); params.push(new Date(q.from).toISOString()); }
  if (q.to) { where.push('o.scheduled_at < ?'); params.push(U.addDays(new Date(q.to), 1).toISOString()); }
  if (q.received === '0') where.push('o.received = 0');
  if (q.pending_pay === '1') where.push('o.paid_assignee = 0 AND o.status = "concluida"');
  if (q.q) {
    where.push('(o.client_name LIKE ? OR o.code LIKE ? OR o.address LIKE ? OR o.title LIKE ? OR o.client_phone LIKE ?)');
    const like = `%${clean(q.q, 60)}%`;
    params.push(like, like, like, like, like);
  }

  const limit = Math.min(U.int(q.limit, 60), 300);
  const offset = Math.max(U.int(q.offset, 0), 0);

  const rows = all(`
    SELECT o.*, c.name AS customer_name, u.name AS assignee_name, u.color AS assignee_color,
           (SELECT COUNT(*) FROM order_photos p WHERE p.order_id = o.id) AS photo_count,
           (SELECT COUNT(*) FROM order_signatures s WHERE s.order_id = o.id) AS signature_count
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN users u ON u.id = o.assignee_id
     WHERE ${where.join(' AND ')}
     ORDER BY (o.scheduled_at IS NULL), o.scheduled_at ASC, o.created_at DESC
     LIMIT ? OFFSET ?`, [...params, limit, offset]);

  const total = get(`SELECT COUNT(*) AS n FROM orders o WHERE ${where.join(' AND ')}`, params)?.n || 0;
  res.json({ orders: rows.map(calc.decorate), total, limit, offset });
}));

/* ------------------------------------------------------------------ *
 * Detalhe
 * ------------------------------------------------------------------ */
router.get('/orders/:id', wrap(async (req, res) => {
  const order = loadOrder(req, req.params.id);
  res.json(fullOrder(order));
}));

function fullOrder(order) {
  const customer = order.customer_id ? get('SELECT * FROM customers WHERE id=?', [order.customer_id]) : null;
  const assignee = order.assignee_id ? get('SELECT id,name,phone,color,commission_pct,pay_mode,pay_fixed FROM users WHERE id=?', [order.assignee_id]) : null;
  return {
    order: calc.decorate({ ...order, customer_name: customer?.name || null, assignee_name: assignee?.name || null }),
    customer,
    assignee,
    items: all('SELECT * FROM order_items WHERE order_id=? ORDER BY rowid', [order.id]),
    photos: all('SELECT * FROM order_photos WHERE order_id=? ORDER BY created_at', [order.id]),
    signatures: all('SELECT * FROM order_signatures WHERE order_id=? ORDER BY signed_at', [order.id]),
    events: all('SELECT * FROM order_events WHERE order_id=? ORDER BY created_at DESC LIMIT 60', [order.id]),
  };
}

/* ------------------------------------------------------------------ *
 * Criacao
 * ------------------------------------------------------------------ */
router.post('/orders', wrap(async (req, res) => {
  assertManager(req);
  const tid = req.user.tenant_id;
  const b = req.body || {};
  const data = orderPayload(b, tid);
  if (!data.client_name) throw bad('Informe o nome do cliente.');

  // Herda a comissao padrao do parceiro quando nao informada.
  if (data.customer_id && b.commission_pct === undefined) {
    const c = get('SELECT commission_pct FROM customers WHERE id=?', [data.customer_id]);
    if (c) data.commission_pct = c.commission_pct;
  }

  const id = uid('os');
  const now = nowISO();
  insert('orders', {
    id,
    tenant_id: tid,
    code: calc.nextOrderCode(tid),
    public_token: U.token(12),
    status: data.status || (data.assignee_id ? 'agendada' : 'pendente'),
    priority: 'normal',
    value_total: 0, commission_pct: 0, extra_value: 0, expenses: 0,
    pay_mode: 'pct', assignee_pay: 0, received: 0, paid_assignee: 0,
    checklist: '[]',
    source: clean(b.source, 20) || 'manual',
    created_by: req.user.id,
    created_at: now,
    updated_at: now,
    ...data,
  });

  const order = get('SELECT * FROM orders WHERE id=?', [id]);
  refreshAssigneePay(id, b.assignee_pay !== undefined ? toCents(b.assignee_pay) : undefined);

  if (Array.isArray(b.items)) {
    for (const item of b.items) addItem(order, item);
  }

  logEvent(order, 'criada', `OS ${order.code} criada por ${req.user.name}.`, req);
  if (order.assignee_id) {
    const a = get('SELECT name FROM users WHERE id=?', [order.assignee_id]);
    logEvent(order, 'atribuida', `Atribuida a ${a?.name || 'colaborador'}.`, req);
  }

  res.status(201).json(fullOrder(get('SELECT * FROM orders WHERE id=?', [id])));
}));

/* ------------------------------------------------------------------ *
 * Edicao
 * ------------------------------------------------------------------ */
router.patch('/orders/:id', wrap(async (req, res) => {
  const order = loadOrder(req, req.params.id);
  const b = req.body || {};

  // Colaborador de campo so pode alterar observacoes e checklist da propria OS.
  const data = isManager(req)
    ? orderPayload(b, order.tenant_id)
    : (() => {
        const limited = {};
        if (b.field_notes !== undefined) limited.field_notes = clean(b.field_notes, 2000);
        if (b.checklist !== undefined) limited.checklist = JSON.stringify(Array.isArray(b.checklist) ? b.checklist : []);
        return limited;
      })();

  if (!Object.keys(data).length) return res.json(fullOrder(order));

  const previousAssignee = order.assignee_id;
  data.updated_at = nowISO();
  update('orders', order.id, data, order.tenant_id);

  if (data.assignee_id !== undefined && data.assignee_id !== previousAssignee) {
    const a = data.assignee_id ? get('SELECT name FROM users WHERE id=?', [data.assignee_id]) : null;
    logEvent(order, 'atribuida', a ? `Atribuida a ${a.name}.` : 'Colaborador removido da OS.', req);
    if (a && get('SELECT status FROM orders WHERE id=?', [order.id]).status === 'pendente') {
      update('orders', order.id, { status: 'agendada' });
    }
  }
  if (data.status !== undefined && data.status !== order.status) {
    logEvent(order, 'status', `Status alterado para ${calc.STATUS_LABEL[data.status]}.`, req);
  }

  const override = b.assignee_pay !== undefined ? toCents(b.assignee_pay) : undefined;
  const valueTouched = ['value_total', 'extra_value', 'commission_pct', 'assignee_id', 'pay_mode'].some((k) => data[k] !== undefined);
  if (override !== undefined || valueTouched) refreshAssigneePay(order.id, override);

  res.json(fullOrder(get('SELECT * FROM orders WHERE id=?', [order.id])));
}));

router.delete('/orders/:id', wrap(async (req, res) => {
  assertManager(req);
  const order = loadOrder(req, req.params.id);
  for (const p of all('SELECT url FROM order_photos WHERE order_id=?', [order.id])) storage.removeByUrl(p.url);
  for (const s of all('SELECT url FROM order_signatures WHERE order_id=?', [order.id])) storage.removeByUrl(s.url);
  run('DELETE FROM orders WHERE id=? AND tenant_id=?', [order.id, order.tenant_id]);
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ *
 * Execucao em campo: iniciar / pausar / concluir
 * ------------------------------------------------------------------ */
router.post('/orders/:id/start', wrap(async (req, res) => {
  const order = loadOrder(req, req.params.id);
  if (order.status === 'concluida') throw bad('Esta OS ja foi concluida.');
  update('orders', order.id, {
    status: 'em_andamento',
    started_at: order.started_at || nowISO(),
    updated_at: nowISO(),
  }, order.tenant_id);
  logEvent(order, 'inicio', `Servico iniciado por ${req.user.name}.`, req, { geo: req.body?.geo });
  res.json(fullOrder(get('SELECT * FROM orders WHERE id=?', [order.id])));
}));

router.post('/orders/:id/pause', wrap(async (req, res) => {
  const order = loadOrder(req, req.params.id);
  update('orders', order.id, { status: 'pausada', updated_at: nowISO() }, order.tenant_id);
  logEvent(order, 'pausa', clean(req.body?.reason, 200) || 'Servico pausado.', req);
  res.json(fullOrder(get('SELECT * FROM orders WHERE id=?', [order.id])));
}));

/**
 * Conclusao: aplica as regras da empresa (foto e assinaturas obrigatorias).
 * E aqui que a OS vira comprovante digital.
 */
router.post('/orders/:id/finish', wrap(async (req, res) => {
  const order = loadOrder(req, req.params.id);
  const tenant = get('SELECT settings FROM tenants WHERE id=?', [order.tenant_id]);
  const cfg = calc.safeParse(tenant?.settings, {});

  const photos = all('SELECT kind FROM order_photos WHERE order_id=?', [order.id]);
  const signatures = all('SELECT role FROM order_signatures WHERE order_id=?', [order.id]);

  const missing = [];
  if (cfg.require_after_photo !== false && !photos.some((p) => p.kind === 'depois')) {
    missing.push('foto do servico concluido');
  }
  if (cfg.require_before_photo && !photos.some((p) => p.kind === 'antes')) {
    missing.push('foto de antes');
  }
  if (!signatures.some((s) => s.role === 'colaborador')) missing.push('assinatura do colaborador');
  if (cfg.require_client_signature !== false && !signatures.some((s) => s.role === 'cliente')) {
    missing.push('assinatura do cliente');
  }
  if (missing.length) throw bad(`Para concluir falta: ${missing.join(', ')}.`, { missing });

  const finishedAt = nowISO();
  const startedAt = order.started_at || order.scheduled_at || finishedAt;
  const duration = Math.max(0, Math.round((new Date(finishedAt) - new Date(startedAt)) / 60000));
  const rating = U.int(req.body?.rating, 0);

  update('orders', order.id, {
    status: 'concluida',
    started_at: startedAt,
    finished_at: finishedAt,
    duration_min: duration,
    rating: rating >= 1 && rating <= 5 ? rating : null,
    client_feedback: clean(req.body?.feedback, 600) || order.client_feedback,
    field_notes: req.body?.notes !== undefined ? clean(req.body.notes, 2000) : order.field_notes,
    updated_at: finishedAt,
  }, order.tenant_id);

  refreshAssigneePay(order.id);
  const done = get('SELECT * FROM orders WHERE id=?', [order.id]);
  logEvent(done, 'conclusao', `Servico concluido por ${req.user.name} em ${duration} min.`, req, { rating });

  // Lanca o financeiro automaticamente.
  const revenue = calc.revenueOf(done);
  if (revenue > 0 && !get('SELECT id FROM finance_entries WHERE order_id=? AND kind=?', [done.id, 'receita'])) {
    insert('finance_entries', {
      id: uid('fin'), tenant_id: done.tenant_id, order_id: done.id,
      kind: 'receita', category: 'servico',
      description: `Receita da ${done.code} - ${done.client_name}`,
      amount: revenue, due_date: finishedAt.slice(0, 10),
      party: done.customer_id ? get('SELECT name FROM customers WHERE id=?', [done.customer_id])?.name : done.client_name,
      created_by: req.user.id, created_at: finishedAt,
    });
  }
  if (done.assignee_pay > 0 && !get('SELECT id FROM finance_entries WHERE order_id=? AND kind=?', [done.id, 'repasse'])) {
    insert('finance_entries', {
      id: uid('fin'), tenant_id: done.tenant_id, order_id: done.id,
      kind: 'repasse', category: 'mao-de-obra',
      description: `Repasse da ${done.code}`,
      amount: done.assignee_pay, due_date: finishedAt.slice(0, 10),
      party: get('SELECT name FROM users WHERE id=?', [done.assignee_id])?.name || null,
      created_by: req.user.id, created_at: finishedAt,
    });
  }

  res.json({
    ...fullOrder(done),
    receipt_url: `/os.html?t=${done.public_token}`,
  });
}));

/* ------------------------------------------------------------------ *
 * Itens do servico
 * ------------------------------------------------------------------ */
function addItem(order, raw) {
  const description = clean(raw?.description, 200);
  if (!description) return null;
  const id = uid('it');
  insert('order_items', {
    id, order_id: order.id, tenant_id: order.tenant_id,
    description,
    qty: Number(raw.qty) > 0 ? Number(raw.qty) : 1,
    unit_value: toCents(raw.unit_value),
    done: raw.done ? 1 : 0,
  });
  return id;
}

router.post('/orders/:id/items', wrap(async (req, res) => {
  const order = loadOrder(req, req.params.id);
  const id = addItem(order, req.body);
  if (!id) throw bad('Descreva o item.');
  res.status(201).json(all('SELECT * FROM order_items WHERE order_id=? ORDER BY rowid', [order.id]));
}));

router.patch('/orders/:id/items/:itemId', wrap(async (req, res) => {
  const order = loadOrder(req, req.params.id);
  const data = {};
  if (req.body?.done !== undefined) data.done = req.body.done ? 1 : 0;
  if (isManager(req)) {
    if (req.body?.description !== undefined) data.description = clean(req.body.description, 200);
    if (req.body?.qty !== undefined) data.qty = Number(req.body.qty) || 1;
    if (req.body?.unit_value !== undefined) data.unit_value = toCents(req.body.unit_value);
  }
  update('order_items', req.params.itemId, data, order.tenant_id);
  res.json(all('SELECT * FROM order_items WHERE order_id=? ORDER BY rowid', [order.id]));
}));

router.delete('/orders/:id/items/:itemId', wrap(async (req, res) => {
  const order = loadOrder(req, req.params.id);
  assertManager(req);
  run('DELETE FROM order_items WHERE id=? AND order_id=?', [req.params.itemId, order.id]);
  res.json(all('SELECT * FROM order_items WHERE order_id=? ORDER BY rowid', [order.id]));
}));

/* ------------------------------------------------------------------ *
 * Fotos do servico (antes / depois / avaria / documento)
 * ------------------------------------------------------------------ */
router.post('/orders/:id/photos', wrap(async (req, res) => {
  const order = loadOrder(req, req.params.id);
  const kind = ['antes', 'depois', 'avaria', 'documento'].includes(req.body?.kind) ? req.body.kind : 'depois';
  const saved = storage.saveDataUrl(req.body?.image, {
    tenantId: order.tenant_id, orderId: order.id, prefix: kind,
  });
  insert('order_photos', {
    id: uid('ph'), order_id: order.id, tenant_id: order.tenant_id,
    kind, url: saved.url, caption: clean(req.body?.caption, 160),
    user_id: req.user.id, created_at: nowISO(),
  });
  logEvent(order, 'foto', `Foto (${kind}) enviada por ${req.user.name}.`, req);
  res.status(201).json(all('SELECT * FROM order_photos WHERE order_id=? ORDER BY created_at', [order.id]));
}));

router.delete('/orders/:id/photos/:photoId', wrap(async (req, res) => {
  const order = loadOrder(req, req.params.id);
  const photo = get('SELECT * FROM order_photos WHERE id=? AND order_id=?', [req.params.photoId, order.id]);
  if (!photo) throw notFound('Foto nao encontrada.');
  if (order.status === 'concluida' && !isManager(req)) throw forbidden('A OS ja foi concluida.');
  storage.removeByUrl(photo.url);
  run('DELETE FROM order_photos WHERE id=?', [photo.id]);
  res.json(all('SELECT * FROM order_photos WHERE order_id=? ORDER BY created_at', [order.id]));
}));

/* ------------------------------------------------------------------ *
 * Assinatura digital (colaborador e cliente)
 * ------------------------------------------------------------------ */
router.post('/orders/:id/signatures', wrap(async (req, res) => {
  const order = loadOrder(req, req.params.id);
  const role = req.body?.role === 'cliente' ? 'cliente' : 'colaborador';
  const name = clean(req.body?.name, 140) || (role === 'colaborador' ? req.user.name : order.client_name);
  if (!name) throw bad('Informe o nome de quem esta assinando.');

  const saved = storage.saveDataUrl(req.body?.image, {
    tenantId: order.tenant_id, orderId: order.id, prefix: `assinatura-${role}`,
  });

  const signedAt = nowISO();
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();

  // Hash de integridade: liga o desenho da assinatura a OS, ao nome e ao momento.
  const proof = U.sha256(`${order.id}|${role}|${name}|${signedAt}|${saved.hash}`);

  const existing = get('SELECT id, url FROM order_signatures WHERE order_id=? AND role=?', [order.id, role]);
  if (existing) {
    if (order.status === 'concluida') throw bad('A OS ja foi concluida e assinada. Assinatura nao pode ser refeita.');
    storage.removeByUrl(existing.url);
    run('DELETE FROM order_signatures WHERE id=?', [existing.id]);
  }

  insert('order_signatures', {
    id: uid('sig'), order_id: order.id, tenant_id: order.tenant_id,
    role, name, doc: clean(req.body?.doc, 24),
    url: saved.url, hash: proof, ip,
    user_agent: clean(req.headers['user-agent'], 240),
    geo: req.body?.geo ? JSON.stringify(req.body.geo) : null,
    signed_at: signedAt,
  });
  logEvent(order, 'assinatura', `Assinatura do ${role} coletada (${name}).`, req, { hash: proof });

  res.status(201).json({
    signatures: all('SELECT * FROM order_signatures WHERE order_id=? ORDER BY signed_at', [order.id]),
    hash: proof,
  });
}));

/* ------------------------------------------------------------------ *
 * Financeiro da OS: recebimento e repasse
 * ------------------------------------------------------------------ */
router.post('/orders/:id/settle', wrap(async (req, res) => {
  assertManager(req);
  const order = loadOrder(req, req.params.id);
  const data = { updated_at: nowISO() };

  if (req.body?.received !== undefined) {
    data.received = req.body.received ? 1 : 0;
    data.received_at = req.body.received ? nowISO() : null;
    const entry = get('SELECT id FROM finance_entries WHERE order_id=? AND kind=?', [order.id, 'receita']);
    if (entry) update('finance_entries', entry.id, { paid_at: data.received ? data.received_at : null }, order.tenant_id);
    logEvent(order, 'financeiro', data.received ? 'Recebimento confirmado.' : 'Recebimento desmarcado.', req);
  }
  if (req.body?.paid_assignee !== undefined) {
    data.paid_assignee = req.body.paid_assignee ? 1 : 0;
    data.paid_at = req.body.paid_assignee ? nowISO() : null;
    const entry = get('SELECT id FROM finance_entries WHERE order_id=? AND kind=?', [order.id, 'repasse']);
    if (entry) update('finance_entries', entry.id, { paid_at: data.paid_assignee ? data.paid_at : null }, order.tenant_id);
    logEvent(order, 'financeiro', data.paid_assignee ? 'Repasse pago ao colaborador.' : 'Repasse marcado como pendente.', req);
  }

  update('orders', order.id, data, order.tenant_id);
  res.json(fullOrder(get('SELECT * FROM orders WHERE id=?', [order.id])));
}));

/* ------------------------------------------------------------------ *
 * Importacao em lote (planilha / nota colada)
 * ------------------------------------------------------------------ */
const IMPORT_FIELDS = {
  cliente: 'client_name', nome: 'client_name', comprador: 'client_name',
  telefone: 'client_phone', fone: 'client_phone', celular: 'client_phone', whatsapp: 'client_phone',
  endereco: 'address', rua: 'address', logradouro: 'address',
  bairro: 'district', cidade: 'city', uf: 'uf', estado: 'uf', cep: 'zip',
  valor: 'value_total', total: 'value_total', preco: 'value_total',
  data: 'scheduled_at', agendamento: 'scheduled_at', entrega: 'scheduled_at',
  loja: '__customer', parceiro: '__customer', fornecedor: '__customer',
  obs: 'description', observacao: 'description', descricao: 'description', produto: 'title', item: 'title',
  nota: 'invoice_ref', pedido: 'invoice_ref', nf: 'invoice_ref',
  tipo: 'service_type', servico: 'service_type',
};

function parseImport(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const delimiter = [';', '\t', ','].map((d) => ({ d, n: (lines[0].match(new RegExp(`\\${d}`, 'g')) || []).length }))
    .sort((a, b) => b.n - a.n)[0];
  if (!delimiter.n) return [];

  const split = (line) => line.split(delimiter.d).map((c) => c.trim());
  const headerCells = split(lines[0]).map((c) => U.slugify(c).replace(/-/g, ''));
  const hasHeader = headerCells.some((c) => IMPORT_FIELDS[c]);
  const map = hasHeader ? headerCells.map((c) => IMPORT_FIELDS[c] || null) : ['client_name', 'client_phone', 'address', 'value_total', 'scheduled_at'];

  const rows = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = split(line);
    const row = {};
    cells.forEach((value, i) => {
      const field = map[i];
      if (!field || !value) return;
      row[field] = value;
    });
    if (row.client_name) rows.push(row);
  }
  return rows;
}

router.post('/orders/import/preview', wrap(async (req, res) => {
  assertManager(req);
  const rows = parseImport(req.body?.text);
  res.json({
    total: rows.length,
    rows: rows.slice(0, 50).map((r) => ({
      ...r,
      value_total_cents: toCents(r.value_total),
      scheduled_iso: parseDateBR(r.scheduled_at),
    })),
  });
}));

router.post('/orders/import', wrap(async (req, res) => {
  assertManager(req);
  const tid = req.user.tenant_id;
  const rows = parseImport(req.body?.text);
  if (!rows.length) throw bad('Nao consegui identificar nenhuma linha. Confira o separador (; , ou tabulacao).');

  const defaults = req.body?.defaults || {};
  const customerId = defaults.customer_id
    ? get('SELECT id, commission_pct FROM customers WHERE id=? AND tenant_id=?', [defaults.customer_id, tid])
    : null;
  const assigneeId = defaults.assignee_id
    ? get('SELECT id FROM users WHERE id=? AND tenant_id=?', [defaults.assignee_id, tid])?.id
    : null;

  const created = [];
  transaction(() => {
    for (const row of rows) {
      const id = uid('os');
      const now = nowISO();
      insert('orders', {
        id, tenant_id: tid,
        code: calc.nextOrderCode(tid),
        public_token: U.token(12),
        customer_id: customerId?.id || null,
        assignee_id: assigneeId,
        client_name: clean(row.client_name, 140),
        client_phone: U.digits(row.client_phone).slice(0, 15),
        title: clean(row.title, 160) || clean(defaults.title, 160),
        description: clean(row.description, 2000),
        service_type: clean(row.service_type, 60) || clean(defaults.service_type, 60),
        status: assigneeId ? 'agendada' : 'pendente',
        priority: 'normal',
        scheduled_at: parseDateBR(row.scheduled_at) || (defaults.scheduled_at ? new Date(defaults.scheduled_at).toISOString() : null),
        address: clean(row.address, 200),
        district: clean(row.district, 80),
        city: clean(row.city, 80) || clean(defaults.city, 80),
        uf: clean(row.uf, 2).toUpperCase(),
        zip: U.digits(row.zip).slice(0, 8),
        invoice_ref: clean(row.invoice_ref, 60),
        value_total: toCents(row.value_total),
        commission_pct: defaults.commission_pct !== undefined ? U.pct(defaults.commission_pct) : (customerId?.commission_pct || 0),
        extra_value: 0, expenses: 0, pay_mode: 'pct', assignee_pay: 0,
        received: 0, paid_assignee: 0, checklist: '[]',
        source: 'importacao', created_by: req.user.id,
        created_at: now, updated_at: now,
      });
      refreshAssigneePay(id);
      created.push(id);
    }
  });

  res.status(201).json({ ok: true, created: created.length });
}));

/** Aceita 11/08/2026, 2026-08-11, 11/08/2026 14:30 */
function parseDateBR(value) {
  if (!value) return null;
  const str = String(value).trim();
  const br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(str);
  if (br) {
    const [, d, m, y, hh = '8', mm = '00'] = br;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const date = new Date(year, Number(m) - 1, Number(d), Number(hh), Number(mm));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

module.exports = { router, logEvent, fullOrder };

'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

// DATA_DIR pode apontar para um volume persistente em producao (ex.: /data no Fly.io).
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'servio.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/* ------------------------------------------------------------------ *
 * Schema
 * Valores monetarios sao SEMPRE inteiros em centavos.
 * ------------------------------------------------------------------ */
db.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  segment       TEXT,
  doc           TEXT,
  phone         TEXT,
  email         TEXT,
  city          TEXT,
  uf            TEXT,
  team_size     TEXT,
  plan          TEXT NOT NULL DEFAULT 'pro',
  cycle         TEXT NOT NULL DEFAULT 'mensal',
  status        TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TEXT,
  settings      TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT,
  doc            TEXT,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'campo',
  commission_pct REAL NOT NULL DEFAULT 0,
  pay_mode       TEXT NOT NULL DEFAULT 'pct',
  pay_fixed      INTEGER NOT NULL DEFAULT 0,
  skills         TEXT,
  color          TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  last_login     TEXT,
  created_at     TEXT NOT NULL,
  UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS customers (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL DEFAULT 'pj',
  name           TEXT NOT NULL,
  doc            TEXT,
  contact        TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  district       TEXT,
  city           TEXT,
  uf             TEXT,
  zip            TEXT,
  commission_pct REAL NOT NULL DEFAULT 0,
  payment_terms  TEXT,
  notes          TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers (tenant_id);

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  public_token    TEXT NOT NULL,
  customer_id     TEXT REFERENCES customers(id) ON DELETE SET NULL,
  assignee_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  client_name     TEXT NOT NULL,
  client_phone    TEXT,
  client_doc      TEXT,
  title           TEXT,
  description     TEXT,
  service_type    TEXT,
  status          TEXT NOT NULL DEFAULT 'pendente',
  priority        TEXT NOT NULL DEFAULT 'normal',
  scheduled_at    TEXT,
  window_label    TEXT,
  address         TEXT,
  district        TEXT,
  city            TEXT,
  uf              TEXT,
  zip             TEXT,
  reference       TEXT,
  value_total     INTEGER NOT NULL DEFAULT 0,
  commission_pct  REAL NOT NULL DEFAULT 0,
  extra_value     INTEGER NOT NULL DEFAULT 0,
  pay_mode        TEXT NOT NULL DEFAULT 'pct',
  assignee_pay    INTEGER NOT NULL DEFAULT 0,
  expenses        INTEGER NOT NULL DEFAULT 0,
  received        INTEGER NOT NULL DEFAULT 0,
  received_at     TEXT,
  paid_assignee   INTEGER NOT NULL DEFAULT 0,
  paid_at         TEXT,
  invoice_ref     TEXT,
  started_at      TEXT,
  finished_at     TEXT,
  duration_min    INTEGER,
  rating          INTEGER,
  client_feedback TEXT,
  field_notes     TEXT,
  checklist       TEXT NOT NULL DEFAULT '[]',
  source          TEXT NOT NULL DEFAULT 'manual',
  created_by      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_sched ON orders (tenant_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_orders_assignee ON orders (tenant_id, assignee_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_token ON orders (public_token);

CREATE TABLE IF NOT EXISTS order_items (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id   TEXT NOT NULL,
  description TEXT NOT NULL,
  qty         REAL NOT NULL DEFAULT 1,
  unit_value  INTEGER NOT NULL DEFAULT 0,
  done        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items (order_id);

CREATE TABLE IF NOT EXISTS order_photos (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id  TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'depois',
  url        TEXT NOT NULL,
  caption    TEXT,
  user_id    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_order ON order_photos (order_id);

CREATE TABLE IF NOT EXISTS order_signatures (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id  TEXT NOT NULL,
  role       TEXT NOT NULL,
  name       TEXT NOT NULL,
  doc        TEXT,
  url        TEXT NOT NULL,
  hash       TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  geo        TEXT,
  signed_at  TEXT NOT NULL,
  UNIQUE (order_id, role)
);

CREATE TABLE IF NOT EXISTS order_events (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id  TEXT NOT NULL,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  user_id    TEXT,
  user_name  TEXT,
  meta       TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events (order_id);

CREATE TABLE IF NOT EXISTS finance_entries (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id    TEXT REFERENCES orders(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,
  category    TEXT,
  description TEXT NOT NULL,
  amount      INTEGER NOT NULL DEFAULT 0,
  due_date    TEXT,
  paid_at     TEXT,
  method      TEXT,
  party       TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_tenant ON finance_entries (tenant_id, kind);

CREATE TABLE IF NOT EXISTS leads (
  id         TEXT PRIMARY KEY,
  name       TEXT,
  email      TEXT,
  phone      TEXT,
  company    TEXT,
  segment    TEXT,
  team_size  TEXT,
  message    TEXT,
  stage      TEXT NOT NULL DEFAULT 'novo',
  source     TEXT,
  utm        TEXT,
  tenant_id  TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL DEFAULT 'cakto',
  provider_ref   TEXT,
  plan           TEXT NOT NULL,
  cycle          TEXT NOT NULL DEFAULT 'mensal',
  amount         INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pendente',
  checkout_url   TEXT,
  customer_email TEXT,
  period_end     TEXT,
  raw            TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subs_tenant ON subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_subs_ref ON subscriptions (provider_ref);

CREATE TABLE IF NOT EXISTS webhook_events (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  event       TEXT,
  external_id TEXT,
  tenant_id   TEXT,
  status      TEXT NOT NULL DEFAULT 'recebido',
  detail      TEXT,
  payload     TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wh_ext ON webhook_events (provider, external_id, event);

CREATE TABLE IF NOT EXISTS email_log (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT,
  to_email   TEXT NOT NULL,
  template   TEXT NOT NULL,
  dedupe_key TEXT,
  subject    TEXT,
  status     TEXT NOT NULL DEFAULT 'enviado',
  detail     TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_dedupe ON email_log (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_tenant ON email_log (tenant_id, created_at);
`);

/* ------------------------------------------------------------------ *
 * Migracoes
 * Bancos criados antes de uma coluna nova precisam recebe-la aqui, ja que
 * CREATE TABLE IF NOT EXISTS nao altera tabelas existentes.
 * ------------------------------------------------------------------ */
function addColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`[db] coluna adicionada: ${table}.${column}`);
}

// Momento em que a assinatura entrou em atraso - base para a carencia.
addColumn('tenants', 'overdue_since', 'TEXT');

/* ------------------------------------------------------------------ *
 * Helpers de acesso
 * ------------------------------------------------------------------ */
const all = (sql, params = []) => db.prepare(sql).all(...params.map(normalize));
const get = (sql, params = []) => db.prepare(sql).get(...params.map(normalize));
const run = (sql, params = []) => db.prepare(sql).run(...params.map(normalize));

/** INSERT a partir de um objeto simples. */
function insert(table, data) {
  const keys = Object.keys(data);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  db.prepare(sql).run(...keys.map((k) => normalize(data[k])));
  return data.id;
}

/** UPDATE por id, com escopo opcional de tenant. */
function update(table, id, data, tenantId) {
  const keys = Object.keys(data).filter((k) => k !== 'id');
  if (!keys.length) return 0;
  let sql = `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`;
  const params = keys.map((k) => normalize(data[k]));
  params.push(id);
  if (tenantId) { sql += ' AND tenant_id=?'; params.push(tenantId); }
  return db.prepare(sql).run(...params).changes;
}

function normalize(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function transaction(fn) {
  db.exec('BEGIN');
  try { const out = fn(); db.exec('COMMIT'); return out; }
  catch (err) { db.exec('ROLLBACK'); throw err; }
}

module.exports = { db, all, get, run, insert, update, transaction, normalize, DATA_DIR };

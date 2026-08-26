'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/* ------------------------------------------------------------------ *
 * .env loader (sem dependencias)
 * ------------------------------------------------------------------ */
function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

/* ------------------------------------------------------------------ *
 * IDs
 * ------------------------------------------------------------------ */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
function uid(prefix = '') {
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}
function token(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}
function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/* ------------------------------------------------------------------ *
 * Datas (tudo em ISO; a UI trabalha em horario local do navegador)
 * ------------------------------------------------------------------ */
function nowISO() { return new Date().toISOString(); }
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function dayRange(dateStr) {
  // dateStr: "YYYY-MM-DD" -> [inicio, fim) em ISO
  const start = new Date(`${dateStr}T00:00:00`);
  const end = addDays(start, 1);
  return [start.toISOString(), end.toISOString()];
}
function monthRange(ref = new Date()) {
  const d = new Date(ref);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return [start.toISOString(), end.toISOString()];
}

/* ------------------------------------------------------------------ *
 * Numeros / dinheiro (armazenamos centavos inteiros)
 * ------------------------------------------------------------------ */
function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Math.round(value * 100);
  const clean = String(value).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function pct(value) {
  const n = Number(String(value ?? '').toString().replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
function int(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/* ------------------------------------------------------------------ *
 * Strings
 * ------------------------------------------------------------------ */
function slugify(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 48) || 'empresa';
}
function clean(str, max = 240) {
  return String(str ?? '').trim().slice(0, max);
}
function digits(str) { return String(str || '').replace(/\D/g, ''); }
function isEmail(str) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(str || '').trim()); }

/* ------------------------------------------------------------------ *
 * Erros HTTP
 * ------------------------------------------------------------------ */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const bad = (msg, details) => new HttpError(400, msg, details);
const unauthorized = (msg = 'Sessao expirada. Faca login novamente.') => new HttpError(401, msg);
const forbidden = (msg = 'Voce nao tem permissao para esta acao.') => new HttpError(403, msg);
const notFound = (msg = 'Registro nao encontrado.') => new HttpError(404, msg);

/** Envolve handlers async para que erros caiam no middleware de erro. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  loadEnv, uid, token, sha256,
  nowISO, addDays, dayRange, monthRange,
  toCents, money, pct, int,
  slugify, clean, digits, isEmail,
  HttpError, bad, unauthorized, forbidden, notFound, wrap,
};

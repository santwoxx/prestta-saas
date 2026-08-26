'use strict';
const express = require('express');
const { all, get, insert, update, run } = require('../db');
const U = require('../util');
const calc = require('../calc');

const router = express.Router();
const { wrap, uid, nowISO, clean, toCents, bad, notFound, forbidden } = U;
const REV = calc.revenueSQL('o');

function assertManager(req) {
  if (!['dono', 'admin', 'superadmin'].includes(req.user.role)) {
    throw forbidden('Apenas o administrador acessa o financeiro.');
  }
}

/* ------------------------------------------------------------------ *
 * Visao geral do financeiro
 * ------------------------------------------------------------------ */
router.get('/finance', wrap(async (req, res) => {
  assertManager(req);
  const tid = req.user.tenant_id;
  const from = req.query.from ? new Date(req.query.from).toISOString() : U.monthRange()[0];
  const to = req.query.to ? U.addDays(new Date(req.query.to), 1).toISOString() : U.monthRange()[1];

  const receber = all(`
    SELECT o.id, o.code, o.client_name, o.finished_at, o.received, o.invoice_ref,
           ${REV} AS valor, c.name AS parceiro, c.payment_terms
      FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.tenant_id = ? AND o.status = 'concluida' AND o.received = 0
     ORDER BY o.finished_at ASC LIMIT 200`, [tid]);

  const pagar = all(`
    SELECT o.id, o.code, o.client_name, o.finished_at, o.assignee_pay AS valor,
           u.name AS colaborador, u.id AS assignee_id, u.color
      FROM orders o LEFT JOIN users u ON u.id = o.assignee_id
     WHERE o.tenant_id = ? AND o.status = 'concluida' AND o.paid_assignee = 0 AND o.assignee_pay > 0
     ORDER BY u.name, o.finished_at ASC LIMIT 200`, [tid]);

  const periodo = get(`
    SELECT COALESCE(SUM(${REV}), 0) AS receita,
           COALESCE(SUM(o.assignee_pay), 0) AS repasses,
           COALESCE(SUM(o.expenses), 0) AS custos_os,
           COUNT(*) AS os
      FROM orders o
     WHERE o.tenant_id = ? AND o.status = 'concluida' AND o.finished_at >= ? AND o.finished_at < ?`,
    [tid, from, to]);

  const despesas = get(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM finance_entries
     WHERE tenant_id = ? AND kind = 'despesa' AND created_at >= ? AND created_at < ?`, [tid, from, to]);

  const lancamentos = all(`
    SELECT f.*, o.code AS order_code FROM finance_entries f
      LEFT JOIN orders o ON o.id = f.order_id
     WHERE f.tenant_id = ? AND f.created_at >= ? AND f.created_at < ?
     ORDER BY f.created_at DESC LIMIT 200`, [tid, from, to]);

  // Fechamento por colaborador (o "acerto" da semana/mes).
  const acertos = all(`
    SELECT u.id, u.name, u.color, u.pay_mode, u.commission_pct,
           COUNT(o.id) AS os,
           COALESCE(SUM(o.assignee_pay), 0) AS total,
           COALESCE(SUM(CASE WHEN o.paid_assignee = 0 THEN o.assignee_pay ELSE 0 END), 0) AS pendente
      FROM users u
      LEFT JOIN orders o ON o.assignee_id = u.id AND o.status = 'concluida'
                        AND o.finished_at >= ? AND o.finished_at < ?
     WHERE u.tenant_id = ? AND u.role = 'campo'
     GROUP BY u.id HAVING os > 0 OR pendente > 0
     ORDER BY pendente DESC, total DESC`, [from, to, tid]);

  const lucro = periodo.receita - periodo.repasses - periodo.custos_os - despesas.total;

  res.json({
    periodo: { from, to },
    resumo: {
      receita: periodo.receita,
      repasses: periodo.repasses,
      custos_os: periodo.custos_os,
      despesas: despesas.total,
      lucro,
      margem: periodo.receita ? Math.round((lucro / periodo.receita) * 100) : 0,
      os: periodo.os,
      ticket_medio: periodo.os ? Math.round(periodo.receita / periodo.os) : 0,
    },
    a_receber: { total: receber.reduce((s, r) => s + r.valor, 0), itens: receber },
    a_pagar: { total: pagar.reduce((s, r) => s + r.valor, 0), itens: pagar },
    acertos,
    lancamentos,
  });
}));

/* ------------------------------------------------------------------ *
 * Lancamentos avulsos (despesas fixas, receitas extras)
 * ------------------------------------------------------------------ */
router.post('/finance/entries', wrap(async (req, res) => {
  assertManager(req);
  const b = req.body || {};
  const description = clean(b.description, 200);
  if (!description) throw bad('Descreva o lancamento.');
  const amount = toCents(b.amount);
  if (amount <= 0) throw bad('Informe um valor maior que zero.');

  const id = uid('fin');
  insert('finance_entries', {
    id,
    tenant_id: req.user.tenant_id,
    order_id: b.order_id || null,
    kind: ['receita', 'despesa', 'repasse'].includes(b.kind) ? b.kind : 'despesa',
    category: clean(b.category, 60),
    description,
    amount,
    due_date: clean(b.due_date, 10) || null,
    paid_at: b.paid ? nowISO() : null,
    method: clean(b.method, 40),
    party: clean(b.party, 140),
    created_by: req.user.id,
    created_at: nowISO(),
  });
  res.status(201).json(get('SELECT * FROM finance_entries WHERE id=?', [id]));
}));

router.patch('/finance/entries/:id', wrap(async (req, res) => {
  assertManager(req);
  const b = req.body || {};
  const data = {};
  if (b.description !== undefined) data.description = clean(b.description, 200);
  if (b.amount !== undefined) data.amount = toCents(b.amount);
  if (b.category !== undefined) data.category = clean(b.category, 60);
  if (b.due_date !== undefined) data.due_date = clean(b.due_date, 10) || null;
  if (b.method !== undefined) data.method = clean(b.method, 40);
  if (b.paid !== undefined) data.paid_at = b.paid ? nowISO() : null;
  const changed = update('finance_entries', req.params.id, data, req.user.tenant_id);
  if (!changed) throw notFound('Lancamento nao encontrado.');
  res.json(get('SELECT * FROM finance_entries WHERE id=?', [req.params.id]));
}));

router.delete('/finance/entries/:id', wrap(async (req, res) => {
  assertManager(req);
  run('DELETE FROM finance_entries WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ *
 * Acoes em lote: baixar recebimentos / pagar acerto do colaborador
 * ------------------------------------------------------------------ */
router.post('/finance/settle-batch', wrap(async (req, res) => {
  assertManager(req);
  const tid = req.user.tenant_id;
  const ids = Array.isArray(req.body?.order_ids) ? req.body.order_ids.slice(0, 500) : [];
  const field = req.body?.field === 'paid_assignee' ? 'paid_assignee' : 'received';
  const value = req.body?.value === false ? 0 : 1;
  if (!ids.length) throw bad('Selecione ao menos uma OS.');

  const stampCol = field === 'received' ? 'received_at' : 'paid_at';
  const stamp = value ? nowISO() : null;
  const placeholders = ids.map(() => '?').join(',');
  run(`UPDATE orders SET ${field}=?, ${stampCol}=?, updated_at=?
        WHERE tenant_id=? AND id IN (${placeholders})`, [value, stamp, nowISO(), tid, ...ids]);

  const kind = field === 'received' ? 'receita' : 'repasse';
  run(`UPDATE finance_entries SET paid_at=?
        WHERE tenant_id=? AND kind=? AND order_id IN (${placeholders})`, [stamp, tid, kind, ...ids]);

  res.json({ ok: true, updated: ids.length });
}));

/** Exportacao CSV do periodo (abre no Excel / contador). */
router.get('/finance/export.csv', wrap(async (req, res) => {
  assertManager(req);
  const tid = req.user.tenant_id;
  const from = req.query.from ? new Date(req.query.from).toISOString() : U.monthRange()[0];
  const to = req.query.to ? U.addDays(new Date(req.query.to), 1).toISOString() : U.monthRange()[1];

  const rows = all(`
    SELECT o.code, o.finished_at, o.client_name, c.name AS parceiro, u.name AS colaborador,
           ${REV} AS receita, o.assignee_pay, o.expenses, o.received, o.paid_assignee, o.invoice_ref
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN users u ON u.id = o.assignee_id
     WHERE o.tenant_id = ? AND o.status = 'concluida' AND o.finished_at >= ? AND o.finished_at < ?
     ORDER BY o.finished_at`, [tid, from, to]);

  const header = 'OS;Data;Cliente;Parceiro;Colaborador;Receita;Repasse;Custos;Lucro;Recebido;Pago ao colaborador;Nota\n';
  const body = rows.map((r) => [
    r.code,
    r.finished_at ? new Date(r.finished_at).toLocaleDateString('pt-BR') : '',
    csv(r.client_name), csv(r.parceiro), csv(r.colaborador),
    brl(r.receita), brl(r.assignee_pay), brl(r.expenses),
    brl(r.receita - r.assignee_pay - r.expenses),
    r.received ? 'Sim' : 'Nao',
    r.paid_assignee ? 'Sim' : 'Nao',
    csv(r.invoice_ref),
  ].join(';')).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="financeiro-${from.slice(0, 10)}.csv"`);
  res.send(`﻿${header}${body}`);
}));

const csv = (v) => String(v ?? '').replace(/[;\n\r]/g, ' ');
const brl = (cents) => (Number(cents || 0) / 100).toFixed(2).replace('.', ',');

module.exports = { router };

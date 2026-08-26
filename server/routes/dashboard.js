'use strict';
const express = require('express');
const { all, get } = require('../db');
const U = require('../util');
const calc = require('../calc');

const router = express.Router();
const { wrap } = U;
const REV = calc.revenueSQL('o');

/* ------------------------------------------------------------------ *
 * Painel geral
 * ------------------------------------------------------------------ */
router.get('/dashboard', wrap(async (req, res) => {
  const tid = req.user.tenant_id;
  const [monthStart, monthEnd] = U.monthRange();
  const today = new Date();
  const [dayStart, dayEnd] = U.dayRange(localDate(today));

  const counts = get(`
    SELECT
      SUM(status = 'pendente')                                   AS pendentes,
      SUM(status = 'agendada')                                   AS agendadas,
      SUM(status = 'em_andamento')                               AS em_andamento,
      SUM(status = 'pausada')                                    AS pausadas,
      SUM(status = 'concluida')                                  AS concluidas,
      SUM(assignee_id IS NULL AND status NOT IN ('concluida','cancelada')) AS sem_colaborador
    FROM orders WHERE tenant_id = ?`, [tid]) || {};

  const receber = get(`
    SELECT COALESCE(SUM(${REV}), 0) AS total, COUNT(*) AS n FROM orders o
     WHERE o.tenant_id = ? AND o.received = 0 AND o.status = 'concluida'`, [tid]);

  const pagar = get(`
    SELECT COALESCE(SUM(o.assignee_pay), 0) AS total, COUNT(*) AS n FROM orders o
     WHERE o.tenant_id = ? AND o.paid_assignee = 0 AND o.status = 'concluida'`, [tid]);

  const mes = get(`
    SELECT COALESCE(SUM(${REV}), 0) AS receita,
           COALESCE(SUM(o.assignee_pay), 0) AS repasses,
           COALESCE(SUM(o.expenses), 0) AS custos,
           COUNT(*) AS concluidas
      FROM orders o
     WHERE o.tenant_id = ? AND o.status = 'concluida'
       AND o.finished_at >= ? AND o.finished_at < ?`, [tid, monthStart, monthEnd]);

  const hoje = get(`
    SELECT COUNT(*) AS total,
           SUM(status = 'concluida') AS concluidas
      FROM orders
     WHERE tenant_id = ? AND scheduled_at >= ? AND scheduled_at < ?`, [tid, dayStart, dayEnd]);

  const equipe = get(`
    SELECT COUNT(*) AS ativos FROM users
     WHERE tenant_id = ? AND active = 1 AND role IN ('campo','admin','dono')`, [tid]);

  const rating = get(`
    SELECT ROUND(AVG(rating), 2) AS media, COUNT(rating) AS avaliacoes
      FROM orders WHERE tenant_id = ? AND rating IS NOT NULL`, [tid]);

  const proximas = all(`
    SELECT o.id, o.code, o.client_name, o.status, o.scheduled_at, o.address, o.district, o.city,
           o.priority, c.name AS customer_name, u.name AS assignee_name, u.color AS assignee_color
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN users u ON u.id = o.assignee_id
     WHERE o.tenant_id = ? AND o.status NOT IN ('concluida','cancelada')
     ORDER BY (o.scheduled_at IS NULL), o.scheduled_at ASC
     LIMIT 8`, [tid]);

  // Serie dos ultimos 6 meses para o grafico do painel.
  const serie = [];
  for (let i = 5; i >= 0; i--) {
    const ref = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const [s, e] = U.monthRange(ref);
    const row = get(`
      SELECT COALESCE(SUM(${REV}), 0) AS receita, COUNT(*) AS os
        FROM orders o
       WHERE o.tenant_id = ? AND o.status = 'concluida' AND o.finished_at >= ? AND o.finished_at < ?`,
      [tid, s, e]);
    serie.push({
      mes: ref.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      receita: row.receita, os: row.os,
    });
  }

  const ranking = all(`
    SELECT u.id, u.name, u.color,
           COUNT(o.id) AS os,
           COALESCE(SUM(${REV}), 0) AS receita,
           ROUND(AVG(o.rating), 1) AS nota
      FROM users u
      LEFT JOIN orders o ON o.assignee_id = u.id AND o.status = 'concluida'
                        AND o.finished_at >= ? AND o.finished_at < ?
     WHERE u.tenant_id = ? AND u.active = 1 AND u.role = 'campo'
     GROUP BY u.id ORDER BY os DESC, receita DESC LIMIT 6`, [monthStart, monthEnd, tid]);

  res.json({
    contadores: {
      pendentes: counts.pendentes || 0,
      agendadas: counts.agendadas || 0,
      em_andamento: counts.em_andamento || 0,
      pausadas: counts.pausadas || 0,
      concluidas: counts.concluidas || 0,
      sem_colaborador: counts.sem_colaborador || 0,
      hoje: hoje.total || 0,
      hoje_concluidas: hoje.concluidas || 0,
      equipe_ativa: equipe.ativos || 0,
    },
    financeiro: {
      a_receber: receber.total, a_receber_qtd: receber.n,
      a_pagar: pagar.total, a_pagar_qtd: pagar.n,
      receita_mes: mes.receita,
      repasses_mes: mes.repasses,
      custos_mes: mes.custos,
      lucro_mes: mes.receita - mes.repasses - mes.custos,
      concluidas_mes: mes.concluidas,
    },
    satisfacao: { media: rating?.media || 0, avaliacoes: rating?.avaliacoes || 0 },
    proximas: proximas.map(calc.decorate),
    serie,
    ranking,
  });
}));

/* ------------------------------------------------------------------ *
 * Rota do dia
 * ------------------------------------------------------------------ */
router.get('/route', wrap(async (req, res) => {
  const tid = req.user.tenant_id;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : localDate(new Date());
  const [start, end] = U.dayRange(date);

  const where = ['o.tenant_id = ?', 'o.scheduled_at >= ?', 'o.scheduled_at < ?', "o.status != 'cancelada'"];
  const params = [tid, start, end];
  if (req.user.role === 'campo') { where.push('o.assignee_id = ?'); params.push(req.user.id); }
  else if (req.query.assignee) { where.push('o.assignee_id = ?'); params.push(req.query.assignee); }

  const stops = all(`
    SELECT o.*, c.name AS customer_name, u.name AS assignee_name, u.color AS assignee_color, u.phone AS assignee_phone
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN users u ON u.id = o.assignee_id
     WHERE ${where.join(' AND ')}
     ORDER BY o.scheduled_at ASC`, params);

  const byAssignee = new Map();
  for (const stop of stops) {
    const key = stop.assignee_id || 'sem';
    if (!byAssignee.has(key)) {
      byAssignee.set(key, {
        assignee_id: stop.assignee_id,
        assignee_name: stop.assignee_name || 'Sem colaborador',
        color: stop.assignee_color || '#94A3B8',
        phone: stop.assignee_phone,
        stops: [],
      });
    }
    byAssignee.get(key).stops.push(calc.decorate(stop));
  }

  const rotas = [...byAssignee.values()].map((r) => ({
    ...r,
    total: r.stops.length,
    concluidas: r.stops.filter((s) => s.status === 'concluida').length,
    receita: r.stops.reduce((sum, s) => sum + s.revenue, 0),
    maps_url: buildMapsUrl(r.stops),
  }));

  res.json({ date, total: stops.length, rotas });
}));

function buildMapsUrl(stops) {
  const addrs = stops
    .map((s) => [s.address, s.district, s.city, s.uf].filter(Boolean).join(', '))
    .filter((a) => a.length > 5);
  if (!addrs.length) return null;
  const destination = encodeURIComponent(addrs[addrs.length - 1]);
  const waypoints = addrs.slice(0, -1).map(encodeURIComponent).join('|');
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`
    + (waypoints ? `&waypoints=${waypoints}` : '')
    + '&travelmode=driving';
}

/* ------------------------------------------------------------------ *
 * Relatorios
 * ------------------------------------------------------------------ */
router.get('/reports', wrap(async (req, res) => {
  const tid = req.user.tenant_id;
  const from = req.query.from ? new Date(req.query.from).toISOString() : U.monthRange()[0];
  const to = req.query.to ? U.addDays(new Date(req.query.to), 1).toISOString() : U.monthRange()[1];

  const resumo = get(`
    SELECT COUNT(*) AS os,
           COALESCE(SUM(${REV}), 0) AS receita,
           COALESCE(SUM(o.assignee_pay), 0) AS repasses,
           COALESCE(SUM(o.expenses), 0) AS custos,
           COALESCE(AVG(o.duration_min), 0) AS duracao_media,
           COALESCE(AVG(o.rating), 0) AS nota_media
      FROM orders o
     WHERE o.tenant_id = ? AND o.status = 'concluida' AND o.finished_at >= ? AND o.finished_at < ?`,
    [tid, from, to]);

  const porParceiro = all(`
    SELECT COALESCE(c.name, 'Cliente direto') AS parceiro, COUNT(*) AS os,
           COALESCE(SUM(${REV}), 0) AS receita
      FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.tenant_id = ? AND o.status = 'concluida' AND o.finished_at >= ? AND o.finished_at < ?
     GROUP BY o.customer_id ORDER BY receita DESC LIMIT 12`, [tid, from, to]);

  const porColaborador = all(`
    SELECT COALESCE(u.name, 'Sem colaborador') AS colaborador, u.color, COUNT(*) AS os,
           COALESCE(SUM(${REV}), 0) AS receita,
           COALESCE(SUM(o.assignee_pay), 0) AS repasse,
           ROUND(AVG(o.rating), 1) AS nota,
           ROUND(AVG(o.duration_min)) AS duracao
      FROM orders o LEFT JOIN users u ON u.id = o.assignee_id
     WHERE o.tenant_id = ? AND o.status = 'concluida' AND o.finished_at >= ? AND o.finished_at < ?
     GROUP BY o.assignee_id ORDER BY receita DESC`, [tid, from, to]);

  const porTipo = all(`
    SELECT COALESCE(NULLIF(o.service_type, ''), 'Nao classificado') AS tipo, COUNT(*) AS os,
           COALESCE(SUM(${REV}), 0) AS receita
      FROM orders o
     WHERE o.tenant_id = ? AND o.status = 'concluida' AND o.finished_at >= ? AND o.finished_at < ?
     GROUP BY tipo ORDER BY os DESC LIMIT 10`, [tid, from, to]);

  res.json({
    periodo: { from, to },
    resumo: { ...resumo, lucro: resumo.receita - resumo.repasses - resumo.custos },
    por_parceiro: porParceiro,
    por_colaborador: porColaborador,
    por_tipo: porTipo,
  });
}));

function localDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = { router };

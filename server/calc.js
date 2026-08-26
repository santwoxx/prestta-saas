'use strict';
const { get } = require('./db');

/**
 * ---------------------------------------------------------------------------
 * Regras de dinheiro de uma OS  (tudo em centavos)
 * ---------------------------------------------------------------------------
 * value_total     valor base do servico / da nota do parceiro
 * commission_pct  % que a SUA empresa recebe sobre esse valor
 *                 - 0   -> voce cobra o valor cheio do cliente final
 *                 - 8   -> voce e parceiro da loja e recebe 8% da nota
 * extra_value     assistencias, taxa de deslocamento, servicos extras
 *
 *   receita = (commission_pct > 0 ? value_total * commission_pct% : value_total) + extra_value
 *   repasse = pay_mode === 'fixo' ? assignee_pay : receita * comissao_do_colaborador%
 *   lucro   = receita - repasse - expenses
 * ---------------------------------------------------------------------------
 */

/** Expressao SQL da receita, para relatorios agregados. Prefixo da tabela orders. */
function revenueSQL(alias = 'o') {
  return `(CASE WHEN ${alias}.commission_pct > 0
                THEN CAST(ROUND(${alias}.value_total * ${alias}.commission_pct / 100.0) AS INTEGER)
                ELSE ${alias}.value_total END + ${alias}.extra_value)`;
}

function revenueOf(order) {
  const base = order.commission_pct > 0
    ? Math.round((order.value_total || 0) * (order.commission_pct / 100))
    : (order.value_total || 0);
  return base + (order.extra_value || 0);
}

function profitOf(order) {
  return revenueOf(order) - (order.assignee_pay || 0) - (order.expenses || 0);
}

/**
 * Calcula quanto o colaborador recebe pela OS.
 * Se `override` for um numero, ele vence (o gestor editou na mao).
 */
function assigneePayFor(order, assignee, override) {
  if (override !== undefined && override !== null && override !== '') return Math.max(0, Math.round(override));
  const mode = order.pay_mode || assignee?.pay_mode || 'pct';
  if (mode === 'fixo') return Math.max(0, assignee?.pay_fixed || order.assignee_pay || 0);
  const pctValue = assignee?.commission_pct ?? 0;
  return Math.max(0, Math.round(revenueOf(order) * (pctValue / 100)));
}

/** Enriquece a OS com os campos calculados usados pela interface. */
function decorate(order) {
  if (!order) return order;
  const revenue = revenueOf(order);
  return {
    ...order,
    checklist: safeParse(order.checklist, []),
    revenue,
    profit: revenue - (order.assignee_pay || 0) - (order.expenses || 0),
    received: !!order.received,
    paid_assignee: !!order.paid_assignee,
  };
}

function safeParse(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/** Gera o proximo codigo sequencial da OS dentro do tenant (OS-0001). */
function nextOrderCode(tenantId) {
  const row = get('SELECT COUNT(*) AS n FROM orders WHERE tenant_id=?', [tenantId]);
  const n = (row?.n || 0) + 1;
  return `OS-${String(n).padStart(4, '0')}`;
}

const STATUSES = ['pendente', 'agendada', 'em_andamento', 'pausada', 'concluida', 'cancelada'];
const STATUS_LABEL = {
  pendente: 'Pendente',
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  pausada: 'Pausada',
  concluida: 'Concluida',
  cancelada: 'Cancelada',
};

module.exports = {
  revenueSQL, revenueOf, profitOf, assigneePayFor, decorate,
  safeParse, nextOrderCode, STATUSES, STATUS_LABEL,
};

'use strict';

/**
 * Planos do SaaS.
 * price_mensal / price_anual sao em centavos e representam o VALOR POR MES.
 * O ciclo anual e cobrado 12x o price_anual em uma unica vez.
 */
const PLANS = [
  {
    id: 'essencial',
    name: 'Essencial',
    tagline: 'Para quem esta saindo da planilha',
    price_mensal: 8900,
    price_anual: 7100,
    limits: { users: 3, orders_month: 150, storage_gb: 5 },
    highlights: [
      'Ordens de servico ilimitadas no app',
      'Ate 3 colaboradores em campo',
      'Assinatura digital do cliente e do colaborador',
      'Fotos de antes e depois em cada OS',
      'Agenda e rota do dia',
      'Financeiro basico (a receber e a pagar)',
      'Comprovante digital com link publico',
      'Suporte por WhatsApp',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'O plano de quem quer crescer',
    badge: 'Mais escolhido',
    popular: true,
    price_mensal: 18900,
    price_anual: 15100,
    limits: { users: 10, orders_month: 600, storage_gb: 25 },
    highlights: [
      'Tudo do Essencial, e mais:',
      'Ate 10 colaboradores em campo',
      'Repasse automatico por % ou valor fixo',
      'Importacao de pedidos e notas em lote',
      'Rota do dia otimizada com Google Maps',
      'Portal do parceiro (loja/cliente acompanha a OS)',
      'Relatorios de produtividade e margem',
      'Avaliacao de satisfacao do cliente (NPS)',
    ],
  },
  {
    id: 'escala',
    name: 'Escala',
    tagline: 'Operacao com varias equipes',
    price_mensal: 34900,
    price_anual: 27900,
    limits: { users: 40, orders_month: 5000, storage_gb: 100 },
    highlights: [
      'Tudo do Pro, e mais:',
      'Ate 40 colaboradores em campo',
      'API e webhooks para integrar seu ERP',
      'Multiplas unidades e centros de custo',
      'Permissoes avancadas por perfil',
      'Exportacao contabil e conciliacao',
      'Onboarding assistido e gerente de conta',
      'SLA de suporte prioritario',
    ],
  },
];

const byId = (id) => PLANS.find((p) => p.id === id) || null;

/** Valor total cobrado no ciclo (centavos). */
function amountFor(planId, cycle) {
  const plan = byId(planId);
  if (!plan) return 0;
  return cycle === 'anual' ? plan.price_anual * 12 : plan.price_mensal;
}

/** Limite de usuarios do plano (usado para bloquear cadastro de colaborador). */
function userLimit(planId) {
  return byId(planId)?.limits.users ?? 3;
}

module.exports = { PLANS, byId, amountFor, userLimit };

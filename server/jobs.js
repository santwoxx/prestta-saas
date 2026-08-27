'use strict';
/**
 * ---------------------------------------------------------------------------
 * Rotinas periodicas (regua de cobranca)
 * ---------------------------------------------------------------------------
 * Roda dentro do proprio processo - nao precisa de cron externo nem de outro
 * servico. Como o Prestta roda em UMA instancia (SQLite em arquivo), nao ha
 * risco de duas maquinas dispararem o mesmo e-mail; ainda assim todo envio usa
 * `dedupeKey`, entao reiniciar o servidor nao reenvia nada.
 *
 * Avisos cobertos:
 *   - teste acabando (3 dias e 1 dia antes)
 *   - teste terminou
 *   - carencia de pagamento vencida (acesso pausado)
 */
const { all, get } = require('./db');
const U = require('./util');
const auth = require('./auth');
const mailer = require('./mailer');

const AVISO_TRIAL_DIAS = [3, 1];

/** Dono (ou admin) da conta, para quem os avisos vao. */
function ownerOf(tenant) {
  const owner = get(
    "SELECT name, email FROM users WHERE tenant_id=? AND role IN ('dono','admin') AND active=1 ORDER BY role='dono' DESC LIMIT 1",
    [tenant.id],
  );
  return owner?.email ? owner : (tenant.email ? { name: tenant.name, email: tenant.email } : null);
}

const orderCount = (tenantId) => get('SELECT COUNT(*) AS n FROM orders WHERE tenant_id=?', [tenantId])?.n || 0;

/* ------------------------------------------------------------------ *
 * Teste gratis
 * ------------------------------------------------------------------ */
async function avisarTrials() {
  let enviados = 0;
  const trials = all("SELECT * FROM tenants WHERE status='trial' AND trial_ends_at IS NOT NULL");

  for (const t of trials) {
    const owner = ownerOf(t);
    if (!owner) continue;

    const msLeft = new Date(t.trial_ends_at) - Date.now();
    const daysLeft = Math.ceil(msLeft / 864e5);

    if (msLeft <= 0) {
      const r = await mailer.send({
        to: owner.email, tenantId: t.id, template: 'trial_terminou',
        dedupeKey: `trial-fim:${t.id}`,
        data: { name: owner.name, company: t.name },
      });
      if (r.status === 'enviado' || r.status === 'simulado') enviados += 1;
      continue;
    }

    if (AVISO_TRIAL_DIAS.includes(daysLeft)) {
      const r = await mailer.send({
        to: owner.email, tenantId: t.id, template: 'trial_terminando',
        dedupeKey: `trial-${daysLeft}d:${t.id}`,
        data: {
          name: owner.name,
          company: t.name,
          daysLeft,
          trialEndsAt: t.trial_ends_at,
          orders: orderCount(t.id),
        },
      });
      if (r.status === 'enviado' || r.status === 'simulado') enviados += 1;
    }
  }
  return enviados;
}

/* ------------------------------------------------------------------ *
 * Carencia de pagamento vencida
 * ------------------------------------------------------------------ */
async function avisarCarenciaVencida() {
  let enviados = 0;
  const atrasados = all("SELECT * FROM tenants WHERE status='atrasado'");

  for (const t of atrasados) {
    const grace = auth.graceInfo(t);
    if (!grace || grace.inGrace) continue; // ainda tem prazo

    const owner = ownerOf(t);
    if (!owner) continue;

    const r = await mailer.send({
      to: owner.email, tenantId: t.id, template: 'acesso_pausado',
      dedupeKey: `pausado:${t.id}:${(t.overdue_since || '').slice(0, 10)}`,
      data: { name: owner.name, company: t.name },
    });
    if (r.status === 'enviado' || r.status === 'simulado') enviados += 1;
  }
  return enviados;
}

/* ------------------------------------------------------------------ *
 * Execucao
 * ------------------------------------------------------------------ */
let rodando = false;

async function runDaily() {
  if (rodando) return null;              // evita sobreposicao
  rodando = true;
  const inicio = Date.now();
  try {
    const trials = await avisarTrials();
    const pausados = await avisarCarenciaVencida();
    const total = trials + pausados;
    if (total) {
      console.log(`[jobs] ${total} aviso(s) enviado(s) em ${Date.now() - inicio}ms `
        + `(trial: ${trials}, carencia: ${pausados})`);
    }
    return { trials, pausados };
  } catch (err) {
    console.error('[jobs] falha na rotina diaria:', err);
    return null;
  } finally {
    rodando = false;
  }
}

const SEIS_HORAS = 6 * 60 * 60 * 1000;

/** Liga o agendador. Chamado uma vez no boot. */
function start() {
  if (process.env.DISABLE_JOBS === '1') {
    console.log('[jobs] desligado por DISABLE_JOBS=1');
    return;
  }
  // Primeira passada 60s depois do boot, para nao competir com a subida.
  setTimeout(() => { runDaily(); }, 60_000).unref();
  setInterval(() => { runDaily(); }, SEIS_HORAS).unref();
  console.log(`[jobs] regua de cobranca ativa (a cada 6h, carencia de ${auth.graceDays()} dias)`);
}

module.exports = { start, runDaily, avisarTrials, avisarCarenciaVencida };

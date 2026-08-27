'use strict';
/**
 * ---------------------------------------------------------------------------
 * E-mails transacionais
 * ---------------------------------------------------------------------------
 * Sem dependencia nova: falamos direto com a API HTTP do provedor.
 *
 *   MAIL_PROVIDER=resend|brevo|log
 *   MAIL_API_KEY=...
 *   MAIL_FROM=nao-responda@seudominio.com.br
 *   MAIL_FROM_NAME=Prestta
 *   MAIL_REPLY_TO=suporte@seudominio.com.br   (opcional)
 *
 * Sem MAIL_API_KEY o modo e "log": o e-mail aparece no console e fica gravado
 * em email_log com status "simulado". Nada quebra - da para desenvolver e
 * subir em producao antes de escolher o provedor.
 *
 * REGRA: enviar e-mail NUNCA pode derrubar o fluxo que o originou (cadastro,
 * webhook de pagamento). Toda falha e engolida e registrada.
 */
const { get, insert } = require('./db');
const U = require('./util');

const CFG = () => ({
  provider: (process.env.MAIL_PROVIDER || (process.env.MAIL_API_KEY ? 'resend' : 'log')).toLowerCase(),
  apiKey: process.env.MAIL_API_KEY || '',
  from: process.env.MAIL_FROM || 'nao-responda@prestta.com.br',
  fromName: process.env.MAIL_FROM_NAME || 'Prestta',
  replyTo: process.env.MAIL_REPLY_TO || '',
  appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, ''),
});

const isConfigured = () => CFG().provider !== 'log' && Boolean(CFG().apiKey);

/* ================================================================== *
 * Layout
 * ================================================================== */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
));

function layout({ preheader, title, body, cta }) {
  const { appUrl } = CFG();
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0B1220">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E4E8F0">
      <tr><td style="background:#16181D;padding:22px 28px">
        <span style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;background:#F5A524;color:#26170A;border-radius:9px;font-weight:800;font-size:16px">P</span>
        <span style="color:#fff;font-weight:700;font-size:17px;margin-left:9px;vertical-align:middle">Prestta</span>
      </td></tr>
      <tr><td style="padding:30px 28px 8px">
        <h1 style="margin:0 0 14px;font-size:20px;line-height:1.35;color:#0B1220">${esc(title)}</h1>
        ${body}
      </td></tr>
      ${cta ? `<tr><td style="padding:6px 28px 30px">
        <a href="${esc(cta.url)}" style="display:inline-block;background:#F5A524;color:#26170A;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:11px">${esc(cta.label)}</a>
      </td></tr>` : ''}
      <tr><td style="padding:18px 28px 26px;border-top:1px solid #E4E8F0;color:#8A94A6;font-size:12px;line-height:1.6">
        Você recebeu este e-mail porque tem uma conta no Prestta.<br>
        <a href="${esc(appUrl)}" style="color:#d98a12">${esc(appUrl.replace(/^https?:\/\//, ''))}</a>
        &nbsp;·&nbsp; <a href="${esc(appUrl)}/privacidade" style="color:#8A94A6">Privacidade</a>
        &nbsp;·&nbsp; <a href="${esc(appUrl)}/termos" style="color:#8A94A6">Termos</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

const p = (text) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3d4757">${text}</p>`;
const strong = (t) => `<strong style="color:#0B1220">${esc(t)}</strong>`;

/* ================================================================== *
 * Templates
 * Cada um recebe `d` (dados) e devolve { subject, html, text }.
 * ================================================================== */
const TEMPLATES = {
  boas_vindas: (d) => ({
    subject: `Bem-vindo ao Prestta, ${firstName(d.name)}!`,
    html: layout({
      preheader: `Seu ambiente está pronto com ${d.trialDays} dias grátis.`,
      title: `Seu ambiente está pronto, ${esc(firstName(d.name))}`,
      body: p(`A conta da ${strong(d.company)} já está no ar com ${strong(`${d.trialDays} dias grátis`)}, sem cartão de crédito.`)
        + p('Para tirar o máximo proveito nos primeiros dias, sugerimos esta ordem:')
        + `<ol style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.9;color:#3d4757">
             <li>Cadastre seus colaboradores de campo</li>
             <li>Crie a primeira ordem de serviço e atribua a alguém</li>
             <li>Peça para o colaborador concluir pelo app com foto e assinatura</li>
             <li>Veja o comprovante e o repasse calculados sozinhos</li>
           </ol>`
        + p('Qualquer dúvida é só responder este e-mail.'),
      cta: { url: `${CFG().appUrl}/app.html`, label: 'Abrir meu painel' },
    }),
    text: `Bem-vindo ao Prestta, ${firstName(d.name)}!\n\n`
      + `A conta da ${d.company} está no ar com ${d.trialDays} dias grátis.\n\n`
      + `Acesse: ${CFG().appUrl}/app.html`,
  }),

  trial_terminando: (d) => ({
    subject: d.daysLeft === 1
      ? 'Seu teste do Prestta termina amanhã'
      : `Faltam ${d.daysLeft} dias do seu teste no Prestta`,
    html: layout({
      preheader: 'Escolha um plano para não perder o acesso.',
      title: d.daysLeft === 1 ? 'Seu teste termina amanhã' : `Faltam ${d.daysLeft} dias de teste`,
      body: p(`Olá, ${esc(firstName(d.name))}. O período de teste da ${strong(d.company)} termina em ${strong(dateBR(d.trialEndsAt))}.`)
        + p(`Nesses dias você registrou ${strong(`${d.orders} ordem(ns) de serviço`)}. Escolhendo um plano agora, nada disso se perde e a equipe continua trabalhando sem interrupção.`)
        + p('Se decidir não continuar, não precisa fazer nada — não cobramos nada automaticamente.'),
      cta: { url: `${CFG().appUrl}/app.html#assinatura`, label: 'Ver planos' },
    }),
    text: `Seu teste do Prestta termina em ${dateBR(d.trialEndsAt)}.\n\n`
      + `Escolha um plano em ${CFG().appUrl}/app.html#assinatura`,
  }),

  trial_terminou: (d) => ({
    subject: 'Seu teste do Prestta terminou',
    html: layout({
      preheader: 'Seus dados estão guardados. Escolha um plano para voltar.',
      title: 'Seu teste terminou',
      body: p(`Olá, ${esc(firstName(d.name))}. O teste da ${strong(d.company)} chegou ao fim e o acesso ao painel está pausado.`)
        + p(`${strong('Seus dados continuam guardados')} — ordens, fotos, assinaturas e financeiro. Assim que escolher um plano, tudo volta exatamente como estava.`),
      cta: { url: `${CFG().appUrl}/app.html#assinatura`, label: 'Escolher um plano' },
    }),
    text: `Seu teste do Prestta terminou. Seus dados estão guardados.\n\n`
      + `Escolha um plano em ${CFG().appUrl}/app.html#assinatura`,
  }),

  pagamento_aprovado: (d) => ({
    subject: `Pagamento confirmado · Prestta ${d.planName}`,
    html: layout({
      preheader: `Plano ${d.planName} ativo até ${dateBR(d.periodEnd)}.`,
      title: 'Pagamento confirmado',
      body: p(`Recebemos o pagamento da ${strong(d.company)}. O plano ${strong(d.planName)} (${esc(d.cycle)}) está ativo.`)
        + `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;font-size:14px;color:#3d4757">
             <tr><td style="padding:7px 0;border-bottom:1px solid #E4E8F0">Valor</td>
                 <td style="padding:7px 0;border-bottom:1px solid #E4E8F0;text-align:right;font-weight:600">${esc(d.amount)}</td></tr>
             <tr><td style="padding:7px 0;border-bottom:1px solid #E4E8F0">Ciclo</td>
                 <td style="padding:7px 0;border-bottom:1px solid #E4E8F0;text-align:right;font-weight:600">${esc(d.cycle)}</td></tr>
             <tr><td style="padding:7px 0">Próxima renovação</td>
                 <td style="padding:7px 0;text-align:right;font-weight:600">${esc(dateBR(d.periodEnd))}</td></tr>
           </table>`
        + p('A nota fiscal e o comprovante de pagamento são enviados pela Cakto, nosso processador de pagamentos.'),
      cta: { url: `${CFG().appUrl}/app.html`, label: 'Ir para o painel' },
    }),
    text: `Pagamento confirmado. Plano ${d.planName} (${d.cycle}) ativo até ${dateBR(d.periodEnd)}.`,
  }),

  pagamento_falhou: (d) => ({
    subject: 'Não conseguimos processar seu pagamento',
    html: layout({
      preheader: `Regularize até ${dateBR(d.graceUntil)} para não perder o acesso.`,
      title: 'Não conseguimos processar seu pagamento',
      body: p(`Olá, ${esc(firstName(d.name))}. A cobrança do plano ${strong(d.planName)} da ${strong(d.company)} não foi aprovada.`)
        + p(`Isso costuma ser cartão vencido, limite indisponível ou uma recusa do banco. ${strong('Nada foi bloqueado ainda')} — sua equipe continua trabalhando normalmente.`)
        + p(`Você tem até ${strong(dateBR(d.graceUntil))} para regularizar. Depois disso o painel é pausado, mas seus dados continuam guardados.`),
      cta: { url: `${CFG().appUrl}/app.html#assinatura`, label: 'Atualizar pagamento' },
    }),
    text: `A cobrança do seu plano Prestta não foi aprovada.\n`
      + `Regularize até ${dateBR(d.graceUntil)} em ${CFG().appUrl}/app.html#assinatura`,
  }),

  acesso_pausado: (d) => ({
    subject: 'Seu acesso ao Prestta foi pausado',
    html: layout({
      preheader: 'Seus dados continuam guardados. Regularize para voltar.',
      title: 'Seu acesso foi pausado',
      body: p(`Olá, ${esc(firstName(d.name))}. Como a cobrança da ${strong(d.company)} não foi regularizada dentro do prazo, o painel está pausado.`)
        + p(`${strong('Nada foi apagado.')} Ordens, fotos, assinaturas e financeiro continuam aqui. Assim que o pagamento for confirmado, o acesso volta na hora.`),
      cta: { url: `${CFG().appUrl}/app.html#assinatura`, label: 'Regularizar agora' },
    }),
    text: `Seu acesso ao Prestta foi pausado por falta de pagamento. Seus dados continuam guardados.\n`
      + `Regularize em ${CFG().appUrl}/app.html#assinatura`,
  }),

  assinatura_cancelada: (d) => ({
    subject: 'Sua assinatura do Prestta foi cancelada',
    html: layout({
      preheader: 'Seus dados ficam guardados por 90 dias.',
      title: 'Assinatura cancelada',
      body: p(`A assinatura da ${strong(d.company)} foi cancelada e não haverá novas cobranças.`)
        + p(`Seus dados ficam guardados por ${strong('90 dias')}. Se voltar dentro desse prazo, encontra tudo como deixou.`)
        + p('Se puder responder este e-mail contando o que faltou, ajuda muito a melhorar o Prestta.'),
      cta: { url: `${CFG().appUrl}/app.html#assinatura`, label: 'Reativar assinatura' },
    }),
    text: `Sua assinatura do Prestta foi cancelada. Os dados ficam guardados por 90 dias.`,
  }),
};

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'tudo bem';
}
function dateBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/* ================================================================== *
 * Envio
 * ================================================================== */
/**
 * Envia um e-mail transacional.
 * @param {object} opts
 * @param {string} opts.to        destinatario
 * @param {string} opts.template  chave em TEMPLATES
 * @param {object} opts.data      dados do template
 * @param {string} [opts.tenantId]
 * @param {string} [opts.dedupeKey] impede reenvio do mesmo aviso
 * @returns {Promise<{ok:boolean, status:string, detail?:string}>}
 */
async function send({ to, template, data = {}, tenantId = null, dedupeKey = null }) {
  const build = TEMPLATES[template];
  if (!build) return log(null, 'erro', `template desconhecido: ${template}`);
  if (!U.isEmail(to)) return log(null, 'erro', `destinatario invalido: ${to}`);

  if (dedupeKey && get('SELECT id FROM email_log WHERE dedupe_key=?', [dedupeKey])) {
    return { ok: true, status: 'ignorado', detail: 'ja enviado' };
  }

  let msg;
  try { msg = build(data); }
  catch (err) { return log(null, 'erro', `falha ao montar template: ${err.message}`); }

  const cfg = CFG();
  const record = {
    id: U.uid('mail'),
    tenant_id: tenantId,
    to_email: to,
    template,
    dedupe_key: dedupeKey,
    subject: msg.subject,
    status: 'enviado',
    detail: null,
    created_at: U.nowISO(),
  };

  if (!isConfigured()) {
    record.status = 'simulado';
    record.detail = 'MAIL_API_KEY nao configurada';
    console.log(`\n[mail:simulado] para ${to} | ${msg.subject}\n${msg.text}\n`);
    return persist(record);
  }

  try {
    const detail = await deliver(cfg, { to, ...msg });
    record.detail = detail || null;
  } catch (err) {
    record.status = 'erro';
    record.detail = String(err.message || err).slice(0, 400);
    console.warn(`[mail] falha ao enviar "${template}" para ${to}:`, record.detail);
  }
  return persist(record);
}

async function deliver(cfg, { to, subject, html, text }) {
  const timeout = AbortSignal.timeout(15000);

  if (cfg.provider === 'brevo') {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': cfg.apiKey, Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: cfg.from, name: cfg.fromName },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
        ...(cfg.replyTo ? { replyTo: { email: cfg.replyTo } } : {}),
      }),
      signal: timeout,
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`brevo ${res.status}: ${body.slice(0, 200)}`);
    return body.slice(0, 200);
  }

  // Padrao: Resend
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      from: `${cfg.fromName} <${cfg.from}>`,
      to: [to],
      subject,
      html,
      text,
      ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
    }),
    signal: timeout,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`resend ${res.status}: ${body.slice(0, 200)}`);
  return body.slice(0, 200);
}

function persist(record) {
  try { insert('email_log', record); }
  catch (err) { console.warn('[mail] nao consegui gravar email_log:', err.message); }
  return { ok: record.status !== 'erro', status: record.status, detail: record.detail };
}

function log(tenantId, status, detail) {
  console.warn(`[mail] ${status}: ${detail}`);
  return { ok: false, status, detail };
}

/** Dispara sem esperar - para usar dentro de rotas sem atrasar a resposta. */
function sendAsync(opts) {
  Promise.resolve(send(opts)).catch((err) => console.warn('[mail] erro nao tratado:', err.message));
}

module.exports = { send, sendAsync, isConfigured, TEMPLATES, CFG };

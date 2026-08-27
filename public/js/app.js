/* ==========================================================================
   Prestta - painel do administrador
   ========================================================================== */

const state = {
  me: null,
  tenant: null,
  plan: null,
  settings: {},
  dash: null,
  customers: [],
  team: [],
  view: 'painel',
  filters: { status: 'abertas', q: '', assignee: '', customer: '', from: '', to: '' },
};

const ICON = {
  painel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  ordens: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4h6a2 2 0 012 2v0H7v0a2 2 0 012-2z"/><rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 11h6M9 15h4"/></svg>',
  rota: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  clientes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21V8l6-4 6 4v13"/><path d="M15 21V11h6v10"/><path d="M7 12h2M7 16h2"/></svg>',
  equipe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 5.5a3 3 0 010 5.6M17.5 20a6 6 0 00-2-4.4"/></svg>',
  financeiro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 15h4"/></svg>',
  relatorios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  importar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>',
  config: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.7 1.7 0 008.9 19a1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 8.9a1.7 1.7 0 00-.4-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  assinatura: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M6 15c2-4 3.5-4 4.5-1s2.5 3 4-1 3-2 3.5 0"/></svg>',
};

const MENU = [
  { section: 'Operação' },
  { id: 'painel', label: 'Painel geral' },
  { id: 'ordens', label: 'Ordens de serviço', badge: 'abertas' },
  { id: 'rota', label: 'Rota do dia' },
  { section: 'Cadastros' },
  { id: 'clientes', label: 'Clientes e parceiros' },
  { id: 'equipe', label: 'Equipe' },
  { id: 'importar', label: 'Importar serviços' },
  { section: 'Gestão' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'config', label: 'Configurações' },
  { id: 'assinatura', label: 'Meu plano' },
];

const TITLES = {
  painel: ['Painel geral', 'Visão rápida das ordens e das finanças da sua empresa.'],
  ordens: ['Ordens de serviço', 'Tudo o que está agendado, em execução e concluído.'],
  rota: ['Rota do dia', 'A sequência de atendimentos de cada colaborador.'],
  clientes: ['Clientes e parceiros', 'Lojas, empresas e clientes finais que geram serviço.'],
  equipe: ['Equipe', 'Quem executa em campo e quanto cada um recebe.'],
  importar: ['Importar serviços', 'Cole a lista da loja ou envie um CSV e crie as OS em lote.'],
  financeiro: ['Financeiro', 'A receber, a pagar e o lucro de cada período.'],
  relatorios: ['Relatórios', 'Produtividade, margem e desempenho por parceiro.'],
  config: ['Configurações', 'Dados da empresa e regras de execução dos serviços.'],
  assinatura: ['Meu plano', 'Assinatura, cobrança e limites do seu plano.'],
};

/* ================================================================== BOOT */
async function boot() {
  try {
    const me = await get('/me');
    state.me = me.user;
    state.tenant = me.tenant;
    state.plan = me.plan;
    state.settings = me.tenant?.settings || {};
    state.trialDays = me.trial_days_left;
    state.grace = me.grace || null;
  } catch {
    location.href = '/entrar';
    return;
  }

  if (state.me.role === 'campo') { location.href = '/campo.html'; return; }
  if (state.me.role === 'superadmin' && !state.tenant) { location.href = '/saas.html'; return; }

  document.getElementById('tenantName').textContent = state.tenant.name;
  renderUserBox();
  renderTrial();

  document.getElementById('burger').onclick = () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sbBackdrop').classList.toggle('on');
  };
  document.getElementById('sbBackdrop').onclick = () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sbBackdrop').classList.remove('on');
  };

  addEventListener('hashchange', route);
  await Promise.all([loadCustomers(), loadTeam()]);
  route();
}

function renderUserBox() {
  document.getElementById('userBox').innerHTML = `
    <div class="av">${initials(state.me.name)}</div>
    <div style="min-width:0;flex:1">
      <b>${esc(state.me.name)}</b>
      <span>${state.me.role === 'dono' ? 'Administrador' : 'Gestor'}</span>
    </div>
    <button class="btn btn-icon" id="logout" title="Sair" style="background:rgba(255,255,255,.06);border:0;color:#93A3BE">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
    </button>`;
  document.getElementById('logout').onclick = async () => {
    await post('/logout');
    location.href = '/entrar';
  };
}

function renderTrial() {
  const box = document.getElementById('trialBox');
  if (state.tenant.status === 'trial' && state.trialDays !== null) {
    box.innerHTML = `
      <div class="trial-card">
        <b>${state.trialDays} dia${state.trialDays === 1 ? '' : 's'} de teste</b>
        <p>Escolha um plano para não perder o acesso ao seu histórico.</p>
        <button class="btn btn-primary btn-sm btn-block" onclick="location.hash='#assinatura'">Ver planos</button>
      </div>`;
  } else if (state.tenant.status === 'atrasado') {
    const g = state.grace;
    const prazo = !g ? 'Regularize para manter o acesso da equipe.'
      : g.inGrace
        ? `Você tem ${g.daysLeft} dia${g.daysLeft === 1 ? '' : 's'} para regularizar antes do acesso ser pausado.`
        : 'O prazo terminou e o acesso está pausado. Seus dados continuam guardados.';
    box.innerHTML = `
      <div class="trial-card" style="background:linear-gradient(140deg,#3A1D1D,#2A1616)">
        <b style="color:#FF9A9A">Pagamento pendente</b>
        <p>${prazo}</p>
        <button class="btn btn-primary btn-sm btn-block" onclick="location.hash='#assinatura'">Regularizar</button>
      </div>`;
  } else {
    box.innerHTML = '';
  }
}

function renderMenu() {
  const openCount = state.dash
    ? state.dash.contadores.pendentes + state.dash.contadores.agendadas + state.dash.contadores.em_andamento
    : null;

  document.getElementById('sbNav').innerHTML = MENU.map((item) => {
    if (item.section) return `<div class="sb-label">${item.section}</div>`;
    const badge = item.badge === 'abertas' && openCount
      ? `<span class="badge">${openCount}</span>` : '';
    return `<a class="sb-link ${state.view === item.id ? 'on' : ''}" href="#${item.id}">
      ${ICON[item.id] || ''}<span>${item.label}</span>${badge}</a>`;
  }).join('');
}

/* ================================================================= ROUTER */
const VIEWS = {};

async function route() {
  const hash = (location.hash || '#painel').slice(1).split('?')[0];
  state.view = VIEWS[hash] ? hash : 'painel';
  const [title, sub] = TITLES[state.view] || ['Prestta', ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSub').textContent = sub;
  document.getElementById('topActions').innerHTML = '';
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sbBackdrop').classList.remove('on');
  renderMenu();

  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    await VIEWS[state.view](content);
  } catch (err) {
    content.innerHTML = `<div class="empty"><div class="ic">⚠️</div><h3>Não consegui carregar</h3><p>${esc(err.message)}</p>
      <button class="btn btn-light" onclick="route()">Tentar de novo</button></div>`;
  }
  renderMenu();
}

async function loadCustomers() { state.customers = (await get('/customers')).customers; }
async function loadTeam() { const d = await get('/team'); state.team = d.team; state.teamLimit = d.limit; }

const fieldTeam = () => state.team.filter((u) => u.active && u.role === 'campo');

/* ================================================================ PAINEL */
VIEWS.painel = async (root) => {
  const d = await get('/dashboard');
  state.dash = d;
  const c = d.contadores;
  const f = d.financeiro;

  document.getElementById('topActions').innerHTML = `
    <button class="btn btn-light btn-sm" onclick="location.hash='#rota'">🗺️ Rota do dia</button>
    <button class="btn btn-primary btn-sm" onclick="newOrder()">+ Nova OS</button>`;

  const maxSerie = Math.max(...d.serie.map((s) => s.receita), 1);

  root.innerHTML = `
    <div class="grid g4" style="margin-bottom:16px">
      ${kpi('Pendentes', c.pendentes, 'gold', '⏳', `${c.agendadas} agendada(s)`)}
      ${kpi('Em andamento', c.em_andamento, 'blue', '🔧', `${c.hoje} serviço(s) hoje`)}
      ${kpi('Sem colaborador', c.sem_colaborador, c.sem_colaborador ? 'red' : 'green', '❓', 'Precisam ser distribuídas')}
      ${kpi('Concluídas no mês', f.concluidas_mes, 'green', '✅', `Nota média ${d.satisfacao.media || '—'} ★`)}
    </div>

    <div class="grid g3" style="margin-bottom:16px">
      ${kpi('A receber', money(f.a_receber), 'gold', '🧾', `${f.a_receber_qtd} OS concluída(s) sem baixa`)}
      ${kpi('A pagar à equipe', money(f.a_pagar), 'blue', '👷', `${f.a_pagar_qtd} repasse(s) em aberto`)}
      ${kpi('Lucro do mês', money(f.lucro_mes), 'green', '📈', `Receita ${money(f.receita_mes)} · repasses ${money(f.repasses_mes)}`)}
    </div>

    <div class="grid g-main">
      <div class="card">
        <div class="card-head">
          <h3>Próximos serviços</h3>
          <div class="r"><button class="btn btn-light btn-sm" onclick="location.hash='#ordens'">Ver todas</button></div>
        </div>
        ${d.proximas.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Cliente</th><th>Colaborador</th><th>Quando</th><th>Status</th></tr></thead>
          <tbody>${d.proximas.map((o) => `
            <tr class="clickable" onclick="openOrder('${o.id}')">
              <td>
                <div class="t-strong">${esc(o.client_name)}</div>
                <div class="t-sub">${esc(o.customer_name || 'Cliente direto')} · ${esc(o.district || o.city || '')}</div>
              </td>
              <td>${o.assignee_name
                ? `<div style="display:flex;align-items:center;gap:8px"><span class="avatar sm" style="background:${o.assignee_color || colorFor(o.assignee_name)}">${initials(o.assignee_name)}</span>${esc(o.assignee_name.split(' ')[0])}</div>`
                : '<span class="chip" style="background:var(--red-soft);color:#B4242A">Sem colaborador</span>'}</td>
              <td><div class="t-strong">${dayLabel(o.scheduled_at)}</div><div class="t-sub">${timeBR(o.scheduled_at)}</div></td>
              <td>${statusBadge(o.status)}</td>
            </tr>`).join('')}</tbody>
        </table></div>` : emptyBox('📋', 'Nenhum serviço em aberto', 'Cadastre uma OS para começar.', 'newOrder()', '+ Nova OS')}
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card card-pad">
          <h3 style="font-size:.95rem;margin-bottom:4px">Receita dos últimos 6 meses</h3>
          <div class="t-sub" style="margin-bottom:10px">Somente OS concluídas</div>
          <div class="bars">
            ${d.serie.map((s) => `
              <div class="col">
                <div class="bar" style="height:${Math.max(4, (s.receita / maxSerie) * 100)}%" data-v="${money(s.receita)} · ${s.os} OS"></div>
                <span class="lb">${s.mes}</span>
              </div>`).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Equipe no mês</h3></div>
          <div class="card-pad" style="padding-top:8px">
            ${d.ranking.length ? d.ranking.map((r) => `
              <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line-2)">
                <span class="avatar" style="background:${r.color || colorFor(r.name)}">${initials(r.name)}</span>
                <div style="flex:1;min-width:0">
                  <div class="t-strong" style="font-size:.87rem">${esc(r.name)}</div>
                  <div class="t-sub">${r.os} OS ${r.nota ? `· ${r.nota} ★` : ''}</div>
                </div>
                <div class="t-strong">${moneyShort(r.receita)}</div>
              </div>`).join('') : '<p class="t-sub">Nenhuma OS concluída neste mês ainda.</p>'}
          </div>
        </div>
      </div>
    </div>`;
};

const kpi = (label, value, tone, icon, hint) => `
  <div class="kpi ${tone}">
    <div class="lbl">${label}</div>
    <div class="val">${value}</div>
    ${hint ? `<div class="hint">${hint}</div>` : ''}
    <div class="ic">${icon}</div>
  </div>`;

const emptyBox = (icon, title, text, action, actionLabel) => `
  <div class="empty">
    <div class="ic">${icon}</div>
    <h3>${title}</h3>
    <p>${text}</p>
    ${action ? `<button class="btn btn-primary" onclick="${action}">${actionLabel}</button>` : ''}
  </div>`;

/* ================================================================ ORDENS */
VIEWS.ordens = async (root) => {
  document.getElementById('topActions').innerHTML = `
    <button class="btn btn-light btn-sm" onclick="location.hash='#importar'">Importar</button>
    <button class="btn btn-primary btn-sm" onclick="newOrder()">+ Nova OS</button>`;

  root.innerHTML = `
    <div class="filters">
      <div class="tabs" id="statusTabs">
        ${[['abertas', 'Em aberto'], ['pendente', 'Pendentes'], ['agendada', 'Agendadas'], ['em_andamento', 'Em andamento'],
           ['concluida', 'Concluídas'], ['cancelada', 'Canceladas'], ['todas', 'Todas']]
          .map(([v, l]) => `<button data-v="${v}" class="${state.filters.status === v ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input class="input" id="q" placeholder="Buscar por cliente, código, endereço…" value="${esc(state.filters.q)}">
      </div>
      <select class="select" id="fAssignee">
        <option value="">Todos os colaboradores</option>
        <option value="sem" ${state.filters.assignee === 'sem' ? 'selected' : ''}>⚠ Sem colaborador</option>
        ${fieldTeam().map((u) => `<option value="${u.id}" ${state.filters.assignee === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
      </select>
      <select class="select" id="fCustomer">
        <option value="">Todos os parceiros</option>
        ${state.customers.map((c) => `<option value="${c.id}" ${state.filters.customer === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="card" id="ordersCard"><div class="loading">Carregando ordens…</div></div>`;

  const apply = () => loadOrders();
  root.querySelectorAll('#statusTabs button').forEach((b) => {
    b.onclick = () => {
      state.filters.status = b.dataset.v;
      root.querySelectorAll('#statusTabs button').forEach((x) => x.classList.toggle('on', x === b));
      apply();
    };
  });
  root.querySelector('#q').oninput = debounce((e) => { state.filters.q = e.target.value; apply(); });
  root.querySelector('#fAssignee').onchange = (e) => { state.filters.assignee = e.target.value; apply(); };
  root.querySelector('#fCustomer').onchange = (e) => { state.filters.customer = e.target.value; apply(); };

  await loadOrders();
};

async function loadOrders() {
  const box = document.getElementById('ordersCard');
  if (!box) return;
  const f = state.filters;
  const params = new URLSearchParams({ limit: '120' });
  if (f.status === 'abertas') params.set('status', 'pendente,agendada,em_andamento,pausada');
  else if (f.status !== 'todas') params.set('status', f.status);
  if (f.q) params.set('q', f.q);
  if (f.assignee) params.set('assignee', f.assignee);
  if (f.customer) params.set('customer', f.customer);

  const { orders, total } = await get(`/orders?${params}`);

  if (!orders.length) {
    box.innerHTML = emptyBox('🔍', 'Nenhuma OS encontrada', 'Ajuste os filtros ou cadastre uma nova ordem de serviço.', 'newOrder()', '+ Nova OS');
    return;
  }

  box.innerHTML = `
    <div class="card-head">
      <h3>${total} ordem(ns)</h3>
      <div class="r t-sub">Clique em uma linha para abrir</div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>OS</th><th>Cliente</th><th>Parceiro</th><th>Colaborador</th><th>Agendamento</th>
        <th class="num">Receita</th><th class="num">Repasse</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${orders.map((o) => `
        <tr class="clickable" onclick="openOrder('${o.id}')">
          <td><div class="t-strong">${o.code}</div><div class="t-sub">${o.photo_count || 0}📷 ${o.signature_count || 0}✍️</div></td>
          <td>
            <div class="t-strong">${esc(o.client_name)}</div>
            <div class="t-sub">${esc(o.title || o.service_type || '')}</div>
          </td>
          <td class="t-sub">${esc(o.customer_name || 'Direto')}</td>
          <td>${o.assignee_name
            ? `<div style="display:flex;align-items:center;gap:7px"><span class="avatar sm" style="background:${o.assignee_color || colorFor(o.assignee_name)}">${initials(o.assignee_name)}</span><span class="t-sub">${esc(o.assignee_name.split(' ')[0])}</span></div>`
            : '<span class="chip" style="background:var(--red-soft);color:#B4242A">Sem</span>'}</td>
          <td><div class="t-strong">${dayLabel(o.scheduled_at)}</div><div class="t-sub">${timeBR(o.scheduled_at)}</div></td>
          <td class="num t-strong">${money(o.revenue)}</td>
          <td class="num t-sub">${money(o.assignee_pay)}</td>
          <td>${statusBadge(o.status)}${o.priority === 'urgente' ? '<span class="badge-pri pri-urgente" style="margin-left:4px">!</span>' : ''}</td>
          <td class="num t-sub">${o.received ? '💰' : ''}${o.paid_assignee ? '✔' : ''}</td>
        </tr>`).join('')}</tbody>
    </table></div>`;
}

/* ============================================================ NOVA / EDITAR OS */
function orderForm(o = {}) {
  const types = state.settings.service_types || [];
  const val = (c) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');
  return `
    <div class="form-grid">
      <div class="f full"><label>Cliente final *</label>
        <input id="of-client_name" value="${esc(o.client_name || '')}" placeholder="Nome de quem recebe o serviço"></div>
      <div class="f"><label>Telefone / WhatsApp</label>
        <input id="of-client_phone" value="${esc(o.client_phone || '')}" placeholder="(47) 99999-9999"></div>
      <div class="f"><label>Parceiro / loja</label>
        <select id="of-customer_id">
          <option value="">Cliente direto (sem parceiro)</option>
          ${state.customers.map((c) => `<option value="${c.id}" ${o.customer_id === c.id ? 'selected' : ''}>${esc(c.name)} ${c.commission_pct ? `(${c.commission_pct}%)` : ''}</option>`).join('')}
        </select></div>

      <div class="f"><label>Tipo de serviço</label>
        <input id="of-service_type" list="serviceTypes" value="${esc(o.service_type || '')}" placeholder="Ex.: Montagem de guarda-roupa">
        <datalist id="serviceTypes">${types.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
      <div class="f"><label>Título da OS</label>
        <input id="of-title" value="${esc(o.title || '')}" placeholder="Resumo do que será feito"></div>

      <div class="f full"><label>Descrição / itens</label>
        <textarea id="of-description" placeholder="O que precisa ser feito, peças, observações da loja…">${esc(o.description || '')}</textarea></div>

      <div class="f"><label>Colaborador</label>
        <select id="of-assignee_id">
          <option value="">Definir depois</option>
          ${fieldTeam().map((u) => `<option value="${u.id}" ${o.assignee_id === u.id ? 'selected' : ''}>${esc(u.name)} · ${u.pay_mode === 'fixo' ? money(u.pay_fixed) : `${u.commission_pct}%`}</option>`).join('')}
        </select></div>
      <div class="f"><label>Data e hora</label>
        <input id="of-scheduled_at" type="datetime-local" value="${toLocalInput(o.scheduled_at)}"></div>

      <div class="f full"><label>Endereço</label>
        <input id="of-address" value="${esc(o.address || '')}" placeholder="Rua, número, complemento"></div>
      <div class="f"><label>Bairro</label><input id="of-district" value="${esc(o.district || '')}"></div>
      <div class="f"><label>Cidade / UF</label>
        <div style="display:flex;gap:8px">
          <input id="of-city" value="${esc(o.city || state.tenant.city || '')}" style="flex:1">
          <input id="of-uf" value="${esc(o.uf || state.tenant.uf || '')}" maxlength="2" style="width:66px;text-transform:uppercase">
        </div></div>
      <div class="f"><label>Referência</label><input id="of-reference" value="${esc(o.reference || '')}" placeholder="Portão azul, apto 302…"></div>
      <div class="f"><label>Nota / pedido</label><input id="of-invoice_ref" value="${esc(o.invoice_ref || '')}" placeholder="NF 12345"></div>

      <div class="f"><label>Valor da nota / do serviço (R$)</label>
        <input id="of-value_total" value="${val(o.value_total)}" placeholder="0,00" inputmode="decimal"></div>
      <div class="f"><label>Comissão da sua empresa (%)</label>
        <input id="of-commission_pct" value="${o.commission_pct ?? ''}" placeholder="0 = você recebe o valor cheio" inputmode="decimal">
        <span class="hint">Use o % quando o parceiro paga comissão sobre a nota.</span></div>
      <div class="f"><label>Serviços extras / assistência (R$)</label>
        <input id="of-extra_value" value="${val(o.extra_value)}" placeholder="0,00" inputmode="decimal"></div>
      <div class="f"><label>Custos (peças, deslocamento)</label>
        <input id="of-expenses" value="${val(o.expenses)}" placeholder="0,00" inputmode="decimal"></div>

      <div class="f"><label>Prioridade</label>
        <select id="of-priority">
          ${['baixa', 'normal', 'alta', 'urgente'].map((p) => `<option value="${p}" ${o.priority === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}
        </select></div>
      <div class="f"><label>Status</label>
        <select id="of-status">
          ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${o.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>

      <div class="f full" style="background:#FAFBFD;border:1px solid var(--line);border-radius:12px;padding:12px 14px">
        <div style="display:flex;justify-content:space-between;font-size:.86rem">
          <span class="t-sub">Receita estimada da empresa</span><b id="calcRevenue">R$ 0,00</b>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.86rem;margin-top:5px">
          <span class="t-sub">Repasse ao colaborador</span><b id="calcPay">R$ 0,00</b>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.86rem;margin-top:5px;padding-top:5px;border-top:1px dashed var(--line)">
          <span class="t-sub">Lucro estimado</span><b id="calcProfit" class="money-pos">R$ 0,00</b>
        </div>
      </div>
    </div>`;
}

function bindOrderCalc(el) {
  const compute = () => {
    const value = parseMoney(el('#of-value_total').value) * 100;
    const pct = Number(String(el('#of-commission_pct').value).replace(',', '.')) || 0;
    const extra = parseMoney(el('#of-extra_value').value) * 100;
    const expenses = parseMoney(el('#of-expenses').value) * 100;
    const revenue = (pct > 0 ? Math.round(value * (pct / 100)) : value) + extra;

    const assignee = state.team.find((u) => u.id === el('#of-assignee_id').value);
    const pay = assignee
      ? (assignee.pay_mode === 'fixo' ? assignee.pay_fixed : Math.round(revenue * (assignee.commission_pct / 100)))
      : 0;

    el('#calcRevenue').textContent = money(revenue);
    el('#calcPay').textContent = money(pay);
    const profit = revenue - pay - expenses;
    const profitEl = el('#calcProfit');
    profitEl.textContent = money(profit);
    profitEl.className = profit >= 0 ? 'money-pos' : 'money-neg';
  };
  ['#of-value_total', '#of-commission_pct', '#of-extra_value', '#of-expenses', '#of-assignee_id'].forEach((sel) => {
    el(sel).addEventListener('input', compute);
    el(sel).addEventListener('change', compute);
  });
  // Herda a comissão padrão do parceiro escolhido.
  el('#of-customer_id').addEventListener('change', (e) => {
    const c = state.customers.find((x) => x.id === e.target.value);
    if (c && !el('#of-commission_pct').value) el('#of-commission_pct').value = c.commission_pct || '';
    compute();
  });
  compute();
}

function collectOrder(el) {
  const v = (id) => el(`#of-${id}`).value.trim();
  return {
    client_name: v('client_name'), client_phone: v('client_phone'),
    customer_id: v('customer_id') || null, assignee_id: v('assignee_id') || null,
    service_type: v('service_type'), title: v('title') || v('service_type'),
    description: v('description'),
    scheduled_at: v('scheduled_at') ? new Date(v('scheduled_at')).toISOString() : null,
    address: v('address'), district: v('district'), city: v('city'), uf: v('uf'),
    reference: v('reference'), invoice_ref: v('invoice_ref'),
    value_total: v('value_total'), commission_pct: v('commission_pct') || 0,
    extra_value: v('extra_value'), expenses: v('expenses'),
    priority: v('priority'), status: v('status'),
  };
}

function newOrder() {
  const m = modal({
    title: 'Nova ordem de serviço',
    subtitle: 'O colaborador recebe na hora, com endereço, contato e valor.',
    size: 'wide',
    body: orderForm({ status: 'pendente', priority: 'normal' }),
    footer: `<button class="btn btn-light" data-cancel>Cancelar</button>
             <button class="btn btn-primary" data-save>Criar OS</button>`,
  });
  bindOrderCalc(m.el);
  m.el('[data-cancel]').onclick = m.close;
  m.el('[data-save]').onclick = async () => {
    const data = collectOrder(m.el);
    if (!data.client_name) return fail('Informe o nome do cliente.');
    const btn = m.el('[data-save]');
    btn.disabled = true; btn.textContent = 'Criando…';
    try {
      const tpl = state.settings.checklist_template || [];
      const res = await post('/orders', { ...data, checklist: tpl.map((t) => ({ text: t, done: false })) });
      m.close();
      ok(`OS ${res.order.code} criada.`);
      route();
      openOrder(res.order.id);
    } catch (err) {
      fail(err.message);
      btn.disabled = false; btn.textContent = 'Criar OS';
    }
  };
}

function editOrder(order) {
  const m = modal({
    title: `Editar ${order.code}`,
    size: 'wide',
    body: orderForm(order),
    footer: `<button class="btn btn-light" data-cancel>Cancelar</button>
             <button class="btn btn-primary" data-save>Salvar alterações</button>`,
  });
  bindOrderCalc(m.el);
  m.el('[data-cancel]').onclick = m.close;
  m.el('[data-save]').onclick = async () => {
    const btn = m.el('[data-save]');
    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      await patch(`/orders/${order.id}`, collectOrder(m.el));
      m.close();
      ok('OS atualizada.');
      openOrder(order.id);
      if (state.view === 'ordens') loadOrders();
    } catch (err) {
      fail(err.message);
      btn.disabled = false; btn.textContent = 'Salvar alterações';
    }
  };
}

/* ========================================================= DETALHE DA OS */
async function openOrder(id) {
  const data = await get(`/orders/${id}`);
  const o = data.order;
  const canEdit = o.status !== 'concluida';

  const m = modal({
    title: `${o.code} · ${o.client_name}`,
    subtitle: `${statusBadge(o.status)} <span class="t-sub" style="margin-left:6px">${esc(o.service_type || o.title || 'Serviço')}</span>`,
    size: 'wide',
    body: `
      <div style="margin:-24px -24px 20px"><div class="os-tabs" id="osTabs">
        <button class="on" data-t="resumo">Resumo</button>
        <button data-t="checklist">Checklist e itens</button>
        <button data-t="fotos">Fotos (${data.photos.length})</button>
        <button data-t="assinaturas">Assinaturas (${data.signatures.length})</button>
        <button data-t="financeiro">Financeiro</button>
        <button data-t="historico">Histórico</button>
      </div></div>
      <div id="osPane"></div>`,
    footer: `
      <div style="margin-right:auto;display:flex;gap:8px">
        ${o.status === 'concluida' ? `<a class="btn btn-light btn-sm" href="/os/${o.public_token}" target="_blank">📄 Comprovante</a>` : ''}
        ${o.client_phone ? `<a class="btn btn-light btn-sm" href="${waLink(o.client_phone, `Olá ${o.client_name}, aqui é da ${state.tenant.name} sobre o seu serviço.`)}" target="_blank">💬 WhatsApp</a>` : ''}
        <a class="btn btn-light btn-sm" href="${mapsLink(o)}" target="_blank">🗺️ Mapa</a>
      </div>
      ${canEdit ? '<button class="btn btn-light" data-edit>Editar</button>' : ''}
      <button class="btn btn-danger btn-sm" data-del>Excluir</button>`,
  });

  const panes = {
    resumo: () => paneResumo(data),
    checklist: () => paneChecklist(data),
    fotos: () => paneFotos(data),
    assinaturas: () => paneAssinaturas(data),
    financeiro: () => paneFinanceiro(data),
    historico: () => paneHistorico(data),
  };
  const show = (t) => {
    m.el('#osPane').innerHTML = panes[t]();
    m.overlay.querySelectorAll('#osTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    bindPane(t, data, m);
  };
  m.overlay.querySelectorAll('#osTabs button').forEach((b) => { b.onclick = () => show(b.dataset.t); });
  show('resumo');

  m.el('[data-edit]')?.addEventListener('click', () => { m.close(); editOrder(o); });
  m.el('[data-del]').onclick = async () => {
    if (!await confirmDialog('Excluir OS', `A ${o.code} e todas as fotos e assinaturas serão apagadas. Não dá para desfazer.`, { confirmText: 'Excluir', danger: true })) return;
    await del(`/orders/${o.id}`);
    m.close();
    ok('OS excluída.');
    route();
  };
}

function paneResumo(d) {
  const o = d.order;
  return `
    <div class="info-grid" style="margin-bottom:18px">
      <div><dt>Cliente</dt><dd>${esc(o.client_name)}${o.client_phone ? `<br><span class="t-sub">${phoneBR(o.client_phone)}</span>` : ''}</dd></div>
      <div><dt>Parceiro</dt><dd>${esc(d.customer?.name || 'Cliente direto')}${d.customer?.commission_pct ? `<br><span class="t-sub">Comissão de ${d.customer.commission_pct}%</span>` : ''}</dd></div>
      <div><dt>Colaborador</dt><dd>${d.assignee ? esc(d.assignee.name) : '<span style="color:var(--red)">Não atribuído</span>'}</dd></div>
      <div><dt>Agendamento</dt><dd>${dateBR(o.scheduled_at, true)}${o.window_label ? ` · ${o.window_label}` : ''}</dd></div>
      <div><dt>Endereço</dt><dd>${esc(fullAddress(o))}${o.reference ? `<br><span class="t-sub">${esc(o.reference)}</span>` : ''}</dd></div>
      <div><dt>Execução</dt><dd>${o.started_at ? `Início ${timeBR(o.started_at)}` : 'Não iniciado'}${o.finished_at ? ` · Fim ${timeBR(o.finished_at)} (${o.duration_min} min)` : ''}</dd></div>
    </div>
    ${o.description ? `<div class="card card-pad" style="margin-bottom:16px"><dt class="t-sub" style="font-weight:700;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em">Descrição</dt><p style="margin:6px 0 0;font-size:.9rem">${esc(o.description).replace(/\n/g, '<br>')}</p></div>` : ''}
    ${o.field_notes ? `<div class="card card-pad" style="margin-bottom:16px;background:#FFFBF3;border-color:#F6E2C2"><dt class="t-sub" style="font-weight:700;font-size:.72rem;text-transform:uppercase">Observações do campo</dt><p style="margin:6px 0 0;font-size:.9rem">${esc(o.field_notes).replace(/\n/g, '<br>')}</p></div>` : ''}
    ${o.rating ? `<div class="card card-pad" style="background:var(--green-soft);border-color:#C8EEDE">
        <b style="color:#0B7A57">${'★'.repeat(o.rating)}${'☆'.repeat(5 - o.rating)} · avaliação do cliente</b>
        ${o.client_feedback ? `<p style="margin:6px 0 0;font-size:.9rem">“${esc(o.client_feedback)}”</p>` : ''}
      </div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
      ${o.status !== 'concluida' ? `
        <select class="select" id="quickStatus">
          ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${o.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <select class="select" id="quickAssignee">
          <option value="">Sem colaborador</option>
          ${fieldTeam().map((u) => `<option value="${u.id}" ${o.assignee_id === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
        </select>` : ''}
    </div>`;
}

function paneChecklist(d) {
  const o = d.order;
  const list = Array.isArray(o.checklist) ? o.checklist : [];
  return `
    <h4 style="font-size:.9rem;margin-bottom:10px">Checklist do serviço</h4>
    ${list.length ? list.map((c, i) => `
      <div class="checklist-item ${c.done ? 'done' : ''}">
        <input type="checkbox" data-check="${i}" ${c.done ? 'checked' : ''} ${o.status === 'concluida' ? 'disabled' : ''}>
        <span>${esc(c.text)}</span>
      </div>`).join('') : '<p class="t-sub">Nenhum checklist definido. Configure um modelo em Configurações.</p>'}

    <h4 style="font-size:.9rem;margin:22px 0 10px">Itens / peças</h4>
    <div class="table-wrap"><table>
      <thead><tr><th>Descrição</th><th class="num">Qtd</th><th class="num">Valor</th><th></th></tr></thead>
      <tbody>${d.items.length ? d.items.map((it) => `
        <tr><td>${esc(it.description)}</td><td class="num">${it.qty}</td><td class="num">${money(it.unit_value)}</td>
        <td class="num"><button class="btn btn-xs btn-danger" data-delitem="${it.id}">×</button></td></tr>`).join('')
        : '<tr><td colspan="4" class="t-sub">Nenhum item cadastrado.</td></tr>'}</tbody>
    </table></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <input class="input" id="newItemDesc" placeholder="Descrição do item" style="flex:1">
      <input class="input" id="newItemValue" placeholder="Valor" style="width:110px">
      <button class="btn btn-light btn-sm" id="addItem">Adicionar</button>
    </div>`;
}

function paneFotos(d) {
  return `
    ${d.photos.length ? `<div class="photo-grid">${d.photos.map((p) => `
      <div class="photo">
        <img src="${p.url}" onclick="lightbox('${p.url}')" alt="${esc(p.caption || p.kind)}">
        <div class="cap"><span class="k k-${p.kind}">${p.kind}</span> ${relative(p.created_at)}
          <button class="btn btn-xs btn-danger" style="margin-left:auto" data-delphoto="${p.id}">×</button>
        </div>
      </div>`).join('')}</div>` : '<p class="t-sub">Nenhuma foto enviada ainda. O colaborador anexa as fotos pelo app durante a execução.</p>'}
    <div style="margin-top:16px">
      <label class="btn btn-light btn-sm" style="cursor:pointer">
        📷 Anexar foto
        <input type="file" accept="image/*" id="adminPhoto" style="display:none">
      </label>
      <select class="select" id="adminPhotoKind" style="margin-left:6px">
        <option value="depois">Depois</option><option value="antes">Antes</option>
        <option value="avaria">Avaria</option><option value="documento">Documento</option>
      </select>
    </div>`;
}

function paneAssinaturas(d) {
  if (!d.signatures.length) {
    return `<div class="empty"><div class="ic">✍️</div><h3>Ainda sem assinaturas</h3>
      <p>As assinaturas são coletadas pelo colaborador no app, na conclusão do serviço.</p></div>`;
  }
  return `
    <div class="sig-grid">${d.signatures.map((s) => `
      <div class="sig-card">
        <img src="${s.url}" alt="Assinatura de ${esc(s.name)}">
        <b>${esc(s.name)}</b>
        <span>${s.role === 'cliente' ? 'Cliente' : 'Colaborador'} · ${dateBR(s.signed_at, true)}</span>
        ${s.doc ? `<div class="t-sub" style="font-size:.72rem">Doc: ${esc(s.doc)}</div>` : ''}
        <div class="hash">sha256 · ${s.hash}</div>
        <div class="t-sub" style="font-size:.68rem;margin-top:4px">IP ${esc(s.ip || '—')}</div>
      </div>`).join('')}</div>
    <p class="t-sub" style="margin-top:16px">
      Cada assinatura é registrada com data, hora, IP e um hash que liga o desenho à ordem de serviço —
      é isso que sustenta o comprovante caso o cliente questione a entrega.
    </p>`;
}

function paneFinanceiro(d) {
  const o = d.order;
  return `
    <div class="info-grid" style="margin-bottom:18px">
      <div><dt>Valor da nota / serviço</dt><dd>${money(o.value_total)}</dd></div>
      <div><dt>Comissão da empresa</dt><dd>${o.commission_pct ? `${o.commission_pct}%` : 'Valor cheio'}</dd></div>
      <div><dt>Extras / assistência</dt><dd>${money(o.extra_value)}</dd></div>
      <div><dt>Custos</dt><dd>${money(o.expenses)}</dd></div>
      <div style="background:var(--gold-soft)"><dt>Receita da empresa</dt><dd style="font-size:1.05rem">${money(o.revenue)}</dd></div>
      <div style="background:var(--blue-soft)"><dt>Repasse ao colaborador</dt><dd style="font-size:1.05rem">${money(o.assignee_pay)}</dd></div>
      <div style="background:var(--green-soft);grid-column:1/-1"><dt>Lucro da OS</dt><dd style="font-size:1.15rem;color:#0B7A57">${money(o.profit)}</dd></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <label class="switch"><input type="checkbox" id="setReceived" ${o.received ? 'checked' : ''}><span class="track"></span>
        <span>Recebido do parceiro/cliente ${o.received_at ? `<span class="t-sub">· ${dateBR(o.received_at)}</span>` : ''}</span></label>
      <label class="switch"><input type="checkbox" id="setPaid" ${o.paid_assignee ? 'checked' : ''}><span class="track"></span>
        <span>Repasse pago ao colaborador ${o.paid_at ? `<span class="t-sub">· ${dateBR(o.paid_at)}</span>` : ''}</span></label>
    </div>`;
}

function paneHistorico(d) {
  if (!d.events.length) return '<p class="t-sub">Sem registros ainda.</p>';
  return `<div class="timeline">${d.events.map((e) => `
    <div class="tl-item">
      <b>${esc(e.message)}</b>
      <span>${esc(e.user_name || 'Sistema')} · ${dateBR(e.created_at, true)}</span>
    </div>`).join('')}</div>`;
}

function bindPane(tab, d, m) {
  const o = d.order;
  const refresh = async () => {
    m.close();
    await openOrder(o.id);
    if (state.view === 'ordens') loadOrders();
    if (state.view === 'painel') route();
  };

  if (tab === 'resumo') {
    m.el('#quickStatus')?.addEventListener('change', async (e) => {
      await patch(`/orders/${o.id}`, { status: e.target.value });
      ok('Status atualizado.');
      refresh();
    });
    m.el('#quickAssignee')?.addEventListener('change', async (e) => {
      await patch(`/orders/${o.id}`, { assignee_id: e.target.value || null });
      ok('Colaborador atualizado.');
      refresh();
    });
  }

  if (tab === 'checklist') {
    m.overlay.querySelectorAll('[data-check]').forEach((cb) => {
      cb.onchange = async () => {
        const list = [...m.overlay.querySelectorAll('[data-check]')].map((x, i) => ({
          text: Array.isArray(o.checklist) ? o.checklist[i].text : '',
          done: x.checked,
        }));
        await patch(`/orders/${o.id}`, { checklist: list });
        o.checklist = list;
      };
    });
    m.el('#addItem').onclick = async () => {
      const description = m.el('#newItemDesc').value.trim();
      if (!description) return fail('Descreva o item.');
      await post(`/orders/${o.id}/items`, { description, unit_value: m.el('#newItemValue').value });
      refresh();
    };
    m.overlay.querySelectorAll('[data-delitem]').forEach((b) => {
      b.onclick = async () => { await del(`/orders/${o.id}/items/${b.dataset.delitem}`); refresh(); };
    });
  }

  if (tab === 'fotos') {
    m.el('#adminPhoto')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const image = await fileToDataUrl(file);
        await post(`/orders/${o.id}/photos`, { image, kind: m.el('#adminPhotoKind').value });
        ok('Foto anexada.');
        refresh();
      } catch (err) { fail(err.message); }
    });
    m.overlay.querySelectorAll('[data-delphoto]').forEach((b) => {
      b.onclick = async () => { await del(`/orders/${o.id}/photos/${b.dataset.delphoto}`); refresh(); };
    });
  }

  if (tab === 'financeiro') {
    m.el('#setReceived').onchange = async (e) => {
      await post(`/orders/${o.id}/settle`, { received: e.target.checked });
      ok(e.target.checked ? 'Recebimento confirmado.' : 'Recebimento desmarcado.');
      o.received = e.target.checked;
    };
    m.el('#setPaid').onchange = async (e) => {
      await post(`/orders/${o.id}/settle`, { paid_assignee: e.target.checked });
      ok(e.target.checked ? 'Repasse marcado como pago.' : 'Repasse voltou para pendente.');
      o.paid_assignee = e.target.checked;
    };
  }
}

/* ================================================================== ROTA */
VIEWS.rota = async (root) => {
  const date = state.routeDate || todayISO();
  state.routeDate = date;
  const d = await get(`/route?date=${date}`);

  document.getElementById('topActions').innerHTML = `
    <input type="date" class="input" id="routeDate" value="${date}">
    <button class="btn btn-light btn-sm" onclick="window.print()">Imprimir</button>`;

  root.innerHTML = d.rotas.length ? d.rotas.map((r) => `
    <div class="route-card">
      <div class="route-head">
        <span class="avatar" style="background:${r.color}">${initials(r.assignee_name)}</span>
        <div>
          <b>${esc(r.assignee_name)}</b>
          <div class="t-sub">${r.total} parada(s) · ${r.concluidas} concluída(s) · ${money(r.receita)} em serviços</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px" class="no-print">
          ${r.phone ? `<a class="btn btn-light btn-sm" href="${waLink(r.phone, `Bom dia! Sua rota de hoje tem ${r.total} atendimentos.`)}" target="_blank">💬</a>` : ''}
          ${r.maps_url ? `<a class="btn btn-dark btn-sm" href="${r.maps_url}" target="_blank">🗺️ Abrir rota</a>` : ''}
        </div>
      </div>
      ${r.stops.map((s, i) => `
        <div class="stop">
          <span class="seq">${i + 1}</span>
          <span class="time">${timeBR(s.scheduled_at)}</span>
          <div class="who">
            <b>${esc(s.client_name)}</b>
            <span>${esc(fullAddress(s))}</span>
          </div>
          <div class="r">
            <span class="t-sub">${money(s.revenue)}</span>
            ${statusBadge(s.status)}
            <button class="btn btn-light btn-xs no-print" onclick="openOrder('${s.id}')">Abrir</button>
          </div>
        </div>`).join('')}
    </div>`).join('')
    : emptyBox('🗺️', 'Nenhum serviço agendado', 'Escolha outra data ou agende uma OS para este dia.', 'newOrder()', '+ Nova OS');

  document.getElementById('routeDate').onchange = (e) => { state.routeDate = e.target.value; route(); };
};

/* ============================================================== CLIENTES */
VIEWS.clientes = async (root) => {
  await loadCustomers();
  document.getElementById('topActions').innerHTML = '<button class="btn btn-primary btn-sm" onclick="editCustomer()">+ Novo cliente</button>';

  root.innerHTML = state.customers.length ? `
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>Contato</th><th class="num">Comissão</th><th class="num">OS</th>
        <th class="num">Faturado</th><th class="num">Em aberto</th><th></th></tr></thead>
      <tbody>${state.customers.map((c) => `
        <tr class="clickable" onclick='editCustomer(${JSON.stringify(c).replace(/'/g, "&#39;")})'>
          <td><div class="t-strong">${esc(c.name)}</div><div class="t-sub">${esc(c.city || '')} ${c.active ? '' : '· arquivado'}</div></td>
          <td class="t-sub">${esc(c.contact || '')}<br>${phoneBR(c.phone)}</td>
          <td class="num">${c.commission_pct ? `${c.commission_pct}%` : '—'}</td>
          <td class="num">${c.orders_count}</td>
          <td class="num t-strong">${money(c.revenue_total)}</td>
          <td class="num" style="color:${c.open_amount ? 'var(--gold-3)' : 'var(--muted-2)'}">${money(c.open_amount)}</td>
          <td class="num t-sub">${esc(c.payment_terms || '')}</td>
        </tr>`).join('')}</tbody>
    </table></div></div>`
    : emptyBox('🏬', 'Nenhum cliente cadastrado', 'Cadastre as lojas parceiras e os clientes que geram serviço para você.', 'editCustomer()', '+ Novo cliente');
};

function editCustomer(c = {}) {
  const isNew = !c.id;
  const m = modal({
    title: isNew ? 'Novo cliente / parceiro' : esc(c.name),
    size: '',
    body: `
      <div class="form-grid">
        <div class="f"><label>Tipo</label>
          <select id="c-kind"><option value="pj" ${c.kind !== 'pf' ? 'selected' : ''}>Empresa / loja parceira</option>
          <option value="pf" ${c.kind === 'pf' ? 'selected' : ''}>Pessoa física</option></select></div>
        <div class="f"><label>Nome *</label><input id="c-name" value="${esc(c.name || '')}"></div>
        <div class="f"><label>CNPJ / CPF</label><input id="c-doc" value="${esc(c.doc || '')}"></div>
        <div class="f"><label>Pessoa de contato</label><input id="c-contact" value="${esc(c.contact || '')}"></div>
        <div class="f"><label>Telefone</label><input id="c-phone" value="${esc(c.phone || '')}"></div>
        <div class="f"><label>E-mail</label><input id="c-email" value="${esc(c.email || '')}"></div>
        <div class="f full"><label>Endereço</label><input id="c-address" value="${esc(c.address || '')}"></div>
        <div class="f"><label>Cidade</label><input id="c-city" value="${esc(c.city || state.tenant.city || '')}"></div>
        <div class="f"><label>UF</label><input id="c-uf" maxlength="2" value="${esc(c.uf || state.tenant.uf || '')}"></div>
        <div class="f"><label>Comissão sobre a nota (%)</label>
          <input id="c-commission_pct" value="${c.commission_pct ?? ''}" placeholder="Ex.: 8">
          <span class="hint">Deixe vazio se você cobra o valor cheio do cliente.</span></div>
        <div class="f"><label>Prazo de pagamento</label><input id="c-payment_terms" value="${esc(c.payment_terms || '')}" placeholder="30 dias após a conclusão"></div>
        <div class="f full"><label>Observações</label><textarea id="c-notes">${esc(c.notes || '')}</textarea></div>
      </div>`,
    footer: `${isNew ? '' : '<button class="btn btn-danger btn-sm" data-del style="margin-right:auto">Excluir</button>'}
      <button class="btn btn-light" data-cancel>Cancelar</button>
      <button class="btn btn-primary" data-save>${isNew ? 'Cadastrar' : 'Salvar'}</button>`,
  });

  m.el('[data-cancel]').onclick = m.close;
  m.el('[data-save]').onclick = async () => {
    const v = (k) => m.el(`#c-${k}`).value.trim();
    if (!v('name')) return fail('Informe o nome.');
    const body = {
      kind: v('kind'), name: v('name'), doc: v('doc'), contact: v('contact'), phone: v('phone'),
      email: v('email'), address: v('address'), city: v('city'), uf: v('uf'),
      commission_pct: v('commission_pct') || 0, payment_terms: v('payment_terms'), notes: v('notes'),
    };
    try {
      if (isNew) await post('/customers', body);
      else await patch(`/customers/${c.id}`, body);
      m.close(); ok('Cliente salvo.'); route();
    } catch (err) { fail(err.message); }
  };
  m.el('[data-del]')?.addEventListener('click', async () => {
    if (!await confirmDialog('Excluir cliente', `Remover ${c.name}? Se houver OS no histórico, ele será apenas arquivado.`, { danger: true, confirmText: 'Excluir' })) return;
    const res = await del(`/customers/${c.id}`);
    m.close(); ok(res.message || 'Cliente removido.'); route();
  });
}

/* ================================================================ EQUIPE */
VIEWS.equipe = async (root) => {
  await loadTeam();
  const active = state.team.filter((u) => u.active).length;
  document.getElementById('topActions').innerHTML = `
    <span class="chip">${active}/${state.teamLimit} usuários do plano</span>
    <button class="btn btn-primary btn-sm" onclick="editMember()">+ Novo colaborador</button>`;

  root.innerHTML = `
    <div class="grid g3" style="margin-bottom:16px">
      ${state.team.filter((u) => u.role === 'campo' && u.active).slice(0, 3).map((u) => `
        <div class="card card-pad">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <span class="avatar" style="background:${u.color || colorFor(u.name)};width:38px;height:38px;border-radius:12px">${initials(u.name)}</span>
            <div><div class="t-strong">${esc(u.name)}</div><div class="t-sub">${u.pay_mode === 'fixo' ? `${money(u.pay_fixed)} por OS` : `${u.commission_pct}% por OS`}</div></div>
          </div>
          <div style="display:flex;gap:16px;font-size:.82rem">
            <div><div class="t-sub">Em aberto</div><b>${u.open_count}</b></div>
            <div><div class="t-sub">Concluídas</div><b>${u.done_count}</b></div>
            <div><div class="t-sub">A receber</div><b style="color:var(--gold-3)">${money(u.pending_pay)}</b></div>
            <div><div class="t-sub">Nota</div><b>${u.avg_rating ? `${u.avg_rating.toFixed(1)} ★` : '—'}</b></div>
          </div>
        </div>`).join('')}
    </div>

    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>Acesso</th><th>Perfil</th><th class="num">Remuneração</th>
        <th class="num">OS abertas</th><th class="num">A receber</th><th>Último acesso</th></tr></thead>
      <tbody>${state.team.map((u) => `
        <tr class="clickable" onclick='editMember(${JSON.stringify(u).replace(/'/g, "&#39;")})'>
          <td><div style="display:flex;align-items:center;gap:9px">
            <span class="avatar" style="background:${u.color || colorFor(u.name)}">${initials(u.name)}</span>
            <div><div class="t-strong">${esc(u.name)}</div><div class="t-sub">${esc(u.skills || '')}</div></div>
          </div></td>
          <td class="t-sub">${esc(u.email)}<br>${phoneBR(u.phone)}</td>
          <td><span class="chip">${{ dono: 'Dono', admin: 'Gestor', campo: 'Campo' }[u.role]}</span>${u.active ? '' : ' <span class="chip" style="background:var(--red-soft);color:#B4242A">inativo</span>'}</td>
          <td class="num">${u.role === 'campo' ? (u.pay_mode === 'fixo' ? `${money(u.pay_fixed)}/OS` : `${u.commission_pct}%`) : '—'}</td>
          <td class="num">${u.open_count}</td>
          <td class="num" style="color:${u.pending_pay ? 'var(--gold-3)' : 'var(--muted-2)'}">${money(u.pending_pay)}</td>
          <td class="t-sub">${u.last_login ? relative(u.last_login) : 'nunca entrou'}</td>
        </tr>`).join('')}</tbody>
    </table></div></div>`;
};

function editMember(u = {}) {
  const isNew = !u.id;
  const m = modal({
    title: isNew ? 'Novo colaborador' : esc(u.name),
    subtitle: isNew ? 'Ele acessa o app de campo com o e-mail e a senha que você definir.' : '',
    body: `
      <div class="form-grid">
        <div class="f"><label>Nome *</label><input id="u-name" value="${esc(u.name || '')}"></div>
        <div class="f"><label>E-mail de acesso *</label><input id="u-email" value="${esc(u.email || '')}" ${isNew ? '' : 'disabled'}></div>
        <div class="f"><label>Telefone</label><input id="u-phone" value="${esc(u.phone || '')}"></div>
        <div class="f"><label>CPF</label><input id="u-doc" value="${esc(u.doc || '')}"></div>
        <div class="f"><label>${isNew ? 'Senha *' : 'Nova senha'}</label>
          <input id="u-password" type="password" placeholder="${isNew ? 'Mínimo 6 caracteres' : 'Deixe vazio para manter'}"></div>
        <div class="f"><label>Perfil</label>
          <select id="u-role" ${u.role === 'dono' ? 'disabled' : ''}>
            <option value="campo" ${u.role === 'campo' || isNew ? 'selected' : ''}>Colaborador de campo</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Gestor (acesso ao painel)</option>
            ${u.role === 'dono' ? '<option value="dono" selected>Dono da conta</option>' : ''}
          </select></div>
        <div class="f"><label>Forma de remuneração</label>
          <select id="u-pay_mode">
            <option value="pct" ${u.pay_mode !== 'fixo' ? 'selected' : ''}>% sobre a receita da OS</option>
            <option value="fixo" ${u.pay_mode === 'fixo' ? 'selected' : ''}>Valor fixo por OS</option>
          </select></div>
        <div class="f"><label>Percentual / valor</label>
          <div style="display:flex;gap:8px">
            <input id="u-commission_pct" value="${u.commission_pct ?? ''}" placeholder="% (ex.: 55)" style="flex:1">
            <input id="u-pay_fixed" value="${u.pay_fixed ? (u.pay_fixed / 100).toFixed(2).replace('.', ',') : ''}" placeholder="R$ fixo" style="flex:1">
          </div></div>
        <div class="f full"><label>Especialidades</label><input id="u-skills" value="${esc(u.skills || '')}" placeholder="Montagem, elétrica, planejados…"></div>
        ${isNew ? '' : `<div class="f full"><label class="switch"><input type="checkbox" id="u-active" ${u.active ? 'checked' : ''} ${u.role === 'dono' ? 'disabled' : ''}><span class="track"></span><span>Acesso ativo</span></label></div>`}
      </div>`,
    footer: `${isNew || u.role === 'dono' ? '' : '<button class="btn btn-danger btn-sm" data-del style="margin-right:auto">Remover</button>'}
      <button class="btn btn-light" data-cancel>Cancelar</button>
      <button class="btn btn-primary" data-save>${isNew ? 'Cadastrar' : 'Salvar'}</button>`,
  });

  m.el('[data-cancel]').onclick = m.close;
  m.el('[data-save]').onclick = async () => {
    const v = (k) => m.el(`#u-${k}`)?.value.trim() ?? '';
    const body = {
      name: v('name'), phone: v('phone'), doc: v('doc'), role: v('role'),
      pay_mode: v('pay_mode'), commission_pct: v('commission_pct') || 0,
      pay_fixed: v('pay_fixed') || 0, skills: v('skills'),
    };
    if (v('password')) body.password = v('password');
    if (!isNew) body.active = m.el('#u-active')?.checked ?? true;
    try {
      if (isNew) await post('/team', { ...body, email: v('email'), password: v('password') });
      else await patch(`/team/${u.id}`, body);
      m.close(); ok('Colaborador salvo.'); route();
    } catch (err) {
      fail(err.message);
      if (err.details?.upgrade) location.hash = '#assinatura';
    }
  };
  m.el('[data-del]')?.addEventListener('click', async () => {
    if (!await confirmDialog('Remover colaborador', `Remover ${u.name}? Se ele tiver OS no histórico, o acesso será apenas desativado.`, { danger: true, confirmText: 'Remover' })) return;
    const res = await del(`/team/${u.id}`);
    m.close(); ok(res.message || 'Colaborador removido.'); route();
  });
}

/* =========================================================== FINANCEIRO */
VIEWS.financeiro = async (root) => {
  const from = state.finFrom || monthStart();
  const to = state.finTo || todayISO();
  state.finFrom = from; state.finTo = to;
  const d = await get(`/finance?from=${from}&to=${to}`);
  const r = d.resumo;

  document.getElementById('topActions').innerHTML = `
    <input type="date" class="input" id="finFrom" value="${from}">
    <input type="date" class="input" id="finTo" value="${to}">
    <a class="btn btn-light btn-sm" href="/api/finance/export.csv?from=${from}&to=${to}">Exportar CSV</a>
    <button class="btn btn-primary btn-sm" onclick="newEntry()">+ Lançamento</button>`;

  root.innerHTML = `
    <div class="grid g4" style="margin-bottom:16px">
      ${kpi('Receita do período', money(r.receita), 'gold', '💰', `${r.os} OS · ticket ${money(r.ticket_medio)}`)}
      ${kpi('Repasses à equipe', money(r.repasses), 'blue', '👷', 'Mão de obra das OS concluídas')}
      ${kpi('Custos e despesas', money(r.custos_os + r.despesas), 'red', '📉', `Peças ${money(r.custos_os)} · fixas ${money(r.despesas)}`)}
      ${kpi('Lucro', money(r.lucro), 'green', '📈', `Margem de ${r.margem}%`)}
    </div>

    <div class="grid g2" style="margin-bottom:16px">
      <div class="card">
        <div class="card-head">
          <h3>A receber · ${money(d.a_receber.total)}</h3>
          <div class="r"><button class="btn btn-green btn-sm" id="baixaReceber">Dar baixa nos marcados</button></div>
        </div>
        <div class="table-wrap" style="max-height:340px;overflow-y:auto"><table>
          <thead><tr><th style="width:34px"><input type="checkbox" id="allRec"></th><th>OS</th><th>Parceiro</th><th class="num">Valor</th></tr></thead>
          <tbody>${d.a_receber.itens.length ? d.a_receber.itens.map((i) => `
            <tr><td><input type="checkbox" class="rec-check" value="${i.id}"></td>
              <td><div class="t-strong">${i.code}</div><div class="t-sub">${esc(i.client_name)}</div></td>
              <td class="t-sub">${esc(i.parceiro || 'Direto')}<br>${esc(i.payment_terms || '')}</td>
              <td class="num t-strong">${money(i.valor)}</td></tr>`).join('')
            : '<tr><td colspan="4" class="t-sub" style="padding:20px">Nada a receber. 🎉</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>A pagar à equipe · ${money(d.a_pagar.total)}</h3>
          <div class="r"><button class="btn btn-green btn-sm" id="baixaPagar">Marcar como pago</button></div>
        </div>
        <div class="table-wrap" style="max-height:340px;overflow-y:auto"><table>
          <thead><tr><th style="width:34px"><input type="checkbox" id="allPay"></th><th>OS</th><th>Colaborador</th><th class="num">Valor</th></tr></thead>
          <tbody>${d.a_pagar.itens.length ? d.a_pagar.itens.map((i) => `
            <tr><td><input type="checkbox" class="pay-check" value="${i.id}"></td>
              <td><div class="t-strong">${i.code}</div><div class="t-sub">${esc(i.client_name)}</div></td>
              <td><div style="display:flex;align-items:center;gap:7px"><span class="avatar sm" style="background:${i.color || colorFor(i.colaborador)}">${initials(i.colaborador)}</span><span class="t-sub">${esc(i.colaborador || '')}</span></div></td>
              <td class="num t-strong">${money(i.valor)}</td></tr>`).join('')
            : '<tr><td colspan="4" class="t-sub" style="padding:20px">Nenhum repasse pendente.</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>

    <div class="grid g2">
      <div class="card">
        <div class="card-head"><h3>Acerto por colaborador</h3></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Colaborador</th><th class="num">OS</th><th class="num">Total</th><th class="num">Pendente</th></tr></thead>
          <tbody>${d.acertos.map((a) => `
            <tr><td><div style="display:flex;align-items:center;gap:9px">
              <span class="avatar" style="background:${a.color || colorFor(a.name)}">${initials(a.name)}</span>
              <div><div class="t-strong">${esc(a.name)}</div><div class="t-sub">${a.pay_mode === 'fixo' ? 'Valor fixo' : `${a.commission_pct}%`}</div></div></div></td>
              <td class="num">${a.os}</td><td class="num">${money(a.total)}</td>
              <td class="num t-strong" style="color:${a.pendente ? 'var(--gold-3)' : 'var(--muted-2)'}">${money(a.pendente)}</td></tr>`).join('')
            || '<tr><td colspan="4" class="t-sub">Sem acertos no período.</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Lançamentos do período</h3></div>
        <div class="table-wrap" style="max-height:340px;overflow-y:auto"><table>
          <thead><tr><th>Descrição</th><th>Tipo</th><th class="num">Valor</th><th></th></tr></thead>
          <tbody>${d.lancamentos.map((l) => `
            <tr><td><div class="t-strong">${esc(l.description)}</div><div class="t-sub">${dateBR(l.created_at)} ${l.paid_at ? '· pago' : '· em aberto'}</div></td>
              <td><span class="chip">${l.kind}</span></td>
              <td class="num ${l.kind === 'receita' ? 'money-pos' : 'money-neg'}">${l.kind === 'receita' ? '' : '-'}${money(l.amount)}</td>
              <td class="num">${l.order_id ? '' : `<button class="btn btn-xs btn-danger" data-delentry="${l.id}">×</button>`}</td></tr>`).join('')
            || '<tr><td colspan="4" class="t-sub">Sem lançamentos.</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>`;

  document.getElementById('finFrom').onchange = (e) => { state.finFrom = e.target.value; route(); };
  document.getElementById('finTo').onchange = (e) => { state.finTo = e.target.value; route(); };

  const bindAll = (master, cls) => {
    const el = root.querySelector(master);
    if (el) el.onchange = () => root.querySelectorAll(cls).forEach((c) => { c.checked = el.checked; });
  };
  bindAll('#allRec', '.rec-check');
  bindAll('#allPay', '.pay-check');

  const settle = async (cls, field) => {
    const ids = [...root.querySelectorAll(`${cls}:checked`)].map((c) => c.value);
    if (!ids.length) return fail('Selecione ao menos uma OS.');
    await post('/finance/settle-batch', { order_ids: ids, field, value: true });
    ok(`${ids.length} OS atualizada(s).`);
    route();
  };
  root.querySelector('#baixaReceber').onclick = () => settle('.rec-check', 'received');
  root.querySelector('#baixaPagar').onclick = () => settle('.pay-check', 'paid_assignee');

  root.querySelectorAll('[data-delentry]').forEach((b) => {
    b.onclick = async () => { await del(`/finance/entries/${b.dataset.delentry}`); ok('Lançamento removido.'); route(); };
  });
};

function newEntry() {
  const m = modal({
    title: 'Novo lançamento',
    size: 'slim',
    body: `
      <div class="form-grid" style="grid-template-columns:1fr">
        <div class="f"><label>Tipo</label>
          <select id="e-kind"><option value="despesa">Despesa</option><option value="receita">Receita avulsa</option></select></div>
        <div class="f"><label>Descrição *</label><input id="e-description" placeholder="Ex.: Combustível da frota"></div>
        <div class="f"><label>Valor (R$) *</label><input id="e-amount" placeholder="0,00" inputmode="decimal"></div>
        <div class="f"><label>Categoria</label><input id="e-category" placeholder="fixo, operacional, ferramentas…"></div>
        <div class="f"><label class="switch"><input type="checkbox" id="e-paid" checked><span class="track"></span><span>Já foi pago</span></label></div>
      </div>`,
    footer: '<button class="btn btn-light" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Lançar</button>',
  });
  m.el('[data-cancel]').onclick = m.close;
  m.el('[data-save]').onclick = async () => {
    const v = (k) => m.el(`#e-${k}`).value.trim();
    if (!v('description')) return fail('Descreva o lançamento.');
    try {
      await post('/finance/entries', {
        kind: v('kind'), description: v('description'), amount: v('amount'),
        category: v('category'), paid: m.el('#e-paid').checked,
      });
      m.close(); ok('Lançamento criado.'); route();
    } catch (err) { fail(err.message); }
  };
}

/* =========================================================== RELATÓRIOS */
VIEWS.relatorios = async (root) => {
  const from = state.repFrom || monthStart();
  const to = state.repTo || todayISO();
  state.repFrom = from; state.repTo = to;
  const d = await get(`/reports?from=${from}&to=${to}`);
  const r = d.resumo;

  document.getElementById('topActions').innerHTML = `
    <input type="date" class="input" id="repFrom" value="${from}">
    <input type="date" class="input" id="repTo" value="${to}">
    <button class="btn btn-light btn-sm" onclick="window.print()">Imprimir</button>`;

  const maxParceiro = Math.max(...d.por_parceiro.map((p) => p.receita), 1);

  root.innerHTML = `
    <div class="grid g4" style="margin-bottom:16px">
      ${kpi('OS concluídas', r.os, 'blue', '✅', `Duração média de ${Math.round(r.duracao_media)} min`)}
      ${kpi('Receita', money(r.receita), 'gold', '💰', `Ticket ${money(r.os ? Math.round(r.receita / r.os) : 0)}`)}
      ${kpi('Lucro', money(r.lucro), 'green', '📈', `${r.receita ? Math.round((r.lucro / r.receita) * 100) : 0}% de margem`)}
      ${kpi('Satisfação', r.nota_media ? `${r.nota_media.toFixed(1)} ★` : '—', 'gold', '⭐', 'Média das avaliações')}
    </div>

    <div class="grid g2" style="margin-bottom:16px">
      <div class="card">
        <div class="card-head"><h3>Receita por parceiro</h3></div>
        <div class="card-pad">
          ${d.por_parceiro.length ? d.por_parceiro.map((p) => `
            <div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:5px">
                <span class="t-strong">${esc(p.parceiro)}</span><span>${money(p.receita)} <span class="t-sub">· ${p.os} OS</span></span>
              </div>
              <div style="height:7px;background:var(--bg-2);border-radius:99px;overflow:hidden">
                <div style="height:100%;width:${(p.receita / maxParceiro) * 100}%;background:linear-gradient(90deg,var(--gold-2),var(--gold));border-radius:99px"></div>
              </div>
            </div>`).join('') : '<p class="t-sub">Sem dados no período.</p>'}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Desempenho da equipe</h3></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Colaborador</th><th class="num">OS</th><th class="num">Receita</th><th class="num">Repasse</th><th class="num">Nota</th><th class="num">Média</th></tr></thead>
          <tbody>${d.por_colaborador.map((c) => `
            <tr><td><div style="display:flex;align-items:center;gap:8px">
              <span class="avatar sm" style="background:${c.color || colorFor(c.colaborador)}">${initials(c.colaborador)}</span>${esc(c.colaborador)}</div></td>
              <td class="num">${c.os}</td><td class="num t-strong">${money(c.receita)}</td>
              <td class="num t-sub">${money(c.repasse)}</td><td class="num">${c.nota || '—'}</td>
              <td class="num t-sub">${c.duracao || '—'} min</td></tr>`).join('')
            || '<tr><td colspan="6" class="t-sub">Sem dados no período.</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Serviços mais executados</h3></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Tipo de serviço</th><th class="num">Quantidade</th><th class="num">Receita</th><th class="num">Ticket médio</th></tr></thead>
        <tbody>${d.por_tipo.map((t) => `
          <tr><td class="t-strong">${esc(t.tipo)}</td><td class="num">${t.os}</td>
            <td class="num">${money(t.receita)}</td><td class="num t-sub">${money(Math.round(t.receita / t.os))}</td></tr>`).join('')
          || '<tr><td colspan="4" class="t-sub">Sem dados no período.</td></tr>'}</tbody>
      </table></div>
    </div>`;

  document.getElementById('repFrom').onchange = (e) => { state.repFrom = e.target.value; route(); };
  document.getElementById('repTo').onchange = (e) => { state.repTo = e.target.value; route(); };
};

/* ============================================================= IMPORTAR */
VIEWS.importar = async (root) => {
  root.innerHTML = `
    <div class="grid g-main">
      <div class="card">
        <div class="card-head"><h3>Cole a lista de serviços</h3></div>
        <div class="card-pad">
          <p class="t-sub" style="margin-top:0">
            Copie da planilha da loja (Ctrl+C) e cole aqui. O Prestta reconhece as colunas
            <b>cliente, telefone, endereço, bairro, cidade, valor, data, nota e observação</b> —
            com cabeçalho ou sem. Separadores aceitos: ponto e vírgula, vírgula ou tabulação.
          </p>
          <div class="f">
            <textarea id="impText" style="min-height:230px;font-family:ui-monospace,Menlo,monospace;font-size:.82rem"
              placeholder="cliente;telefone;endereco;bairro;valor;data&#10;Joelma Silva;47999887766;Rua das Acácias, 210;Centro;3450,00;28/08/2026&#10;Carlos Eduardo;47988776655;Av. Brasil, 1180;Vila Nova;1890,50;28/08/2026"></textarea>
          </div>
          <div class="form-grid">
            <div class="f"><label>Parceiro / loja destas OS</label>
              <select id="impCustomer"><option value="">Cliente direto</option>
                ${state.customers.map((c) => `<option value="${c.id}">${esc(c.name)} ${c.commission_pct ? `(${c.commission_pct}%)` : ''}</option>`).join('')}
              </select></div>
            <div class="f"><label>Atribuir a</label>
              <select id="impAssignee"><option value="">Definir depois</option>
                ${fieldTeam().map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}
              </select></div>
            <div class="f"><label>Tipo de serviço padrão</label><input id="impType" placeholder="Ex.: Montagem de móveis"></div>
            <div class="f"><label>Comissão (%) — vazio usa a do parceiro</label><input id="impPct" placeholder="8"></div>
          </div>
          <div style="display:flex;gap:10px;margin-top:14px">
            <button class="btn btn-light" id="btnPreview">Analisar</button>
            <button class="btn btn-primary" id="btnImport" disabled>Importar</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Prévia</h3></div>
        <div id="impPreview" class="card-pad"><p class="t-sub">Cole a lista e clique em <b>Analisar</b> para conferir antes de importar.</p></div>
      </div>
    </div>`;

  root.querySelector('#btnPreview').onclick = async () => {
    const text = root.querySelector('#impText').value;
    if (!text.trim()) return fail('Cole a lista primeiro.');
    const d = await post('/orders/import/preview', { text });
    const box = root.querySelector('#impPreview');
    if (!d.total) {
      box.innerHTML = '<p class="t-sub">Não consegui identificar linhas. Confira o separador (; , ou tabulação).</p>';
      root.querySelector('#btnImport').disabled = true;
      return;
    }
    box.innerHTML = `
      <p class="t-strong">${d.total} serviço(s) reconhecido(s)</p>
      <div class="table-wrap" style="max-height:420px;overflow-y:auto"><table>
        <thead><tr><th>Cliente</th><th>Endereço</th><th class="num">Valor</th><th>Data</th></tr></thead>
        <tbody>${d.rows.map((r) => `
          <tr><td class="t-strong">${esc(r.client_name)}</td>
            <td class="t-sub">${esc([r.address, r.district].filter(Boolean).join(' · '))}</td>
            <td class="num">${money(r.value_total_cents)}</td>
            <td class="t-sub">${r.scheduled_iso ? dateBR(r.scheduled_iso) : '—'}</td></tr>`).join('')}</tbody>
      </table></div>
      ${d.total > d.rows.length ? `<p class="t-sub">Mostrando as primeiras ${d.rows.length} de ${d.total}.</p>` : ''}`;
    root.querySelector('#btnImport').disabled = false;
  };

  root.querySelector('#btnImport').onclick = async () => {
    const btn = root.querySelector('#btnImport');
    btn.disabled = true; btn.textContent = 'Importando…';
    try {
      const res = await post('/orders/import', {
        text: root.querySelector('#impText').value,
        defaults: {
          customer_id: root.querySelector('#impCustomer').value || null,
          assignee_id: root.querySelector('#impAssignee').value || null,
          service_type: root.querySelector('#impType').value,
          commission_pct: root.querySelector('#impPct').value || undefined,
        },
      });
      ok(`${res.created} OS criadas.`);
      location.hash = '#ordens';
    } catch (err) {
      fail(err.message);
      btn.disabled = false; btn.textContent = 'Importar';
    }
  };
};

/* ========================================================= CONFIGURAÇÕES */
VIEWS.config = async (root) => {
  const w = await get('/workspace');
  const t = w.tenant;
  const s = t.settings || {};
  state.settings = s;

  root.innerHTML = `
    <div class="grid g2">
      <div class="card">
        <div class="card-head"><h3>Dados da empresa</h3></div>
        <div class="card-pad">
          <div class="form-grid">
            <div class="f full"><label>Nome da empresa</label><input id="w-name" value="${esc(t.name)}"></div>
            <div class="f"><label>CNPJ</label><input id="w-doc" value="${esc(t.doc || '')}"></div>
            <div class="f"><label>Telefone</label><input id="w-phone" value="${esc(t.phone || '')}"></div>
            <div class="f"><label>E-mail</label><input id="w-email" value="${esc(t.email || '')}"></div>
            <div class="f"><label>Segmento</label><input id="w-segment" value="${esc(t.segment || '')}"></div>
            <div class="f"><label>Cidade</label><input id="w-city" value="${esc(t.city || '')}"></div>
            <div class="f"><label>UF</label><input id="w-uf" maxlength="2" value="${esc(t.uf || '')}"></div>
          </div>
          <button class="btn btn-primary btn-sm" id="saveCompany" style="margin-top:14px">Salvar dados</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Regras de execução</h3></div>
        <div class="card-pad">
          <p class="t-sub" style="margin-top:0">O que o colaborador precisa fazer antes de conseguir concluir uma OS no app.</p>
          <div style="display:flex;flex-direction:column;gap:14px;margin:16px 0">
            <label class="switch"><input type="checkbox" id="s-sig" ${s.require_client_signature !== false ? 'checked' : ''}><span class="track"></span><span>Exigir assinatura do cliente</span></label>
            <label class="switch"><input type="checkbox" id="s-after" ${s.require_after_photo !== false ? 'checked' : ''}><span class="track"></span><span>Exigir foto do serviço concluído</span></label>
            <label class="switch"><input type="checkbox" id="s-before" ${s.require_before_photo ? 'checked' : ''}><span class="track"></span><span>Exigir foto de antes</span></label>
            <label class="switch"><input type="checkbox" id="s-rating" ${s.ask_rating !== false ? 'checked' : ''}><span class="track"></span><span>Pedir avaliação do cliente</span></label>
          </div>
          <div class="f"><label>Comissão padrão para novos parceiros (%)</label>
            <input id="s-pct" value="${s.default_commission_pct ?? ''}" placeholder="0"></div>
          <div class="f" style="margin-top:12px"><label>Tipos de serviço (um por linha)</label>
            <textarea id="s-types" style="min-height:90px">${esc((s.service_types || []).join('\n'))}</textarea></div>
          <div class="f" style="margin-top:12px"><label>Checklist padrão da OS (um por linha)</label>
            <textarea id="s-check" style="min-height:120px">${esc((s.checklist_template || []).join('\n'))}</textarea></div>
          <div class="f" style="margin-top:12px"><label>Mensagem no comprovante do cliente</label>
            <textarea id="s-msg" style="min-height:70px">${esc(s.receipt_message || '')}</textarea></div>
          <button class="btn btn-primary btn-sm" id="saveSettings" style="margin-top:14px">Salvar regras</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3>Uso do plano ${esc(w.plan?.name || '')}</h3>
        <div class="r"><button class="btn btn-light btn-sm" onclick="location.hash='#assinatura'">Gerenciar plano</button></div></div>
      <div class="card-pad grid g3">
        ${usageBar('Usuários ativos', w.usage.users, w.plan?.limits.users)}
        ${usageBar('OS neste mês', w.usage.orders_month, w.plan?.limits.orders_month)}
        <div><div class="t-sub">Armazenamento de fotos</div><div class="t-strong" style="font-size:1.1rem">${w.plan?.limits.storage_gb} GB</div></div>
      </div>
    </div>`;

  root.querySelector('#saveCompany').onclick = async () => {
    const v = (k) => root.querySelector(`#w-${k}`).value.trim();
    await patch('/workspace', { name: v('name'), doc: v('doc'), phone: v('phone'), email: v('email'), segment: v('segment'), city: v('city'), uf: v('uf') });
    ok('Dados salvos.');
    state.tenant.name = v('name');
    document.getElementById('tenantName').textContent = v('name');
  };

  root.querySelector('#saveSettings').onclick = async () => {
    const lines = (id) => root.querySelector(id).value.split('\n').map((x) => x.trim()).filter(Boolean);
    const res = await patch('/workspace', {
      settings: {
        require_client_signature: root.querySelector('#s-sig').checked,
        require_after_photo: root.querySelector('#s-after').checked,
        require_before_photo: root.querySelector('#s-before').checked,
        ask_rating: root.querySelector('#s-rating').checked,
        default_commission_pct: root.querySelector('#s-pct').value || 0,
        service_types: lines('#s-types'),
        checklist_template: lines('#s-check'),
        receipt_message: root.querySelector('#s-msg').value,
      },
    });
    state.settings = res.tenant.settings;
    ok('Regras atualizadas.');
  };
};

function usageBar(label, used, limit) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return `
    <div>
      <div class="t-sub">${label}</div>
      <div class="t-strong" style="font-size:1.1rem">${num(used)} <span class="t-sub">de ${num(limit)}</span></div>
      <div style="height:7px;background:var(--bg-2);border-radius:99px;margin-top:7px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${pct > 85 ? 'var(--red)' : 'linear-gradient(90deg,var(--gold-2),var(--gold))'};border-radius:99px"></div>
      </div>
    </div>`;
}

/* =========================================================== ASSINATURA */
VIEWS.assinatura = async (root) => {
  const s = await get('/subscription');
  state.cycleChoice = state.cycleChoice || s.cycle || 'mensal';

  const statusLabel = {
    trial: ['Em teste gratuito', 'gold'], ativo: ['Assinatura ativa', 'green'],
    atrasado: ['Pagamento pendente', 'red'], cancelado: ['Assinatura cancelada', 'red'],
  }[s.status] || ['—', 'blue'];

  root.innerHTML = `
    <div class="grid g3" style="margin-bottom:20px">
      ${kpi('Situação', statusLabel[0], statusLabel[1], '💳',
        s.trial_days_left !== null ? `${s.trial_days_left} dia(s) restante(s)` : (s.subscription?.period_end ? `Renova em ${dateBR(s.subscription.period_end)}` : ''))}
      ${kpi('Plano atual', s.plan?.name || '—', 'blue', '📦', `Cobrança ${s.cycle}`)}
      ${kpi('Valor', money(s.cycle === 'anual' ? s.plan.price_anual : s.plan.price_mensal), 'gold', '💰', s.cycle === 'anual' ? 'por mês, cobrado anualmente' : 'por mês')}
    </div>

    ${!s.integration.api && !Object.values(s.integration.links).some((l) => l.mensal || l.anual) ? `
      <div class="card card-pad" style="background:#FFFBF3;border-color:#F6E2C2;margin-bottom:20px">
        <b>⚙️ Checkout da Cakto ainda não configurado</b>
        <p class="t-sub" style="margin:6px 0 0">
          Crie as ofertas no painel da Cakto e cole os links em <code>CAKTO_CHECKOUT_&lt;PLANO&gt;_&lt;CICLO&gt;</code> no arquivo <code>.env</code>.
          O webhook deve apontar para <code>${location.origin}/api/webhooks/cakto</code>.
        </p>
      </div>` : ''}

    <div class="card-head" style="border:0;padding-left:0">
      <h3>Escolha o seu plano</h3>
      <div class="r">
        <div class="tabs" id="cycleTabs">
          <button data-c="mensal" class="${state.cycleChoice === 'mensal' ? 'on' : ''}">Mensal</button>
          <button data-c="anual" class="${state.cycleChoice === 'anual' ? 'on' : ''}">Anual (-20%)</button>
        </div>
      </div>
    </div>

    <div class="grid g3" style="margin-bottom:20px">
      ${s.plans.map((p) => {
        const price = state.cycleChoice === 'anual' ? p.price_anual : p.price_mensal;
        const current = p.id === s.plan?.id && s.status === 'ativo' && s.cycle === state.cycleChoice;
        return `
        <div class="card card-pad" style="border-color:${p.popular ? 'var(--gold)' : 'var(--line)'};position:relative">
          ${p.badge ? `<span class="chip" style="position:absolute;top:-10px;left:20px;background:linear-gradient(135deg,var(--gold-2),var(--gold));color:#26170A">${p.badge}</span>` : ''}
          <h3 style="font-size:1.1rem">${p.name}</h3>
          <div class="t-sub" style="margin-bottom:12px">${p.tagline}</div>
          <div style="font-family:var(--font-display);font-size:2rem;font-weight:800;letter-spacing:-.04em">${money(price)}<span class="t-sub" style="font-size:.85rem;font-weight:500">/mês</span></div>
          <div class="t-sub" style="margin-bottom:16px">${state.cycleChoice === 'anual' ? `${money(p.price_anual * 12)} por ano` : 'Cobrado mensalmente'}</div>
          <ul style="display:flex;flex-direction:column;gap:8px;font-size:.85rem;margin-bottom:18px">
            ${p.highlights.slice(0, 6).map((h) => `<li>✓ ${esc(h)}</li>`).join('')}
          </ul>
          <button class="btn ${p.popular ? 'btn-primary' : 'btn-light'} btn-block" data-plan="${p.id}" ${current ? 'disabled' : ''}>
            ${current ? 'Plano atual' : (s.status === 'ativo' ? 'Mudar para este plano' : 'Assinar agora')}
          </button>
        </div>`;
      }).join('')}
    </div>

    <div class="grid g2">
      <div class="card">
        <div class="card-head"><h3>Histórico de cobranças</h3></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Data</th><th>Plano</th><th class="num">Valor</th><th>Status</th></tr></thead>
          <tbody>${s.history.length ? s.history.map((h) => `
            <tr><td class="t-sub">${dateBR(h.created_at)}</td><td>${h.plan} · ${h.cycle}</td>
              <td class="num">${money(h.amount)}</td><td><span class="chip">${h.status}</span></td></tr>`).join('')
            : '<tr><td colspan="4" class="t-sub">Nenhuma cobrança ainda.</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="card card-pad">
        <h3 style="font-size:.95rem;margin-bottom:8px">Pagamento</h3>
        <p class="t-sub">
          As cobranças são processadas pela <b>Cakto</b> — Pix, boleto e cartão de crédito.
          A ativação do plano é automática assim que o pagamento é confirmado.
        </p>
        ${s.status !== 'cancelado' ? '<button class="btn btn-danger btn-sm" id="cancelSub" style="margin-top:12px">Cancelar assinatura</button>' : ''}
      </div>
    </div>`;

  root.querySelectorAll('#cycleTabs button').forEach((b) => {
    b.onclick = () => { state.cycleChoice = b.dataset.c; route(); };
  });

  root.querySelectorAll('[data-plan]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true; b.textContent = 'Gerando checkout…';
      try {
        const res = await post('/subscription/checkout', { plan: b.dataset.plan, cycle: state.cycleChoice });
        ok('Redirecionando para o pagamento seguro…');
        setTimeout(() => window.open(res.checkout_url, '_blank'), 400);
        b.disabled = false; b.textContent = 'Abrir checkout';
      } catch (err) {
        fail(err.message);
        b.disabled = false; b.textContent = 'Tentar novamente';
      }
    };
  });

  root.querySelector('#cancelSub')?.addEventListener('click', async () => {
    if (!await confirmDialog('Cancelar assinatura', 'Você perde o acesso ao painel no fim do período pago. Os dados ficam guardados por 90 dias.', { danger: true, confirmText: 'Cancelar assinatura' })) return;
    const res = await post('/subscription/cancel');
    ok(res.message);
    route();
  });
};

/* --------------------------------------------------------------- Utils */
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

boot();

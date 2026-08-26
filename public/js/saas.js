'use strict';

let masterData = {};

async function init() {
  try {
    const me = await get('/me');
    if (!me || me.role !== 'superadmin') {
      location.href = '/entrar';
      return;
    }
    goSaaS('visao_geral');
  } catch (err) {
    document.getElementById('content').innerHTML = `<div class="empty"><div class="ic">⚠️</div><h3>Acesso Negado</h3><p>${esc(err.message)}</p></div>`;
  }
}

// Navegação
window.goSaaS = function (view) {
  document.querySelectorAll('.sb-link').forEach(el => el.classList.remove('on'));
  const link = document.querySelector(`.sb-link[data-view="${view}"]`);
  if (link) link.classList.add('on');
  
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sbBackdrop').classList.remove('on');
  }

  const titles = {
    visao_geral: ['SaaS Overview', 'Métricas de crescimento'],
    tenants: ['Lojas / Contas', 'Gerenciamento de clientes'],
    leads: ['Funil de Leads', 'Usuários que se cadastraram'],
    webhooks: ['Integração Cakto', 'Logs de pagamentos']
  };
  if (titles[view]) {
    document.getElementById('pageTitle').textContent = titles[view][0];
    document.getElementById('pageSub').textContent = titles[view][1];
  }

  const c = document.getElementById('content');
  c.innerHTML = '<div class="loading">Carregando dados mestre...</div>';

  if (view === 'visao_geral') renderOverview(c);
  if (view === 'tenants') renderTenants(c);
  if (view === 'leads') renderLeads(c);
  if (view === 'webhooks') renderWebhooks(c);
};

/* ------------------------------------------------------------- Visão Geral */
async function renderOverview(container) {
  try {
    const d = await get('/saas/overview');
    
    // Preparar gráficos de barra pro crescimento
    const barsHtml = d.serie.map(s => {
      const max = Math.max(...d.serie.map(x => Math.max(x.contas, x.leads))) || 1;
      const hContas = Math.max(4, Math.round((s.contas / max) * 100));
      return `
        <div class="col">
          <div class="bar" style="height:${hContas}%" data-v="${s.contas} Contas"></div>
          <div class="lb">${s.mes}</div>
        </div>
      `;
    }).reverse().join('');

    container.innerHTML = `
      <div class="grid g4" style="margin-bottom:24px">
        <div class="kpi kpi-master">
          <div class="lbl">MRR (Recorrente Mensal)</div>
          <div class="val">${moneyShort(d.receita.mrr)}</div>
          <div class="hint">ARR: ${moneyShort(d.receita.arr)}</div>
          <div class="ic">💰</div>
        </div>
        <div class="kpi">
          <div class="lbl">Lojas Ativas</div>
          <div class="val">${d.tenants.ativos}</div>
          <div class="hint">De ${d.tenants.total} contas criadas</div>
          <div class="ic">🏢</div>
        </div>
        <div class="kpi gold">
          <div class="lbl">Leads no Funil</div>
          <div class="val">${d.leads.total}</div>
          <div class="hint">${d.leads.novos} aguardando contato</div>
          <div class="ic">🎯</div>
        </div>
        <div class="kpi blue">
          <div class="lbl">Ordens Processadas</div>
          <div class="val">${num(d.uso.ordens)}</div>
          <div class="hint">${num(d.uso.assinaturas)} assinaturas geradas</div>
          <div class="ic">🚀</div>
        </div>
      </div>

      <div class="grid g-main">
        <div class="card card-pad">
          <h3>Crescimento de Contas</h3>
          <p style="font-size:.85rem;color:var(--muted)">Últimos 6 meses (Novas Contas)</p>
          <div class="bars" style="height:180px;margin-top:24px">
            ${barsHtml}
          </div>
        </div>

        <div class="card card-pad">
          <h3>Saúde das Contas</h3>
          <div style="margin-top:20px;display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;justify-content:space-between;padding:10px;background:var(--green-soft);border-radius:8px">
              <span style="color:#0B7A57;font-weight:600">Pagas (Ativas)</span> <b>${d.tenants.ativos}</b>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px;background:var(--gold-soft);border-radius:8px">
              <span style="color:var(--gold-3);font-weight:600">Em Teste (Trial)</span> <b>${d.tenants.trial}</b>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px;background:#FFF0E6;border-radius:8px">
              <span style="color:#C2580E;font-weight:600">Atrasadas</span> <b>${d.tenants.atrasados}</b>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px;background:var(--red-soft);border-radius:8px">
              <span style="color:#B4242A;font-weight:600">Canceladas</span> <b>${d.tenants.cancelados}</b>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) { fail(err.message); }
}

/* ------------------------------------------------------------- Contas / Tenants */
async function renderTenants(container) {
  try {
    const d = await get('/saas/tenants');
    
    container.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>Contas no Sistema</h3>
          <div class="r">
            <input type="text" class="input" placeholder="Buscar loja ou email..." style="width:240px">
          </div>
        </div>
        <div class="table-wrap">
          <table class="table-tenant">
            <thead>
              <tr>
                <th>Loja / Cliente</th>
                <th>Contato</th>
                <th>Plano / Status</th>
                <th class="num">Uso</th>
                <th>Adesão</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${d.tenants.map(t => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      <div class="avatar" style="background:var(--ink);color:#fff">${initials(t.name)}</div>
                      <div>
                        <b>${esc(t.name)}</b>
                        <div class="t-sub">ID: ${t.id.slice(3,10)}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <b>${esc(t.dono || 'S/ Dono')}</b>
                    <div class="t-sub">${esc(t.dono_email || t.email)}</div>
                  </td>
                  <td>
                    <span class="badge-status stt-${t.status}">${t.status}</span>
                    <div class="t-sub" style="margin-top:4px">${t.plan} (${t.cycle})</div>
                  </td>
                  <td class="num">
                    <b>${t.usuarios}</b> users<br>
                    <span class="t-sub">${t.ordens} OS</span>
                  </td>
                  <td>
                    ${dateBR(t.created_at)}
                    <div class="t-sub">${relative(t.ultimo_acesso)}</div>
                  </td>
                  <td class="num">
                    <button class="btn btn-outline btn-sm" onclick="impersonate('${t.id}')" title="Logar como dono desta conta">Acessar Loja</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch(err) { fail(err.message); }
}

async function impersonate(tenantId) {
  if (!await confirmDialog('Acessar conta?', 'Você fará login como dono desta loja e terá acesso total aos dados do cliente.')) return;
  try {
    const res = await post(`/saas/tenants/${tenantId}/acessar`);
    if (res.ok) {
      window.location.href = res.redirect;
    }
  } catch (err) { fail(err.message); }
}

/* ------------------------------------------------------------- Leads */
async function renderLeads(container) {
  try {
    const d = await get('/saas/leads');
    
    container.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>Funil de Vendas</h3>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Nome</th>
                <th>Contato</th>
                <th>Estágio</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${d.leads.map(l => `
                <tr>
                  <td>${dateBR(l.created_at)}<br><span class="t-sub">${timeBR(l.created_at)}</span></td>
                  <td><b>${esc(l.name)}</b></td>
                  <td>
                    ${phoneBR(l.phone)}<br>
                    <span class="t-sub">${esc(l.email)}</span>
                  </td>
                  <td>
                    <select class="select" onchange="updateLeadStage('${l.id}', this.value)" style="padding:4px 8px;font-size:.8rem;height:auto">
                      <option value="novo" ${l.stage === 'novo' ? 'selected' : ''}>Novo Lead</option>
                      <option value="contato" ${l.stage === 'contato' ? 'selected' : ''}>Em Contato</option>
                      <option value="convertido" ${l.stage === 'convertido' ? 'selected' : ''}>Convertido</option>
                      <option value="perdido" ${l.stage === 'perdido' ? 'selected' : ''}>Perdido</option>
                    </select>
                  </td>
                  <td>
                    <a href="${waLink(l.phone, 'Olá '+l.name+', vi que você se cadastrou no Prestta.')}" target="_blank" class="btn btn-outline btn-sm">Chamar no WhatsApp</a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) { fail(err.message); }
}

window.updateLeadStage = async function(id, stage) {
  try {
    await patch(`/saas/leads/${id}`, { stage });
    ok('Estágio atualizado.');
  } catch (err) { fail(err.message); }
}

/* ------------------------------------------------------------- Webhooks */
async function renderWebhooks(container) {
  try {
    const d = await get('/saas/webhooks');
    
    container.innerHTML = `
      <div class="grid g4" style="margin-bottom:20px">
        <div class="card card-pad" style="grid-column: 1 / span 3">
          <b style="display:block;margin-bottom:10px">URL do Webhook (Cakto)</b>
          <input type="text" class="input" value="${d.config.url}" readonly onclick="this.select()" style="width:100%;font-family:monospace;background:#F6F7FA">
          <p style="font-size:.8rem;color:var(--muted);margin-top:8px">Configure esta URL nas notificações do Cakto para ativar planos automaticamente.</p>
        </div>
        <div class="card card-pad">
          <b style="display:block;margin-bottom:10px">Status da API</b>
          ${d.config.secret_configurado ? `<div style="color:var(--green);font-weight:600;font-size:.9rem">✓ Secret Configurado</div>` : `<div style="color:var(--red);font-weight:600;font-size:.9rem">⚠️ Secret Ausente no .env</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Últimos Eventos Recebidos</h3>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Evento</th>
                <th>Status</th>
                <th>Detalhes Brutos</th>
              </tr>
            </thead>
            <tbody>
              ${d.events.length === 0 ? `<tr><td colspan="4" class="center muted" style="padding:40px">Nenhum webhook recebido ainda.</td></tr>` : ''}
              ${d.events.map(e => `
                <tr>
                  <td style="white-space:nowrap">${dateBR(e.created_at, true)}</td>
                  <td><span class="badge-st stt-trial" style="background:#E4E8F0;color:#35405A">${esc(e.event)}</span></td>
                  <td>
                    ${e.status === 'ok' ? `<span class="badge-st stt-ativo">OK</span>` : `<span class="badge-st stt-cancelado">ERRO</span>`}
                  </td>
                  <td>
                    <div style="font-family:monospace;font-size:.7rem;max-height:60px;overflow:auto;background:var(--bg-2);padding:6px;border-radius:6px">
                      ${esc(e.detail || '{}')}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) { fail(err.message); }
}

init();

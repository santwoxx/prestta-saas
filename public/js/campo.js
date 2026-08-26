'use strict';

/* Estado global do app de campo */
let me = null;
let currentTab = 'hoje';
let orders = [];

/* ------------------------------------------------------------- Inicialização */
async function init() {
  try {
    me = await get('/me');
    if (!me || me.role !== 'campo') {
      location.href = '/entrar';
      return;
    }
    
    document.getElementById('userName').textContent = me.name;
    document.getElementById('userInitial').textContent = initials(me.name);
    
    // Buscar tenant
    const t = await get('/tenant');
    document.getElementById('userTenant').textContent = t.name;

    setupTabs();
    await loadOrders();
    
    // Atualiza a cada 5 mins p/ garantir que n perdeu nova OS
    setInterval(loadOrders, 300000);
  } catch (err) {
    console.error(err);
    document.getElementById('appBody').innerHTML = `<div class="empty"><div class="ic">⚠️</div><h3>Erro ao carregar app</h3><p>${esc(err.message)}</p></div>`;
  }
}

function setupTabs() {
  const btns = document.querySelectorAll('.fa-nav button');
  btns.forEach(b => {
    b.onclick = () => {
      btns.forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      currentTab = b.dataset.tab;
      render();
    };
  });
}

/* ------------------------------------------------------------- Dados */
async function loadOrders() {
  try {
    const res = await get('/orders?limit=100');
    orders = res.orders;
    render();
  } catch (err) {
    fail(err.message);
  }
}

function render() {
  const body = document.getElementById('appBody');
  if (currentTab === 'perfil') {
    renderPerfil(body);
    return;
  }

  const isHoje = currentTab === 'hoje';
  const today = todayISO();
  
  const filtered = orders.filter(o => {
    if (isHoje) {
      return o.status !== 'concluida' && o.status !== 'cancelada';
    } else {
      return o.status === 'concluida' || o.status === 'cancelada';
    }
  });

  // Atualizar stats
  if (isHoje) {
    const doneToday = orders.filter(o => o.status === 'concluida' && (o.finished_at || '').startsWith(today));
    document.getElementById('statTotal').textContent = filtered.length + doneToday.length;
    document.getElementById('statDone').textContent = doneToday.length;
    
    const ganhos = doneToday.reduce((sum, o) => sum + (o.assignee_pay || 0), 0);
    document.getElementById('statGanhos').textContent = money(ganhos);
  }

  if (!filtered.length) {
    body.innerHTML = `
      <div class="empty fade-in">
        <div class="ic">${isHoje ? '☕' : '📭'}</div>
        <h3>${isHoje ? 'Nenhum serviço pendente' : 'Nenhum histórico'}</h3>
        <p>${isHoje ? 'Você está livre no momento. Atualizaremos se algo surgir.' : 'Seus serviços finalizados aparecerão aqui.'}</p>
        <button class="btn btn-outline btn-sm" onclick="loadOrders()">Atualizar agenda</button>
      </div>`;
    return;
  }

  body.innerHTML = `<div class="fade-in">${filtered.map(o => `
    <div class="job" onclick="openOrder('${o.id}')">
      <div class="top">
        <span class="time">${timeBR(o.scheduled_at).replace('—', '--:--')}</span>
        ${statusBadge(o.status)}
        ${o.priority === 'urgente' ? `<span class="badge-pri pri-urgente">Urgente</span>` : ''}
      </div>
      <h3>${esc(o.title || o.service_type || 'Serviço')}</h3>
      <div class="addr">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:2px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
        <span>${esc(fullAddress(o))}</span>
      </div>
      <div class="foot">
        <div class="avatar sm" style="background:var(--bg-2);color:var(--muted)">👤</div>
        <span style="font-size:.78rem;color:var(--muted)">${esc(o.client_name)}</span>
        ${o.assignee_pay > 0 ? `<div class="pay">+${money(o.assignee_pay)}</div>` : ''}
      </div>
    </div>
  `).join('')}</div>`;
}

function renderPerfil(body) {
  body.innerHTML = `
    <div class="fade-in" style="background:#fff;border-radius:14px;padding:20px;border:1px solid var(--line);text-align:center">
      <div class="avatar" style="width:64px;height:64px;font-size:1.5rem;margin:0 auto 16px;background:linear-gradient(135deg, var(--gold-2), var(--gold));color:#26170A">${initials(me.name)}</div>
      <h2 style="font-size:1.1rem;margin-bottom:4px">${esc(me.name)}</h2>
      <div class="sub">${esc(me.email)} • ${phoneBR(me.phone)}</div>
      
      <div class="grid g2" style="margin-top:24px;text-align:left">
        <div class="kpi">
          <div class="lbl">Sua Comissão</div>
          <div class="val">${me.commission_pct}%</div>
        </div>
        <div class="kpi">
          <div class="lbl">Modelo</div>
          <div class="val">${me.pay_mode === 'fixo' ? 'Fixo/OS' : 'Porcentagem'}</div>
        </div>
      </div>
      
      <button class="btn btn-outline btn-block" style="margin-top:24px" onclick="location.href='/api/auth/logout'">Sair do aplicativo</button>
    </div>
  `;
}

/* ------------------------------------------------------------- Modal da OS */
async function openOrder(id) {
  const loading = modal({ title: 'Carregando...', size: 'slim', body: '<div class="loading">Buscando dados da OS...</div>' });
  try {
    const full = await get(`/orders/${id}`);
    loading.close();
    renderOrderModal(full);
  } catch (err) {
    loading.close();
    fail(err.message);
  }
}

function renderOrderModal(full) {
  const o = full.order;
  const isDone = o.status === 'concluida' || o.status === 'cancelada';
  
  // Ações baseadas no status
  let actionBtn = '';
  if (!isDone) {
    if (o.status === 'em_andamento') {
      actionBtn = `
        <button class="btn btn-outline btn-block" onclick="pauseJob('${o.id}')">Pausar Serviço</button>
        <button class="btn btn-primary btn-block" onclick="finishJobFlow('${o.id}')">
          Concluir Serviço (Fotos e Assinatura)
        </button>`;
    } else {
      actionBtn = `
        <button class="btn btn-green btn-block btn-lg" onclick="startJob('${o.id}')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Iniciar Atendimento
        </button>`;
    }
  }

  const checklistHtml = JSON.parse(o.checklist || '[]').length === 0 ? '' : `
    <div style="margin-top:24px">
      <b style="font-size:.85rem;display:block;margin-bottom:10px">Checklist</b>
      ${JSON.parse(o.checklist || '[]').map(c => `<div class="checklist-item"><div class="ck"></div>${esc(c)}</div>`).join('')}
    </div>
  `;

  const itemsHtml = !full.items.length ? '' : `
    <div style="margin-top:24px">
      <b style="font-size:.85rem;display:block;margin-bottom:10px">Itens/Produtos na OS</b>
      <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden">
        <table style="margin:0">
          <tbody>
            ${full.items.map(it => `
              <tr>
                <td style="padding:10px 14px"><b style="font-size:.8rem">${esc(it.description)}</b></td>
                <td class="num" style="padding:10px 14px;color:var(--muted)">${it.qty}x</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  modal({
    title: `OS ${o.code}`,
    subtitle: esc(o.title || o.service_type || 'Serviço'),
    size: 'slim',
    body: `
      <div class="info-grid">
        <div><dt>Status</dt><dd>${statusBadge(o.status)}</dd></div>
        <div><dt>Agendado</dt><dd>${dateBR(o.scheduled_at, true)}</dd></div>
        <div><dt>Cliente</dt><dd>${esc(o.client_name)}</dd></div>
        <div><dt>Telefone</dt><dd>${phoneBR(o.client_phone)}</dd></div>
        <div style="grid-column:1/-1"><dt>Endereço</dt><dd>${esc(fullAddress(o))}</dd></div>
      </div>
      
      <div style="display:flex;gap:10px;margin-top:14px">
        <a href="${mapsLink(o)}" target="_blank" class="btn btn-outline" style="flex:1">Navegar (Maps)</a>
        ${o.client_phone ? `<a href="${waLink(o.client_phone, `Olá! Sou o técnico da Prestta, estou a caminho para a OS ${o.code}.`)}" target="_blank" class="btn btn-outline" style="flex:1">WhatsApp</a>` : ''}
      </div>

      ${o.description ? `
        <div style="margin-top:24px">
          <b style="font-size:.85rem;display:block;margin-bottom:6px">Descrição</b>
          <p style="font-size:.86rem;color:var(--muted);white-space:pre-wrap;background:#fff;padding:12px;border-radius:10px;border:1px solid var(--line);margin:0">${esc(o.description)}</p>
        </div>` : ''}
      
      ${itemsHtml}
      ${checklistHtml}
    `,
    footer: actionBtn || `<div class="muted center" style="width:100%;font-size:.82rem">Esta OS não permite mais ações (Status: ${o.status}).</div>`
  });
}

/* ------------------------------------------------------------- Ações Simples */
async function startJob(id) {
  if (!await confirmDialog('Iniciar serviço?', 'Confirma que chegou ao local e iniciou o trabalho?')) return;
  try {
    // Tenta pegar geolocalizacao (opcional, se der timeout ou negar ignora)
    let geo = null;
    if (navigator.geolocation) {
      geo = await new Promise(r => {
        navigator.geolocation.getCurrentPosition(
          p => r({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
          () => r(null),
          { timeout: 4000 }
        );
      });
    }
    await post(`/orders/${id}/start`, { geo });
    ok('Serviço iniciado!');
    document.querySelector('.overlay').remove(); // fecha modal da OS
    loadOrders();
    openOrder(id);
  } catch (err) { fail(err.message); }
}

async function pauseJob(id) {
  const reason = prompt('Motivo da pausa? (Opcional)');
  if (reason === null) return;
  try {
    await post(`/orders/${id}/pause`, { reason });
    ok('Serviço pausado.');
    document.querySelector('.overlay').remove();
    loadOrders();
    openOrder(id);
  } catch (err) { fail(err.message); }
}

/* ------------------------------------------------------------- Fluxo de Conclusão */
// O fluxo é: 1. Modal de Fotos -> 2. Modal de Assinatura -> 3. Finish
async function finishJobFlow(id) {
  document.querySelector('.overlay').remove(); // Fecha modal atual
  
  // 1. Abre modal de Fotos
  const m = modal({
    title: 'Fotos do Serviço',
    subtitle: 'Envie as fotos obrigatórias',
    size: 'slim',
    body: `
      <p style="font-size:.85rem;color:var(--muted);margin-bottom:20px">Tire uma foto de como estava antes (opcional dependendo da empresa) e como ficou depois.</p>
      
      <div class="f field">
        <label>Foto do ANTES</label>
        <div class="upload-btn" id="btnAntes">
          <div><span style="font-size:1.5rem">📷</span><br>Tirar Foto</div>
          <input type="file" id="fileAntes" accept="image/*" capture="environment" style="display:none">
        </div>
        <div id="previewAntes" style="display:none;margin-top:8px"></div>
      </div>
      
      <div class="f field" style="margin-top:20px">
        <label>Foto do DEPOIS (Obrigatória)</label>
        <div class="upload-btn" id="btnDepois">
          <div><span style="font-size:1.5rem">📷</span><br>Tirar Foto</div>
          <input type="file" id="fileDepois" accept="image/*" capture="environment" style="display:none">
        </div>
        <div id="previewDepois" style="display:none;margin-top:8px"></div>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="loadOrders();">Cancelar</button>
      <button class="btn btn-primary" id="btnNextSign">Próximo: Assinaturas</button>
    `
  });

  let imgAntes = null, imgDepois = null;

  const setupUpload = (btnId, fileId, previewId, setter) => {
    const btn = m.el('#'+btnId);
    const file = m.el('#'+fileId);
    const preview = m.el('#'+previewId);
    
    btn.onclick = () => file.click();
    file.onchange = async () => {
      if (!file.files[0]) return;
      try {
        btn.innerHTML = 'Processando...';
        const dataUrl = await fileToDataUrl(file.files[0], 1200, 0.7);
        setter(dataUrl);
        btn.style.display = 'none';
        preview.style.display = 'block';
        preview.innerHTML = `
          <div class="thumb" style="height:140px">
            <img src="${dataUrl}">
            <button class="rm" onclick="this.parentElement.parentElement.style.display='none'; document.getElementById('${btnId}').style.display='grid'; document.getElementById('${btnId}').innerHTML='<div><span style=\\'font-size:1.5rem\\'>📷</span><br>Tirar Foto</div>';">×</button>
          </div>
        `;
      } catch (err) { fail(err.message); btn.innerHTML = 'Tentar Novamente'; }
    };
  };

  setupUpload('btnAntes', 'fileAntes', 'previewAntes', v => imgAntes = v);
  setupUpload('btnDepois', 'fileDepois', 'previewDepois', v => imgDepois = v);

  m.el('#btnNextSign').onclick = async () => {
    if (!imgDepois) return fail('A foto do DEPOIS é obrigatória.');
    
    m.el('#btnNextSign').disabled = true;
    m.el('#btnNextSign').textContent = 'Enviando fotos...';
    try {
      if (imgAntes) await post(`/orders/${id}/photos`, { kind: 'antes', image: imgAntes });
      await post(`/orders/${id}/photos`, { kind: 'depois', image: imgDepois });
      
      m.close();
      openSignatureFlow(id); // Passa pra proxima fase
    } catch (err) {
      fail(err.message);
      m.el('#btnNextSign').disabled = false;
      m.el('#btnNextSign').textContent = 'Próximo: Assinaturas';
    }
  };
}

function openSignatureFlow(id) {
  const m = modal({
    title: 'Assinaturas',
    subtitle: 'Comprovante do serviço',
    size: 'slim',
    body: `
      <div class="f" style="margin-bottom:20px">
        <label>1. Assinatura do Colaborador (Você)</label>
        <div class="sign-pad">
          <canvas id="padColab"></canvas>
          <div class="sign-line"></div>
          <div class="ph">Assine aqui</div>
        </div>
      </div>
      
      <div class="f" style="margin-bottom:20px">
        <label>2. Assinatura do Cliente</label>
        <div class="sign-pad">
          <canvas id="padCliente"></canvas>
          <div class="sign-line"></div>
          <div class="ph">Cliente assina aqui</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:10px">
          <input type="text" id="nomeCliente" class="input" placeholder="Nome legível do cliente" style="flex:1">
          <input type="text" id="docCliente" class="input" placeholder="CPF/RG (Opcional)" style="flex:1">
        </div>
      </div>
      
      <div class="f">
        <label>Observações finais (Opcional)</label>
        <textarea id="obsFinal" placeholder="Ex: Equipamento entregue em perfeito estado." style="min-height:60px"></textarea>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" id="btnClearPad">Limpar Assinaturas</button>
      <button class="btn btn-primary" id="btnFinish">Finalizar OS</button>
    `
  });

  const pad1 = signaturePad(m.el('#padColab'));
  const pad2 = signaturePad(m.el('#padCliente'));
  
  m.el('#btnClearPad').onclick = () => { pad1.clear(); pad2.clear(); };

  m.el('#btnFinish').onclick = async () => {
    if (pad1.isEmpty()) return fail('Sua assinatura é obrigatória.');
    if (pad2.isEmpty()) return fail('A assinatura do cliente é obrigatória.');
    const clientName = m.el('#nomeCliente').value.trim();
    if (!clientName) return fail('Digite o nome legível do cliente que assinou.');

    m.el('#btnFinish').disabled = true;
    m.el('#btnFinish').textContent = 'Finalizando...';
    
    try {
      // Envia assinatura do colaborador
      await post(`/orders/${id}/signatures`, { role: 'colaborador', image: pad1.toDataURL() });
      // Envia assinatura do cliente
      await post(`/orders/${id}/signatures`, { role: 'cliente', name: clientName, doc: m.el('#docCliente').value, image: pad2.toDataURL() });
      
      // Conclui a OS
      const res = await post(`/orders/${id}/finish`, { notes: m.el('#obsFinal').value });
      
      m.close();
      ok('Serviço Concluído com sucesso!');
      
      // Mostra tela de sucesso
      modal({
        title: 'Sucesso!',
        size: 'slim',
        body: `
          <div style="text-align:center;padding:20px 0">
            <div style="width:70px;height:70px;border-radius:20px;background:var(--green-soft);color:var(--green);font-size:2rem;display:grid;place-items:center;margin:0 auto 16px">✓</div>
            <h2 style="font-size:1.2rem;margin-bottom:8px">Ordem de Serviço finalizada</h2>
            <p style="color:var(--muted);font-size:.9rem;margin-bottom:24px">O comprovante digital já está disponível.</p>
            
            <a href="${res.receipt_url}" target="_blank" class="btn btn-outline btn-block">Visualizar Comprovante Web</a>
            <button class="btn btn-primary btn-block" style="margin-top:10px" onclick="location.reload()">Voltar pra Agenda</button>
          </div>
        `
      });
      loadOrders();
      
    } catch (err) {
      fail(err.message);
      m.el('#btnFinish').disabled = false;
      m.el('#btnFinish').textContent = 'Finalizar OS';
    }
  };
}

init();

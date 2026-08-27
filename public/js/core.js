/* ==========================================================================
   Prestta - utilitarios compartilhados entre o painel e o app de campo
   ========================================================================== */

/* ------------------------------------------------------------------ API */
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* resposta sem corpo */ }

  if (!res.ok) {
    if (res.status === 401 && !location.pathname.startsWith('/entrar')) {
      location.href = '/entrar';
      return new Promise(() => {});
    }
    const err = new Error(data?.error || `Erro ${res.status}`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

const get = (p) => api(p);
const post = (p, body) => api(p, { method: 'POST', body });
const patch = (p, body) => api(p, { method: 'PATCH', body });
const del = (p) => api(p, { method: 'DELETE' });

/* ------------------------------------------------------------ Formatação */
const money = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const moneyShort = (cents) => {
  const v = Number(cents || 0) / 100;
  if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return money(cents);
};
const num = (v) => Number(v || 0).toLocaleString('pt-BR');

function dateBR(iso, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return withTime ? `${date} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : date;
}
const timeBR = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
const dayLabel = (iso) => {
  if (!iso) return 'Sem data';
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today) / 864e5);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '');
};
function relative(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `há ${Math.floor(diff / 86400)}d`;
  return dateBR(iso);
}
const phoneBR = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || '—';
};
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colorFor = (seed) => {
  const palette = ['#F5A524', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#06B6D4', '#EC4899', '#F59E0B'];
  let h = 0;
  for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
};

const STATUS_LABEL = {
  pendente: 'Pendente', agendada: 'Agendada', em_andamento: 'Em andamento',
  pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada',
};
const statusBadge = (s) => `<span class="badge-st st-${s}">${STATUS_LABEL[s] || s}</span>`;
const fullAddress = (o) => [o.address, o.district, o.city, o.uf].filter(Boolean).join(', ') || 'Endereço não informado';
const mapsLink = (o) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress(o))}&travelmode=driving`;
const waLink = (phone, text) => `https://wa.me/55${String(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(text || '')}`;

/* --------------------------------------------------------------- Toasts */
function toast(message, type = '') {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'ok' ? '✓' : type === 'err' ? '!' : 'ⓘ'}</span><span>${esc(message)}</span>`;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(24px)';
    setTimeout(() => el.remove(), 260);
  }, 3600);
}
const ok = (m) => toast(m, 'ok');
const fail = (m) => toast(m, 'err');

/* --------------------------------------------------------------- Modais */
function modal({ title, subtitle, body, footer, size = '', onOpen, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal ${size}">
      <div class="modal-head">
        <div><h2>${esc(title)}</h2>${subtitle ? `<div class="sub">${subtitle}</div>` : ''}</div>
        <button class="x" aria-label="Fechar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;

  const close = () => {
    overlay.remove();
    document.body.style.overflow = '';
    onClose?.();
  };
  overlay.querySelector('.x').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const escHandler = (e) => {
    if (e.key === 'Escape') { close(); removeEventListener('keydown', escHandler); }
  };
  addEventListener('keydown', escHandler);

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  onOpen?.(overlay, close);
  return { overlay, close, el: (sel) => overlay.querySelector(sel) };
}

function confirmDialog(title, message, { confirmText = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    const m = modal({
      title,
      size: 'slim',
      body: `<p style="margin:0;color:var(--muted);font-size:.92rem">${message}</p>`,
      footer: `
        <button class="btn btn-light" data-no>Cancelar</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirmText)}</button>`,
      onClose: () => resolve(false),
    });
    m.el('[data-no]').onclick = () => { m.close(); resolve(false); };
    m.el('[data-yes]').onclick = () => { m.overlay.remove(); document.body.style.overflow = ''; resolve(true); };
  });
}

/* ------------------------------------------------------------ Lightbox */
function lightbox(src) {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = `<img src="${src}" alt="">`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
}

/* ------------------------------------------- Imagem: redimensionar p/ upload */
/** Le um File de <input type=file>, redimensiona e devolve um data URL JPEG. */
function fileToDataUrl(file, maxSize = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Selecione uma imagem.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------- Assinatura em canvas */
/**
 * Transforma um <canvas> em prancheta de assinatura (mouse + toque).
 * Retorna { clear, isEmpty, toDataURL }.
 */
function signaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let dirty = false;
  let last = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const data = dirty ? canvas.toDataURL() : null;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#16233E';
    if (data) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = data;
    }
  }

  const pos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const point = e.touches?.[0] || e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing = true;
    last = pos(e);
    canvas.parentElement.classList.add('has');
  };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    dirty = true;
  };
  const end = () => { drawing = false; last = null; };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  requestAnimationFrame(resize);
  addEventListener('resize', resize);

  return {
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty = false;
      canvas.parentElement.classList.remove('has');
    },
    isEmpty: () => !dirty,
    toDataURL() {
      // Fundo branco para o PNG nao ficar transparente no comprovante.
      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height;
      const octx = out.getContext('2d');
      octx.fillStyle = '#FFFFFF';
      octx.fillRect(0, 0, out.width, out.height);
      octx.drawImage(canvas, 0, 0);
      return out.toDataURL('image/png');
    },
  };
}

/* ------------------------------------------------------------- Diversos */
const debounce = (fn, ms = 320) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};
const parseMoney = (v) => {
  const clean = String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
};
/** ISO -> valor para <input type="datetime-local"> no fuso local. */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

'use strict';
/**
 * ---------------------------------------------------------------------------
 * Entrega protegida de fotos e assinaturas
 * ---------------------------------------------------------------------------
 * Antes estes arquivos eram servidos por express.static: quem tivesse a URL
 * via a foto do servico e a assinatura do cliente (com nome e CPF), sem login.
 * URL dificil de adivinhar nao e controle de acesso.
 *
 * Agora existem exatamente dois caminhos legitimos:
 *
 *  1. SESSAO - usuario logado no mesmo tenant dono do arquivo (ou superadmin).
 *     Cobre o painel e o app de campo, que carregam as imagens com o cookie.
 *
 *  2. TOKEN DA OS - `?t=<public_token>` valido para aquela ordem de servico.
 *     Cobre o comprovante publico que o cliente recebe por WhatsApp, sem login.
 *
 * Qualquer outro acesso recebe 403. Nada de `next()` no caminho de negacao:
 * se isso acontecesse, o express.static de /public serviria o arquivo assim
 * mesmo quando UPLOAD_DIR aponta para dentro de public/.
 */
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { get } = require('../db');
const { UPLOAD_DIR } = require('../storage');

const router = express.Router();

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/** Acrescenta ?t=<token> a uma URL de upload, para uso no comprovante publico. */
function withToken(url, token) {
  if (!url || !token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`;
}

function podeVer(req, tenantId, orderId) {
  // 1. Sessao valida no mesmo tenant
  const u = req.user;
  if (u && (u.role === 'superadmin' || (u.tenant_id && u.tenant_id === tenantId))) return true;

  // 2. Token publico da propria OS
  const token = req.query?.t;
  if (token && orderId && orderId !== 'geral') {
    const order = get('SELECT id, tenant_id FROM orders WHERE public_token=?', [String(token)]);
    if (order && order.id === orderId && order.tenant_id === tenantId) return true;
  }

  return false;
}

router.get('/uploads/:tenantId/:orderId/:file', (req, res) => {
  const { tenantId, orderId, file } = req.params;

  if (!podeVer(req, tenantId, orderId)) {
    return res.status(403).json({ error: 'Voce nao tem permissao para ver este arquivo.' });
  }

  const ext = path.extname(file).toLowerCase();
  if (!MIME[ext]) return res.status(404).json({ error: 'Arquivo nao encontrado.' });

  // Path traversal: resolvemos e conferimos que o caminho final continua
  // dentro de UPLOAD_DIR antes de tocar no disco.
  const abs = path.resolve(UPLOAD_DIR, tenantId, orderId, file);
  const raiz = path.resolve(UPLOAD_DIR) + path.sep;
  if (!abs.startsWith(raiz)) {
    return res.status(403).json({ error: 'Caminho invalido.' });
  }
  if (!fs.existsSync(abs)) {
    return res.status(404).json({ error: 'Arquivo nao encontrado.' });
  }

  res.setHeader('Content-Type', MIME[ext]);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(abs, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// Qualquer outro formato de URL sob /uploads e recusado explicitamente.
router.use('/uploads', (_req, res) => {
  res.status(403).json({ error: 'Voce nao tem permissao para ver este arquivo.' });
});

module.exports = { router, withToken };

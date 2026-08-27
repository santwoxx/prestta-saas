'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { uid, sha256, bad } = require('./util');

// UPLOAD_DIR tambem pode apontar para o volume persistente em producao.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB por arquivo (o cliente ja redimensiona)

/**
 * Grava um data URL (base64) vindo do navegador em disco.
 * Usado tanto para as fotos do servico quanto para as assinaturas (canvas).
 * Retorna { url, hash, bytes, absPath }.
 */
function saveDataUrl(dataUrl, { tenantId, orderId, prefix = 'file' }) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw bad('Arquivo invalido: envie uma imagem.');
  }
  const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw bad('Formato de imagem nao suportado.');

  const mime = match[1].toLowerCase();
  const ext = MIME_EXT[mime];
  if (!ext) throw bad('Envie a imagem em JPG, PNG ou WEBP.');

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw bad('Imagem vazia.');
  if (buffer.length > MAX_BYTES) throw bad('Imagem muito grande (limite de 6 MB).');

  const dir = path.join(UPLOAD_DIR, tenantId, orderId || 'geral');
  fs.mkdirSync(dir, { recursive: true });

  const name = `${prefix}-${uid()}.${ext}`;
  const absPath = path.join(dir, name);
  fs.writeFileSync(absPath, buffer);

  return {
    url: `/uploads/${tenantId}/${orderId || 'geral'}/${name}`,
    hash: sha256(buffer),
    bytes: buffer.length,
    absPath,
  };
}

/** Remove um arquivo previamente salvo (ignora ausencia). */
function removeByUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return false;
  const abs = path.join(UPLOAD_DIR, url.replace('/uploads/', ''));
  if (!abs.startsWith(UPLOAD_DIR)) return false; // path traversal
  try { fs.unlinkSync(abs); return true; } catch { return false; }
}

module.exports = { saveDataUrl, removeByUrl, UPLOAD_DIR };

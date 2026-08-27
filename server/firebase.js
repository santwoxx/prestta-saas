'use strict';
const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { HttpError } = require('./util');

/**
 * Firebase Admin apenas para VALIDAR o ID token do Google.
 * Nao precisa de service account: o SDK busca as chaves publicas do Google e
 * confere o `aud` contra o projectId. Basta o projectId estar correto.
 */
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'prestta';

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}

/**
 * Valida um ID token do Firebase e devolve o payload decodificado.
 * @param {string} token
 */
async function verifyToken(token) {
  try {
    const decoded = await getAuth().verifyIdToken(token);
    if (!decoded.email) {
      throw new HttpError(400, 'Sua conta Google nao expos um e-mail. Use outra conta.');
    }
    if (decoded.email_verified === false) {
      throw new HttpError(403, 'Confirme o e-mail da sua conta Google antes de entrar.');
    }
    return decoded;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.warn('[firebase] token invalido:', err.message);
    throw new HttpError(401, 'Nao foi possivel validar seu login do Google. Tente novamente.');
  }
}

module.exports = { verifyToken, PROJECT_ID };

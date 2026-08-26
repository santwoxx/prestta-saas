'use strict';
const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Initialize Firebase Admin without a service account.
// This allows verifyIdToken to fetch Google's public keys.
// The projectId is required.
if (!getApps().length) {
  initializeApp({
    projectId: 'prestta', // Do seu config do Firebase
  });
}

/**
 * Verify a Firebase ID Token.
 * @param {string} token 
 */
async function verifyToken(token) {
  return getAuth().verifyIdToken(token);
}

module.exports = {
  verifyToken,
};

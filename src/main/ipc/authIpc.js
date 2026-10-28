'use strict';

const { handle } = require('./ipcHelper');

/**
 * Registriert die IPC-Kanäle für die Anmeldung. Die Oberfläche erreicht sie
 * über window.api.auth (siehe preload.js). Nur diese Kanäle sind ohne
 * Anmeldung erreichbar, alle anderen werden vom Guard in ipcHelper.js blockiert.
 *
 * @param {import('../auth/AuthService')} authService Anmeldung und Sitzung
 */
function registerAuthIpc(authService) {
  handle('auth:login', (username, password) => authService.login(username, password), { requiresLogin: false });
  handle('auth:logout', () => authService.logout(), { requiresLogin: false });
  handle('auth:status', () => authService.status(), { requiresLogin: false });
}

module.exports = registerAuthIpc;
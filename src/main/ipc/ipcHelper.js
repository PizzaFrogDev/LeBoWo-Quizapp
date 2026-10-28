'use strict';

const { ipcMain } = require('electron');


/**
 * Prüft vor jedem geschützten Kanal, ob jemand angemeldet ist.
 * Wird in main.js mit setAuthGuard() auf AuthService.isLoggedIn gesetzt.
 */
let authGuard = () => true;

/**
 * @param {() => boolean} guard Funktion, die true liefert, wenn ein Benutzer angemeldet ist
 */
function setAuthGuard(guard) {
  authGuard = guard;
}

/**
 * Übersetzt technische Fehler in Meldungen, die ein Anwender versteht.
 * @param {Error} error Aufgetretener Fehler
 * @returns {string} Text für die Oberfläche
 */
function toUserMessage(error) {
  const message = String(error && error.message ? error.message : error);
  if (message.includes('FOREIGN KEY')) {
    return 'Der Eintrag wird noch von anderen Daten verwendet (z. B. gespielten Runden) und kann nicht gelöscht werden.';
  }
  if (message.includes('database is locked')) {
    return 'Die Datenbank ist gerade gesperrt. Bitte schließe andere Programme, die QuizzApp.db geöffnet haben (z. B. DB Browser), und versuche es erneut.';
  }
  return message;
}

/**
 * Registriert einen IPC-Kanal. Die Antwort an die Oberfläche hat immer die Form
 *   { ok: true, data: ... }   bei Erfolg
 *   { ok: false, error: "..." } bei einem Fehler
 * Der Preload-Code wandelt das wieder in ein normales Promise um.
 *
 * @param {string} channel Name des Kanals, z. B. "categories:list"
 * @param {Function} handler Funktion, die die Arbeit erledigt
 * @param {{requiresLogin?: boolean}} [options] requiresLogin: false = auch ohne Anmeldung erreichbar
 */
function handle(channel, handler, { requiresLogin = true } = {}) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      if (requiresLogin && !authGuard()) {
        throw new Error('Bitte zuerst anmelden.');
      }
      return { ok: true, data: await handler(...args) };
    } catch (error) {
      return { ok: false, error: toUserMessage(error) };
    }
  });
}
module.exports = { handle, toUserMessage, setAuthGuard };

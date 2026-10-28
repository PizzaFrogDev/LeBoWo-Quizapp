'use strict';

const { ipcMain } = require('electron');

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
 */
function handle(channel, handler) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await handler(...args) };
    } catch (error) {
      return { ok: false, error: toUserMessage(error) };
    }
  });
}

module.exports = { handle, toUserMessage };

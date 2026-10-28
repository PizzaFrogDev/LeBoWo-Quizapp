'use strict';

const fs = require('fs');
const path = require('path');
const { BrowserWindow, dialog } = require('electron');

const { handle } = require('./ipcHelper');
const { MAX_MEDIA_BYTES, mimeTypeFromFileName, toDataUrl } = require('../database/mediaUtils');

/**
 * Öffnet den Dateidialog zur Bildauswahl und liest die gewählte Datei ein.
 * Der Renderer darf selbst nicht auf Dateien zugreifen, daher erledigt das der Hauptprozess.
 *
 * @returns {Promise<{dataUrl:string, mimeType:string, fileName:string}|null>}
 *          Das Bild oder null, wenn der Dialog abgebrochen wurde
 * @throws {Error} bei unerlaubtem Format oder zu großer Datei
 */
async function pickImage() {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    title: 'Bild für die Frage auswählen',
    filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const mimeType = mimeTypeFromFileName(filePath);
  if (!mimeType) {
    throw new Error('Dieses Dateiformat wird nicht unterstützt. Erlaubt sind PNG, JPG, GIF und WebP.');
  }
  if (fs.statSync(filePath).size > MAX_MEDIA_BYTES) {
    throw new Error('Das Bild ist zu groß (maximal 2 MB).');
  }

  return {
    dataUrl: toDataUrl(fs.readFileSync(filePath), mimeType),
    mimeType,
    fileName: path.basename(filePath),
  };
}

/**
 * Registriert die IPC-Kanäle für Fragen und Antworten.
 * Die Oberfläche erreicht sie über window.api.questions (siehe preload.js).
 *
 * @param {import('../database/QuestionRepository')} questionRepository Zugriff auf Fragen und Antworten
 */
function registerQuestionIpc(questionRepository) {
  handle('questions:list', (filter) => questionRepository.findAll(filter ?? {}));
  handle('questions:get', (id) => questionRepository.findById(id));
  handle('questions:create', (payload) => questionRepository.create(payload));
  handle('questions:update', (id, payload) => questionRepository.update(id, payload));
  handle('questions:delete', (id) => questionRepository.delete(id));
  handle('questions:pickImage', () => pickImage());
}

module.exports = registerQuestionIpc;

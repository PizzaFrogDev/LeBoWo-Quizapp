'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Ruft einen IPC-Kanal im Hauptprozess auf und wandelt die Antwort
 * { ok, data | error } in ein normales Promise um.
 *
 * @param {string} channel Kanalname, z. B. "questions:list"
 * @param {...*} args Argumente für den Handler
 * @returns {Promise<*>} Ergebnis des Handlers
 * @throws {Error} mit der Fehlermeldung aus dem Hauptprozess
 */
async function call(channel, ...args) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
}

/**
 * Die Oberfläche läuft aus Sicherheitsgründen ohne Node.js-Zugriff
 * (contextIsolation). Sie kennt nur dieses Objekt: window.api.
 * Das ist die komplette Schnittstelle zwischen Oberfläche und Datenbank.
 */
contextBridge.exposeInMainWorld('api', {
  categories: {
    /** @returns {Promise<{id,name,description,questionCount}[]>} */
    list: () => call('categories:list'),
    /** @param {{name:string, description:string}} payload @returns {Promise<number>} neue ID */
    create: (payload) => call('categories:create', payload),
    /** @param {number} id @param {{name:string, description:string}} payload */
    update: (id, payload) => call('categories:update', id, payload),
    /** @param {number} id */
    delete: (id) => call('categories:delete', id),
  },

  difficulties: {
    /** @returns {Promise<{level,name,description}[]>} */
    list: () => call('difficulties:list'),
  },

  questions: {
    /**
     * @param {{categoryId?:number, difficultyLevel?:number, search?:string}} [filter]
     * @returns {Promise<{id,text,categoryId,categoryName,difficultyLevel,difficultyName,answerCount,hasMedia}[]>}
     */
    list: (filter) => call('questions:list', filter),
    /** @param {number} id @returns {Promise<Object>} Frage inkl. Antworten und Bild */
    get: (id) => call('questions:get', id),
    /**
     * @param {{text, categoryId, difficultyLevel, mediaAction, mediaDataUrl, answers:{text,correct}[]}} payload
     * @returns {Promise<number>} neue ID
     */
    create: (payload) => call('questions:create', payload),
    /** @param {number} id @param {Object} payload gleiche Form wie bei create (Antworten mit "id") */
    update: (id, payload) => call('questions:update', id, payload),
    /** @param {number} id */
    delete: (id) => call('questions:delete', id),
    /** Öffnet den Dateidialog. @returns {Promise<{dataUrl,mimeType,fileName}|null>} */
    pickImage: () => call('questions:pickImage'),
  },
});

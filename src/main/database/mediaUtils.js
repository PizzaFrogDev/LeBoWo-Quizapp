'use strict';

const path = require('path');

/** Maximale Bildgröße in Bytes (2 MB), damit die Datenbank nicht unnötig wächst. */
const MAX_MEDIA_BYTES = 2 * 1024 * 1024;

/** Erlaubte Bildformate, zugeordnet über die Dateiendung. */
const MIME_TYPE_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * Ermittelt den MIME-Typ anhand der Dateiendung.
 * @param {string} fileName Dateiname oder Pfad
 * @returns {string|null} z. B. "image/png" oder null, wenn das Format nicht erlaubt ist
 */
function mimeTypeFromFileName(fileName) {
  return MIME_TYPE_BY_EXTENSION[path.extname(fileName).toLowerCase()] ?? null;
}

/**
 * Wandelt Bilddaten in eine Data-URL um, die die Oberfläche direkt
 * als <img src="..."> anzeigen kann.
 * @param {Buffer|Uint8Array} data Rohdaten des Bildes
 * @param {string} mimeType z. B. "image/png"
 * @returns {string} Data-URL
 */
function toDataUrl(data, mimeType) {
  return `data:${mimeType};base64,${Buffer.from(data).toString('base64')}`;
}

/**
 * Zerlegt eine Data-URL wieder in MIME-Typ und Rohdaten.
 * @param {string} dataUrl Data-URL aus der Oberfläche
 * @returns {{mimeType:string, data:Buffer}} Bilddaten zum Speichern
 * @throws {Error} bei unbekanntem Format oder zu großer Datei
 */
function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!match) {
    throw new Error('Das Bild hat ein ungültiges Format. Erlaubt sind PNG, JPG, GIF und WebP.');
  }

  const data = Buffer.from(match[2], 'base64');
  if (data.length > MAX_MEDIA_BYTES) {
    throw new Error('Das Bild ist zu groß (maximal 2 MB).');
  }
  return { mimeType: match[1], data };
}

module.exports = { MAX_MEDIA_BYTES, mimeTypeFromFileName, toDataUrl, parseDataUrl };

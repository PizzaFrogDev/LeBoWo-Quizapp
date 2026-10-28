'use strict';

const crypto = require('crypto');
const fs = require('fs');

/** Länge des gespeicherten Passwort-Hashes in Bytes. */
const KEY_LENGTH = 64;

/** Nach so vielen falschen Versuchen wird der Benutzername kurz gesperrt. */
const MAX_FAILED_ATTEMPTS = 5;

/** Dauer der Sperre in Millisekunden. */
const LOCK_DURATION_MS = 30 * 1000;

/** Einheitliche Meldung, damit niemand erfährt, ob es den Benutzernamen gibt. */
const WRONG_CREDENTIALS_MESSAGE = 'Benutzername oder Passwort ist falsch.';

/**
 * AuthService
 * -----------
 * Anmeldung für das Autorentool. Die Zugangsdaten stehen in einer JSON-Datei
 * (data/authors.json). Dort liegen keine Klartext-Passwörter, sondern nur
 * gesalzene scrypt-Hashes:
 *
 *   [ { "username": "leander", "displayName": "Leander", "salt": "…", "hash": "…" } ]
 *
 * Die Klasse hält außerdem den Anmeldezustand (wer ist gerade angemeldet?)
 * und sperrt einen Benutzernamen nach zu vielen Fehlversuchen kurz.
 *
 * Hinweis: Das schützt die Bedienung des Tools. Die Datenbankdatei selbst
 * ist dadurch nicht verschlüsselt.
 */
class AuthService {
  /**
   * @param {string} filePath Pfad zur authors.json
   */
  constructor(filePath) {
    this.filePath = filePath;
    /** @type {{username:string, displayName:string, salt:string, hash:string}[]|null} */
    this.authors = null;
    /** @type {{username:string, displayName:string}|null} */
    this.currentUser = null;
    /** Fehlversuche je Benutzername: { count, lockedUntil } */
    this.failures = new Map();
  }

  /**
   * Erzeugt Salt und Hash für ein Passwort.
   * @param {string} password Klartext-Passwort
   * @param {string} [saltHex] Vorhandenes Salt (nur für Prüfungen); sonst wird ein neues erzeugt
   * @returns {{salt:string, hash:string}} Beides als Hex-Text
   */
  static hashPassword(password, saltHex = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), KEY_LENGTH).toString('hex');
    return { salt: saltHex, hash };
  }

  /**
   * Vereinheitlicht Benutzernamen (Groß-/Kleinschreibung und Leerzeichen sind egal).
   * @param {string} username Eingabe
   * @returns {string} Bereinigter Name
   */
  static normalize(username) {
    return String(username ?? '').trim().toLowerCase();
  }

  /**
   * Liest die Benutzerdatei (beim ersten Anmeldeversuch und danach aus dem Speicher).
   * @returns {{username:string, displayName:string, salt:string, hash:string}[]} Alle Autoren
   * @throws {Error} wenn die Datei fehlt oder kaputt ist
   */
  loadAuthors() {
    if (this.authors) {
      return this.authors;
    }
    if (!fs.existsSync(this.filePath)) {
      throw new Error('Die Benutzerdatei data/authors.json fehlt. Bitte aus dem Repository holen (git pull).');
    }

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      throw new Error('Die Benutzerdatei data/authors.json ist beschädigt.');
    }
    if (!Array.isArray(parsed)) {
      throw new Error('Die Benutzerdatei data/authors.json hat ein ungültiges Format.');
    }

    this.authors = parsed.map((entry) => ({
      username: AuthService.normalize(entry.username),
      displayName: String(entry.displayName ?? entry.username),
      salt: String(entry.salt),
      hash: String(entry.hash),
    }));
    return this.authors;
  }

  /**
   * Meldet einen Autor an.
   * @param {string} username Benutzername
   * @param {string} password Passwort
   * @returns {{username:string, displayName:string}} Der angemeldete Benutzer
   * @throws {Error} bei falschen Daten oder wenn der Benutzername gerade gesperrt ist
   */
  login(username, password) {
    const authors = this.loadAuthors();
    const name = AuthService.normalize(username);

    const remaining = this.remainingLockSeconds(name);
    if (remaining > 0) {
      throw new Error(`Zu viele Fehlversuche. Bitte warte noch ${remaining} Sekunden.`);
    }

    const author = authors.find((candidate) => candidate.username === name);

    // Auch bei unbekanntem Namen wird ein Hash berechnet, damit die Antwortzeit nichts verrät.
    const candidateHash = AuthService.hashPassword(password, author ? author.salt : '00'.repeat(16)).hash;
    const matches =
      author !== undefined &&
      candidateHash.length === author.hash.length &&
      crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(author.hash, 'hex'));

    if (!matches) {
      this.registerFailure(name);
      throw new Error(WRONG_CREDENTIALS_MESSAGE);
    }

    this.failures.delete(name);
    this.currentUser = { username: author.username, displayName: author.displayName };
    return this.currentUser;
  }

  /** Meldet den aktuellen Benutzer ab. */
  logout() {
    this.currentUser = null;
  }

  /**
   * @returns {boolean} true, wenn gerade jemand angemeldet ist
   */
  isLoggedIn() {
    return this.currentUser !== null;
  }

  /**
   * @returns {{loggedIn:boolean, user:({username:string, displayName:string}|null)}} Anmeldezustand für die Oberfläche
   */
  status() {
    return { loggedIn: this.isLoggedIn(), user: this.currentUser };
  }

  /**
   * Zählt einen Fehlversuch und sperrt den Namen bei zu vielen.
   * @param {string} name Normalisierter Benutzername
   */
  registerFailure(name) {
    const entry = this.failures.get(name) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
      entry.count = 0;
      entry.lockedUntil = Date.now() + LOCK_DURATION_MS;
    }
    this.failures.set(name, entry);
  }

  /**
   * @param {string} name Normalisierter Benutzername
   * @returns {number} Verbleibende Sperrzeit in Sekunden (0 = nicht gesperrt)
   */
  remainingLockSeconds(name) {
    const entry = this.failures.get(name);
    if (!entry || entry.lockedUntil <= Date.now()) {
      return 0;
    }
    return Math.ceil((entry.lockedUntil - Date.now()) / 1000);
  }
}

module.exports = AuthService;
'use strict';

const fs = require('fs');

/**
 * Database
 * --------
 * Kapselt die Verbindung zur SQLite-Datenbank (QuizzApp.db).
 *
 * Alle Repository-Klassen (Kategorien, Fragen, Antworten, ...) greifen
 * ausschließlich über diese Klasse auf die Datenbank zu. Dadurch ist die
 * konkrete SQLite-Bibliothek an genau einer Stelle austauschbar.
 *
 * Unterstützte Bibliotheken (in dieser Reihenfolge):
 *   1. "node:sqlite"   – in Node.js >= 22.13 / Electron >= 35 eingebaut
 *   2. "better-sqlite3" – Fallback für ältere Electron-Versionen
 */
class Database {
  /**
   * Öffnet die Datenbankdatei.
   * @param {string} filePath Absoluter Pfad zur .db-Datei
   * @throws {Error} wenn die Datei nicht existiert
   */
  constructor(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Die Datenbankdatei wurde nicht gefunden: ${filePath}`);
    }

    this.filePath = filePath;
    this.connection = Database.openConnection(filePath);

    // SQLite prüft Fremdschlüssel nur, wenn man es ausdrücklich einschaltet.
    this.connection.exec('PRAGMA foreign_keys = ON');
  }

  /**
   * Öffnet eine Verbindung mit der ersten verfügbaren SQLite-Bibliothek.
   * @param {string} filePath Pfad zur Datenbankdatei
   * @returns {object} Verbindungsobjekt (prepare / exec / close)
   */
  static openConnection(filePath) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      return new DatabaseSync(filePath);
    } catch (builtInError) {
      try {
        const BetterSqlite3 = require('better-sqlite3');
        return new BetterSqlite3(filePath);
      } catch (fallbackError) {
        throw new Error(
          'Keine SQLite-Bibliothek verfügbar. Entweder Electron >= 35 verwenden ' +
            'oder "npm install better-sqlite3" ausführen. ' +
            `(${builtInError.message})`
        );
      }
    }
  }

  /**
   * Führt eine SELECT-Abfrage aus und liefert alle Zeilen.
   * @param {string} sql SQL mit "?"-Platzhaltern
   * @param {Array} [params] Werte für die Platzhalter
   * @returns {Object[]} Zeilen als einfache Objekte
   */
  all(sql, params = []) {
    const rows = this.connection.prepare(sql).all(...params);
    // Kopie als normales Objekt, damit die Zeilen problemlos per IPC gesendet werden können.
    return rows.map((row) => ({ ...row }));
  }

  /**
   * Führt eine SELECT-Abfrage aus und liefert nur die erste Zeile.
   * @param {string} sql SQL mit "?"-Platzhaltern
   * @param {Array} [params] Werte für die Platzhalter
   * @returns {Object|null} Die Zeile oder null, wenn nichts gefunden wurde
   */
  get(sql, params = []) {
    const row = this.connection.prepare(sql).get(...params);
    return row ? { ...row } : null;
  }

  /**
   * Führt INSERT / UPDATE / DELETE aus.
   * @param {string} sql SQL mit "?"-Platzhaltern
   * @param {Array} [params] Werte für die Platzhalter
   * @returns {{changes: number, lastInsertRowid: number}} Anzahl geänderter Zeilen und neue ID
   */
  run(sql, params = []) {
    const info = this.connection.prepare(sql).run(...params);
    return {
      changes: Number(info.changes),
      lastInsertRowid: Number(info.lastInsertRowid),
    };
  }

  /**
   * Führt mehrere Anweisungen als eine Transaktion aus: entweder werden
   * alle übernommen oder – bei einem Fehler – keine.
   * @param {Function} work Funktion mit den Datenbankzugriffen
   * @returns {*} Rückgabewert von work
   */
  transaction(work) {
    this.connection.exec('BEGIN');
    try {
      const result = work();
      this.connection.exec('COMMIT');
      return result;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }

  /** Schließt die Verbindung. */
  close() {
    this.connection.close();
  }
}

module.exports = Database;

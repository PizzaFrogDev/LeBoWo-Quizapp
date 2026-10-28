'use strict';

/**
 * DifficultyRepository
 * --------------------
 * Lesender Zugriff auf die Tabelle "difficulty" (Schwierigkeitsgrade).
 *
 * Die Schwierigkeitsgrade wurden bereits in der Planung festgelegt und
 * werden im Autorentool nur zur Auswahl angeboten, nicht verändert.
 */
class DifficultyRepository {
  /**
   * @param {import('./Database')} database Geöffnete Datenbankverbindung
   */
  constructor(database) {
    this.database = database;
  }

  /**
   * Liefert alle Schwierigkeitsgrade, aufsteigend nach Stufe.
   * @returns {{level:number, name:string, description:string}[]}
   */
  findAll() {
    const rows = this.database.all(
      `SELECT difficulty_level, difficulty_name, difficulty_description
         FROM difficulty
        ORDER BY difficulty_level`
    );
    return rows.map((row) => ({
      level: row.difficulty_level,
      name: row.difficulty_name,
      description: row.difficulty_description ?? '',
    }));
  }

  /**
   * Prüft, ob eine Schwierigkeitsstufe existiert.
   * @param {number} level Stufe
   * @returns {boolean} true, wenn vorhanden
   */
  exists(level) {
    return this.database.get('SELECT 1 AS found FROM difficulty WHERE difficulty_level = ?', [level]) !== null;
  }
}

module.exports = DifficultyRepository;

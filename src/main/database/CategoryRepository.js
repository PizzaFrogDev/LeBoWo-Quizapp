'use strict';

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

/**
 * CategoryRepository
 * ------------------
 * Zugriff auf die Tabelle "category" (Anlegen, Lesen, Ändern, Löschen).
 *
 * Nach außen werden einfache Objekte im Format
 *   { id, name, description, questionCount }
 * geliefert, damit die Oberfläche nichts über die Spaltennamen wissen muss.
 */
class CategoryRepository {
  /**
   * @param {import('./Database')} database Geöffnete Datenbankverbindung
   */
  constructor(database) {
    this.database = database;
  }

  /**
   * Liefert alle Kategorien alphabetisch inklusive der Anzahl ihrer Fragen.
   * @returns {{id:number, name:string, description:string, questionCount:number}[]}
   */
  findAll() {
    const rows = this.database.all(
      `SELECT c.category_id, c.category_name, c.category_description,
              COUNT(q.question_id) AS question_count
         FROM category c
         LEFT JOIN question q ON q.category = c.category_id
        GROUP BY c.category_id
        ORDER BY c.category_name COLLATE NOCASE`
    );
    return rows.map(CategoryRepository.toDto);
  }

  /**
   * Liefert eine einzelne Kategorie.
   * @param {number} id Kategorie-ID
   * @returns {Object|null} Die Kategorie oder null
   */
  findById(id) {
    const row = this.database.get(
      `SELECT c.category_id, c.category_name, c.category_description,
              (SELECT COUNT(*) FROM question q WHERE q.category = c.category_id) AS question_count
         FROM category c
        WHERE c.category_id = ?`,
      [id]
    );
    return row ? CategoryRepository.toDto(row) : null;
  }

  /**
   * Legt eine neue Kategorie an.
   * @param {{name:string, description?:string}} payload Eingaben aus dem Formular
   * @returns {number} ID der neuen Kategorie
   * @throws {Error} bei ungültigen Eingaben oder doppeltem Namen
   */
  create(payload) {
    const { name, description } = CategoryRepository.validate(payload);
    try {
      const info = this.database.run(
        'INSERT INTO category (category_name, category_description) VALUES (?, ?)',
        [name, description]
      );
      return info.lastInsertRowid;
    } catch (error) {
      throw CategoryRepository.translateError(error);
    }
  }

  /**
   * Ändert Name und Beschreibung einer bestehenden Kategorie.
   * @param {number} id Kategorie-ID
   * @param {{name:string, description?:string}} payload Neue Werte
   * @throws {Error} wenn die Kategorie fehlt, die Eingaben ungültig sind oder der Name schon existiert
   */
  update(id, payload) {
    if (!this.findById(id)) {
      throw new Error('Die Kategorie existiert nicht mehr.');
    }
    const { name, description } = CategoryRepository.validate(payload);
    try {
      this.database.run(
        'UPDATE category SET category_name = ?, category_description = ? WHERE category_id = ?',
        [name, description, id]
      );
    } catch (error) {
      throw CategoryRepository.translateError(error);
    }
  }

  /**
   * Löscht eine Kategorie. Kategorien, die noch Fragen enthalten, werden
   * nicht gelöscht, damit keine Fragen "ins Leere" zeigen.
   * @param {number} id Kategorie-ID
   * @throws {Error} wenn die Kategorie noch Fragen enthält
   */
  delete(id) {
    const category = this.findById(id);
    if (!category) {
      throw new Error('Die Kategorie existiert nicht mehr.');
    }
    if (category.questionCount > 0) {
      throw new Error(
        `Die Kategorie "${category.name}" enthält noch ${category.questionCount} Frage(n). ` +
          'Bitte zuerst die Fragen löschen oder einer anderen Kategorie zuordnen.'
      );
    }
    this.database.run('DELETE FROM category WHERE category_id = ?', [id]);
  }

  /**
   * Prüft und bereinigt die Eingaben aus dem Formular.
   * @param {{name:string, description?:string}} payload Rohdaten
   * @returns {{name:string, description:(string|null)}} Bereinigte Werte
   * @throws {Error} bei ungültigen Eingaben
   */
  static validate(payload) {
    const name = String(payload?.name ?? '').trim();
    const description = String(payload?.description ?? '').trim();

    if (name.length === 0) {
      throw new Error('Bitte einen Namen für die Kategorie eingeben.');
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new Error(`Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`);
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new Error(`Die Beschreibung darf höchstens ${MAX_DESCRIPTION_LENGTH} Zeichen lang sein.`);
    }
    return { name, description: description.length > 0 ? description : null };
  }

  /**
   * Übersetzt technische SQLite-Fehler in verständliche Meldungen.
   * @param {Error} error Ursprünglicher Fehler
   * @returns {Error} Fehler mit lesbarem Text
   */
  static translateError(error) {
    if (String(error.message).includes('UNIQUE')) {
      return new Error('Eine Kategorie mit diesem Namen existiert bereits.');
    }
    return error;
  }

  /**
   * Wandelt eine Datenbankzeile in das Objekt um, das die Oberfläche erhält.
   * @param {Object} row Zeile aus der Tabelle "category"
   * @returns {{id:number, name:string, description:string, questionCount:number}}
   */
  static toDto(row) {
    return {
      id: row.category_id,
      name: row.category_name,
      description: row.category_description ?? '',
      questionCount: row.question_count ?? 0,
    };
  }
}

module.exports = CategoryRepository;

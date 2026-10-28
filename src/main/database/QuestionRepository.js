'use strict';

const { parseDataUrl, toDataUrl } = require('./mediaUtils');

const MAX_TEXT_LENGTH = 1000;
const MAX_ANSWER_LENGTH = 300;

/** Eine Frage braucht mindestens 1 richtige + 3 falsche Antworten (das API liefert genau 4 aus). */
const MIN_ANSWERS = 4;

/**
 * QuestionRepository
 * ------------------
 * Zugriff auf die Tabelle "question" samt zugehörigen Antworten.
 * Eine Frage und ihre Antworten werden immer gemeinsam in einer
 * Transaktion gespeichert.
 *
 * Nach außen werden einfache Objekte geliefert (siehe toListItem / toDetail),
 * damit die Oberfläche nichts über die Spaltennamen wissen muss.
 */
class QuestionRepository {
  /**
   * @param {import('./Database')} database Geöffnete Datenbankverbindung
   * @param {import('./AnswerRepository')} answerRepository Zugriff auf "answer"
   * @param {import('./CategoryRepository')} categoryRepository Zum Prüfen der Kategorie
   * @param {import('./DifficultyRepository')} difficultyRepository Zum Prüfen der Schwierigkeit
   */
  constructor(database, answerRepository, categoryRepository, difficultyRepository) {
    this.database = database;
    this.answers = answerRepository;
    this.categories = categoryRepository;
    this.difficulties = difficultyRepository;
  }

  /**
   * Liefert die Fragen für die Übersichtstabelle, optional gefiltert.
   * @param {{categoryId?:number, difficultyLevel?:number, search?:string}} [filter] Filterkriterien
   * @returns {Object[]} Fragen ohne Bilddaten und ohne Antworttexte
   */
  findAll(filter = {}) {
    const conditions = [];
    const params = [];

    if (filter.categoryId) {
      conditions.push('q.category = ?');
      params.push(Number(filter.categoryId));
    }
    if (filter.difficultyLevel) {
      conditions.push('q.difficulty = ?');
      params.push(Number(filter.difficultyLevel));
    }

    const search = String(filter.search ?? '').trim();
    if (search.length > 0) {
      // "\" , "%" und "_" sind in LIKE Sonderzeichen und werden maskiert.
      conditions.push("q.text LIKE ? ESCAPE '\\'");
      params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.database.all(
      `SELECT q.question_id, q.text, q.category, c.category_name,
              q.difficulty, d.difficulty_name,
              (q.media IS NOT NULL) AS has_media,
              (SELECT COUNT(*) FROM answer a WHERE a.question_id = q.question_id) AS answer_count
         FROM question q
         LEFT JOIN category c ON c.category_id = q.category
         LEFT JOIN difficulty d ON d.difficulty_level = q.difficulty
         ${where}
        ORDER BY q.question_id DESC`,
      params
    );
    return rows.map(QuestionRepository.toListItem);
  }

  /**
   * Liefert eine vollständige Frage zum Bearbeiten (inklusive Bild und Antworten).
   * @param {number} id ID der Frage
   * @returns {Object} Frage mit Antworten
   * @throws {Error} wenn die Frage nicht existiert
   */
  findById(id) {
    const row = this.database.get(
      `SELECT question_id, text, media, mime_type, category, difficulty
         FROM question
        WHERE question_id = ?`,
      [id]
    );
    if (!row) {
      throw new Error('Die Frage existiert nicht mehr.');
    }
    return QuestionRepository.toDetail(row, this.answers.findByQuestion(id));
  }

  /**
   * Legt eine neue Frage mit ihren Antworten an.
   * @param {Object} payload Eingaben aus dem Formular (siehe validate)
   * @returns {number} ID der neuen Frage
   * @throws {Error} bei ungültigen Eingaben
   */
  create(payload) {
    const data = this.validate(payload);

    return this.database.transaction(() => {
      // Die Statistik-Spalten sind NOT NULL, daher starten sie ausdrücklich bei 0.
      const info = this.database.run(
        `INSERT INTO question
           (text, media, mime_type, category, difficulty, answered_correctly, answered_incorrectly)
         VALUES (?, ?, ?, ?, ?, 0, 0)`,
        [
          data.text,
          data.media ? data.media.data : null,
          data.media ? data.media.mimeType : null,
          data.categoryId,
          data.difficultyLevel,
        ]
      );
      this.answers.sync(info.lastInsertRowid, data.answers);
      return info.lastInsertRowid;
    });
  }

  /**
   * Ändert eine bestehende Frage samt Antworten.
   * @param {number} id ID der Frage
   * @param {Object} payload Neue Werte (siehe validate)
   * @throws {Error} wenn die Frage fehlt oder die Eingaben ungültig sind
   */
  update(id, payload) {
    this.findById(id); // wirft einen Fehler, falls die Frage nicht (mehr) existiert
    const data = this.validate(payload);

    this.database.transaction(() => {
      this.database.run(
        'UPDATE question SET text = ?, category = ?, difficulty = ? WHERE question_id = ?',
        [data.text, data.categoryId, data.difficultyLevel, id]
      );

      if (data.mediaAction === 'set') {
        this.database.run('UPDATE question SET media = ?, mime_type = ? WHERE question_id = ?', [
          data.media.data,
          data.media.mimeType,
          id,
        ]);
      } else if (data.mediaAction === 'remove') {
        this.database.run('UPDATE question SET media = NULL, mime_type = NULL WHERE question_id = ?', [id]);
      }

      this.answers.sync(id, data.answers);
    });
  }

  /**
   * Löscht eine Frage mit allen ihren Antworten.
   * @param {number} id ID der Frage
   * @throws {Error} wenn die Frage fehlt oder noch von anderen Daten verwendet wird
   */
  delete(id) {
    this.findById(id);
    this.database.transaction(() => {
      this.answers.deleteByQuestion(id);
      this.database.run('DELETE FROM question WHERE question_id = ?', [id]);
    });
  }

  /**
   * Prüft und bereinigt die Eingaben aus dem Formular.
   *
   * Erwartete Form:
   *   {
   *     text, categoryId, difficultyLevel,
   *     mediaAction: 'keep' | 'remove' | 'set',   // was mit dem Bild geschehen soll
   *     mediaDataUrl: string | null,               // nur bei 'set'
   *     answers: [{ id?, text, correct }]
   *   }
   *
   * @param {Object} payload Rohdaten aus der Oberfläche
   * @returns {Object} Bereinigte und geprüfte Daten
   * @throws {Error} mit verständlicher Meldung bei ungültigen Eingaben
   */
  validate(payload) {
    const text = String(payload?.text ?? '').trim();
    if (text.length === 0) {
      throw new Error('Bitte einen Fragetext eingeben.');
    }
    if (text.length > MAX_TEXT_LENGTH) {
      throw new Error(`Der Fragetext darf höchstens ${MAX_TEXT_LENGTH} Zeichen lang sein.`);
    }

    const categoryId = Number(payload?.categoryId);
    if (!this.categories.findById(categoryId)) {
      throw new Error('Bitte eine gültige Kategorie auswählen.');
    }

    const difficultyLevel = Number(payload?.difficultyLevel);
    if (!this.difficulties.exists(difficultyLevel)) {
      throw new Error('Bitte einen gültigen Schwierigkeitsgrad auswählen.');
    }

    const answers = QuestionRepository.validateAnswers(payload?.answers);

    const mediaAction = payload?.mediaAction ?? 'keep';
    const media = mediaAction === 'set' ? parseDataUrl(payload.mediaDataUrl) : null;

    return { text, categoryId, difficultyLevel, answers, mediaAction, media };
  }

  /**
   * Prüft die Antworten: mindestens 4, genau eine richtige, keine leeren oder doppelten.
   * @param {Array} rawAnswers Antworten aus der Oberfläche
   * @returns {{id?:number, text:string, correct:boolean}[]} Bereinigte Antworten
   * @throws {Error} bei Regelverstößen
   */
  static validateAnswers(rawAnswers) {
    if (!Array.isArray(rawAnswers)) {
      throw new Error('Es fehlen die Antworten.');
    }

    const answers = rawAnswers.map((answer) => ({
      id: answer.id ?? undefined,
      text: String(answer.text ?? '').trim(),
      correct: Boolean(answer.correct),
    }));

    if (answers.some((answer) => answer.text.length === 0)) {
      throw new Error('Bitte alle Antwortfelder ausfüllen oder leere Antworten entfernen.');
    }
    if (answers.some((answer) => answer.text.length > MAX_ANSWER_LENGTH)) {
      throw new Error(`Eine Antwort darf höchstens ${MAX_ANSWER_LENGTH} Zeichen lang sein.`);
    }
    if (answers.length < MIN_ANSWERS) {
      throw new Error(`Es werden mindestens ${MIN_ANSWERS} Antworten benötigt (1 richtige und 3 falsche).`);
    }

    const correctCount = answers.filter((answer) => answer.correct).length;
    if (correctCount !== 1) {
      throw new Error('Genau eine Antwort muss als richtig markiert sein.');
    }

    const uniqueTexts = new Set(answers.map((answer) => answer.text.toLowerCase()));
    if (uniqueTexts.size !== answers.length) {
      throw new Error('Jede Antwort darf nur einmal vorkommen.');
    }
    return answers;
  }

  /**
   * Wandelt eine Zeile der Übersichtsabfrage in das Objekt für die Tabelle um.
   * @param {Object} row Zeile aus findAll
   * @returns {Object} Listeneintrag
   */
  static toListItem(row) {
    return {
      id: row.question_id,
      text: row.text,
      categoryId: row.category,
      categoryName: row.category_name ?? '(unbekannt)',
      difficultyLevel: row.difficulty,
      difficultyName: row.difficulty_name ?? '(unbekannt)',
      answerCount: row.answer_count,
      hasMedia: Boolean(row.has_media),
    };
  }

  /**
   * Wandelt eine Zeile aus "question" samt Antworten in das Objekt für das Formular um.
   * @param {Object} row Zeile aus der Tabelle "question"
   * @param {{id:number, text:string, correct:boolean}[]} answers Antworten der Frage
   * @returns {Object} Frage mit Antworten und Bild als Data-URL
   */
  static toDetail(row, answers) {
    return {
      id: row.question_id,
      text: row.text,
      categoryId: row.category,
      difficultyLevel: row.difficulty,
      mimeType: row.mime_type ?? null,
      mediaDataUrl: row.media && row.mime_type ? toDataUrl(row.media, row.mime_type) : null,
      answers,
    };
  }
}

module.exports = QuestionRepository;

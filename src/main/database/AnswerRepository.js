'use strict';

/**
 * AnswerRepository
 * ----------------
 * Zugriff auf die Tabelle "answer". Zu einer Frage gehören beliebig viele
 * Antworten: genau eine richtige, der Rest falsch. Das serverseitige API
 * wählt später zufällig drei falsche aus.
 *
 * Hinweis zur Datenbank: Die Spalte für falsch beantwortete Antworten heißt
 * dort "answered_incorreclty" (Tippfehler im vorhandenen Schema). Der Name
 * muss in den SQL-Anweisungen genauso geschrieben werden.
 */
class AnswerRepository {
  /**
   * @param {import('./Database')} database Geöffnete Datenbankverbindung
   */
  constructor(database) {
    this.database = database;
  }

  /**
   * Liefert alle Antworten einer Frage in der Reihenfolge der Erfassung.
   * @param {number} questionId ID der Frage
   * @returns {{id:number, text:string, correct:boolean}[]}
   */
  findByQuestion(questionId) {
    const rows = this.database.all(
      `SELECT answer_id, text, correct_answer
         FROM answer
        WHERE question_id = ?
        ORDER BY answer_id`,
      [questionId]
    );
    return rows.map((row) => ({
      id: row.answer_id,
      text: row.text,
      correct: Boolean(row.correct_answer),
    }));
  }

  /**
   * Gleicht die gespeicherten Antworten einer Frage mit der übergebenen
   * Liste ab:
   *   - Einträge mit "id"      -> werden aktualisiert (Statistik bleibt erhalten)
   *   - Einträge ohne "id"     -> werden neu angelegt
   *   - fehlende bisherige IDs -> werden gelöscht
   *
   * Muss innerhalb einer Transaktion aufgerufen werden (siehe QuestionRepository).
   *
   * @param {number} questionId ID der Frage
   * @param {{id?:number, text:string, correct:boolean}[]} answers Gewünschter Zustand
   * @throws {Error} wenn eine Antwort-ID nicht zu dieser Frage gehört
   */
  sync(questionId, answers) {
    const existingIds = new Set(this.findByQuestion(questionId).map((answer) => answer.id));
    const keptIds = new Set();

    for (const answer of answers) {
      if (answer.id !== undefined && answer.id !== null) {
        if (!existingIds.has(answer.id)) {
          throw new Error('Eine Antwort gehört nicht zu dieser Frage. Bitte die Frage neu laden.');
        }
        this.database.run(
          'UPDATE answer SET text = ?, correct_answer = ? WHERE answer_id = ?',
          [answer.text, answer.correct ? 1 : 0, answer.id]
        );
        keptIds.add(answer.id);
      } else {
        this.database.run(
          `INSERT INTO answer (question_id, text, correct_answer, answered_correctly, answered_incorreclty)
           VALUES (?, ?, ?, 0, 0)`,
          [questionId, answer.text, answer.correct ? 1 : 0]
        );
      }
    }

    for (const id of existingIds) {
      if (!keptIds.has(id)) {
        this.database.run('DELETE FROM answer WHERE answer_id = ?', [id]);
      }
    }
  }

  /**
   * Löscht alle Antworten einer Frage (wird vor dem Löschen der Frage benötigt).
   * @param {number} questionId ID der Frage
   */
  deleteByQuestion(questionId) {
    this.database.run('DELETE FROM answer WHERE question_id = ?', [questionId]);
  }
}

module.exports = AnswerRepository;

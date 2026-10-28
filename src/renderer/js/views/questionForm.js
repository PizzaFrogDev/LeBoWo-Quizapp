/**
 * questionForm.js
 * ---------------
 * Dialog zum Anlegen und Bearbeiten einer Frage:
 * Fragetext, Kategorie, Schwierigkeit, optionales Bild und beliebig viele
 * Antworten (genau eine richtige, mindestens drei falsche).
 *
 * Geprüft wird endgültig im Hauptprozess (QuestionRepository.validate);
 * dessen Fehlermeldungen werden hier im Formular angezeigt.
 */

import { el, openModal } from '../ui/ui.js';

/** Mindestanzahl Antworten: 1 richtige + 3 falsche. */
const MIN_ANSWERS = 4;

export class QuestionForm {
  /**
   * @param {Object} options Einstellungen
   * @param {{id:number, name:string}[]} options.categories Auswahl für die Kategorie
   * @param {{level:number, name:string}[]} options.difficulties Auswahl für die Schwierigkeit
   * @param {Object|null} options.question Bestehende Frage (aus questions.get) oder null für "neu"
   * @param {Function} options.onSaved Wird nach dem Speichern mit (wasEdit:boolean) aufgerufen
   */
  constructor({ categories, difficulties, question, onSaved }) {
    this.categories = categories;
    this.difficulties = difficulties;
    this.question = question;
    this.onSaved = onSaved;
    this.isEdit = question !== null;

    /** Antworten im Formular; bei neuen Fragen starten vier leere Zeilen. */
    this.answers = this.isEdit
      ? question.answers.map((answer) => ({ ...answer }))
      : Array.from({ length: MIN_ANSWERS }, (_, index) => ({ text: '', correct: index === 0 }));

    /** Bild: 'keep' = nichts ändern, 'set' = neues Bild, 'remove' = Bild entfernen */
    this.mediaAction = 'keep';
    this.mediaDataUrl = question?.mediaDataUrl ?? null;
    this.hadMedia = Boolean(question?.mediaDataUrl);

    this.modal = null;
    this.answerRows = [];
  }

  /** Baut das Formular und zeigt es als Dialog an. */
  open() {
    this.textInput = el('textarea', {
      id: 'question-text',
      class: 'input textarea',
      rows: '3',
      maxlength: '1000',
      placeholder: 'z. B. Wie heißt die Hauptstadt von Frankreich?',
    });
    this.textInput.value = this.question?.text ?? '';

    this.categorySelect = this.buildSelect(
      'question-category',
      this.categories.map((category) => ({ value: category.id, label: category.name })),
      this.question?.categoryId
    );
    this.difficultySelect = this.buildSelect(
      'question-difficulty',
      this.difficulties.map((difficulty) => ({ value: difficulty.level, label: difficulty.name })),
      this.question?.difficultyLevel
    );

    this.mediaArea = el('div', { class: 'media-editor' });
    this.answerList = el('div', { class: 'answers' });
    this.answerSummary = el('span', { class: 'answers__summary' });
    this.errorBox = el('div', { class: 'form-error', role: 'alert', hidden: true });
    this.saveButton = el('button', { class: 'btn btn--primary', type: 'submit', text: 'Speichern' });

    this.renderMedia();
    this.renderAnswers();

    const form = el(
      'form',
      { class: 'form', novalidate: true, onSubmit: (event) => this.submit(event) },
      el('div', { class: 'field' }, el('label', { for: 'question-text', text: 'Fragetext *' }), this.textInput),
      el(
        'div',
        { class: 'field-row' },
        el('div', { class: 'field' }, el('label', { for: 'question-category', text: 'Kategorie *' }), this.categorySelect),
        el(
          'div',
          { class: 'field' },
          el('label', { for: 'question-difficulty', text: 'Schwierigkeit *' }),
          this.difficultySelect
        )
      ),
      el('div', { class: 'field' }, el('span', { class: 'field__label', text: 'Bild (optional)' }), this.mediaArea),
      el(
        'div',
        { class: 'field' },
        el('div', { class: 'answers__header' }, el('span', { class: 'field__label', text: 'Antworten *' }), this.answerSummary),
        el('p', {
          class: 'field__hint',
          text:
            'Markiere die richtige Antwort. Du brauchst mindestens drei falsche – ' +
            'in der App werden später zufällig drei davon angezeigt.',
        }),
        this.answerList,
        el(
          'button',
          { class: 'btn btn--small answers__add', type: 'button', onClick: () => this.addAnswer() },
          '+ Antwort hinzufügen'
        )
      ),
      this.errorBox,
      el(
        'div',
        { class: 'form-actions' },
        el('button', { class: 'btn btn--ghost', type: 'button', text: 'Abbrechen', onClick: () => this.modal.close() }),
        this.saveButton
      )
    );

    this.modal = openModal({
      title: this.isEdit ? 'Frage bearbeiten' : 'Neue Frage',
      content: form,
      wide: true,
    });
  }

  /**
   * Erzeugt ein Auswahlfeld.
   * @param {string} id id-Attribut (für das <label>)
   * @param {{value:number, label:string}[]} options Einträge
   * @param {number} [selectedValue] Vorausgewählter Wert (leer = "Bitte wählen")
   * @returns {HTMLSelectElement} Das Auswahlfeld
   */
  buildSelect(id, options, selectedValue) {
    const select = el(
      'select',
      { id, class: 'input' },
      el('option', { value: '', text: 'Bitte wählen …' }),
      options.map((option) => el('option', { value: String(option.value), text: option.label }))
    );
    select.value = selectedValue !== undefined && selectedValue !== null ? String(selectedValue) : '';
    return select;
  }

  /** Zeichnet den Bildbereich (Vorschau oder Auswahl-Schaltfläche). */
  renderMedia() {
    if (this.mediaDataUrl) {
      this.mediaArea.replaceChildren(
        el('img', { class: 'media-editor__preview', src: this.mediaDataUrl, alt: 'Vorschau des Bildes' }),
        el(
          'div',
          { class: 'media-editor__buttons' },
          el('button', { class: 'btn btn--small', type: 'button', onClick: () => this.chooseImage() }, 'Anderes Bild …'),
          el(
            'button',
            { class: 'btn btn--small btn--danger-ghost', type: 'button', onClick: () => this.removeImage() },
            'Bild entfernen'
          )
        )
      );
    } else {
      this.mediaArea.replaceChildren(
        el('button', { class: 'btn btn--small', type: 'button', onClick: () => this.chooseImage() }, 'Bild auswählen …'),
        el('span', { class: 'field__hint', text: 'PNG, JPG, GIF oder WebP, höchstens 2 MB' })
      );
    }
  }

  /** Öffnet den Dateidialog (im Hauptprozess) und übernimmt das gewählte Bild. */
  async chooseImage() {
    try {
      const image = await window.api.questions.pickImage();
      if (image) {
        this.mediaDataUrl = image.dataUrl;
        this.mediaAction = 'set';
        this.renderMedia();
      }
    } catch (error) {
      this.showError(error.message);
    }
  }

  /** Entfernt das Bild; bei einer bestehenden Frage wird es beim Speichern gelöscht. */
  removeImage() {
    this.mediaDataUrl = null;
    this.mediaAction = this.hadMedia ? 'remove' : 'keep';
    this.renderMedia();
  }

  /** Zeichnet alle Antwortzeilen neu (nach Hinzufügen oder Entfernen). */
  renderAnswers() {
    this.answerRows = this.answers.map((answer, index) => this.buildAnswerRow(answer, index));
    this.answerList.replaceChildren(...this.answerRows);
    this.updateAnswerSummary();
  }

  /**
   * Erzeugt eine Antwortzeile: Auswahl "richtig", Textfeld und Entfernen-Schaltfläche.
   * @param {{text:string, correct:boolean}} answer Zugehörige Antwort
   * @param {number} index Position in der Liste
   * @returns {HTMLElement} Die Zeile
   */
  buildAnswerRow(answer, index) {
    const radio = el('input', {
      type: 'radio',
      name: 'correct-answer',
      checked: answer.correct,
      'aria-label': `Antwort ${index + 1} ist richtig`,
      onChange: () => this.markCorrect(index),
    });
    const textField = el('input', {
      class: 'input',
      type: 'text',
      maxlength: '300',
      placeholder: `Antwort ${index + 1}`,
      'aria-label': `Antwort ${index + 1}`,
      value: answer.text,
      // Nur den Zustand aktualisieren; kein Neuzeichnen, damit der Cursor im Feld bleibt.
      onInput: (event) => {
        answer.text = event.target.value;
      },
    });
    const removeButton = el('button', {
      class: 'btn btn--small btn--danger-ghost answer-row__remove',
      type: 'button',
      title: this.answers.length <= MIN_ANSWERS ? `Mindestens ${MIN_ANSWERS} Antworten nötig` : 'Antwort entfernen',
      'aria-label': `Antwort ${index + 1} entfernen`,
      disabled: this.answers.length <= MIN_ANSWERS,
      onClick: () => this.removeAnswer(index),
      text: '✕',
    });

    return el(
      'div',
      { class: `answer-row${answer.correct ? ' answer-row--correct' : ''}` },
      el('label', { class: 'answer-row__correct', title: 'Richtige Antwort' }, radio, el('span', { text: 'richtig' })),
      textField,
      removeButton
    );
  }

  /**
   * Markiert genau eine Antwort als richtig.
   * @param {number} correctIndex Position der richtigen Antwort
   */
  markCorrect(correctIndex) {
    this.answers.forEach((answer, index) => {
      answer.correct = index === correctIndex;
      this.answerRows[index].classList.toggle('answer-row--correct', answer.correct);
    });
    this.updateAnswerSummary();
  }

  /** Hängt eine leere (falsche) Antwort an und setzt den Cursor hinein. */
  addAnswer() {
    this.answers.push({ text: '', correct: false });
    this.renderAnswers();
    const fields = this.answerList.querySelectorAll('input[type="text"]');
    fields[fields.length - 1].focus();
  }

  /**
   * Entfernt eine Antwort. War es die richtige, wird die erste verbleibende richtig.
   * @param {number} index Position der Antwort
   */
  removeAnswer(index) {
    if (this.answers.length <= MIN_ANSWERS) {
      return;
    }
    const [removed] = this.answers.splice(index, 1);
    if (removed.correct) {
      this.answers[0].correct = true;
    }
    this.renderAnswers();
  }

  /** Aktualisiert die Zusammenfassung "5 Antworten · 1 richtig, 4 falsch". */
  updateAnswerSummary() {
    const total = this.answers.length;
    this.answerSummary.textContent = `${total} Antworten · 1 richtig, ${total - 1} falsch`;
  }

  /**
   * Zeigt eine Fehlermeldung im Formular.
   * @param {string} message Text
   */
  showError(message) {
    this.errorBox.textContent = message;
    this.errorBox.hidden = false;
  }

  /**
   * Sendet das Formular an den Hauptprozess.
   * @param {SubmitEvent} event Absenden-Ereignis
   */
  async submit(event) {
    event.preventDefault();
    this.errorBox.hidden = true;
    this.saveButton.disabled = true;

    const payload = {
      text: this.textInput.value,
      categoryId: this.categorySelect.value,
      difficultyLevel: this.difficultySelect.value,
      mediaAction: this.mediaAction,
      mediaDataUrl: this.mediaAction === 'set' ? this.mediaDataUrl : null,
      answers: this.answers.map((answer) => ({ id: answer.id, text: answer.text, correct: answer.correct })),
    };

    try {
      if (this.isEdit) {
        await window.api.questions.update(this.question.id, payload);
      } else {
        await window.api.questions.create(payload);
      }
      this.modal.close();
      this.onSaved(this.isEdit);
    } catch (error) {
      // Fehler im Formular anzeigen, damit die Eingaben nicht verloren gehen.
      this.showError(error.message);
      this.saveButton.disabled = false;
    }
  }
}

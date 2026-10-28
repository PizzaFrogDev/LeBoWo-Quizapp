/**
 * questionView.js
 * ---------------
 * Ansicht "Fragen": filterbare Tabelle aller Quizfragen mit Anlegen,
 * Bearbeiten und Löschen. Das Formular selbst steckt in QuestionForm.
 */

import { el, showToast, confirmDialog } from '../ui/ui.js';
import { QuestionForm } from './questionForm.js';

/** Wartezeit in Millisekunden, bevor nach dem Tippen im Suchfeld gesucht wird. */
const SEARCH_DELAY_MS = 250;

export class QuestionView {
  constructor() {
    /** @type {HTMLElement|null} Bereich, in dem die Tabelle steht */
    this.listArea = null;
    /** @type {HTMLElement|null} Anzeige "n Fragen" in der Werkzeugleiste */
    this.countLabel = null;
    /** Kategorien und Schwierigkeitsgrade für Filter und Formular */
    this.categories = [];
    this.difficulties = [];
    /** Aktuelle Filtereinstellungen */
    this.filter = { search: '', categoryId: '', difficultyLevel: '' };
    /** Timer für die verzögerte Suche */
    this.searchTimer = null;
  }

  /**
   * Baut das Grundgerüst der Ansicht und lädt die Daten.
   * @param {HTMLElement} container Zielcontainer (#view)
   */
  async mount(container) {
    this.filter = { search: '', categoryId: '', difficultyLevel: '' };
    [this.categories, this.difficulties] = await Promise.all([
      window.api.categories.list(),
      window.api.difficulties.list(),
    ]);

    this.countLabel = el('span', { class: 'toolbar__count' });
    this.listArea = el('div', { class: 'card' });

    container.append(
      el(
        'header',
        { class: 'page-header' },
        el(
          'div',
          {},
          el('h1', { class: 'page-title', text: 'Fragen' }),
          el('p', {
            class: 'page-subtitle',
            text: 'Quizfragen mit ihren Antworten erfassen und pflegen.',
          })
        ),
        el('button', { class: 'btn btn--primary', type: 'button', onClick: () => this.openForm(null) }, '+ Neue Frage')
      ),
      this.buildToolbar(),
      this.listArea
    );

    await this.reload();
  }

  /**
   * Erzeugt die Werkzeugleiste mit Suchfeld und Filtern.
   * @returns {HTMLElement} Die Werkzeugleiste
   */
  buildToolbar() {
    const searchInput = el('input', {
      class: 'input toolbar__search',
      type: 'search',
      placeholder: 'Fragen durchsuchen …',
      'aria-label': 'Fragen durchsuchen',
      onInput: (event) => {
        // Erst suchen, wenn kurz nicht getippt wurde – schont die Datenbank.
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
          this.filter.search = event.target.value;
          this.reload();
        }, SEARCH_DELAY_MS);
      },
    });

    const categorySelect = el(
      'select',
      {
        class: 'input toolbar__select',
        'aria-label': 'Nach Kategorie filtern',
        onChange: (event) => {
          this.filter.categoryId = event.target.value;
          this.reload();
        },
      },
      el('option', { value: '', text: 'Alle Kategorien' }),
      this.categories.map((category) => el('option', { value: String(category.id), text: category.name }))
    );

    const difficultySelect = el(
      'select',
      {
        class: 'input toolbar__select',
        'aria-label': 'Nach Schwierigkeit filtern',
        onChange: (event) => {
          this.filter.difficultyLevel = event.target.value;
          this.reload();
        },
      },
      el('option', { value: '', text: 'Alle Schwierigkeiten' }),
      this.difficulties.map((difficulty) =>
        el('option', { value: String(difficulty.level), text: difficulty.name })
      )
    );

    return el('div', { class: 'toolbar' }, searchInput, categorySelect, difficultySelect, this.countLabel);
  }

  /** Lädt die Fragen passend zu den Filtern neu und zeichnet die Tabelle. */
  async reload() {
    try {
      const questions = await window.api.questions.list({
        search: this.filter.search,
        categoryId: this.filter.categoryId ? Number(this.filter.categoryId) : undefined,
        difficultyLevel: this.filter.difficultyLevel ? Number(this.filter.difficultyLevel) : undefined,
      });
      this.renderList(questions);
    } catch (error) {
      showToast(`Fragen konnten nicht geladen werden: ${error.message}`, 'error');
    }
  }

  /**
   * Zeichnet die Tabelle (oder einen Hinweis, wenn nichts gefunden wurde).
   * @param {Object[]} questions Fragen aus window.api.questions.list
   */
  renderList(questions) {
    this.countLabel.textContent = questions.length === 1 ? '1 Frage' : `${questions.length} Fragen`;

    if (questions.length === 0) {
      const isFiltered = Object.values(this.filter).some((value) => value !== '');
      this.listArea.replaceChildren(
        el(
          'div',
          { class: 'empty-state' },
          el('div', { class: 'empty-state__icon', 'aria-hidden': 'true', text: isFiltered ? '🔍' : '❓' }),
          el('p', { class: 'empty-state__title', text: isFiltered ? 'Keine passenden Fragen' : 'Noch keine Fragen' }),
          el('p', {
            text: isFiltered
              ? 'Ändere die Suche oder die Filter.'
              : 'Lege mit „Neue Frage“ die erste Quizfrage an.',
          })
        )
      );
      return;
    }

    const rows = questions.map((question) =>
      el(
        'tr',
        {},
        el('td', {}, el('div', { class: 'question-text', title: question.text, text: question.text })),
        el('td', { class: 'cell-muted', text: question.categoryName }),
        el(
          'td',
          {},
          el('span', {
            class: `badge badge--level-${Math.abs(question.difficultyLevel) % 4}`,
            text: question.difficultyName,
          })
        ),
        el('td', { class: 'cell-number', text: String(question.answerCount) }),
        el('td', {
          class: 'cell-number',
          title: question.hasMedia ? 'Mit Bild' : 'Ohne Bild',
          text: question.hasMedia ? '🖼️' : '–',
        }),
        el(
          'td',
          { class: 'cell-actions' },
          el('button', { class: 'btn btn--small', type: 'button', onClick: () => this.openForm(question.id) }, 'Bearbeiten'),
          el(
            'button',
            { class: 'btn btn--small btn--danger-ghost', type: 'button', onClick: () => this.remove(question) },
            'Löschen'
          )
        )
      )
    );

    this.listArea.replaceChildren(
      el(
        'table',
        { class: 'table table--questions' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: 'Frage' }),
            el('th', { text: 'Kategorie' }),
            el('th', { text: 'Schwierigkeit' }),
            el('th', { class: 'cell-number', text: 'Antworten' }),
            el('th', { class: 'cell-number', text: 'Bild' }),
            el('th', { class: 'cell-actions', text: 'Aktionen' })
          )
        ),
        el('tbody', {}, rows)
      )
    );
  }

  /**
   * Öffnet das Formular zum Anlegen oder Bearbeiten.
   * @param {number|null} questionId ID der zu bearbeitenden Frage oder null für "neu"
   */
  async openForm(questionId) {
    if (this.categories.length === 0) {
      showToast('Lege zuerst eine Kategorie an, bevor du Fragen erfasst.', 'error');
      return;
    }

    try {
      const question = questionId === null ? null : await window.api.questions.get(questionId);
      new QuestionForm({
        categories: this.categories,
        difficulties: this.difficulties,
        question,
        onSaved: (wasEdit) => {
          showToast(wasEdit ? 'Frage gespeichert.' : 'Frage angelegt.', 'success');
          this.reload();
        },
      }).open();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  /**
   * Löscht eine Frage nach Rückfrage.
   * @param {{id:number, text:string}} question Zu löschende Frage
   */
  async remove(question) {
    const shortText = question.text.length > 80 ? `${question.text.slice(0, 80)} …` : question.text;
    const confirmed = await confirmDialog({
      title: 'Frage löschen?',
      message: `Die Frage „${shortText}“ wird mit allen Antworten gelöscht.`,
      confirmText: 'Löschen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await window.api.questions.delete(question.id);
      showToast('Frage gelöscht.', 'success');
      await this.reload();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

/**
 * categoryView.js
 * ---------------
 * Ansicht "Kategorien": Tabelle aller Kategorien mit Anlegen, Bearbeiten
 * und Löschen. Die Formulare öffnen sich als Dialog.
 */

import { el, showToast, openModal, confirmDialog } from '../ui/ui.js';

export class CategoryView {
  constructor() {
    /** @type {HTMLElement|null} Container, in den diese Ansicht zeichnet */
    this.container = null;
    /** @type {HTMLElement|null} Bereich, in dem die Tabelle steht */
    this.listArea = null;
  }

  /**
   * Baut das Grundgerüst der Ansicht und lädt die Daten.
   * @param {HTMLElement} container Zielcontainer (#view)
   */
  async mount(container) {
    this.container = container;
    this.listArea = el('div', { class: 'card' });

    container.append(
      el(
        'header',
        { class: 'page-header' },
        el(
          'div',
          {},
          el('h1', { class: 'page-title', text: 'Kategorien' }),
          el('p', { class: 'page-subtitle', text: 'Fragen werden in Kategorien einsortiert, z. B. „Geografie“ oder „Sport“.' })
        ),
        el('button', { class: 'btn btn--primary', type: 'button', onClick: () => this.openForm(null) }, '+ Neue Kategorie')
      ),
      this.listArea
    );

    await this.reload();
  }

  /** Lädt die Kategorien neu und zeichnet die Tabelle. */
  async reload() {
    try {
      const categories = await window.api.categories.list();
      this.renderList(categories);
    } catch (error) {
      showToast(`Kategorien konnten nicht geladen werden: ${error.message}`, 'error');
    }
  }

  /**
   * Zeichnet die Tabelle (oder einen Hinweis, wenn es noch keine Kategorie gibt).
   * @param {{id:number, name:string, description:string, questionCount:number}[]} categories Kategorien
   */
  renderList(categories) {
    if (categories.length === 0) {
      this.listArea.replaceChildren(
        el(
          'div',
          { class: 'empty-state' },
          el('div', { class: 'empty-state__icon', 'aria-hidden': 'true', text: '🗂️' }),
          el('p', { class: 'empty-state__title', text: 'Noch keine Kategorien' }),
          el('p', { text: 'Lege die erste Kategorie an, um Fragen einsortieren zu können.' })
        )
      );
      return;
    }

    const rows = categories.map((category) =>
      el(
        'tr',
        {},
        el('td', { class: 'cell-strong', text: category.name }),
        el('td', { class: 'cell-muted', text: category.description || '–' }),
        el('td', { class: 'cell-number' }, el('span', { class: 'badge', text: String(category.questionCount) })),
        el(
          'td',
          { class: 'cell-actions' },
          el('button', { class: 'btn btn--small', type: 'button', onClick: () => this.openForm(category) }, 'Bearbeiten'),
          el(
            'button',
            { class: 'btn btn--small btn--danger-ghost', type: 'button', onClick: () => this.remove(category) },
            'Löschen'
          )
        )
      )
    );

    this.listArea.replaceChildren(
      el(
        'table',
        { class: 'table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: 'Name' }),
            el('th', { text: 'Beschreibung' }),
            el('th', { class: 'cell-number', text: 'Fragen' }),
            el('th', { class: 'cell-actions', text: 'Aktionen' })
          )
        ),
        el('tbody', {}, rows)
      )
    );
  }

  /**
   * Öffnet das Formular zum Anlegen oder Bearbeiten einer Kategorie.
   * @param {{id:number, name:string, description:string}|null} category Bestehende Kategorie oder null für "neu"
   */
  openForm(category) {
    const isEdit = category !== null;

    const nameInput = el('input', {
      id: 'category-name',
      class: 'input',
      type: 'text',
      maxlength: '100',
      required: true,
      placeholder: 'z. B. Geografie',
      value: category?.name ?? '',
    });
    const descriptionInput = el('textarea', {
      id: 'category-description',
      class: 'input textarea',
      rows: '3',
      maxlength: '500',
      placeholder: 'Optional: Worum geht es in dieser Kategorie?',
    });
    descriptionInput.value = category?.description ?? '';

    const errorBox = el('div', { class: 'form-error', role: 'alert', hidden: true });
    const saveButton = el('button', { class: 'btn btn--primary', type: 'submit', text: 'Speichern' });
    let modal = null;

    const form = el(
      'form',
      {
        class: 'form',
        novalidate: true,
        onSubmit: async (event) => {
          event.preventDefault();
          errorBox.hidden = true;
          saveButton.disabled = true;

          const payload = { name: nameInput.value, description: descriptionInput.value };
          try {
            if (isEdit) {
              await window.api.categories.update(category.id, payload);
            } else {
              await window.api.categories.create(payload);
            }
            modal.close();
            showToast(isEdit ? 'Kategorie gespeichert.' : 'Kategorie angelegt.', 'success');
            await this.reload();
          } catch (error) {
            // Fehler (z. B. doppelter Name) im Formular anzeigen, damit nichts verloren geht.
            errorBox.textContent = error.message;
            errorBox.hidden = false;
            saveButton.disabled = false;
          }
        },
      },
      el('div', { class: 'field' }, el('label', { for: 'category-name', text: 'Name *' }), nameInput),
      el('div', { class: 'field' }, el('label', { for: 'category-description', text: 'Beschreibung' }), descriptionInput),
      errorBox,
      el(
        'div',
        { class: 'form-actions' },
        el('button', { class: 'btn btn--ghost', type: 'button', text: 'Abbrechen', onClick: () => modal.close() }),
        saveButton
      )
    );

    modal = openModal({ title: isEdit ? 'Kategorie bearbeiten' : 'Neue Kategorie', content: form });
  }

  /**
   * Löscht eine Kategorie nach Rückfrage.
   * @param {{id:number, name:string, questionCount:number}} category Zu löschende Kategorie
   */
  async remove(category) {
    const confirmed = await confirmDialog({
      title: 'Kategorie löschen?',
      message: `Soll die Kategorie „${category.name}“ wirklich gelöscht werden?`,
      confirmText: 'Löschen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await window.api.categories.delete(category.id);
      showToast('Kategorie gelöscht.', 'success');
      await this.reload();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

/**
 * ui.js
 * -----
 * Kleine Hilfsfunktionen, die alle Ansichten gemeinsam nutzen:
 *   - el()            baut DOM-Elemente (ohne innerHTML, damit Datenbankinhalte nie als HTML gelten)
 *   - showToast()     kurze Meldung unten rechts
 *   - openModal()     Dialogfenster mit beliebigem Inhalt
 *   - confirmDialog() Ja/Nein-Rückfrage als Promise
 */

/**
 * Erzeugt ein DOM-Element.
 *
 * Beispiel: el('button', { class: 'btn', onClick: speichern }, 'Speichern')
 *
 * Unterstützte Eigenschaften:
 *   class, text, for, on<Ereignis> (z. B. onClick), dataset,
 *   value/checked/disabled/selected/readOnly (als Property) und alle weiteren als Attribut.
 *
 * @param {string} tag HTML-Tag, z. B. "div"
 * @param {Object} [props] Eigenschaften und Attribute
 * @param {...(Node|string|number|null|false|Array)} children Kindelemente oder Text
 * @returns {HTMLElement} Das erzeugte Element
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  const propertyNames = ['value', 'checked', 'disabled', 'selected', 'readOnly'];

  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) {
      continue;
    }
    if (key === 'class') {
      node.className = value;
    } else if (key === 'text') {
      node.textContent = value;
    } else if (key === 'for') {
      node.htmlFor = value;
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (propertyNames.includes(key)) {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? '' : value);
    }
  }

  appendChildren(node, children);
  return node;
}

/**
 * Hängt Kinder an ein Element (verschachtelte Listen werden aufgelöst,
 * Text wird als Textknoten eingefügt, null/false werden übersprungen).
 * @param {Node} parent Zielelement
 * @param {Array} children Kinder
 */
function appendChildren(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * Zeigt eine kurze Meldung unten rechts, die nach einigen Sekunden verschwindet.
 * @param {string} message Text der Meldung
 * @param {'success'|'error'|'info'} [type] Art der Meldung (bestimmt die Farbe)
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = el('div', { class: `toast toast--${type}`, role: type === 'error' ? 'alert' : 'status', text: message });
  container.append(toast);

  const lifetime = type === 'error' ? 6000 : 3500;
  setTimeout(() => toast.remove(), lifetime);
}

/** Alle gerade offenen Dialoge (der letzte liegt oben). */
const openModals = [];

/**
 * Öffnet ein Dialogfenster über der Oberfläche.
 * Schließen: Kreuz oben rechts oder Escape-Taste.
 *
 * @param {Object} options Einstellungen
 * @param {string} options.title Überschrift
 * @param {Node} options.content Inhalt des Dialogs
 * @param {boolean} [options.wide] true für breite Formulare
 * @returns {{close: Function}} Handle zum Schließen von außen
 */
export function openModal({ title, content, wide = false }) {
  const root = document.getElementById('modal-root');

  const closeButton = el('button', { class: 'modal__close', type: 'button', 'aria-label': 'Schließen', text: '×' });
  const dialog = el(
    'div',
    { class: `modal${wide ? ' modal--wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('div', { class: 'modal__header' }, el('h2', { class: 'modal__title', text: title }), closeButton),
    el('div', { class: 'modal__body' }, content)
  );
  const overlay = el('div', { class: 'modal-overlay' }, dialog);

  const handle = {
    close() {
      const index = openModals.indexOf(handle);
      if (index >= 0) {
        openModals.splice(index, 1);
      }
      overlay.remove();
    },
  };

  closeButton.addEventListener('click', () => handle.close());
  openModals.push(handle);
  root.append(overlay);

  // Fokus auf das erste Eingabefeld, damit man sofort tippen kann.
  const firstField = dialog.querySelector('input, textarea, select');
  if (firstField) {
    firstField.focus();
  }
  return handle;
}

// Escape schließt immer den obersten Dialog.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openModals.length > 0) {
    openModals[openModals.length - 1].close();
  }
});

/**
 * Zeigt eine Ja/Nein-Rückfrage.
 *
 * @param {Object} options Einstellungen
 * @param {string} options.title Überschrift
 * @param {string} options.message Erklärender Text
 * @param {string} [options.confirmText] Beschriftung der Bestätigen-Schaltfläche
 * @param {boolean} [options.danger] true für gefährliche Aktionen (rote Schaltfläche)
 * @returns {Promise<boolean>} true, wenn bestätigt wurde
 */
export function confirmDialog({ title, message, confirmText = 'Bestätigen', danger = false }) {
  return new Promise((resolve) => {
    let modal = null;
    let decided = false;

    const decide = (answer) => {
      if (decided) {
        return;
      }
      decided = true;
      modal.close();
      resolve(answer);
    };

    const content = el(
      'div',
      { class: 'confirm' },
      el('p', { class: 'confirm__message', text: message }),
      el(
        'div',
        { class: 'form-actions' },
        el('button', { class: 'btn btn--ghost', type: 'button', text: 'Abbrechen', onClick: () => decide(false) }),
        el('button', {
          class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
          type: 'button',
          text: confirmText,
          onClick: () => decide(true),
        })
      )
    );

    modal = openModal({ title, content });

    // Schließen per Kreuz oder Escape zählt als "Abbrechen".
    const originalClose = modal.close;
    modal.close = () => {
      originalClose();
      decide(false);
    };
  });
}

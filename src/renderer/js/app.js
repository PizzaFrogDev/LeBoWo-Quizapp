/**
 * app.js
 * ------
 * Einstiegspunkt der Oberfläche. Die Klasse App verwaltet die Navigation
 * zwischen den Ansichten ("Fragen" und "Kategorien").
 *
 * Jede Ansicht ist eine Klasse mit der Methode mount(container), die ihren
 * Inhalt in den übergebenen Container zeichnet und die Daten über
 * window.api (siehe preload.js) lädt.
 */

import { CategoryView } from './views/categoryView.js';
import { QuestionView } from './views/questionView.js';
import { showToast } from './ui/ui.js';
import { LoginView } from './views/loginView.js';

class App {
  constructor() {
    /** Alle verfügbaren Ansichten, erreichbar über das data-view-Attribut der Navigation. */
    this.views = {
      questions: new QuestionView(),
      categories: new CategoryView(),
    };
    this.container = document.getElementById('view');
    this.navButtons = Array.from(document.querySelectorAll('.nav-item'));
  }

  /** Verbindet die Navigation und öffnet die Startansicht. */
    async init() {
    // Erst anmelden, dann erst Daten laden.
    await LoginView.ensureAuthenticated();

    for (const button of this.navButtons) {
      button.addEventListener('click', () => this.navigate(button.dataset.view));
    }
    this.navigate('questions');
  }

  /**
   * Wechselt zu einer Ansicht.
   * @param {string} name Schlüssel aus this.views
   */
  async navigate(name) {
    const view = this.views[name];
    if (!view) {
      return;
    }

    for (const button of this.navButtons) {
      const isActive = button.dataset.view === name;
      button.classList.toggle('nav-item--active', isActive);
      button.setAttribute('aria-current', isActive ? 'page' : 'false');
    }

    this.container.replaceChildren();
    try {
      await view.mount(this.container);
    } catch (error) {
      showToast(`Die Ansicht konnte nicht geladen werden: ${error.message}`, 'error');
    }
  }
}

// Module werden erst nach dem Parsen des HTML ausgeführt; der Check ist eine Absicherung.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App().init());
} else {
  new App().init();
}

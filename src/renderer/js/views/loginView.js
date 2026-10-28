/**
 * loginView.js
 * ------------
 * Anmeldung für das Autorentool.
 *
 *   - Zeigt vor allem anderen einen Vollbild-Anmeldebildschirm.
 *   - Bei falschen Daten wechselt er zu einem Handy, auf dem ein Video läuft,
 *     darunter steht "Nochmal versuchen".
 *   - Nach der Anmeldung steht in der Seitenleiste, wer angemeldet ist, samt "Abmelden".
 *
 * Das Video liegt im Ordner assets/ und kann einfach ausgetauscht werden
 * (gleicher Dateiname: login-fail.mp4).
 */

import { el } from '../ui/ui.js';

/** Pfad zum Video, von src/renderer/index.html aus gesehen. */
const FAIL_VIDEO_PATH = '../../assets/login-fail.mp4';

export class LoginView {
  constructor() {
    /** @type {HTMLElement|null} Vollbild-Container der Anmeldung */
    this.overlay = null;
    /** @type {HTMLElement|null} Bereich, in dem Formular oder Handy stehen */
    this.stage = null;
    /** @type {Function|null} Löst das Promise von show() auf */
    this.resolveLogin = null;
    /** Zuletzt eingegebener Benutzername, damit er nach einem Fehlversuch stehen bleibt */
    this.lastUsername = '';
  }

  /**
   * Stellt sicher, dass jemand angemeldet ist. Ist schon jemand angemeldet
   * (z. B. nach einem Neuladen des Fensters), passiert nichts Sichtbares.
   * Andernfalls wird die Anmeldung gezeigt und erst nach Erfolg weitergemacht.
   *
   * @returns {Promise<{username:string, displayName:string}>} Der angemeldete Benutzer
   */
  static async ensureAuthenticated() {
    const status = await window.api.auth.status();
    const user = status.loggedIn ? status.user : await new LoginView().show();
    LoginView.mountSessionBar(user);
    return user;
  }

  /**
   * Zeigt in der Seitenleiste den Benutzer und die Schaltfläche "Abmelden".
   * @param {{displayName:string}} user Angemeldeter Benutzer
   */
  static mountSessionBar(user) {
    const footer = document.querySelector('.sidebar__footer');
    if (!footer || document.querySelector('.sessionbar')) {
      return;
    }

    const logout = async () => {
      await window.api.auth.logout();
      // Neu laden: Der Zustand der Oberfläche wird verworfen, die Anmeldung erscheint wieder.
      window.location.reload();
    };

    footer.before(
      el(
        'div',
        { class: 'sessionbar' },
        el('div', { class: 'sessionbar__label', text: 'Angemeldet als' }),
        el('div', { class: 'sessionbar__user', text: user.displayName }),
        el('button', { class: 'sessionbar__logout', type: 'button', onClick: logout }, 'Abmelden')
      )
    );
  }

  /**
   * Zeigt den Anmeldebildschirm.
   * @returns {Promise<{username:string, displayName:string}>} Wird nach erfolgreicher Anmeldung erfüllt
   */
  show() {
    this.stage = el('div', { class: 'login__stage' });
    this.overlay = el('div', { class: 'login' }, this.stage);
    document.body.append(this.overlay);

    this.showForm();
    return new Promise((resolve) => {
      this.resolveLogin = resolve;
    });
  }

  /** Zeichnet das Anmeldeformular (auch nach einem Fehlversuch). */
  showForm() {
    const usernameInput = el('input', {
      id: 'login-username',
      class: 'input',
      type: 'text',
      autocomplete: 'username',
      autocapitalize: 'off',
      spellcheck: 'false',
      placeholder: 'z. B. leander',
      value: this.lastUsername,
    });
    const passwordInput = el('input', {
      id: 'login-password',
      class: 'input',
      type: 'password',
      autocomplete: 'current-password',
      placeholder: 'Passwort',
    });
    const submitButton = el('button', { class: 'btn btn--primary login__submit', type: 'submit', text: 'Anmelden' });

    const form = el(
      'form',
      {
        class: 'login__card form',
        novalidate: true,
        onSubmit: async (event) => {
          event.preventDefault();
          submitButton.disabled = true;
          this.lastUsername = usernameInput.value;

          try {
            const user = await window.api.auth.login(usernameInput.value, passwordInput.value);
            this.finish(user);
          } catch (error) {
            this.showFailure(error.message);
          }
        },
      },
      el(
        'div',
        { class: 'login__brand' },
        el('span', { class: 'sidebar__logo', 'aria-hidden': 'true', text: '?' }),
        el('div', {}, el('div', { class: 'login__title', text: 'QuizzApp' }), el('div', { class: 'login__subtitle', text: 'Autorentool' }))
      ),
      el('p', { class: 'login__hint', text: 'Nur für das Entwicklerteam. Bitte melde dich an.' }),
      el('div', { class: 'field' }, el('label', { for: 'login-username', text: 'Benutzername' }), usernameInput),
      el('div', { class: 'field' }, el('label', { for: 'login-password', text: 'Passwort' }), passwordInput),
      submitButton,
      el('div', { class: 'login__footer', text: '© Boehm · Leander · Wolkan' })
    );

    this.stage.replaceChildren(form);
    (this.lastUsername ? passwordInput : usernameInput).focus();
  }

  /**
   * Wechselt vom Formular zum Handy mit dem Video.
   * @param {string} message Fehlermeldung vom Hauptprozess
   */
  showFailure(message) {
    const video = el('video', {
      class: 'phone__video',
      src: FAIL_VIDEO_PATH,
      autoplay: true,
      loop: true,
      playsinline: true,
      'aria-label': 'Video: Zugriff verweigert',
    });
    const screen = el('div', { class: 'phone__screen' }, video);

    // Fehlt die Videodatei, bleibt der Bildschirm nicht leer.
    video.addEventListener('error', () => {
      screen.replaceChildren(el('div', { class: 'phone__fallback' }, el('div', { class: 'phone__fallback-icon', text: '🚫' }), 'Zugriff verweigert'));
    });

    const phone = el(
      'div',
      { class: 'phone', 'aria-hidden': 'false' },
      el('span', { class: 'phone__button phone__button--silent' }),
      el('span', { class: 'phone__button phone__button--volume-up' }),
      el('span', { class: 'phone__button phone__button--volume-down' }),
      el('span', { class: 'phone__button phone__button--power' }),
      el('div', { class: 'phone__body' }, screen, el('span', { class: 'phone__island' }), el('span', { class: 'phone__home-bar' }))
    );

    const retryButton = el('button', { class: 'btn btn--primary', type: 'button', onClick: () => this.showForm() }, 'Nochmal versuchen');

    this.stage.replaceChildren(
      el(
        'div',
        { class: 'login__failure', role: 'alert' },
        phone,
        el('h2', { class: 'login__failure-title', text: 'Falsche Anmeldedaten' }),
        el('p', { class: 'login__failure-text', text: message }),
        retryButton
      )
    );

    video.play().catch(() => {
      /* Autoplay kann blockiert sein; das Video startet dann beim ersten Klick. */
    });
    retryButton.focus();
  }

  /**
   * Schließt den Anmeldebildschirm nach erfolgreicher Anmeldung.
   * @param {{username:string, displayName:string}} user Angemeldeter Benutzer
   */
  finish(user) {
    this.overlay.classList.add('login--leaving');
    setTimeout(() => this.overlay.remove(), 250);
    this.resolveLogin(user);
  }
}
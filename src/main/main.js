'use strict';

const { app, BrowserWindow, Menu, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const Database = require('./database/Database');
const CategoryRepository = require('./database/CategoryRepository');
const DifficultyRepository = require('./database/DifficultyRepository');
const AnswerRepository = require('./database/AnswerRepository');
const QuestionRepository = require('./database/QuestionRepository');

const registerCategoryIpc = require('./ipc/categoryIpc');
const registerQuestionIpc = require('./ipc/questionIpc');

const AuthService = require('./auth/AuthService');
const registerAuthIpc = require('./ipc/authIpc');
const { setAuthGuard } = require('./ipc/ipcHelper');

/** Geöffnete Datenbank; wird beim Beenden der App geschlossen. */
let database = null;

/**
 * Ermittelt den Pfad der Datenbank. Standard ist "data/QuizzApp.db" im
 * Projektordner. Fehlt die Datei dort, darf der Anwender sie auswählen.
 *
 * @returns {string|null} Pfad zur Datenbank oder null, wenn der Dialog abgebrochen wurde
 */
function resolveDatabasePath() {
  const defaultPath = path.join(app.getAppPath(), 'data', 'QuizzApp.db');
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  const selection = dialog.showOpenDialogSync({
    title: 'QuizzApp-Datenbank auswählen',
    filters: [{ name: 'SQLite-Datenbank', extensions: ['db', 'sqlite', 'sqlite3'] }],
    properties: ['openFile'],
  });
  return selection && selection.length > 0 ? selection[0] : null;
}

/**
 * Öffnet die Datenbank, erzeugt die Repositories und registriert die
 * IPC-Kanäle, über die die Oberfläche auf die Daten zugreift.
 *
 * @returns {boolean} true, wenn alles bereit ist
 */
function initializeBackend() {
  const databasePath = resolveDatabasePath();
  if (!databasePath) {
    return false;
  }

  database = new Database(databasePath);

  const categoryRepository = new CategoryRepository(database);
  const difficultyRepository = new DifficultyRepository(database);
  const answerRepository = new AnswerRepository(database);
  const questionRepository = new QuestionRepository(
    database,
    answerRepository,
    categoryRepository,
    difficultyRepository
  );

  registerCategoryIpc(categoryRepository, difficultyRepository);
    registerQuestionIpc(questionRepository);

  // Anmeldung: Alle Datenkanäle sind erst nach erfolgreichem Login erreichbar.
  const authService = new AuthService(path.join(app.getAppPath(), 'data', 'authors.json'));
  setAuthGuard(() => authService.isLoggedIn());
  registerAuthIpc(authService);
  return true;
}

/** Erstellt das Hauptfenster der Anwendung. */
function createMainWindow() {
  const window = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    title: 'QuizzApp Autorentool',
    backgroundColor: '#f4f5fb',
    webPreferences: {
      // Sicherheit: Die Oberfläche bekommt keinen Zugriff auf Node.js.
      // Alles Nötige steht über das Objekt "window.api" bereit (preload.js).
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  try {
    if (!initializeBackend()) {
      app.quit();
      return;
    }
  } catch (error) {
    dialog.showErrorBox('Datenbank konnte nicht geöffnet werden', error.message);
    app.quit();
    return;
  }

  // Die Standard-Menüleiste wird nicht benötigt.
  Menu.setApplicationMenu(null);
  createMainWindow();

  // macOS: Fenster neu erstellen, wenn auf das Dock-Symbol geklickt wird.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  if (database) {
    database.close();
  }
});

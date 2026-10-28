'use strict';

const { handle } = require('./ipcHelper');

/**
 * Registriert die IPC-Kanäle für Kategorien und Schwierigkeitsgrade.
 * Die Oberfläche (Renderer-Prozess) erreicht sie über window.api.categories
 * bzw. window.api.difficulties (siehe preload.js).
 *
 * @param {import('../database/CategoryRepository')} categoryRepository Zugriff auf "category"
 * @param {import('../database/DifficultyRepository')} difficultyRepository Zugriff auf "difficulty"
 */
function registerCategoryIpc(categoryRepository, difficultyRepository) {
  handle('categories:list', () => categoryRepository.findAll());
  handle('categories:create', (payload) => categoryRepository.create(payload));
  handle('categories:update', (id, payload) => categoryRepository.update(id, payload));
  handle('categories:delete', (id) => categoryRepository.delete(id));

  handle('difficulties:list', () => difficultyRepository.findAll());
}

module.exports = registerCategoryIpc;

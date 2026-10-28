'use strict';

/**
 * Legt einen Autor an oder ändert sein Passwort (data/authors.json).
 *
 * Aufruf:
 *   node scripts/set-password.js <benutzername> <passwort> [Anzeigename]
 *
 * Beispiel:
 *   node scripts/set-password.js leander MeinNeuesPasswort Leander
 *
 * Danach die geänderte data/authors.json committen und pushen, damit alle
 * dieselben Zugangsdaten haben.
 */

const fs = require('fs');
const path = require('path');
const AuthService = require('../src/main/auth/AuthService');

const [, , rawUsername, password, displayNameArgument] = process.argv;

if (!rawUsername || !password) {
  console.error('Aufruf: node scripts/set-password.js <benutzername> <passwort> [Anzeigename]');
  process.exit(1);
}
if (password.length < 6) {
  console.error('Das Passwort sollte mindestens 6 Zeichen lang sein.');
  process.exit(1);
}

const filePath = path.join(__dirname, '..', 'data', 'authors.json');
const username = AuthService.normalize(rawUsername);
const authors = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : [];

const existing = authors.find((author) => AuthService.normalize(author.username) === username);
const { salt, hash } = AuthService.hashPassword(password);

if (existing) {
  existing.salt = salt;
  existing.hash = hash;
  if (displayNameArgument) {
    existing.displayName = displayNameArgument;
  }
} else {
  authors.push({ username, displayName: displayNameArgument || rawUsername, salt, hash });
}

fs.mkdirSync(path.dirname(filePath), { recursive: true });
fs.writeFileSync(filePath, `${JSON.stringify(authors, null, 2)}\n`, 'utf8');
console.log(`${existing ? 'Passwort geändert' : 'Autor angelegt'}: ${username}`);
// Cuentas de Corito Dominó (sobre el mismo servidor). Guarda usuarios en
// data/users.json con contraseña hasheada (scrypt). Maneja /api/*.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

let users = {}; // key (username en minúsculas) -> registro
function load() {
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    users = {};
  }
}
function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
load();

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const newToken = () => crypto.randomBytes(24).toString('hex');
const findByToken = (t) =>
  t ? Object.values(users).find((u) => u.token === t) : null;

function publicProfile(u) {
  return {
    username: u.username,
    coins: u.coins,
    rating: u.rating,
    vip: u.vip,
    table: u.table,
    tiles: u.tiles,
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => {
      try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); }
    });
  });
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/// Maneja rutas /api/*. Devuelve true si la atendió.
export async function handleApi(req, res) {
  if (!req.url.startsWith('/api/')) return false;
  const route = req.url.split('?')[0];
  const body = await readBody(req);

  if (route === '/api/register') {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (username.length < 3 || password.length < 4) {
      sendJson(res, 400, { error: 'Usuario (3+ letras) y contraseña (4+) requeridos' });
      return true;
    }
    const key = username.toLowerCase();
    if (users[key]) { sendJson(res, 409, { error: 'Ese usuario ya existe' }); return true; }
    const salt = crypto.randomBytes(16).toString('hex');
    const u = {
      username, salt, hash: hash(password, salt), token: newToken(),
      coins: 1000, rating: 1000, vip: false, table: 'verde', tiles: 'blanco',
      createdAt: Date.now(),
    };
    users[key] = u; save();
    sendJson(res, 200, { token: u.token, profile: publicProfile(u) });
    return true;
  }

  if (route === '/api/login') {
    const key = String(body.username || '').trim().toLowerCase();
    const u = users[key];
    if (!u || u.hash !== hash(String(body.password || ''), u.salt)) {
      sendJson(res, 401, { error: 'Usuario o contraseña incorrectos' });
      return true;
    }
    u.token = newToken(); save();
    sendJson(res, 200, { token: u.token, profile: publicProfile(u) });
    return true;
  }

  if (route === '/api/profile') {
    const u = findByToken(body.token);
    if (!u) { sendJson(res, 401, { error: 'Sesión inválida' }); return true; }
    sendJson(res, 200, { profile: publicProfile(u) });
    return true;
  }

  // Guarda saldo/rating/cosméticos del usuario (v1: el cliente reporta).
  if (route === '/api/sync') {
    const u = findByToken(body.token);
    if (!u) { sendJson(res, 401, { error: 'Sesión inválida' }); return true; }
    if (Number.isFinite(body.coins)) u.coins = Math.max(0, Math.floor(body.coins));
    if (Number.isFinite(body.ratingDelta)) u.rating += Math.floor(body.ratingDelta);
    if (typeof body.table === 'string') u.table = body.table;
    if (typeof body.tiles === 'string') u.tiles = body.tiles;
    if (typeof body.vip === 'boolean') u.vip = body.vip;
    save();
    sendJson(res, 200, { profile: publicProfile(u) });
    return true;
  }

  sendJson(res, 404, { error: 'Ruta no encontrada' });
  return true;
}

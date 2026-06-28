// Cuentas + amigos + historial de Corito Dominó. Usa la capa `store` (Postgres
// si hay DATABASE_URL, si no archivo JSON). Maneja todas las rutas /api/*.
import crypto from 'crypto';
import { store } from './store.js';
import { isOnline } from './presence.js';

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const newToken = () => crypto.randomBytes(24).toString('hex');

function publicProfile(u) {
  return {
    username: u.username,
    coins: u.coins,
    rating: u.rating,
    vip: u.vip,
    table: u.table,
    tiles: u.tiles,
    owned: u.owned || 'mesa_verde,ficha_blanco',
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

  // ───────────────── Cuentas ─────────────────
  if (route === '/api/register') {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (username.length < 3 || password.length < 4) {
      sendJson(res, 400, { error: 'Usuario (3+ letras) y contraseña (4+) requeridos' });
      return true;
    }
    const key = username.toLowerCase();
    if (await store.getUserByName(key)) {
      sendJson(res, 409, { error: 'Ese usuario ya existe' }); return true;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const u = {
      key, username, salt, hash: hash(password, salt), token: newToken(),
      coins: 1000, rating: 1000, vip: false, table: 'verde', tiles: 'blanco',
      owned: 'mesa_verde,ficha_blanco',
      createdAt: Date.now(),
    };
    await store.createUser(u);
    sendJson(res, 200, { token: u.token, profile: publicProfile(u) });
    return true;
  }

  if (route === '/api/login') {
    const key = String(body.username || '').trim().toLowerCase();
    const u = await store.getUserByName(key);
    if (!u || u.hash !== hash(String(body.password || ''), u.salt)) {
      sendJson(res, 401, { error: 'Usuario o contraseña incorrectos' });
      return true;
    }
    const token = newToken();
    await store.setToken(key, token);
    sendJson(res, 200, { token, profile: publicProfile(u) });
    return true;
  }

  if (route === '/api/profile') {
    const u = await store.getUserByToken(body.token);
    if (!u) { sendJson(res, 401, { error: 'Sesión inválida' }); return true; }
    sendJson(res, 200, { profile: publicProfile(u) });
    return true;
  }

  if (route === '/api/sync') {
    const u = await store.getUserByToken(body.token);
    if (!u) { sendJson(res, 401, { error: 'Sesión inválida' }); return true; }
    const f = {};
    if (Number.isFinite(body.coins)) f.coins = Math.max(0, Math.floor(body.coins));
    if (Number.isFinite(body.ratingDelta)) f.rating = (u.rating || 1000) + Math.floor(body.ratingDelta);
    if (typeof body.table === 'string') f.table = body.table;
    if (typeof body.tiles === 'string') f.tiles = body.tiles;
    if (typeof body.owned === 'string') f.owned = body.owned;
    if (typeof body.vip === 'boolean') f.vip = body.vip;
    await store.updateUser(u.key || u.username, f);
    sendJson(res, 200, { profile: publicProfile({ ...u, ...f }) });
    return true;
  }

  // ───────────────── Amigos ─────────────────
  if (route === '/api/friends') {
    const u = await store.getUserByToken(body.token);
    if (!u) { sendJson(res, 401, { error: 'Sesión inválida' }); return true; }
    const names = await store.getFriends(u.username);
    const friends = names.map((n) => ({ username: n, online: isOnline(n) }));
    const requests = await store.getRequests(u.username);
    sendJson(res, 200, { friends, requests });
    return true;
  }

  if (route === '/api/friends/request') {
    const u = await store.getUserByToken(body.token);
    if (!u) { sendJson(res, 401, { error: 'Sesión inválida' }); return true; }
    const targetName = String(body.to || '').trim();
    if (!targetName) { sendJson(res, 400, { error: 'Falta el usuario' }); return true; }
    if (targetName.toLowerCase() === u.username.toLowerCase()) {
      sendJson(res, 400, { error: 'No puedes agregarte a ti mismo' }); return true;
    }
    const target = await store.getUserByName(targetName);
    if (!target) { sendJson(res, 404, { error: 'No existe ese usuario' }); return true; }
    // Si el otro ya me había enviado solicitud, aceptamos directo.
    const myReqs = (await store.getRequests(u.username)).map((s) => s.toLowerCase());
    if (myReqs.includes(targetName.toLowerCase())) {
      await store.respondRequest(u.username, target.username, true);
      sendJson(res, 200, { ok: true, becameFriends: true });
      return true;
    }
    await store.addFriendRequest(u.username, target.username);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (route === '/api/friends/respond') {
    const u = await store.getUserByToken(body.token);
    if (!u) { sendJson(res, 401, { error: 'Sesión inválida' }); return true; }
    const from = String(body.from || '').trim();
    await store.respondRequest(u.username, from, body.accept === true);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (route === '/api/friends/remove') {
    const u = await store.getUserByToken(body.token);
    if (!u) { sendJson(res, 401, { error: 'Sesión inválida' }); return true; }
    await store.removeFriend(u.username, String(body.username || '').trim());
    sendJson(res, 200, { ok: true });
    return true;
  }

  // ───────────────── Historial ─────────────────
  if (route === '/api/history') {
    const u = await store.getUserByToken(body.token);
    if (!u) { sendJson(res, 401, { error: 'Sesión inválida' }); return true; }
    const matches = await store.getHistory(u.username, 30);
    sendJson(res, 200, { matches });
    return true;
  }

  if (route === '/api/match') {
    const u = await store.getUserByToken(body.token);
    if (!u) { sendJson(res, 401, { error: 'Sesión inválida' }); return true; }
    await store.addMatch(u.username, {
      playedAt: Date.now(),
      mode: String(body.mode || 'clasico'),
      players: Math.floor(body.players || 2),
      won: body.won === true,
      myScore: Math.floor(body.myScore || 0),
      oppScore: Math.floor(body.oppScore || 0),
      ratingDelta: Math.floor(body.ratingDelta || 0),
      coinNet: Math.floor(body.coinNet || 0),
      detail: String(body.detail || ''),
    });
    sendJson(res, 200, { ok: true });
    return true;
  }

  sendJson(res, 404, { error: 'Ruta no encontrada' });
  return true;
}

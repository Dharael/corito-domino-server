// Capa de almacenamiento de Corito Dominó.
//
// Si existe la variable de entorno DATABASE_URL (Postgres de Render), guarda
// TODO en Postgres (cuentas, amigos, solicitudes, historial) → permanente.
// Si NO existe, cae automáticamente a un archivo JSON local (data/users.json),
// para que el servidor siga funcionando sin configurar nada (no permanente).
//
// Interfaz (toda async):
//   getUserByName(name)         → registro o null
//   getUserByToken(token)       → registro o null
//   createUser(rec)             → inserta
//   updateUser(name, fields)    → actualiza campos sueltos
//   setToken(name, token)
//   addFriendRequest(from, to)
//   getRequests(name)           → [usernames] pendientes hacia 'name'
//   respondRequest(name, from, accept)
//   getFriends(name)            → [usernames]
//   removeFriend(name, other)
//   addMatch(name, row)         → guarda una partida en el historial
//   getHistory(name, limit)     → [partidas] más recientes primero
//
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USE_PG = !!process.env.DATABASE_URL;

// ───────────────────────── Implementación Postgres ─────────────────────────
let pool = null;
async function pgInit() {
  const { default: pg } = await import('pg');
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Render exige SSL
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      key        TEXT PRIMARY KEY,
      username   TEXT NOT NULL,
      salt       TEXT NOT NULL,
      hash       TEXT NOT NULL,
      token      TEXT,
      coins      INTEGER DEFAULT 1000,
      rating     INTEGER DEFAULT 1000,
      vip        BOOLEAN DEFAULT FALSE,
      "table"    TEXT DEFAULT 'verde',
      tiles      TEXT DEFAULT 'blanco',
      created_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS friends (
      a TEXT NOT NULL,
      b TEXT NOT NULL,
      PRIMARY KEY (a, b)
    );
    CREATE TABLE IF NOT EXISTS friend_requests (
      from_key TEXT NOT NULL,
      to_key   TEXT NOT NULL,
      created_at BIGINT,
      PRIMARY KEY (from_key, to_key)
    );
    CREATE TABLE IF NOT EXISTS matches (
      id         SERIAL PRIMARY KEY,
      user_key   TEXT NOT NULL,
      played_at  BIGINT,
      mode       TEXT,
      players    INTEGER,
      won        BOOLEAN,
      my_score   INTEGER,
      opp_score  INTEGER,
      rating_delta INTEGER,
      coin_net   INTEGER,
      detail     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_key);
    CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
  `);
  console.log('[store] Postgres conectado y tablas listas.');
}

const pgStore = {
  async getUserByName(name) {
    const r = await pool.query('SELECT * FROM users WHERE key=$1', [name.toLowerCase()]);
    return r.rows[0] || null;
  },
  async getUserByToken(token) {
    if (!token) return null;
    const r = await pool.query('SELECT * FROM users WHERE token=$1', [token]);
    return r.rows[0] || null;
  },
  async createUser(u) {
    await pool.query(
      `INSERT INTO users (key, username, salt, hash, token, coins, rating, vip, "table", tiles, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [u.key, u.username, u.salt, u.hash, u.token, u.coins, u.rating, u.vip, u.table, u.tiles, u.createdAt]
    );
  },
  async updateUser(name, f) {
    const key = name.toLowerCase();
    const sets = [], vals = [];
    let i = 1;
    for (const [k, v] of Object.entries(f)) {
      sets.push(`${k === 'table' ? '"table"' : k}=$${i++}`);
      vals.push(v);
    }
    if (!sets.length) return;
    vals.push(key);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE key=$${i}`, vals);
  },
  async setToken(name, token) {
    await pool.query('UPDATE users SET token=$1 WHERE key=$2', [token, name.toLowerCase()]);
  },
  async addFriendRequest(from, to) {
    await pool.query(
      `INSERT INTO friend_requests (from_key, to_key, created_at) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`,
      [from.toLowerCase(), to.toLowerCase(), Date.now()]
    );
  },
  async getRequests(name) {
    const r = await pool.query(
      `SELECT u.username FROM friend_requests fr JOIN users u ON u.key=fr.from_key
       WHERE fr.to_key=$1 ORDER BY fr.created_at DESC`,
      [name.toLowerCase()]
    );
    return r.rows.map((x) => x.username);
  },
  async respondRequest(name, from, accept) {
    const me = name.toLowerCase(), other = from.toLowerCase();
    await pool.query('DELETE FROM friend_requests WHERE from_key=$1 AND to_key=$2', [other, me]);
    if (accept) {
      await pool.query('INSERT INTO friends (a,b) VALUES ($1,$2) ON CONFLICT DO NOTHING', [me, other]);
      await pool.query('INSERT INTO friends (a,b) VALUES ($1,$2) ON CONFLICT DO NOTHING', [other, me]);
    }
  },
  async getFriends(name) {
    const r = await pool.query(
      `SELECT u.username FROM friends f JOIN users u ON u.key=f.b WHERE f.a=$1 ORDER BY u.username`,
      [name.toLowerCase()]
    );
    return r.rows.map((x) => x.username);
  },
  async removeFriend(name, other) {
    const me = name.toLowerCase(), o = other.toLowerCase();
    await pool.query('DELETE FROM friends WHERE (a=$1 AND b=$2) OR (a=$2 AND b=$1)', [me, o]);
  },
  async addMatch(name, m) {
    await pool.query(
      `INSERT INTO matches (user_key, played_at, mode, players, won, my_score, opp_score, rating_delta, coin_net, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [name.toLowerCase(), m.playedAt, m.mode, m.players, m.won, m.myScore, m.oppScore, m.ratingDelta, m.coinNet, m.detail]
    );
  },
  async getHistory(name, limit = 30) {
    const r = await pool.query(
      `SELECT played_at, mode, players, won, my_score, opp_score, rating_delta, coin_net, detail
       FROM matches WHERE user_key=$1 ORDER BY played_at DESC LIMIT $2`,
      [name.toLowerCase(), limit]
    );
    return r.rows.map((x) => ({
      playedAt: Number(x.played_at), mode: x.mode, players: x.players, won: x.won,
      myScore: x.my_score, oppScore: x.opp_score, ratingDelta: x.rating_delta,
      coinNet: x.coin_net, detail: x.detail,
    }));
  },
};

// ───────────────────────── Implementación archivo JSON ─────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'users.json');
let db = { users: {}, friends: {}, requests: {}, matches: {} };
function fileLoad() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    // Compatibilidad: el formato viejo era directamente {key: user}.
    if (raw.users) db = { friends: {}, requests: {}, matches: {}, ...raw };
    else db = { users: raw, friends: {}, requests: {}, matches: {} };
  } catch {
    db = { users: {}, friends: {}, requests: {}, matches: {} };
  }
}
function fileSave() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}
fileLoad();

const fileStore = {
  async getUserByName(name) { return db.users[name.toLowerCase()] || null; },
  async getUserByToken(token) {
    return token ? Object.values(db.users).find((u) => u.token === token) || null : null;
  },
  async createUser(u) { db.users[u.key] = u; fileSave(); },
  async updateUser(name, f) {
    const u = db.users[name.toLowerCase()];
    if (u) { Object.assign(u, f); fileSave(); }
  },
  async setToken(name, token) {
    const u = db.users[name.toLowerCase()];
    if (u) { u.token = token; fileSave(); }
  },
  async addFriendRequest(from, to) {
    const t = to.toLowerCase();
    (db.requests[t] ||= []);
    if (!db.requests[t].includes(from.toLowerCase())) db.requests[t].push(from.toLowerCase());
    fileSave();
  },
  async getRequests(name) {
    return (db.requests[name.toLowerCase()] || [])
      .map((k) => db.users[k]?.username).filter(Boolean);
  },
  async respondRequest(name, from, accept) {
    const me = name.toLowerCase(), other = from.toLowerCase();
    db.requests[me] = (db.requests[me] || []).filter((k) => k !== other);
    if (accept) {
      (db.friends[me] ||= []); (db.friends[other] ||= []);
      if (!db.friends[me].includes(other)) db.friends[me].push(other);
      if (!db.friends[other].includes(me)) db.friends[other].push(me);
    }
    fileSave();
  },
  async getFriends(name) {
    return (db.friends[name.toLowerCase()] || [])
      .map((k) => db.users[k]?.username).filter(Boolean);
  },
  async removeFriend(name, other) {
    const me = name.toLowerCase(), o = other.toLowerCase();
    db.friends[me] = (db.friends[me] || []).filter((k) => k !== o);
    db.friends[o] = (db.friends[o] || []).filter((k) => k !== me);
    fileSave();
  },
  async addMatch(name, m) {
    const k = name.toLowerCase();
    (db.matches[k] ||= []).unshift(m);
    if (db.matches[k].length > 50) db.matches[k] = db.matches[k].slice(0, 50);
    fileSave();
  },
  async getHistory(name, limit = 30) {
    return (db.matches[name.toLowerCase()] || []).slice(0, limit);
  },
};

export const store = USE_PG ? pgStore : fileStore;
export const usingPostgres = USE_PG;
export async function initStore() {
  if (USE_PG) await pgInit();
  else console.log('[store] Modo ARCHIVO (data/users.json). Define DATABASE_URL para Postgres permanente.');
}
export { crypto };

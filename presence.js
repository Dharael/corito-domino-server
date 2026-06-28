// Presencia online: qué usuarios (por su token) están conectados ahora mismo
// por WebSocket. Lo usa el WS (server.js) para marcar entrada/salida y la API
// de amigos (auth.js) para decir quién está en línea.
import { store } from './store.js';

const counts = new Map(); // key (username minúsculas) -> nº de conexiones

export async function markOnlineByToken(token) {
  const u = await store.getUserByToken(token);
  if (!u) return null;
  const key = u.key || u.username.toLowerCase();
  counts.set(key, (counts.get(key) || 0) + 1);
  return key;
}

export function markOffline(key) {
  if (!key) return;
  const n = (counts.get(key) || 0) - 1;
  if (n <= 0) counts.delete(key);
  else counts.set(key, n);
}

export function isOnline(key) {
  return counts.has((key || '').toLowerCase());
}

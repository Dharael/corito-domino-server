// Servidor de Corito Dominó: sirve la PÁGINA WEB del juego (carpeta ./public) y
// además maneja el MULTIJUGADOR (WebSocket) en el MISMO puerto. Así un solo
// enlace/túnel sirve para todo y tu amigo solo abre el link en Safari/Chrome.
//
//   npm install
//   npm start            (puerto 8080 por defecto)
//
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { handleApi } from './auth.js';

const PORT = process.env.PORT || 8080;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.bin': 'application/octet-stream',
};

const server = http.createServer(async (req, res) => {
  // Cuentas / API primero.
  if (await handleApi(req, res)) return;

  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  let filePath = path.join(PUBLIC, urlPath);
  // Evitar salir de PUBLIC.
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: cualquier ruta desconocida → index.html.
      fs.readFile(path.join(PUBLIC, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404); res.end('No web build. Pon el build de Flutter en ./public'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(idx);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ─── Multijugador (WebSocket) sobre el mismo servidor http ───
const wss = new WebSocketServer({ server });

/** code -> { clients: Map<id, ws>, nextId, names: Map<id,string> } */
const rooms = new Map();
const makeCode = () => {
  let c;
  do { c = Math.floor(1000 + Math.random() * 9000).toString(); } while (rooms.has(c));
  return c;
};
const send = (ws, obj) => { if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); };
const roomPlayers = (room) => [...room.names.entries()].map(([id, name]) => ({ id, name }));
const broadcast = (room, obj, exceptId = null) => {
  for (const [id, ws] of room.clients) if (id !== exceptId) send(ws, obj);
};

wss.on('connection', (ws) => {
  ws.roomCode = null; ws.id = null;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }

    if (m.t === 'create') {
      const code = makeCode();
      const room = { clients: new Map(), names: new Map(), nextId: 0 };
      rooms.set(code, room);
      const id = room.nextId++;
      room.clients.set(id, ws); room.names.set(id, m.name || 'Anfitrión');
      ws.roomCode = code; ws.id = id;
      send(ws, { t: 'created', code, id, players: roomPlayers(room) });
      return;
    }
    if (m.t === 'join') {
      const room = rooms.get(m.code);
      if (!room) { send(ws, { t: 'error', msg: 'Sala no encontrada' }); return; }
      if (room.clients.size >= 4) { send(ws, { t: 'error', msg: 'Sala llena' }); return; }
      const id = room.nextId++;
      room.clients.set(id, ws); room.names.set(id, m.name || `Jugador ${id}`);
      ws.roomCode = m.code; ws.id = id;
      send(ws, { t: 'joined', code: m.code, id, players: roomPlayers(room) });
      broadcast(room, { t: 'players', players: roomPlayers(room) });
      return;
    }
    if (m.t === 'msg') {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const payload = { t: 'msg', from: ws.id, data: m.data };
      if (m.to === undefined || m.to === null) broadcast(room, payload, ws.id);
      else send(room.clients.get(m.to), payload);
      return;
    }
  });
  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    room.clients.delete(ws.id); room.names.delete(ws.id);
    if (room.clients.size === 0) rooms.delete(ws.roomCode);
    else broadcast(room, { t: 'left', id: ws.id, players: roomPlayers(room) });
  });
});

server.listen(PORT, () => {
  console.log(`Corito Dominó (web + multijugador) en http://localhost:${PORT}`);
});

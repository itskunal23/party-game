import 'dotenv/config';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createApp } from './lib/create-app.js';
import {
  createRoom, joinRoom, rejoinRoom, startGame,
  handleIntent, logDrink, skipDrink, removePlayer,
  assignDrink, getRoom, cleanupExpiredRooms
} from './lib/rooms.js';

const PORT = process.env.PORT ?? 3000;
const app = createApp();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Track socket → player mapping for disconnect handling
const socketMeta = new WeakMap();

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    try {
      const { type, roomCode, playerName, sessionToken, rank, targetId,
              drink, scenario, profile } = msg;

      if (type === 'create') {
        createRoom(ws, playerName ?? 'Host', profile ?? {});
      }

      else if (type === 'join') {
        joinRoom(ws, roomCode, playerName ?? 'Player', profile ?? {});
      }

      else if (type === 'rejoin') {
        rejoinRoom(ws, roomCode, sessionToken);
      }

      else if (type === 'start') {
        const meta = getMetaFromSocket(ws);
        if (meta) startGame(meta.roomCode, meta.playerId);
      }

      else if (type === 'ask') {
        const meta = getMetaFromSocket(ws);
        if (!meta) return;
        const room = getRoom(meta.roomCode);
        if (!room) return;
        handleIntent(room, { type: 'ask', fromId: meta.playerId, targetId, rank });
      }

      else if (type === 'logDrink') {
        const meta = getMetaFromSocket(ws);
        if (meta) logDrink(meta.roomCode, meta.playerId, drink);
      }

      else if (type === 'skipDrink') {
        const meta = getMetaFromSocket(ws);
        if (meta) skipDrink(meta.roomCode, meta.playerId, scenario);
      }

      else if (type === 'chooseDrink') {
        const meta = getMetaFromSocket(ws);
        if (meta) assignDrink(meta.roomCode, meta.playerId, msg);
      }

      else if (type === 'playAgain') {
        const meta = getMetaFromSocket(ws);
        if (meta) startGame(meta.roomCode, meta.playerId);
      }

      else if (type === 'leave') {
        const meta = getMetaFromSocket(ws);
        if (meta) removePlayer(meta.roomCode, meta.playerId);
      }

      // Client confirms their identity after receiving roomCreated/joined/rejoined
      else if (type === 'identify') {
        socketMeta.set(ws, { roomCode: msg.roomCode, playerId: msg.playerId });
      }

    } catch (err) {
      // Silently drop malformed messages
      console.error('WS message error:', err.message);
    }
  });

  ws.on('close', () => {
    const meta = getMetaFromSocket(ws);
    if (meta) removePlayer(meta.roomCode, meta.playerId);
  });

  ws.on('error', () => { ws.terminate(); });
});

function getMetaFromSocket(ws) {
  return socketMeta.get(ws) ?? null;
}

// Heartbeat — drop dead connections every 30s
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);

// Room cleanup every 30 minutes
const cleanup = setInterval(cleanupExpiredRooms, 30 * 60 * 1000);

wss.on('close', () => {
  clearInterval(heartbeat);
  clearInterval(cleanup);
});

server.listen(PORT, () => {
  console.log(`GFY server running on http://localhost:${PORT}`);
  console.log(`AI enabled: ${!!process.env.NVIDIA_API_KEY}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

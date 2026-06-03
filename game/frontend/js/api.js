const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

let socket = null;
let handlers = {};
let outboundQueue = [];
let reconnectDelay = 1000;
let reconnectTimer = null;
let currentRoomCode = null;
let currentPlayerId = null;
let currentToken = null;

export function onMessage(type, fn) {
  handlers[type] = fn;
}

export function send(msg) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  } else {
    outboundQueue.push(msg);
  }
}

function flushQueue() {
  while (outboundQueue.length && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(outboundQueue.shift()));
  }
}

function dispatch(msg) {
  const fn = handlers[msg.type] ?? handlers['*'];
  if (fn) fn(msg);

  // Cache identity from server
  if (msg.type === 'roomCreated') {
    currentRoomCode = msg.roomCode;
    currentPlayerId = msg.playerId;
    currentToken = msg.sessionToken;
    localStorage.setItem('gfy_room', msg.roomCode);
    localStorage.setItem('gfy_pid', msg.playerId);
    localStorage.setItem('gfy_token', msg.sessionToken);
    send({ type: 'identify', roomCode: msg.roomCode, playerId: msg.playerId });
  }
  if (msg.type === 'joined') {
    currentRoomCode = msg.roomCode;
    currentPlayerId = msg.playerId;
    currentToken = msg.sessionToken;
    localStorage.setItem('gfy_room', msg.roomCode);
    localStorage.setItem('gfy_pid', msg.playerId);
    localStorage.setItem('gfy_token', msg.sessionToken);
    send({ type: 'identify', roomCode: msg.roomCode, playerId: msg.playerId });
  }
  if (msg.type === 'rejoined') {
    currentRoomCode = msg.roomCode;
    currentPlayerId = msg.playerId;
    send({ type: 'identify', roomCode: msg.roomCode, playerId: msg.playerId });
  }
}

function attemptRejoin() {
  const room = currentRoomCode ?? localStorage.getItem('gfy_room');
  const token = currentToken ?? localStorage.getItem('gfy_token');
  if (room && token) {
    send({ type: 'rejoin', roomCode: room, sessionToken: token });
  }
}

function connect() {
  if (socket && socket.readyState <= WebSocket.OPEN) return;

  socket = new WebSocket(WS_URL);

  socket.addEventListener('open', () => {
    reconnectDelay = 1000;
    clearTimeout(reconnectTimer);
    flushQueue();
    if (currentRoomCode && currentToken) attemptRejoin();
    dispatch({ type: 'connected' });
  });

  socket.addEventListener('message', e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    dispatch(msg);
  });

  socket.addEventListener('close', () => {
    dispatch({ type: 'disconnected' });
    scheduleReconnect();
  });

  socket.addEventListener('error', () => {
    socket.close();
  });
}

function scheduleReconnect() {
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    connect();
  }, reconnectDelay);
}

export function getMyId() { return currentPlayerId; }
export function getMyRoom() { return currentRoomCode; }

export function init() { connect(); }

// REST helpers
export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

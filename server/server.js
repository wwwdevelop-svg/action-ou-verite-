const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// rooms: { ROOMCODE: { players: [names], hostSocketId } }
const rooms = {};

function makeCode(){ return Math.random().toString(36).slice(2,7).toUpperCase(); }

io.on('connection', (socket) => {
  console.log('ws: connection', socket.id);

  socket.on('create_room', ({ name }, cb) => {
    const code = makeCode();
    rooms[code] = { players: [{ id: socket.id, name }], host: socket.id };
    socket.join(code);
    cb && cb({ ok: true, code, players: rooms[code].players, host: rooms[code].host });
    io.to(code).emit('room:update', { players: rooms[code].players, host: rooms[code].host });
  });

  socket.on('join_room', ({ name, code }, cb) => {
    if(!rooms[code]) return cb && cb({ ok: false, error: 'Salon introuvable' });
    rooms[code].players.push({ id: socket.id, name });
    socket.join(code);
    cb && cb({ ok: true, code, players: rooms[code].players, host: rooms[code].host });
    io.to(code).emit('room:update', { players: rooms[code].players, host: rooms[code].host });
  });

  socket.on('start_game', ({ code }) => {
    if(!rooms[code]) return;
    io.to(code).emit('game:start');
  });

  socket.on('chat_message', ({ code, text, name }) => {
    if(!rooms[code]) return;
    io.to(code).emit('chat:message', { text, name, time: Date.now() });
  });

  // speaking (voice activity) reporting
  socket.on('speaking', ({ code, speaking, level }) => {
    if(!rooms[code]) return;
    io.to(code).emit('player:speaking', { id: socket.id, speaking, level });
  });

  // moderation endpoints - only host can trigger
  socket.on('mod:request_cam', ({ code, targetId }, cb) => {
    const room = rooms[code]; if(!room) return cb && cb({ ok: false, error: 'Salon introuvable' });
    if(room.host !== socket.id) return cb && cb({ ok: false, error: 'Forbidden' });
    io.to(targetId).emit('mod:request_cam', { from: socket.id });
    cb && cb({ ok: true });
  });

  socket.on('mod:disable_cam', ({ code, targetId }, cb) => {
    const room = rooms[code]; if(!room) return cb && cb({ ok: false, error: 'Salon introuvable' });
    if(room.host !== socket.id) return cb && cb({ ok: false, error: 'Forbidden' });
    io.to(targetId).emit('mod:disable_cam', { from: socket.id });
    cb && cb({ ok: true });
  });

  socket.on('mod:force_mic', ({ code, targetId, action }, cb) => {
    const room = rooms[code]; if(!room) return cb && cb({ ok: false, error: 'Salon introuvable' });
    if(room.host !== socket.id) return cb && cb({ ok: false, error: 'Forbidden' });
    // action: 'enable' or 'disable'
    io.to(targetId).emit('mod:force_mic', { from: socket.id, action });
    cb && cb({ ok: true });
  });

  socket.on('disconnecting', () => {
    const joined = Array.from(socket.rooms).filter(r => r !== socket.id);
    joined.forEach(code => {
      const room = rooms[code];
      if(!room) return;
      room.players = room.players.filter(p => p.id !== socket.id);
      if(room.players.length === 0) delete rooms[code];
      else io.to(code).emit('room:update', room.players);
    });
  });

  // simple signaling placeholders for future WebRTC
  socket.on('webrtc:signal', ({ code, toId, data }) => {
    io.to(toId).emit('webrtc:signal', { from: socket.id, data });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on :${PORT}`));

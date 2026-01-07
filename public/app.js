// client-side app.js (module) - Socket.IO integration
const socket = io();

const $ = id => document.getElementById(id);
const players = [];
let roomCode = null;
let localStream = null;

// DOM bindings
document.getElementById('createBtn').addEventListener('click', ()=> {
  const name = $('username').value.trim() || 'Joueur';
  socket.emit('create_room', { name }, (res) => {
    if(res.ok){ roomCode = res.code; $('code').textContent = roomCode; showLobby(res.players); }
  });
});

document.getElementById('joinBtn').addEventListener('click', ()=> {
  const name = $('username').value.trim() || 'Joueur';
  const code = $('roomCode').value.trim().toUpperCase();
  if(!code) return alert('Renseigne un code');
  socket.emit('join_room', { name, code }, (res) => {
    if(!res.ok) return alert(res.error);
    roomCode = res.code; $('code').textContent = roomCode; showLobby(res.players);
  });
});

document.getElementById('startGameBtn').addEventListener('click', ()=> {
  socket.emit('start_game', { code: roomCode });
});

document.getElementById('sendMsgBtn').addEventListener('click', ()=> {
  const text = $('msg').value.trim(); if(!text) return;
  const name = $('username').value || 'Moi';
  socket.emit('chat_message', { code: roomCode, text, name });
  $('msg').value = '';
});

function showLobby(pls){
  hide($('home')); show($('lobby'));
  const ul = $('players'); ul.innerHTML = '';
  pls.forEach(p => { const li = document.createElement('li'); li.textContent = p.name; ul.appendChild(li); });
}

// socket handlers
socket.on('room:update', (pls) => {
  if(!roomCode) return; const ul = $('players'); ul.innerHTML = '';
  pls.forEach(p => { const li = document.createElement('li'); li.textContent = p.name; ul.appendChild(li); });
});

socket.on('chat:message', ({ name, text, time }) => {
  const m = document.createElement('div'); m.innerHTML = `<strong class="small">${name}</strong> <span class="small">[${new Date(time).toLocaleTimeString()}]</span>: ${text}`;
  $('messages').appendChild(m); $('messages').scrollTop = $('messages').scrollHeight;
});

socket.on('game:start', ()=>{
  hide($('lobby')); show($('game'));
  // simple single-player turn simulation: set current turn to first player
  $('turn').textContent = 'Début du jeu ! Choisis Action ou Vérité';
});

// camera controls (local only for now)
document.getElementById('startCamBtn').addEventListener('click', async ()=>{
  try{ localStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true }); $('localVideo').srcObject = localStream; show($('webcamMenu')); }
  catch(e){ alert('Accès refusé à la caméra'); }
});
document.getElementById('stopCamBtn').addEventListener('click', ()=>{
  if(!localStream) return; localStream.getTracks().forEach(t=>t.stop()); $('localVideo').srcObject = null; localStream = null;
});

// simple UI helpers
function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

// Keep earlier game logic available locally (random prompts)
const modePrompts = {
  classic: { action: ["Fais 10 jumping jacks","Chante un refrain"], truth:["Ton premier crush?","Ta plus grande peur?"] },
  adult: { action:["Envoie un DM coquin"], truth:["Ton plus grand secret intime?"] },
  extreme: { action:["Mange quelque chose d'étrange"], truth:["As-tu déjà été arrêté?"] }
};

document.getElementById('actionBtn').addEventListener('click', ()=> choose('action'));
document.getElementById('truthBtn').addEventListener('click', ()=> choose('truth'));
document.getElementById('refuseBtn').addEventListener('click', ()=> { $('challenge').textContent = 'Action refusée — pénalité !'; setTimeout(()=>{ $('challenge').textContent=''; },2000); });

function choose(kind){ const mode = $('mode').value; const arr = modePrompts[mode][kind]; const p = arr[Math.floor(Math.random()*arr.length)]; $('challenge').textContent = p; startTimer(); }

let timerInt=null; let timeLeft=30;
function startTimer(){ clearInterval(timerInt); timeLeft=30; $('timer').textContent = `⏱️ ${timeLeft}`; timerInt=setInterval(()=>{ timeLeft--; $('timer').textContent = `⏱️ ${timeLeft}`; if(timeLeft<=0){ clearInterval(timerInt); $('challenge').textContent += ' — Temps écoulé!'; } },1000); }

// initial simple state
document.addEventListener('DOMContentLoaded', ()=>{});

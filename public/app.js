// client-side app.js (module) - Socket.IO integration
const socket = io();

// ====================== VARIABLES ======================
const $ = id => document.getElementById(id);
let room, user;
let localStream, peerConnections = {};
let countdown, time = 30;
let micEnabled = true;
let modeSelect = document.getElementById("mode");

const challenge = document.getElementById("challenge");
const timer = document.getElementById("timer");
const localVideo = document.getElementById("localVideo");
const webcamMenu = document.getElementById("webcamMenu");

const players = [];
let roomCode = null;

// ------------------ DOM bindings ------------------
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

// ------------------ helpers ------------------
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
  $('turn').textContent = 'Début du jeu ! Choisis Action ou Vérité';
});

// simple UI helpers
function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

// ====================== ACTIONS / VÉRITÉS ======================
function random(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

const classicActionParts = {
  verbs:["Imite","Complimente","Fais rire","Ignore","Regarde","Fais semblant d'être","Danse comme","Parle comme"],
  targets:["le joueur à gauche","le joueur à droite","un personnage célèbre","un super-héros"],
  constraints:["pendant 10 secondes","pendant 20 secondes","sans parler","en exagérant"]
};
const classicTruthParts = { starters:["Quelle est la dernière fois que","As-tu déjà"], subjects:["tu étais à l'école","tu étais enfant"] };

const adultActionParts = { verbs:["Regarde","Complimente","Fais un clin d’œil à"], targets:["la caméra","un joueur"], constraints:["pendant 10 secondes","avec assurance"] };
const adultTruthParts = { starters:["Qu’est-ce qui t’attire quand","As-tu déjà ressenti quelque chose quand"], subjects:["quelqu’un te regarde","tu plais à quelqu’un"] };

const extremeActionParts = { verbs:["Fixe","Avoue quelque chose à","Active ta webcam et regarde"], targets:["la caméra","le groupe"], constraints:["pendant 15 secondes","sans rire","avec intensité"] };
const extremeTruthParts = { starters:["Quelle est la chose que tu caches quand","As-tu déjà ressenti quelque chose de fort quand"], subjects:["tu es attiré(e)","tu perds le contrôle"] };

function generateClassicAction(){return `${random(classicActionParts.verbs)} ${random(classicActionParts.targets)} ${random(classicActionParts.constraints)}.`;}
function generateClassicTruth(){return `${random(classicTruthParts.starters)} ${random(classicTruthParts.subjects)} ?`; }

function generateAdultAction(){return `${random(adultActionParts.verbs)} ${random(adultActionParts.targets)} ${random(adultActionParts.constraints)}.`;}
function generateAdultTruth(){return `${random(adultTruthParts.starters)} ${random(adultTruthParts.subjects)} ?`; }

function generateExtremeAction(){return `${random(extremeActionParts.verbs)} ${random(extremeActionParts.targets)} ${random(extremeActionParts.constraints)}.`;}
function generateExtremeTruth(){return `${random(extremeTruthParts.starters)} ${random(extremeTruthParts.subjects)} ?`; }

function choose(type){
  clearInterval(countdown);
  startTimer();
  let mode = modeSelect.value;
  if(mode==="classic"){ challenge.textContent = type==="action"?generateClassicAction():generateClassicTruth(); }
  if(mode==="adult"){ challenge.textContent = type==="action"?generateAdultAction():generateAdultTruth(); }
  if(mode==="extreme"){ challenge.textContent = type==="action"?generateExtremeAction():generateExtremeTruth(); }
}

// ====================== TIMER ======================
function startTimer(){ time=30; timer.textContent="⏱️ "+time;
  countdown=setInterval(()=>{time--; timer.textContent="⏱️ "+time; if(time<=0){clearInterval(countdown); challenge.textContent="⏰ Temps écoulé !"; stopCam();}},1000);
}

// ====================== WEBCAM / MICRO ======================
async function startCam(){
  localStream = await navigator.mediaDevices.getUserMedia({video:true,audio:true});
  localVideo.srcObject = localStream;
  localStream.getTracks().forEach(track=>{ for(let id in peerConnections) peerConnections[id].addTrack(track,localStream); });
  webcamMenu.classList.remove("hidden");
}
function stopCam(){ if(localStream) localStream.getTracks().forEach(track=>track.stop()); localVideo.srcObject=null; }
function toggleMic(){ micEnabled=!micEnabled; if(localStream) localStream.getAudioTracks().forEach(t=>t.enabled=micEnabled); }

// ====================== REFUSER ACTION ======================
function refuseAction(){ challenge.textContent="❌ Action refusée... Nouvelle action 😈"; setTimeout(autoNewAction,1500); }
function autoNewAction(){ choose(Math.random()<0.5?"action":"truth"); }

// Wire action buttons
document.getElementById('actionBtn').addEventListener('click', ()=> choose('action'));
document.getElementById('truthBtn').addEventListener('click', ()=> choose('truth'));
document.getElementById('refuseBtn').addEventListener('click', ()=> { refuseAction(); });

// camera controls (local only for now)
document.getElementById('startCamBtn').addEventListener('click', async ()=>{
  try{ await startCam(); }
  catch(e){ alert('Accès refusé à la caméra'); }
});
document.getElementById('stopCamBtn').addEventListener('click', ()=>{ stopCam(); });
document.getElementById('toggleMicBtn').addEventListener('click', ()=>{ toggleMic(); });

// ====================== PLACEHOLDER MULTI / CHAT ======================
function createRoom(){alert("Créer salon (Firebase non configuré)");}
function joinRoom(){alert("Rejoindre salon (Firebase non configuré)");}
function startGame(){alert("Démarrer jeu (Firebase non configuré)");}
function sendMessage(){alert("Envoyer message (Firebase non configuré)");}
function forceCam(){alert("Forcer caméra (Firebase non configuré)");}
function forceMic(){alert("Forcer micro (Firebase non configuré)");}

// initial simple state
document.addEventListener('DOMContentLoaded', ()=>{});
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

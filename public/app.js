// client-side app.js (module) - Socket.IO + WebRTC integration
const socket = io();

// ====================== HELPERS & STATE ======================
const $ = id => document.getElementById(id);
let localStream = null;
let peerConnections = {};
let countdown = null, time = 30;
let micEnabled = true;
let roomCode = null;

const challenge = $('challenge');
const timer = $('timer');
const localVideo = $('localVideo');
const webcamMenu = $('webcamMenu');

// ====================== UI BINDINGS ======================
$('createBtn').addEventListener('click', ()=>{
  const name = $('username').value.trim() || 'Joueur';
  socket.emit('create_room', { name }, (res)=>{ if(res.ok){ roomCode = res.code; $('code').textContent = roomCode; showLobby(res.players, res.host); } });
});
$('joinBtn').addEventListener('click', ()=>{
  const name = $('username').value.trim() || 'Joueur';
  const code = $('roomCode').value.trim().toUpperCase(); if(!code) return alert('Renseigne un code');
  socket.emit('join_room', { name, code }, (res)=>{ if(!res.ok) return alert(res.error); roomCode = res.code; $('code').textContent = roomCode; showLobby(res.players, res.host); });
});
$('startGameBtn').addEventListener('click', ()=> socket.emit('start_game', { code: roomCode }));
$('sendMsgBtn').addEventListener('click', ()=> sendMessage());

$('actionBtn').addEventListener('click', ()=> choose('action'));
$('truthBtn').addEventListener('click', ()=> choose('truth'));
$('refuseBtn').addEventListener('click', ()=> refuseAction());
$('startCamBtn').addEventListener('click', async ()=>{ try{ await startCam(); }catch(e){ alert('Accès refusé à la caméra'); } });
$('stopCamBtn').addEventListener('click', ()=> stopCam());
$('toggleMicBtn').addEventListener('click', ()=> toggleMic());

function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

function showLobby(players, host){ hide($('home')); show($('lobby')); const ul = $('players'); ul.innerHTML = ''; players.forEach(p => {
  const li = document.createElement('li'); li.textContent = p.name; li.dataset.id = p.id;
  if(host === socket.id){ // moderation controls
    const btnCamReq = document.createElement('button'); btnCamReq.textContent='📷 Demander cam'; btnCamReq.onclick = ()=> socket.emit('mod:request_cam',{ code: roomCode, targetId: p.id }, (res)=>{ if(!res.ok) alert(res.error); });
    const btnCamOff = document.createElement('button'); btnCamOff.textContent='🚫 Stop cam'; btnCamOff.onclick = ()=> socket.emit('mod:disable_cam',{ code: roomCode, targetId: p.id }, (res)=>{ if(!res.ok) alert(res.error); });
    const btnMute = document.createElement('button'); btnMute.textContent='🔇 Couper micro'; btnMute.onclick = ()=> socket.emit('mod:force_mic',{ code: roomCode, targetId: p.id, action:'disable' }, (res)=>{ if(!res.ok) alert(res.error); });
    const btnUnmute = document.createElement('button'); btnUnmute.textContent='🔊 Rétablir micro'; btnUnmute.onclick = ()=> socket.emit('mod:force_mic',{ code: roomCode, targetId: p.id, action:'enable' }, (res)=>{ if(!res.ok) alert(res.error); });
    li.appendChild(document.createElement('br')); li.appendChild(btnCamReq); li.appendChild(btnCamOff); li.appendChild(btnMute); li.appendChild(btnUnmute);
  }
  ul.appendChild(li);
});
  syncPeers(players);
}

// ====================== Socket handlers ======================
socket.on('room:update', (payload)=>{ if(!payload) return; roomCode = roomCode || payload.code; showLobby(payload.players, payload.host); });
socket.on('chat:message', ({ name, text, time })=>{ const m = document.createElement('div'); m.innerHTML = `<strong class="small">${name}</strong> <span class="small">[${new Date(time).toLocaleTimeString()}]</span>: ${text}`; $('messages').appendChild(m); $('messages').scrollTop = $('messages').scrollHeight; });
socket.on('game:start', ()=>{ hide($('lobby')); show($('game')); $('turn').textContent='Début du jeu ! Choisis Action ou Vérité'; });

// moderation & speaking
socket.on('player:speaking', ({ id, speaking })=>{ const el = document.querySelector(`[data-peer="${id}"]`); if(el) speaking ? el.classList.add('talking') : el.classList.remove('talking'); if(id === socket.id) localVideo.classList.toggle('talking', speaking); });
socket.on('mod:request_cam', ({ from })=>{ if(confirm('Le modérateur demande que vous activiez votre caméra. Acceptez ?')){ startCam(); socket.emit('mod:response_cam',{ toId: from, ok: true }); } else socket.emit('mod:response_cam',{ toId: from, ok: false }); });
socket.on('mod:disable_cam', ()=> stopCam());
socket.on('mod:force_mic', ({ action })=>{ if(action === 'disable'){ if(localStream) localStream.getAudioTracks().forEach(t=>t.enabled = false); } else if(action === 'enable'){ if(localStream) localStream.getAudioTracks().forEach(t=>t.enabled = true); else { navigator.mediaDevices.getUserMedia({ audio:true }).then(s=>{ localStream = s; $('localVideo').srcObject = localStream; startVAD(); }); } } });

// signaling
socket.on('webrtc:signal', async ({ from, data })=>{
  if(!peerConnections[from] && data.type === 'sdp' && data.sdp && data.sdp.type === 'offer'){ createPeerConnection(from); }
  const pc = peerConnections[from]; if(!pc) return console.warn('No pc for', from);
  try{ if(data.type === 'sdp'){ const desc = new RTCSessionDescription(data.sdp); await pc.setRemoteDescription(desc); if(data.sdp.type === 'offer'){ const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); socket.emit('webrtc:signal',{ toId: from, data:{ type:'sdp', sdp: pc.localDescription }}); } } else if(data.type === 'candidate'){ await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } }catch(e){ console.error('signal err', e); }
});

// ====================== ACTIONS / TRUTHS ======================
function random(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
const classicActionParts = { verbs:["Imite","Complimente","Fais rire","Ignore","Regarde","Fais semblant d'être","Danse comme","Parle comme"], targets:["le joueur à gauche","le joueur à droite","un personnage célèbre","un super-héros"], constraints:["pendant 10 secondes","pendant 20 secondes","sans parler","en exagérant"] };
const classicTruthParts = { starters:["Quelle est la dernière fois que","As-tu déjà"], subjects:["tu étais à l'école","tu étais enfant"] };
const adultActionParts = { verbs:["Regarde","Complimente","Fais un clin d’œil à"], targets:["la caméra","un joueur"], constraints:["pendant 10 secondes","avec assurance"] };
const adultTruthParts = { starters:["Qu’est-ce qui t’attire quand","As-tu déjà ressenti quelque chose quand"], subjects:["quelqu’un te regarde","tu plais à quelqu’un"] };
const extremeActionParts = { verbs:["Fixe","Avoue quelque chose à","Active ta webcam et regarde"], targets:["la caméra","le groupe"], constraints:["pendant 15 secondes","sans rire","avec intensité"] };
const extremeTruthParts = { starters:["Quelle est la chose que tu caches quand","As-tu déjà ressenti quelque chose de fort quand"], subjects:["tu es attiré(e)","tu perds le contrôle"] };

function generateClassicAction(){ return `${random(classicActionParts.verbs)} ${random(classicActionParts.targets)} ${random(classicActionParts.constraints)}.`; }
function generateClassicTruth(){ return `${random(classicTruthParts.starters)} ${random(classicTruthParts.subjects)} ?`; }
function generateAdultAction(){ return `${random(adultActionParts.verbs)} ${random(adultActionParts.targets)} ${random(adultActionParts.constraints)}.`; }
function generateAdultTruth(){ return `${random(adultTruthParts.starters)} ${random(adultTruthParts.subjects)} ?`; }
function generateExtremeAction(){ return `${random(extremeActionParts.verbs)} ${random(extremeActionParts.targets)} ${random(extremeActionParts.constraints)}.`; }
function generateExtremeTruth(){ return `${random(extremeTruthParts.starters)} ${random(extremeTruthParts.subjects)} ?`; }

function choose(type){ clearInterval(countdown); startTimer(); const mode = $('mode').value; if(mode === 'classic'){ challenge.textContent = type==='action'?generateClassicAction():generateClassicTruth(); } else if(mode==='adult'){ challenge.textContent = type==='action'?generateAdultAction():generateAdultTruth(); } else { challenge.textContent = type==='action'?generateExtremeAction():generateExtremeTruth(); } }

function startTimer(){ time = 30; timer.textContent = `⏱️ ${time}`; clearInterval(countdown); countdown = setInterval(()=>{ time--; timer.textContent = `⏱️ ${time}`; if(time<=0){ clearInterval(countdown); challenge.textContent = '⏰ Temps écoulé !'; stopCam(); } }, 1000); }

// ====================== Webcam / Mic / VAD ======================
async function startCam(){ localStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true }); localVideo.srcObject = localStream; Object.values(peerConnections).forEach(async (pc)=>{ localStream.getTracks().forEach(track=>pc.addTrack(track, localStream)); try{ await negotiate(pc); }catch(e){ console.warn('neg failed', e); } }); webcamMenu.classList.remove('hidden'); startVAD(); }
function stopCam(){ if(localStream){ localStream.getTracks().forEach(t=>t.stop()); localVideo.srcObject = null; localStream = null; stopVAD(); } }
function toggleMic(){ micEnabled = !micEnabled; if(localStream) localStream.getAudioTracks().forEach(t=>t.enabled = micEnabled); }

let audioCtx, analyser, dataArray, vadInterval, lastSpeaking = false;
function startVAD(){ try{ if(!localStream) return; audioCtx = new (window.AudioContext || window.webkitAudioContext)(); const src = audioCtx.createMediaStreamSource(localStream); analyser = audioCtx.createAnalyser(); analyser.fftSize = 2048; src.connect(analyser); dataArray = new Float32Array(analyser.fftSize); vadInterval = setInterval(()=>{ analyser.getFloatTimeDomainData(dataArray); let sum=0; for(let i=0;i<dataArray.length;i++) sum += dataArray[i]*dataArray[i]; const rms = Math.sqrt(sum / dataArray.length); const speaking = rms > 0.02; if(speaking !== lastSpeaking){ lastSpeaking = speaking; socket.emit('speaking', { code: roomCode, speaking, level: rms }); } }, 150); }catch(e){ console.warn('VAD init failed', e); } }
function stopVAD(){ if(vadInterval) clearInterval(vadInterval); if(audioCtx) audioCtx.close(); audioCtx=null; analyser=null; dataArray=null; lastSpeaking=false; }

// ====================== WebRTC helpers ======================
function createVideoElementForPeer(id, name){ let existing = document.querySelector(`#remote-${id}`); if(existing) return existing; const vid = document.createElement('video'); vid.id = `remote-${id}`; vid.autoplay=true; vid.playsInline=true; vid.width = 200; vid.style.borderRadius='8px'; const wrap = document.createElement('div'); wrap.dataset.peer = id; wrap.appendChild(vid); const label = document.createElement('div'); label.className='small'; label.textContent = name || id; wrap.appendChild(label); document.getElementById('remoteCams').appendChild(wrap); return vid; }

function createPeerConnection(remoteId, name){ if(peerConnections[remoteId]) return peerConnections[remoteId]; const pc = new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }] }); pc.onicecandidate = e => { if(e.candidate) socket.emit('webrtc:signal',{ toId: remoteId, data:{ type:'candidate', candidate: e.candidate } }); }; pc.ontrack = e => { const vid = createVideoElementForPeer(remoteId, name); if(e.streams && e.streams[0]) vid.srcObject = e.streams[0]; else { const ms = new MediaStream(); ms.addTrack(e.track); vid.srcObject = ms; } }; peerConnections[remoteId] = pc; if(localStream) localStream.getTracks().forEach(track=>pc.addTrack(track, localStream)); return pc; }

async function negotiate(pc){ try{ const offer = await pc.createOffer(); await pc.setLocalDescription(offer); const remoteId = Object.keys(peerConnections).find(k=>peerConnections[k]===pc); if(remoteId) socket.emit('webrtc:signal',{ toId: remoteId, data:{ type:'sdp', sdp: pc.localDescription } }); }catch(e){ console.error('neg err', e); } }

function syncPeers(players){ const ids = players.map(p=>p.id).filter(id=>id!==socket.id); Object.keys(peerConnections).forEach(id=>{ if(!ids.includes(id)) removePeer(id); }); players.forEach(p=>{ if(p.id===socket.id) return; if(!peerConnections[p.id]){ const pc = createPeerConnection(p.id, p.name); if(socket.id && socket.id < p.id) negotiate(pc); } }); }

function removePeer(id){ if(peerConnections[id]){ try{ peerConnections[id].close(); }catch(e){} delete peerConnections[id]; } const el = document.querySelector(`[data-peer="${id}"]`); if(el) el.remove(); }

// ====================== Moderation & placeholders ======================
function refuseAction(){ challenge.textContent='❌ Action refusée... Nouvelle action 😈'; setTimeout(()=> choose(Math.random()<0.5?'action':'truth'), 1400); }
function sendMessage(){ const text = $('msg').value.trim(); if(!text) return; socket.emit('chat_message',{ code: roomCode, name: $('username').value||'Moi', text }); $('msg').value=''; }
function createRoom(){ alert('Créer salon (serveur WebSocket utilisé)'); }
function joinRoom(){ alert('Rejoindre salon (utilise le bouton)'); }

document.addEventListener('DOMContentLoaded', ()=>{});
// client-side app.js (module) - Socket.IO + WebRTC integration
const socket = io();

// ====================== VARIABLES ======================
const $ = id => document.getElementById(id);
let localStream = null;
let peerConnections = {}; // map remoteId -> RTCPeerConnection
let countdown, time = 30;
let micEnabled = true;

const challenge = $('challenge');
const timer = $('timer');
const localVideo = $('localVideo');
const webcamMenu = $('webcamMenu');

let roomCode = null;

// ------------------ DOM bindings ------------------
$('createBtn').addEventListener('click', ()=> {
  const name = $('username').value.trim() || 'Joueur';
  socket.emit('create_room', { name }, (res) => {
    if(res.ok){ roomCode = res.code; $('code').textContent = roomCode; showLobby(res.players); }
  });
});

$('joinBtn').addEventListener('click', ()=> {
  const name = $('username').value.trim() || 'Joueur';
  const code = $('roomCode').value.trim().toUpperCase();
  if(!code) return alert('Renseigne un code');
  socket.emit('join_room', { name, code }, (res) => {
  $('turn').textContent = 'Début du jeu ! Choisis Action ou Vérité';
    // initial simple state
    document.addEventListener('DOMContentLoaded', ()=>{});
  try{
    if(data.type === 'sdp'){
      const desc = new RTCSessionDescription(data.sdp);
      await pc.setRemoteDescription(desc);
      if(data.sdp.type === 'offer'){
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:signal', { toId: from, data: { type: 'sdp', sdp: pc.localDescription } });
      }
    }else if(data.type === 'candidate'){
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }catch(e){ console.error('Error handling signal', e); }
});

// ------------------ Actions / Truths (generators) ------------------
function random(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
const classicActionParts = { verbs:["Imite","Complimente","Fais rire","Ignore","Regarde","Fais semblant d'être","Danse comme","Parle comme"], targets:["le joueur à gauche","le joueur à droite","un personnage célèbre","un super-héros"], constraints:["pendant 10 secondes","pendant 20 secondes","sans parler","en exagérant"] };
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

function choose(type){ clearInterval(countdown); startTimer(); let mode = $('mode').value; if(mode==="classic"){ challenge.textContent = type==="action"?generateClassicAction():generateClassicTruth(); } if(mode==="adult"){ challenge.textContent = type==="action"?generateAdultAction():generateAdultTruth(); } if(mode==="extreme"){ challenge.textContent = type==="action"?generateExtremeAction():generateExtremeTruth(); } }

// timer
function startTimer(){ time=30; timer.textContent = `⏱️ ${time}`; countdown = setInterval(()=>{ time--; timer.textContent = `⏱️ ${time}`; if(time<=0){ clearInterval(countdown); challenge.textContent = '⏰ Temps écoulé !'; stopCam(); } },1000); }

// ------------------ Webcam / Micro / WebRTC helpers ------------------
async function startCam(){
  localStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
  localVideo.srcObject = localStream;
  // add local tracks to PCs and renegotiate
  Object.values(peerConnections).forEach(async (pc) => {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    try{ await negotiate(pc); }catch(e){ console.warn('negotiation failed', e); }
  });
  webcamMenu.classList.remove('hidden');
  // start voice activity detection
  startVAD();
}
function stopCam(){ if(localStream) localStream.getTracks().forEach(t=>t.stop()); localVideo.srcObject = null; localStream = null; }
function toggleMic(){ micEnabled = !micEnabled; if(localStream) localStream.getAudioTracks().forEach(t=>t.enabled = micEnabled); }

function createVideoElementForPeer(id, name){
  let existing = document.querySelector(`#remote-${id}`);
  if(existing) return existing;
  const vid = document.createElement('video'); vid.id = `remote-${id}`; vid.autoplay = true; vid.playsInline = true; vid.width = 200; vid.style.borderRadius = '8px';
  const wrap = document.createElement('div'); wrap.dataset.peer = id; wrap.appendChild(vid);
  const label = document.createElement('div'); label.className = 'small'; label.textContent = name || id; wrap.appendChild(label);
  document.getElementById('remoteCams').appendChild(wrap);
  return vid;
}

// ====================== VAD (voice activity detection) ======================
let audioCtx, analyser, dataArray, vadInterval, lastSpeaking = false;
function startVAD(){
  try{
    if(!localStream) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(localStream);
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 2048;
    src.connect(analyser);
    dataArray = new Float32Array(analyser.fftSize);
    vadInterval = setInterval(()=>{
      analyser.getFloatTimeDomainData(dataArray);
      let sum = 0; for(let i=0;i<dataArray.length;i++){ sum += dataArray[i]*dataArray[i]; }
      let rms = Math.sqrt(sum / dataArray.length);
      const speaking = rms > 0.02; // threshold
      if(speaking !== lastSpeaking){ lastSpeaking = speaking; socket.emit('speaking', { code: roomCode, speaking, level: rms }); }
    }, 150);
  }catch(e){ console.warn('VAD init failed', e); }
}
function stopVAD(){ if(vadInterval) clearInterval(vadInterval); if(audioCtx) audioCtx.close(); audioCtx = null; analyser = null; dataArray = null; lastSpeaking = false; }

function removePeer(id){ if(peerConnections[id]){ try{ peerConnections[id].close(); }catch(e){} delete peerConnections[id]; } const el = document.querySelector(`[data-peer="${id}"]`); if(el) el.remove(); }

function createPeerConnection(remoteId, name){
  if(peerConnections[remoteId]) return peerConnections[remoteId];
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  pc.onicecandidate = e => { if(e.candidate) socket.emit('webrtc:signal', { toId: remoteId, data: { type: 'candidate', candidate: e.candidate } }); };
  pc.ontrack = e => { const vid = createVideoElementForPeer(remoteId, name); if(e.streams && e.streams[0]) vid.srcObject = e.streams[0]; else { const ms = new MediaStream(); ms.addTrack(e.track); vid.srcObject = ms; } };
  peerConnections[remoteId] = pc;
  // if we already have tracks, add them
  if(localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  return pc;
}

async function negotiate(pc){
  try{
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // find remote id for this pc
    const remoteId = Object.keys(peerConnections).find(k => peerConnections[k] === pc);
    if(remoteId) socket.emit('webrtc:signal', { toId: remoteId, data: { type: 'sdp', sdp: pc.localDescription } });
  }catch(e){ console.error('negotiation error', e); }
}

function syncPeers(pls){
  const ids = pls.map(p => p.id).filter(id => id !== socket.id);
  // remove missing
  Object.keys(peerConnections).forEach(id => { if(!ids.includes(id)) removePeer(id); });
  // create for new
  pls.forEach(p => {
    if(p.id === socket.id) return;
    if(!peerConnections[p.id]){
      const pc = createPeerConnection(p.id, p.name);
      // deterministic initiator: lexicographic comparison
      if(socket.id && socket.id < p.id){ negotiate(pc); }
    }
  });
}

// ------------------ Refuse & placeholders ------------------
function refuseAction(){ challenge.textContent = '❌ Action refusée... Nouvelle action 😈'; setTimeout(()=> choose(Math.random()<0.5?'action':'truth'), 1400); }
function createRoom(){ alert('Créer salon (serveur WebSocket utilisé pour réel multi-joueurs)'); }
function joinRoom(){ alert('Rejoindre salon (use the Join button)'); }
function startGame(){ socket.emit('start_game',{code: roomCode}); }
function sendMessage(){ const text = $('msg').value.trim(); if(!text) return; socket.emit('chat_message',{code:roomCode, name: $('username').value||'Moi', text}); $('msg').value = ''; }
function forceCam(){ alert('Forcer caméra : nécessite autorité serveur'); }
function forceMic(){ alert('Forcer micro : nécessite autorité serveur'); }

// wire local controls
$('actionBtn').addEventListener('click', ()=> choose('action'));
$('truthBtn').addEventListener('click', ()=> choose('truth'));
$('refuseBtn').addEventListener('click', ()=> refuseAction());
$('startCamBtn').addEventListener('click', async ()=> { try{ await startCam(); }catch(e){ alert('Accès refusé à la caméra'); } });
$('stopCamBtn').addEventListener('click', ()=> stopCam());
$('toggleMicBtn').addEventListener('click', ()=> toggleMic());

// initial ready
document.addEventListener('DOMContentLoaded', ()=>{});
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
  function stopCam(){ 
    if(localStream) { 
      localStream.getTracks().forEach(track=>track.stop()); 
      localVideo.srcObject=null; 
      stopVAD(); 
    } 
  }
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

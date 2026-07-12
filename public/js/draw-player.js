const socket = io();

const AVATAR_GALLERY = [
  '/avatars/avatar1.svg', '/avatars/avatar2.svg', '/avatars/avatar3.svg', '/avatars/avatar4.svg', '/avatars/avatar5.svg',
  '/avatars/avatar6.svg', '/avatars/avatar7.svg', '/avatars/avatar8.svg', '/avatars/avatar9.svg', '/avatars/avatar10.svg',
];
let selectedAvatar = AVATAR_GALLERY[0];
let myPlayerId = localStorage.getItem('drawPlayerId');
if (!myPlayerId) {
  myPlayerId = Math.random().toString(16).slice(2) + Date.now().toString(16);
  localStorage.setItem('drawPlayerId', myPlayerId);
}
let lastCode = localStorage.getItem('drawLastCode') || '';
let lastPseudo = localStorage.getItem('drawLastPseudo') || '';
let myPseudo = '';

const screens = {
  join: document.getElementById('screen-join'),
  wait: document.getElementById('screen-wait'),
  draw: document.getElementById('screen-draw'),
  guess: document.getElementById('screen-guess'),
  roundEnd: document.getElementById('screen-round-end'),
  end: document.getElementById('screen-end'),
};
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

function buildAvatarGallery(container, currentSelection, onSelect, fileInput) {
  container.innerHTML = '';
  AVATAR_GALLERY.forEach((url) => {
    const tile = document.createElement('div');
    tile.className = 'avatar-tile' + (url === currentSelection ? ' selected' : '');
    tile.innerHTML = `<img src="${url}" alt="Avatar">`;
    tile.addEventListener('click', () => {
      container.querySelectorAll('.avatar-tile').forEach((t) => t.classList.remove('selected'));
      tile.classList.add('selected');
      onSelect(url);
    });
    container.appendChild(tile);
  });
  const uploadTile = document.createElement('div');
  uploadTile.className = 'avatar-tile upload-tile';
  uploadTile.textContent = '📷 Ma photo';
  uploadTile.addEventListener('click', () => fileInput.click());
  container.appendChild(uploadTile);

  fileInput.value = '';
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('photo', file);
    try {
      const res = await fetch('/api/avatar-upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        onSelect(data.url);
        container.querySelectorAll('.avatar-tile').forEach((t) => t.classList.remove('selected'));
        const customTile = document.createElement('div');
        customTile.className = 'avatar-tile selected';
        customTile.innerHTML = `<img src="${data.url}" alt="Ma photo">`;
        container.insertBefore(customTile, uploadTile);
      }
    } catch (e) { /* ignore */ }
  };
}

buildAvatarGallery(document.getElementById('avatar-grid'), selectedAvatar, (url) => { selectedAvatar = url; }, document.getElementById('join-avatar-upload-input'));

const params = new URLSearchParams(window.location.search);
if (params.get('code')) document.getElementById('input-code').value = params.get('code').toUpperCase();
else if (lastCode) document.getElementById('input-code').value = lastCode;
if (lastPseudo) document.getElementById('input-pseudo').value = lastPseudo;

document.getElementById('btn-join').addEventListener('click', join);
document.getElementById('input-pseudo').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

function join() {
  const code = document.getElementById('input-code').value.trim();
  const pseudo = document.getElementById('input-pseudo').value.trim();
  document.getElementById('join-error').textContent = '';
  if (!code || !pseudo) { document.getElementById('join-error').textContent = 'Merci de remplir le code et ton pseudo.'; return; }
  localStorage.setItem('drawLastCode', code.toUpperCase());
  localStorage.setItem('drawLastPseudo', pseudo);
  socket.emit('draw:join-game', { code, pseudo, avatar: selectedAvatar, playerId: myPlayerId });
}

const wasInGame = localStorage.getItem('drawInGame') === '1';
if (wasInGame && lastCode && lastPseudo && !params.get('code')) {
  socket.emit('draw:join-game', { code: lastCode, pseudo: lastPseudo, avatar: selectedAvatar, playerId: myPlayerId });
}
socket.on('connect', () => {
  if (localStorage.getItem('drawInGame') === '1' && lastCode && lastPseudo) {
    socket.emit('draw:join-game', { code: lastCode, pseudo: lastPseudo, avatar: selectedAvatar, playerId: myPlayerId });
  }
});

socket.on('draw:join-error', ({ message }) => {
  document.getElementById('join-error').textContent = message;
  localStorage.removeItem('drawInGame');
});

socket.on('draw:joined', ({ pseudo, avatar }) => {
  localStorage.setItem('drawInGame', '1');
  myPseudo = pseudo;
  if (avatar) selectedAvatar = avatar;
  document.getElementById('wait-avatar').src = avatar || selectedAvatar;
  document.getElementById('wait-pseudo').textContent = pseudo;
  showScreen('wait');
});

socket.on('draw:game-ended', () => localStorage.removeItem('drawInGame'));
socket.on('draw:host-left', () => localStorage.removeItem('drawInGame'));

const avatarPickerPanel = document.getElementById('avatar-picker-panel');
document.getElementById('btn-change-avatar').addEventListener('click', () => {
  avatarPickerPanel.classList.toggle('hidden');
  if (!avatarPickerPanel.classList.contains('hidden')) {
    buildAvatarGallery(document.getElementById('wait-avatar-grid'), selectedAvatar, (url) => {
      selectedAvatar = url;
      document.getElementById('wait-avatar').src = url;
      socket.emit('draw:update-avatar', { avatar: url });
      avatarPickerPanel.classList.add('hidden');
    }, document.getElementById('wait-avatar-upload-input'));
  }
});

// ---------- Dessin (vue dessinateur) ----------
const myCanvas = document.getElementById('my-canvas');
const myCtx = myCanvas.getContext('2d');
const viewCanvas = document.getElementById('view-canvas');
const viewCtx = viewCanvas.getContext('2d');
function drawViewSegment({ x0, y0, x1, y1, color, size }) {
  viewCtx.strokeStyle = color;
  viewCtx.lineWidth = size * viewCanvas.width;
  viewCtx.lineCap = 'round';
  viewCtx.lineJoin = 'round';
  viewCtx.beginPath();
  viewCtx.moveTo(x0 * viewCanvas.width, y0 * viewCanvas.height);
  viewCtx.lineTo(x1 * viewCanvas.width, y1 * viewCanvas.height);
  viewCtx.stroke();
}
socket.on('draw:stroke', (data) => drawViewSegment(data));
socket.on('draw:clear', () => viewCtx.clearRect(0, 0, viewCanvas.width, viewCanvas.height));

const COLORS = ['#16130F', '#C6A664', '#8C3B3B', '#3E6152', '#3A5A78', '#F8F3EA'];
const SIZES = [{ label: 'S', value: 0.006 }, { label: 'M', value: 0.014 }, { label: 'L', value: 0.026 }];
let currentColor = COLORS[0];
let currentSize = SIZES[1].value;
let drawing = false;
let lastPoint = null;

function buildColorRow() {
  const row = document.getElementById('draw-color-row');
  row.innerHTML = '';
  COLORS.forEach((c) => {
    const dot = document.createElement('div');
    dot.className = 'draw-color-swatch' + (c === currentColor ? ' selected' : '');
    dot.style.background = c;
    dot.addEventListener('click', () => {
      currentColor = c;
      row.querySelectorAll('.draw-color-swatch').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
    row.appendChild(dot);
  });
}
function buildSizeRow() {
  const row = document.getElementById('draw-size-row');
  row.innerHTML = '';
  SIZES.forEach((s) => {
    const btn = document.createElement('div');
    btn.className = 'draw-size-btn' + (s.value === currentSize ? ' selected' : '');
    btn.textContent = s.label;
    btn.addEventListener('click', () => {
      currentSize = s.value;
      row.querySelectorAll('.draw-size-btn').forEach((d) => d.classList.remove('selected'));
      btn.classList.add('selected');
    });
    row.appendChild(btn);
  });
}
buildColorRow();
buildSizeRow();

function pointerPos(e) {
  const rect = myCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
}
function localSegment(p0, p1) {
  myCtx.strokeStyle = currentColor;
  myCtx.lineWidth = currentSize * myCanvas.width;
  myCtx.lineCap = 'round';
  myCtx.lineJoin = 'round';
  myCtx.beginPath();
  myCtx.moveTo(p0.x * myCanvas.width, p0.y * myCanvas.height);
  myCtx.lineTo(p1.x * myCanvas.width, p1.y * myCanvas.height);
  myCtx.stroke();
}
function startDraw(e) {
  e.preventDefault();
  drawing = true;
  lastPoint = pointerPos(e);
}
function moveDraw(e) {
  if (!drawing) return;
  e.preventDefault();
  const p = pointerPos(e);
  localSegment(lastPoint, p);
  socket.emit('draw:stroke', { x0: lastPoint.x, y0: lastPoint.y, x1: p.x, y1: p.y, color: currentColor, size: currentSize });
  lastPoint = p;
}
function endDraw() { drawing = false; lastPoint = null; }

myCanvas.addEventListener('mousedown', startDraw);
myCanvas.addEventListener('mousemove', moveDraw);
window.addEventListener('mouseup', endDraw);
myCanvas.addEventListener('touchstart', startDraw, { passive: false });
myCanvas.addEventListener('touchmove', moveDraw, { passive: false });
myCanvas.addEventListener('touchend', endDraw);

document.getElementById('btn-clear-canvas').addEventListener('click', () => {
  myCtx.clearRect(0, 0, myCanvas.width, myCanvas.height);
  socket.emit('draw:clear');
});

// ---------- Manche démarrée ----------
let iAmDrawer = false;
let foundThisRound = false;

socket.on('draw:round-started', (data) => {
  iAmDrawer = data.isDrawer;
  document.getElementById('found-msg').classList.add('hidden');
  foundThisRound = false;
  if (iAmDrawer) {
    myCtx.clearRect(0, 0, myCanvas.width, myCanvas.height);
    document.getElementById('draw-word').textContent = data.word;
    showScreen('draw');
  } else {
    viewCtx.clearRect(0, 0, viewCanvas.width, viewCanvas.height);
    document.getElementById('guess-drawer-pseudo').textContent = data.drawerPseudo || '';
    document.getElementById('guess-word-hint').textContent = data.wordLength ? Array(data.wordLength).fill('_').join(' ') : '';
    document.getElementById('guess-input').value = '';
    document.getElementById('guess-input').disabled = false;
    document.getElementById('guess-feed').innerHTML = '';
    showScreen('guess');
  }
});

function submitGuess() {
  if (iAmDrawer || foundThisRound) return;
  const input = document.getElementById('guess-input');
  const text = input.value.trim();
  if (!text) return;
  socket.emit('draw:guess', { text });
  input.value = '';
}
document.getElementById('btn-submit-guess').addEventListener('click', submitGuess);
document.getElementById('guess-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitGuess(); });

socket.on('draw:you-found-it', () => {
  foundThisRound = true;
  document.getElementById('found-msg').classList.remove('hidden');
  document.getElementById('guess-input').disabled = true;
});
socket.on('draw:guess-correct', ({ pseudo, rank }) => {
  if (iAmDrawer) return;
  const feed = document.getElementById('guess-feed');
  const row = document.createElement('div');
  row.className = 'draw-feed-row correct';
  row.textContent = `✅ ${pseudo} a trouvé !`;
  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
});
socket.on('draw:guess-wrong', ({ pseudo, text }) => {
  if (iAmDrawer) return;
  const feed = document.getElementById('guess-feed');
  const row = document.createElement('div');
  row.className = 'draw-feed-row';
  row.textContent = `${pseudo} : ${text}`;
  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
});

// ---------- Fin de manche ----------
socket.on('draw:round-end', ({ word, results }) => {
  document.getElementById('re-word').textContent = word;
  const mine = results.find((r) => r.pseudo === myPseudo);
  document.getElementById('re-msg').textContent = iAmDrawer
    ? `Bravo pour ce dessin !`
    : (mine && mine.found ? `Bien joué, +${mine.points} pts !` : `Pas trouvé cette fois...`);
  showScreen('roundEnd');
});

// ---------- Fin ----------
socket.on('draw:game-over', ({ leaderboard }) => {
  const mine = leaderboard.find((p) => p.pseudo === myPseudo);
  const rank = mine ? leaderboard.indexOf(mine) + 1 : null;
  document.getElementById('final-score-msg').textContent = mine
    ? `Tu termines ${rank}${rank === 1 ? 'er' : 'ème'} avec ${mine.score} points.`
    : "En attente de l'animateur pour la suite...";
  showScreen('end');
});

// ---------- Rejouer (l'hôte relance une nouvelle partie) ----------
socket.on('draw:game-reset', () => {
  showScreen('wait');
});

socket.on('draw:game-ended', () => {
  alert("La partie est terminée. Merci d'avoir joué !");
  window.location.href = '/index.html';
});
socket.on('draw:host-left', () => {
  alert("L'animateur a quitté la partie.");
  window.location.href = '/index.html';
});

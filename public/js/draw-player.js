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
const overlayCanvas = document.getElementById('my-canvas-overlay');
const overlayCtx = overlayCanvas.getContext('2d');
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
socket.on('draw:clear', () => { viewCtx.clearRect(0, 0, viewCanvas.width, viewCanvas.height); viewCtx.fillStyle = '#F8F3EA'; viewCtx.fillRect(0, 0, viewCanvas.width, viewCanvas.height); });
socket.on('draw:sync', ({ dataUrl }) => {
  const img = new Image();
  img.onload = () => { viewCtx.clearRect(0, 0, viewCanvas.width, viewCanvas.height); viewCtx.drawImage(img, 0, 0, viewCanvas.width, viewCanvas.height); };
  img.src = dataUrl;
});

const CANVAS_BG = '#F8F3EA';
const COLORS = [
  '#16130F', '#FFFFFF', '#8C3B3B', '#C6A664', '#3E6152', '#3A5A78',
  '#D94F4F', '#E8963C', '#E8D24C', '#6FA85C', '#4C9BE8', '#7C5CC4',
  '#C45CA0', '#8A5A3A', '#B0B0B0', CANVAS_BG,
];
const SIZES = [{ label: 'XS', value: 0.003 }, { label: 'S', value: 0.006 }, { label: 'M', value: 0.014 }, { label: 'L', value: 0.026 }, { label: 'XL', value: 0.045 }];
let currentColor = COLORS[0];
let currentSize = SIZES[2].value;
let currentTool = 'brush'; // 'brush' | 'eraser' | 'fill' | 'line' | 'rect' | 'circle'
const SHAPE_TOOLS = ['line', 'rect', 'circle'];
let drawing = false;
let lastPoint = null;
let shapeStart = null;
let shapeCurrent = null;
let strokeHistory = []; // liste de traits (chacun = tableau de segments), pour "Annuler"
let currentStroke = null;

function buildColorRow() {
  const row = document.getElementById('draw-color-row');
  row.innerHTML = '';
  COLORS.forEach((c) => {
    const dot = document.createElement('div');
    dot.className = 'draw-color-swatch' + (c === currentColor ? ' selected' : '');
    dot.style.background = c;
    dot.addEventListener('click', () => {
      currentColor = c;
      if (currentTool === 'eraser') currentTool = 'brush';
      updateToolButtons();
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
function updateToolButtons() {
  document.querySelectorAll('.draw-tool-btn').forEach((b) => b.classList.toggle('selected', b.dataset.tool === currentTool));
}
function buildToolRow() {
  const row = document.getElementById('draw-tool-row');
  if (!row) return;
  row.innerHTML = '';
  const tools = [
    { id: 'brush', label: '🖌️ Pinceau' },
    { id: 'eraser', label: '🧽 Gomme' },
    { id: 'fill', label: '🪣 Remplir' },
  ];
  tools.forEach((t) => {
    const btn = document.createElement('div');
    btn.className = 'draw-tool-btn' + (t.id === currentTool ? ' selected' : '');
    btn.dataset.tool = t.id;
    btn.textContent = t.label;
    btn.addEventListener('click', () => { currentTool = t.id; updateToolButtons(); });
    row.appendChild(btn);
  });
  const undoBtn = document.createElement('div');
  undoBtn.className = 'draw-tool-btn';
  undoBtn.textContent = '↩️ Annuler';
  undoBtn.addEventListener('click', undoLastStroke);
  row.appendChild(undoBtn);
}
function buildShapeRow() {
  const row = document.getElementById('draw-shape-row');
  if (!row) return;
  row.innerHTML = '';
  const shapes = [
    { id: 'line', label: '📏 Ligne' },
    { id: 'rect', label: '▭ Rectangle' },
    { id: 'circle', label: '⬭ Cercle' },
  ];
  shapes.forEach((t) => {
    const btn = document.createElement('div');
    btn.className = 'draw-tool-btn' + (t.id === currentTool ? ' selected' : '');
    btn.dataset.tool = t.id;
    btn.textContent = t.label;
    btn.addEventListener('click', () => { currentTool = t.id; updateToolButtons(); });
    row.appendChild(btn);
  });
}
buildColorRow();
buildSizeRow();
buildToolRow();
buildShapeRow();

function fillCanvasBg() {
  myCtx.fillStyle = CANVAS_BG;
  myCtx.fillRect(0, 0, myCanvas.width, myCanvas.height);
}

function redrawFromHistory() {
  myCtx.clearRect(0, 0, myCanvas.width, myCanvas.height);
  fillCanvasBg();
  strokeHistory.forEach((stroke) => {
    stroke.forEach((seg) => localSegment({ x: seg.x0, y: seg.y0 }, { x: seg.x1, y: seg.y1 }, seg.color, seg.size));
  });
}

function syncSnapshotToOthers() {
  try { socket.emit('draw:sync', { dataUrl: myCanvas.toDataURL('image/png') }); } catch (e) { /* ignore */ }
}

function undoLastStroke() {
  if (!iAmDrawer || strokeHistory.length === 0) return;
  strokeHistory.pop();
  redrawFromHistory();
  syncSnapshotToOthers();
}

// Remplissage façon "seau de peinture" (flood fill) sur le canvas du dessinateur
function floodFill(startX, startY, fillColorHex) {
  const w = myCanvas.width, h = myCanvas.height;
  const imgData = myCtx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const toRgb = (hex) => {
    const v = hex.replace('#', '');
    const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [fr, fg, fb] = toRgb(fillColorHex);
  const idx = (x, y) => (y * w + x) * 4;
  const sx = Math.floor(startX * w), sy = Math.floor(startY * h);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
  const startIdx = idx(sx, sy);
  const targetR = data[startIdx], targetG = data[startIdx + 1], targetB = data[startIdx + 2], targetA = data[startIdx + 3];
  if (targetR === fr && targetG === fg && targetB === fb) return;
  const matches = (i) => Math.abs(data[i] - targetR) < 20 && Math.abs(data[i + 1] - targetG) < 20 && Math.abs(data[i + 2] - targetB) < 20 && Math.abs(data[i + 3] - targetA) < 20;
  const stack = [[sx, sy]];
  const visited = new Uint8Array(w * h);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const vIdx = y * w + x;
    if (visited[vIdx]) continue;
    const i = idx(x, y);
    if (!matches(i)) continue;
    visited[vIdx] = 1;
    data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = 255;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  myCtx.putImageData(imgData, 0, 0);
}

function pointerPos(e) {
  const rect = overlayCanvas.getBoundingClientRect();
  const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null;
  const clientX = t ? t.clientX : e.clientX;
  const clientY = t ? t.clientY : e.clientY;
  return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
}
function drawSegmentOnCanvas(ctx, canvasEl, p0, p1, color, size) {
  ctx.strokeStyle = color;
  ctx.lineWidth = size * canvasEl.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(p0.x * canvasEl.width, p0.y * canvasEl.height);
  ctx.lineTo(p1.x * canvasEl.width, p1.y * canvasEl.height);
  ctx.stroke();
}
function localSegment(p0, p1, color, size) { drawSegmentOnCanvas(myCtx, myCanvas, p0, p1, color, size); }

// Calcule les segments (points normalisés 0-1) qui composent une forme entre deux coins p0/p1
function computeShapeSegments(tool, p0, p1) {
  if (tool === 'line') return [{ x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y }];
  if (tool === 'rect') {
    return [
      { x0: p0.x, y0: p0.y, x1: p1.x, y1: p0.y },
      { x0: p1.x, y0: p0.y, x1: p1.x, y1: p1.y },
      { x0: p1.x, y0: p1.y, x1: p0.x, y1: p1.y },
      { x0: p0.x, y0: p1.y, x1: p0.x, y1: p0.y },
    ];
  }
  if (tool === 'circle') {
    const cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2;
    const rx = Math.abs(p1.x - p0.x) / 2, ry = Math.abs(p1.y - p0.y) / 2;
    const N = 32;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    }
    const segs = [];
    for (let i = 0; i < N; i++) segs.push({ x0: pts[i].x, y0: pts[i].y, x1: pts[i + 1].x, y1: pts[i + 1].y });
    return segs;
  }
  return [];
}
function activeColor() { return currentTool === 'eraser' ? CANVAS_BG : currentColor; }
function activeSize() { return currentTool === 'eraser' ? Math.max(currentSize, 0.03) : currentSize; }

function startDraw(e) {
  e.preventDefault();
  const p = pointerPos(e);
  if (currentTool === 'fill') {
    floodFill(p.x, p.y, currentColor);
    strokeHistory.push([{ x0: p.x, y0: p.y, x1: p.x, y1: p.y, color: currentColor, size: 0, fill: true }]);
    syncSnapshotToOthers();
    return;
  }
  if (SHAPE_TOOLS.includes(currentTool)) {
    shapeStart = p;
    shapeCurrent = p;
    drawing = true;
    return;
  }
  drawing = true;
  lastPoint = p;
  currentStroke = [];
}
function moveDraw(e) {
  if (!drawing) return;
  e.preventDefault();
  const p = pointerPos(e);
  if (SHAPE_TOOLS.includes(currentTool)) {
    shapeCurrent = p;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    const segs = computeShapeSegments(currentTool, shapeStart, shapeCurrent);
    segs.forEach((s) => drawSegmentOnCanvas(overlayCtx, overlayCanvas, { x: s.x0, y: s.y0 }, { x: s.x1, y: s.y1 }, currentColor, currentSize));
    return;
  }
  const color = activeColor();
  const size = activeSize();
  localSegment(lastPoint, p, color, size);
  const seg = { x0: lastPoint.x, y0: lastPoint.y, x1: p.x, y1: p.y, color, size };
  socket.emit('draw:stroke', seg);
  if (currentStroke) currentStroke.push(seg);
  lastPoint = p;
}
function endDraw() {
  if (!drawing) return;
  if (SHAPE_TOOLS.includes(currentTool)) {
    if (shapeStart && shapeCurrent) {
      const segs = computeShapeSegments(currentTool, shapeStart, shapeCurrent);
      const color = currentColor;
      const size = currentSize;
      const stroke = [];
      segs.forEach((s) => {
        const seg = { x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, color, size };
        localSegment({ x: s.x0, y: s.y0 }, { x: s.x1, y: s.y1 }, color, size);
        socket.emit('draw:stroke', seg);
        stroke.push(seg);
      });
      if (stroke.length) strokeHistory.push(stroke);
    }
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    shapeStart = null;
    shapeCurrent = null;
    drawing = false;
    return;
  }
  if (currentStroke && currentStroke.length) strokeHistory.push(currentStroke);
  drawing = false;
  lastPoint = null;
  currentStroke = null;
}

overlayCanvas.addEventListener('mousedown', startDraw);
overlayCanvas.addEventListener('mousemove', moveDraw);
window.addEventListener('mouseup', endDraw);
overlayCanvas.addEventListener('touchstart', startDraw, { passive: false });
overlayCanvas.addEventListener('touchmove', moveDraw, { passive: false });
overlayCanvas.addEventListener('touchend', endDraw);

document.getElementById('btn-clear-canvas').addEventListener('click', () => {
  strokeHistory = [];
  myCtx.clearRect(0, 0, myCanvas.width, myCanvas.height);
  fillCanvasBg();
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
    strokeHistory = [];
    myCtx.clearRect(0, 0, myCanvas.width, myCanvas.height);
    fillCanvasBg();
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    shapeStart = null;
    shapeCurrent = null;
    currentTool = 'brush';
    updateToolButtons();
    document.getElementById('draw-word').textContent = data.word;
    document.getElementById('drawer-guess-feed').innerHTML = '';
    showScreen('draw');
  } else {
    viewCtx.clearRect(0, 0, viewCanvas.width, viewCanvas.height);
    viewCtx.fillStyle = '#F8F3EA';
    viewCtx.fillRect(0, 0, viewCanvas.width, viewCanvas.height);
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
  const feed = document.getElementById(iAmDrawer ? 'drawer-guess-feed' : 'guess-feed');
  if (!feed) return;
  const row = document.createElement('div');
  row.className = 'draw-feed-row correct';
  row.textContent = `✅ ${pseudo} a trouvé !`;
  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
});
socket.on('draw:guess-wrong', ({ pseudo, text }) => {
  const feed = document.getElementById(iAmDrawer ? 'drawer-guess-feed' : 'guess-feed');
  if (!feed) return;
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

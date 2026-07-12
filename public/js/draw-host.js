const socket = io();
let gameCode = null;
let timerInterval = null;

const screens = {
  create: document.getElementById('screen-create'),
  lobby: document.getElementById('screen-lobby'),
  drawing: document.getElementById('screen-drawing'),
  roundEnd: document.getElementById('screen-round-end'),
  podium: document.getElementById('screen-podium'),
};
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}
function avatarImg(p, cls) { return `<img class="${cls}" src="${p.avatar}" alt="${p.pseudo}">`; }

document.getElementById('btn-create').addEventListener('click', () => socket.emit('draw:create-game'));

socket.on('draw:game-created', ({ code }) => {
  gameCode = code;
  document.getElementById('lobby-code').textContent = code;
  const joinUrl = `${window.location.origin}/draw-player.html?code=${code}`;
  document.getElementById('qrcode').innerHTML = '';
  new QRCode(document.getElementById('qrcode'), { text: joinUrl, width: 200, height: 200, colorDark: '#16130F', colorLight: '#F8F3EA' });
  showScreen('lobby');
});

socket.on('draw:player-joined', ({ players }) => {
  document.getElementById('player-count-num').textContent = players.length;
  const pills = document.getElementById('player-pills');
  pills.innerHTML = '';
  players.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'player-pill';
    el.innerHTML = `<img class="avatar-img-sm" src="${p.avatar}"> ${p.pseudo}`;
    pills.appendChild(el);
  });
});

document.getElementById('btn-start').addEventListener('click', () => {
  document.getElementById('lobby-error').textContent = '';
  socket.emit('draw:host-start');
});

socket.on('draw:error', ({ message }) => {
  const errEl = document.getElementById('lobby-error');
  if (errEl) errEl.textContent = message;
});

// ---------- Dessin en cours ----------
const canvas = document.getElementById('draw-canvas');
const ctx = canvas.getContext('2d');
function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
function drawSegment({ x0, y0, x1, y1, color, size }) {
  ctx.strokeStyle = color;
  ctx.lineWidth = size * canvas.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x0 * canvas.width, y0 * canvas.height);
  ctx.lineTo(x1 * canvas.width, y1 * canvas.height);
  ctx.stroke();
}
socket.on('draw:stroke', (data) => drawSegment(data));
socket.on('draw:clear', () => clearCanvas());

function startTimer(duration) {
  clearInterval(timerInterval);
  const circle = document.getElementById('timer-circle');
  const numEl = document.getElementById('timer-num');
  const circumference = 2 * Math.PI * 27;
  circle.style.strokeDasharray = circumference;
  let remaining = Math.round(duration / 1000);
  const total = remaining;
  numEl.textContent = remaining;
  circle.style.strokeDashoffset = 0;
  timerInterval = setInterval(() => {
    remaining -= 1;
    numEl.textContent = Math.max(remaining, 0);
    circle.style.strokeDashoffset = circumference * (1 - Math.max(remaining, 0) / total);
    if (remaining <= 0) clearInterval(timerInterval);
  }, 1000);
}

socket.on('draw:round-started', ({ wordLength, round, total, duration, drawerPseudo }) => {
  clearCanvas();
  document.getElementById('drawing-round').textContent = round;
  document.getElementById('drawing-total').textContent = total;
  document.getElementById('drawing-drawer-pseudo').textContent = drawerPseudo || '';
  document.getElementById('drawing-word-hint').textContent = wordLength ? Array(wordLength).fill('_').join(' ') : '';
  document.getElementById('drawing-feed').innerHTML = '';
  startTimer(duration);
  showScreen('drawing');
});

document.getElementById('btn-force-end-round').addEventListener('click', () => socket.emit('draw:force-end-round'));

socket.on('draw:guess-correct', ({ pseudo, rank }) => {
  const feed = document.getElementById('drawing-feed');
  const row = document.createElement('div');
  row.className = 'draw-feed-row correct';
  row.textContent = `✅ ${pseudo} a trouvé ! (${rank}${rank === 1 ? 'er' : 'ème'})`;
  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
});
socket.on('draw:guess-wrong', ({ pseudo, text }) => {
  const feed = document.getElementById('drawing-feed');
  const row = document.createElement('div');
  row.className = 'draw-feed-row';
  row.textContent = `${pseudo} : ${text}`;
  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
});

// ---------- Fin de manche ----------
socket.on('draw:round-end', ({ word, drawerPseudo, drawerPoints, results, round, total }) => {
  clearInterval(timerInterval);
  document.getElementById('re-round').textContent = round;
  document.getElementById('re-total').textContent = total;
  document.getElementById('re-word').textContent = word;
  document.getElementById('re-drawer-line').textContent = `${drawerPseudo} gagne ${drawerPoints} pts pour avoir fait deviner ${results.filter((r) => r.found).length} joueur(s).`;

  const list = document.getElementById('re-results');
  list.innerHTML = '';
  results.sort((a, b) => b.points - a.points).forEach((r) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `<span class="lb-rank">${r.found ? '✅' : '—'}</span>${avatarImg(r, 'avatar-img-sm')}<span class="lb-name">${r.pseudo}</span><span class="lb-score">+${r.points} pts</span>`;
    list.appendChild(row);
  });

  showScreen('roundEnd');
});

document.getElementById('btn-next-round').addEventListener('click', () => socket.emit('draw:host-next-round'));

// ---------- Fin ----------
socket.on('draw:game-over', ({ leaderboard }) => {
  showScreen('podium');
  const top3 = leaderboard.slice(0, 3);
  const stage = document.getElementById('podium-stage');
  stage.innerHTML = '';
  const order = [1, 0, 2];
  order.forEach((idx) => {
    const p = top3[idx];
    if (!p) return;
    const heightClass = idx === 0 ? 'h1' : idx === 1 ? 'h2' : 'h3';
    const posClass = idx === 0 ? 'p1' : idx === 1 ? 'p2' : 'p3';
    const col = document.createElement('div');
    col.className = `podium-col ${posClass}`;
    col.innerHTML = `${avatarImg(p, 'avatar-img-podium')}<div>${p.pseudo}</div><div class="podium-block ${heightClass}">${idx + 1}</div>`;
    stage.appendChild(col);
  });

  const lb = document.getElementById('final-leaderboard');
  lb.innerHTML = '';
  leaderboard.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.style.animationDelay = `${i * 0.05}s`;
    row.innerHTML = `<span class="lb-rank">${i + 1}</span>${avatarImg(p, 'avatar-img-sm')}<span class="lb-name">${p.pseudo}</span><span class="lb-score">${p.score} pts</span>`;
    lb.appendChild(row);
  });

  if (window.confetti) {
    confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
    setTimeout(() => confetti({ particleCount: 100, spread: 120, origin: { y: 0.4 } }), 400);
  }
});

document.getElementById('btn-end-game').addEventListener('click', () => {
  socket.emit('draw:end-game');
  window.location.href = '/index.html';
});

// ---------- Rejouer (retour au lobby, sans recréer de partie) ----------
document.getElementById('btn-replay').addEventListener('click', () => socket.emit('draw:host-restart'));

socket.on('draw:game-reset', ({ players }) => {
  document.getElementById('player-count-num').textContent = players.length;
  const pills = document.getElementById('player-pills');
  pills.innerHTML = '';
  players.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'player-pill';
    el.innerHTML = `<img class="avatar-img-sm" src="${p.avatar}"> ${p.pseudo}`;
    pills.appendChild(el);
  });
  const errEl = document.getElementById('lobby-error');
  if (errEl) errEl.textContent = '';
  showScreen('lobby');
});

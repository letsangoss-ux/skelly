const socket = io();

const AVATAR_GALLERY = [
  '/avatars/avatar1.svg', '/avatars/avatar2.svg', '/avatars/avatar3.svg', '/avatars/avatar4.svg', '/avatars/avatar5.svg',
  '/avatars/avatar6.svg', '/avatars/avatar7.svg', '/avatars/avatar8.svg', '/avatars/avatar9.svg', '/avatars/avatar10.svg',
];
let selectedAvatar = AVATAR_GALLERY[0];
let myPseudo = '';
let timerInterval = null;
let answered = false;
let audioCtx = null;

// ---------- Identité persistante (pour se reconnecter après coupure) ----------
let myPlayerId = localStorage.getItem('quizPlayerId');
if (!myPlayerId) {
  myPlayerId = Math.random().toString(16).slice(2) + Date.now().toString(16);
  localStorage.setItem('quizPlayerId', myPlayerId);
}
let lastCode = localStorage.getItem('quizLastCode') || '';
let lastPseudo = localStorage.getItem('quizLastPseudo') || '';

const screens = {
  join: document.getElementById('screen-join'),
  wait: document.getElementById('screen-wait'),
  play: document.getElementById('screen-play'),
  result: document.getElementById('screen-result'),
  final: document.getElementById('screen-final'),
};
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

// ---------- Petit bip généré (pour le tic-tac des 5 dernières secondes) ----------
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) { /* ignore */ }
}

// ---------- Galerie d'avatars réutilisable ----------
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

// ---------- Rejoindre ----------
document.getElementById('btn-join').addEventListener('click', join);
document.getElementById('input-pseudo').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

function join() {
  const code = document.getElementById('input-code').value.trim();
  const pseudo = document.getElementById('input-pseudo').value.trim();
  document.getElementById('join-error').textContent = '';
  if (!code || !pseudo) {
    document.getElementById('join-error').textContent = 'Merci de remplir le code et ton pseudo.';
    return;
  }
  myPseudo = pseudo;
  localStorage.setItem('quizLastCode', code.toUpperCase());
  localStorage.setItem('quizLastPseudo', pseudo);
  socket.emit('player:join-game', { code, pseudo, avatar: selectedAvatar, playerId: myPlayerId });
}

// Tentative de reconnexion automatique uniquement si une partie était en cours
const wasInGame = localStorage.getItem('quizInGame') === '1';
if (wasInGame && lastCode && lastPseudo && !params.get('code')) {
  socket.emit('player:join-game', { code: lastCode, pseudo: lastPseudo, avatar: selectedAvatar, playerId: myPlayerId });
}

socket.on('player:join-error', ({ message }) => {
  document.getElementById('join-error').textContent = message;
  localStorage.removeItem('quizInGame');
});

socket.on('player:joined', ({ pseudo, avatar }) => {
  localStorage.setItem('quizInGame', '1');
  myPseudo = pseudo;
  if (avatar) selectedAvatar = avatar;
  document.getElementById('wait-avatar').src = avatar || selectedAvatar;
  document.getElementById('wait-pseudo').textContent = pseudo;
  showScreen('wait');
});

socket.on('player:kicked', () => {
  localStorage.removeItem('quizLastCode');
  localStorage.removeItem('quizInGame');
  alert("L'animateur t'a retiré de la partie.");
  window.location.href = '/player.html';
});

// ---------- Changer de photo pendant l'attente ----------
const avatarPickerPanel = document.getElementById('avatar-picker-panel');
document.getElementById('btn-change-avatar').addEventListener('click', () => {
  avatarPickerPanel.classList.toggle('hidden');
  if (!avatarPickerPanel.classList.contains('hidden')) {
    buildAvatarGallery(
      document.getElementById('wait-avatar-grid'), selectedAvatar,
      (url) => {
        selectedAvatar = url;
        document.getElementById('wait-avatar').src = url;
        socket.emit('player:update-avatar', { avatar: url });
        avatarPickerPanel.classList.add('hidden');
      },
      document.getElementById('wait-avatar-upload-input')
    );
  }
});

// ---------- Réactions ----------
document.querySelectorAll('.reaction-btn').forEach((btn) => {
  btn.addEventListener('click', () => socket.emit('player:reaction', { emoji: btn.dataset.emoji }));
});

// ---------- Question ----------
const answerColors = ['answer-0', 'answer-1', 'answer-2', 'answer-3'];
let paused = false;

socket.on('question:show', (q) => {
  answered = false;
  paused = false;
  showScreen('play');
  document.getElementById('p-progress').textContent = `Question ${q.index + 1} / ${q.total}`;
  document.getElementById('p-waiting-msg').classList.add('hidden');
  document.getElementById('p-multi-banner').classList.toggle('hidden', !q.multipleAnswers);

  const questionTextEl = document.getElementById('p-question-text');
  questionTextEl.textContent = q.text || '';
  questionTextEl.classList.toggle('hidden', !q.text);

  const photoFrame = document.getElementById('p-photo-frame');
  if (q.image) { document.getElementById('p-image').src = q.image; photoFrame.classList.remove('hidden'); }
  else photoFrame.classList.add('hidden');

  const wrap = document.getElementById('p-answers');
  wrap.innerHTML = '';
  wrap.classList.remove('hidden');
  q.answers.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.className = `answer-btn ${answerColors[i]}`;
    btn.innerHTML = `<span class="answer-shape"></span> ${text}`;
    btn.addEventListener('click', () => submitAnswer(i, wrap));
    wrap.appendChild(btn);
  });

  startTimer(q.duration);
});

socket.on('game:paused', () => { paused = true; clearInterval(timerInterval); });
socket.on('game:resumed', () => { paused = false; resumeTimerVisual(); });

function submitAnswer(index, wrap) {
  if (answered || paused) return;
  answered = true;
  socket.emit('player:submit-answer', { answerIndex: index });
  wrap.querySelectorAll('.answer-btn').forEach((b, i) => { b.disabled = true; if (i === index) b.classList.add('chosen'); });
  document.getElementById('p-waiting-msg').classList.remove('hidden');
}

let currentRemaining = 0;
let currentDuration = 20;

function startTimer(duration) {
  clearInterval(timerInterval);
  currentDuration = duration;
  currentRemaining = duration;
  const circle = document.getElementById('p-timer-circle');
  circle.style.strokeDasharray = 2 * Math.PI * 27;
  tick();
  timerInterval = setInterval(tick, 1000);
}
function resumeTimerVisual() {
  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
}
function tick() {
  if (paused) return;
  const circle = document.getElementById('p-timer-circle');
  const numEl = document.getElementById('p-timer-num');
  const circumference = 2 * Math.PI * 27;
  numEl.textContent = Math.max(currentRemaining, 0);
  const ratio = Math.max(currentRemaining, 0) / currentDuration;
  circle.style.strokeDashoffset = circumference * (1 - ratio);
  if (currentRemaining <= 5 && currentRemaining > 0) beep();
  if (currentRemaining <= 0) {
    clearInterval(timerInterval);
    if (!answered) document.querySelectorAll('#p-answers .answer-btn').forEach((b) => (b.disabled = true));
    return;
  }
  currentRemaining -= 1;
}

// ---------- Résultat individuel ----------
socket.on('player:result', ({ correct, points, totalScore, streak }) => {
  clearInterval(timerInterval);
  showScreen('result');
  document.getElementById('result-emoji').textContent = correct ? '🎉' : '😬';
  document.getElementById('result-text').textContent = correct ? 'Bonne réponse !' : 'Raté cette fois...';
  document.getElementById('result-points').textContent = correct ? `+${points} points` : '+0 point';
  document.getElementById('result-total').textContent = `${totalScore} points`;
  const streakEl = document.getElementById('result-streak');
  if (correct && streak >= 2) {
    streakEl.textContent = `🔥 ${streak} bonnes réponses d'affilée !`;
    streakEl.classList.remove('hidden');
  } else {
    streakEl.classList.add('hidden');
  }
});

// ---------- Fin de partie ----------
socket.on('game:over', ({ leaderboard, awards }) => {
  showScreen('final');
  localStorage.removeItem('quizLastCode');
  localStorage.removeItem('quizInGame');
  const myRank = leaderboard.findIndex((p) => p.pseudo === myPseudo);
  const title = myRank === 0 ? '👑 Tu remportes la partie !' : myRank >= 0 && myRank <= 2 ? '🏅 Sur le podium !' : "Merci d'avoir joué !";
  document.getElementById('final-title').textContent = title;

  const awardsEl = document.getElementById('final-awards');
  awardsEl.innerHTML = '';
  if (awards) {
    if (awards.fastest) awardsEl.innerHTML += `<div class="award-row"><span class="award-emoji">⚡</span><span class="award-text"><strong>${awards.fastest.pseudo}</strong> — le plus rapide</span></div>`;
    if (awards.streak) awardsEl.innerHTML += `<div class="award-row"><span class="award-emoji">🔥</span><span class="award-text"><strong>${awards.streak.pseudo}</strong> — ${awards.streak.value} bonnes réponses d'affilée</span></div>`;
    if (awards.comeback) awardsEl.innerHTML += `<div class="award-row"><span class="award-emoji">🚀</span><span class="award-text"><strong>${awards.comeback.pseudo}</strong> — plus grosse remontée au classement</span></div>`;
  }

  const lb = document.getElementById('final-player-leaderboard');
  lb.innerHTML = '';
  leaderboard.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.style.animationDelay = `${i * 0.05}s`;
    row.innerHTML = `<span class="lb-rank">${i + 1}</span><img class="avatar-img-sm" src="${p.avatar}"><span class="lb-name">${p.pseudo}</span><span class="lb-score">${p.score} pts</span>`;
    lb.appendChild(row);
  });

  if (myRank >= 0 && myRank <= 2 && window.confetti) confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
});

socket.on('game:host-left', () => alert("L'animateur a quitté la partie."));

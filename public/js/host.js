const socket = io();

let currentQuiz = null;
let gameCode = null;
let timerInterval = null;
let currentQuestionIndex = 0;
let musicMuted = false;
let isPaused = false;
let currentPlayersMap = {}; // socketId -> player (pour le bouton "exclure")

const urlParams = new URLSearchParams(window.location.search);
const presetQuizId = urlParams.get('quizId');

// ---------- Fiabilité : ne jamais rester bloqué silencieusement ----------
// Si le serveur signale qu'il ne retrouve plus la partie (ex: le service a
// redémarré/s'est mis en veille pendant l'attente des joueurs), on prévient
// clairement au lieu de laisser le bouton "Lancer la partie" ne rien faire.
socket.on('host:error', ({ message }) => {
  alert(message || "Un problème est survenu. Merci de recréer une partie.");
});

// Si la connexion au serveur a été coupée puis rétablie alors qu'on était déjà
// passé à l'écran de salle d'attente, la partie précédente n'existe plus côté
// serveur (mémoire perdue). On recrée automatiquement une nouvelle partie avec
// le même quiz pour ne pas rester bloqué — un nouveau code sera affiché.
let hasConnectedOnce = false;
socket.on('connect', () => {
  if (!hasConnectedOnce) { hasConnectedOnce = true; return; }
  if (!screens.lobby.classList.contains('hidden') && gameCode) {
    const quizIdToReuse = (currentQuiz && currentQuiz.id) || presetQuizId;
    gameCode = null;
    alert("La connexion avec le serveur a été rétablie mais la partie précédente a été perdue (le service a probablement redémarré). Un nouveau code va être généré.");
    socket.emit('host:create-game', { quizId: quizIdToReuse });
  }
});

const screens = {
  create: document.getElementById('screen-create'),
  lobby: document.getElementById('screen-lobby'),
  question: document.getElementById('screen-question'),
  reveal: document.getElementById('screen-reveal'),
  podium: document.getElementById('screen-podium'),
};
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}
function avatarImg(p, cls) { return `<img class="${cls}" src="${p.avatar}" alt="${p.pseudo}">`; }

// ---------- Écran 1 : choisir / créer la partie ----------
async function initCreateScreen() {
  if (presetQuizId) {
    document.getElementById('quiz-select-list').classList.add('hidden');
    document.getElementById('preset-create-row').classList.remove('hidden');
    try {
      const res = await fetch('/api/quizzes');
      const quizzes = await res.json();
      const quiz = quizzes.find((q) => q.id === presetQuizId);
      if (quiz) document.getElementById('create-subtitle').textContent = `Quiz choisi : « ${quiz.title} »`;
    } catch (e) {}
    return;
  }
  try {
    const res = await fetch('/api/quizzes');
    const quizzes = await res.json();
    const list = document.getElementById('quiz-select-list');
    list.innerHTML = '';
    if (quizzes.length === 0) { list.innerHTML = '<p class="subtitle">Aucun quiz. Créez-en un depuis « Gérer mes quiz ».</p>'; return; }
    quizzes.forEach((q) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-ghost';
      btn.textContent = `${q.title} (${q.questions.length} question${q.questions.length > 1 ? 's' : ''})`;
      btn.addEventListener('click', () => socket.emit('host:create-game', { quizId: q.id }));
      list.appendChild(btn);
    });
  } catch (e) {
    document.getElementById('quiz-select-list').innerHTML = '<p class="subtitle">Impossible de charger les quiz.</p>';
  }
}
initCreateScreen();

document.getElementById('btn-create').addEventListener('click', () => {
  socket.emit('host:create-game', { quizId: presetQuizId });
});

// ---------- Musique de fond ----------
const bgMusic = document.getElementById('bg-music');
const musicControl = document.getElementById('music-control');
const btnToggleMusic = document.getElementById('btn-toggle-music');
const musicVolumeSlider = document.getElementById('music-volume');
bgMusic.volume = musicVolumeSlider.value / 100;

function playTrack(url) {
  if (!url) return;
  if (bgMusic.getAttribute('data-current') !== url) {
    bgMusic.src = url;
    bgMusic.setAttribute('data-current', url);
  }
  bgMusic.muted = musicMuted;
  bgMusic.play().catch(() => {});
}
function playLobbyMusic() {
  if (currentQuiz && currentQuiz.music) { playTrack(currentQuiz.music); musicControl.classList.remove('hidden'); }
}
function playQuestionMusic() {
  if (currentQuiz && currentQuiz.musicQuestion) playTrack(currentQuiz.musicQuestion);
  else if (currentQuiz && currentQuiz.music) playTrack(currentQuiz.music);
}
function stopMusic() { bgMusic.pause(); bgMusic.currentTime = 0; bgMusic.removeAttribute('data-current'); }

btnToggleMusic.addEventListener('click', () => {
  musicMuted = !musicMuted;
  bgMusic.muted = musicMuted;
  btnToggleMusic.textContent = musicMuted ? '🔇' : '🔊';
  if (!musicMuted && bgMusic.paused) bgMusic.play().catch(() => {});
});

musicVolumeSlider.addEventListener('input', () => {
  bgMusic.volume = musicVolumeSlider.value / 100;
  if (musicVolumeSlider.value > 0 && musicMuted) {
    musicMuted = false;
    bgMusic.muted = false;
    btnToggleMusic.textContent = '🔊';
  }
});

// ---------- Créer la partie ----------
socket.on('host:game-created', ({ code, quiz }) => {
  gameCode = code;
  currentQuiz = quiz;
  document.getElementById('lobby-code').textContent = code;

  const joinUrl = `${window.location.origin}/player.html?code=${code}`;
  document.getElementById('qrcode').innerHTML = '';
  new QRCode(document.getElementById('qrcode'), { text: joinUrl, width: 200, height: 200, colorDark: '#16130F', colorLight: '#F8F3EA' });

  showScreen('lobby');
  if (quiz.music || quiz.musicQuestion) musicControl.classList.remove('hidden');
  playLobbyMusic();
});

// ---------- Joueurs qui rejoignent ----------
socket.on('host:player-joined', ({ players }) => {
  document.getElementById('player-count-num').textContent = players.length;
  currentPlayersMap = {};
  const pills = document.getElementById('player-pills');
  pills.innerHTML = '';
  players.forEach((p) => {
    if (p.socketId) currentPlayersMap[p.socketId] = p;
    const el = document.createElement('div');
    el.className = 'player-pill';
    el.innerHTML = `${avatarImg(p, 'avatar-img-sm')} ${p.pseudo} <button class="kick-btn" title="Exclure">✕</button>`;
    el.querySelector('.kick-btn').addEventListener('click', () => {
      if (confirm(`Exclure ${p.pseudo} de la partie ?`)) socket.emit('host:kick-player', { socketId: p.socketId });
    });
    pills.appendChild(el);
  });
});

// ---------- Lancer la partie ----------
document.getElementById('btn-start').addEventListener('click', () => socket.emit('host:start-game'));

// ---------- Afficher une question ----------
const answerColors = ['answer-0', 'answer-1', 'answer-2', 'answer-3'];
let currentAnswersText = [];

let pendingDuration = 20;

// Étape 1 : aperçu de la question (texte/photo/son), pas de chrono, réponses pas
// cliquables — l'animateur laisse le temps à tout le monde de prendre connaissance
// des éléments, puis clique sur "Ouvrir les réponses" quand il est prêt.
socket.on('question:preview', (q) => {
  showScreen('question');
  isPaused = false;
  document.getElementById('btn-toggle-pause').textContent = '⏸ Pause';
  currentQuestionIndex = q.index;
  currentAnswersText = q.answers;
  pendingDuration = q.duration;
  document.getElementById('q-progress').textContent = `Question ${q.index + 1} / ${q.total}`;
  document.getElementById('q-text').textContent = q.text || '';
  document.getElementById('q-text').classList.toggle('hidden', !q.text);
  document.getElementById('answered-count').textContent = '0';
  document.getElementById('total-players').textContent = document.getElementById('player-count-num').textContent;
  document.getElementById('q-multi-banner').classList.toggle('hidden', !q.multipleAnswers);

  const photoFrame = document.getElementById('q-photo-frame');
  const expandBtn = document.getElementById('btn-expand-photo');
  if (q.image) {
    document.getElementById('q-image').src = q.image;
    photoFrame.classList.remove('hidden');
    expandBtn.classList.remove('hidden');
  } else {
    photoFrame.classList.add('hidden');
    expandBtn.classList.add('hidden');
  }

  const questionSound = document.getElementById('question-sound');
  questionSound.pause();
  if (q.sound) {
    questionSound.src = q.sound;
    questionSound.currentTime = 0;
    questionSound.play().catch(() => {});
  } else {
    questionSound.removeAttribute('src');
  }

  const wrap = document.getElementById('q-answers-host');
  wrap.innerHTML = '';
  q.answers.forEach((text, i) => {
    const btn = document.createElement('div');
    btn.className = `answer-btn ${answerColors[i]}`;
    btn.innerHTML = `<span class="answer-shape"></span> ${text}`;
    wrap.appendChild(btn);
  });

  playQuestionMusic();

  // Écran d'aperçu : chrono figé à la durée totale, bouton "Ouvrir les réponses"
  // visible, bouton "Révéler" et pause masqués (pas de chrono en cours à interrompre).
  clearInterval(timerInterval);
  const circle = document.getElementById('timer-circle');
  document.getElementById('timer-num').textContent = q.duration;
  circle.style.strokeDasharray = 2 * Math.PI * 27;
  circle.style.strokeDashoffset = 0;
  document.getElementById('btn-open-answering').classList.remove('hidden');
  document.getElementById('btn-reveal').classList.add('hidden');
  document.getElementById('btn-toggle-pause').classList.add('hidden');
  document.getElementById('waiting-msg-answers').classList.add('hidden');
});

document.getElementById('btn-open-answering').addEventListener('click', () => {
  socket.emit('host:open-answering');
});

// Étape 2 : l'animateur a cliqué "Ouvrir les réponses" — le chrono démarre
// vraiment maintenant et les joueurs peuvent répondre.
socket.on('question:answers-open', ({ duration }) => {
  document.getElementById('btn-open-answering').classList.add('hidden');
  document.getElementById('btn-reveal').classList.remove('hidden');
  document.getElementById('btn-toggle-pause').classList.remove('hidden');
  document.getElementById('waiting-msg-answers').classList.remove('hidden');
  startTimer(duration);
});

socket.on('host:player-answered', ({ answeredCount, totalPlayers }) => {
  document.getElementById('answered-count').textContent = answeredCount;
  document.getElementById('total-players').textContent = totalPlayers;
});

function startTimer(duration) {
  clearInterval(timerInterval);
  const circle = document.getElementById('timer-circle');
  const numEl = document.getElementById('timer-num');
  const circumference = 2 * Math.PI * 27;
  circle.style.strokeDasharray = circumference;
  let remaining = duration;
  numEl.textContent = remaining;
  circle.style.strokeDashoffset = 0;
  timerInterval = setInterval(() => {
    if (isPaused) return;
    remaining -= 1;
    numEl.textContent = Math.max(remaining, 0);
    circle.style.strokeDashoffset = circumference * (1 - Math.max(remaining, 0) / duration);
    if (remaining <= 0) clearInterval(timerInterval);
  }, 1000);
}

// ---------- Pause ----------
document.getElementById('btn-toggle-pause').addEventListener('click', () => socket.emit('host:toggle-pause'));
socket.on('game:paused', () => {
  isPaused = true;
  document.getElementById('btn-toggle-pause').textContent = '▶ Reprendre';
  if (!document.getElementById('pause-overlay-el')) {
    const overlay = document.createElement('div');
    overlay.className = 'pause-overlay';
    overlay.id = 'pause-overlay-el';
    overlay.textContent = '⏸ Partie en pause';
    document.body.appendChild(overlay);
  }
});
socket.on('game:resumed', () => {
  isPaused = false;
  document.getElementById('btn-toggle-pause').textContent = '⏸ Pause';
  const overlay = document.getElementById('pause-overlay-el');
  if (overlay) overlay.remove();
});

// ---------- Réactions flottantes ----------
socket.on('host:reaction', ({ emoji }) => {
  const el = document.createElement('div');
  el.className = 'floating-reaction';
  el.textContent = emoji;
  el.style.left = `${10 + Math.random() * 80}%`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2700);
});

// ---------- Photo en plein écran ----------
document.getElementById('btn-expand-photo').addEventListener('click', () => {
  const overlay = document.createElement('div');
  overlay.className = 'fullscreen-photo-overlay';
  overlay.innerHTML = `<img src="${document.getElementById('q-image').src}" alt="Photo en grand">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
  const escHandler = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
});

// ---------- Révéler ----------
document.getElementById('btn-reveal').addEventListener('click', () => socket.emit('host:reveal'));

function rankChangeHtml(p) {
  if (p.isNew || !p.rankChange) return '<span class="lb-rank-change same">—</span>';
  if (p.rankChange > 0) return `<span class="lb-rank-change up">▲ ${p.rankChange}</span>`;
  return `<span class="lb-rank-change down">▼ ${Math.abs(p.rankChange)}</span>`;
}
function renderLeaderboard(container, leaderboard, withRankChange) {
  container.innerHTML = '';
  leaderboard.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.style.animationDelay = `${i * 0.05}s`;
    row.innerHTML = `
      <span class="lb-rank">${i + 1}</span>
      ${avatarImg(p, 'avatar-img-sm')}
      <span class="lb-name">${p.pseudo}</span>
      <span class="lb-score">${p.score} pts</span>
      ${withRankChange ? rankChangeHtml(p) : ''}
    `;
    container.appendChild(row);
  });
}

socket.on('question:reveal', ({ correctIndexes, stats, leaderboard }) => {
  clearInterval(timerInterval);
  document.getElementById('question-sound').pause();
  showScreen('reveal');

  const total = stats.reduce((a, b) => a + b, 0) || 1;
  const bars = document.getElementById('stats-bars');
  bars.innerHTML = '';
  stats.forEach((count, i) => {
    const pct = Math.round((count / total) * 100);
    const isCorrect = correctIndexes.includes(i);
    const row = document.createElement('div');
    row.className = 'stat-bar-row';
    row.innerHTML = `
      <span class="answer-shape ${answerColors[i]}" style="width:14px;height:14px;border-radius:4px;flex-shrink:0;"></span>
      <span style="min-width:130px; ${isCorrect ? 'color:var(--gold);font-weight:700;' : ''}">${currentAnswersText[i]}${isCorrect ? ' ✓' : ''}</span>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
      <span style="min-width:30px;text-align:right;">${count}</span>
    `;
    bars.appendChild(row);
  });

  const correctTexts = correctIndexes.map((i) => currentAnswersText[i]).join(' ou ');
  document.getElementById('reveal-answer-text').textContent = `Bonne réponse : ${correctTexts}`;
  renderLeaderboard(document.getElementById('reveal-leaderboard'), leaderboard, true);
});

// ---------- Question suivante ----------
document.getElementById('btn-next').addEventListener('click', () => socket.emit('host:next-question'));

// ---------- Fin de partie ----------
socket.on('game:over', ({ leaderboard, awards }) => {
  showScreen('podium');
  stopMusic();
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

  const awardsEl = document.getElementById('podium-awards');
  awardsEl.innerHTML = '';
  if (awards) {
    if (awards.fastest) awardsEl.innerHTML += `<div class="award-row"><span class="award-emoji">⚡</span><span class="award-text"><strong>${awards.fastest.pseudo}</strong> — le plus rapide</span></div>`;
    if (awards.streak) awardsEl.innerHTML += `<div class="award-row"><span class="award-emoji">🔥</span><span class="award-text"><strong>${awards.streak.pseudo}</strong> — ${awards.streak.value} bonnes réponses d'affilée</span></div>`;
    if (awards.comeback) awardsEl.innerHTML += `<div class="award-row"><span class="award-emoji">🚀</span><span class="award-text"><strong>${awards.comeback.pseudo}</strong> — plus grosse remontée au classement</span></div>`;
  }

  renderLeaderboard(document.getElementById('final-leaderboard'), leaderboard, false);

  if (window.confetti) {
    confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
    setTimeout(() => confetti({ particleCount: 100, spread: 120, origin: { y: 0.4 } }), 400);
  }
});

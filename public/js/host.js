const socket = io();

let currentQuiz = null;
let gameCode = null;
let timerInterval = null;
let currentQuestionIndex = 0;
let musicMuted = false;

const urlParams = new URLSearchParams(window.location.search);
const presetQuizId = urlParams.get('quizId');

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

function avatarImg(p, cls) {
  return `<img class="${cls}" src="${p.avatar}" alt="${p.pseudo}">`;
}

async function initCreateScreen() {
  if (presetQuizId) {
    document.getElementById('quiz-select-list').classList.add('hidden');
    document.getElementById('preset-create-row').classList.remove('hidden');
    try {
      const res = await fetch('/api/quizzes');
      const quizzes = await res.json();
      const quiz = quizzes.find((q) => q.id === presetQuizId);
      if (quiz) document.getElementById('create-subtitle').textContent = `Quiz choisi : « ${quiz.title} »`;
    } catch (e) { }
    return;
  }
  try {
    const res = await fetch('/api/quizzes');
    const quizzes = await res.json();
    const list = document.getElementById('quiz-select-list');
    list.innerHTML = '';
    if (quizzes.length === 0) {
      list.innerHTML = '<p class="subtitle">Aucun quiz pour le moment. Créez-en un depuis « Gérer mes quiz ».</p>';
      return;
    }
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

const bgMusic = document.getElementById('bg-music');
const btnToggleMusic = document.getElementById('btn-toggle-music');
const volumeSlider = document.getElementById('music-volume');

function playMusicIfAny() {
  if (currentQuiz && currentQuiz.music) {
    bgMusic.src = currentQuiz.music;
    bgMusic.volume = volumeSlider.value;
    bgMusic.muted = musicMuted;
    bgMusic.play().catch(() => {});
    btnToggleMusic.classList.remove('hidden');
    volumeSlider.classList.remove('hidden');
  } else {
    btnToggleMusic.classList.add('hidden');
    volumeSlider.classList.add('hidden');
  }
}

btnToggleMusic.addEventListener('click', () => {
  musicMuted = !musicMuted;
  bgMusic.muted = musicMuted;
  btnToggleMusic.textContent = musicMuted ? '🔇 Musique' : '🔊 Musique';
  if (!musicMuted && bgMusic.paused) bgMusic.play().catch(() => {});
});

volumeSlider.addEventListener('input', (e) => {
  bgMusic.volume = e.target.value;
});

function stopMusic() {
  bgMusic.pause();
  bgMusic.currentTime = 0;
}

socket.on('host:game-created', ({ code, quiz }) => {
  gameCode = code;
  currentQuiz = quiz;
  document.getElementById('lobby-code').textContent = code;

  const joinUrl = `${window.location.origin}/player.html?code=${code}`;
  document.getElementById('qrcode').innerHTML = '';
  new QRCode(document.getElementById('qrcode'), {
    text: joinUrl,
    width: 200,
    height: 200,
    colorDark: '#16130F',
    colorLight: '#F8F3EA',
  });

  showScreen('lobby');
  playMusicIfAny();
});

socket.on('host:player-joined', ({ players }) => {
  document.getElementById('player-count-num').textContent = players.length;
  const pills = document.getElementById('player-pills');
  pills.innerHTML = '';
  players.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'player-pill';
    el.innerHTML = `${avatarImg(p, 'avatar-img-sm')} ${p.pseudo}`;
    pills.appendChild(el);
  });
});

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('host:start-game');
});

const answerColors = ['answer-0', 'answer-1', 'answer-2', 'answer-3'];
let currentAnswersText = [];

socket.on('question:show', (q) => {
  showScreen('question');
  currentQuestionIndex = q.index;
  currentAnswersText = q.answers;
  document.getElementById('q-progress').textContent = `Question ${q.index + 1} / ${q.total}`;
  document.getElementById('answered-count').textContent = '0';
  document.getElementById('total-players').textContent = document.getElementById('player-count-num').textContent;
  
  document.getElementById('q-text').textContent = q.text || '';
  
  const imgFrame = document.getElementById('q-image-frame');
  const btnExpand = document.getElementById('btn-expand-photo');
  if (q.image) {
    document.getElementById('q-image').src = q.image;
    imgFrame.classList.remove('hidden');
    btnExpand.classList.remove('hidden');
  } else {
    imgFrame.classList.add('hidden');
    btnExpand.classList.add('hidden');
  }

  const wrap = document.getElementById('q-answers-host');
  wrap.innerHTML = '';
  q.answers.forEach((text, i) => {
    const btn = document.createElement('div');
    btn.className = `answer-btn ${answerColors[i]}`;
    btn.innerHTML = `<span class="answer-shape"></span> ${text}`;
    wrap.appendChild(btn);
  });

  startTimer(q.duration);
});

socket.on('host:player-answered', ({ answeredCount, totalPlayers }) => {
  document.getElementById('answered-count').textContent = answeredCount;
  document.getElementById('total-players').textContent = totalPlayers;
});

function startTimer(duration) {
  clearInterval(timerInterval);
  const circle = document.getElementById('timer-circle');
  const numEl = document.getElementById('timer-num');
  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  circle.style.strokeDasharray = circumference;

  let remaining = duration;
  numEl.textContent = remaining;
  circle.style.strokeDashoffset = 0;

  timerInterval = setInterval(() => {
    remaining -= 1;
    numEl.textContent = Math.max(remaining, 0);
    const ratio = Math.max(remaining, 0) / duration;
    circle.style.strokeDashoffset = circumference * (1 - ratio);
    if (remaining <= 0) clearInterval(timerInterval);
  }, 1000);
}

document.getElementById('btn-expand-photo').addEventListener('click', () => {
  const overlay = document.createElement('div');
  overlay.className = 'fullscreen-photo-overlay';
  overlay.innerHTML = `<img src="${document.getElementById('q-image').src}" alt="Photo en grand">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
  const escHandler = (e) => {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
});

document.getElementById('btn-reveal').addEventListener('click', () => {
  socket.emit('host:reveal');
});

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

  const correctTexts = correctIndexes.map(i => currentAnswersText[i]).join(' et ');
  document.getElementById('reveal-answer-text').textContent = `Bonne(s) réponse(s) : ${correctTexts}`;
  
  renderLeaderboard(document.getElementById('reveal-leaderboard'), leaderboard, true);
});

document.getElementById('btn-next').addEventListener('click', () => {
  socket.emit('host:next-question');
});

socket.on('game:over', ({ leaderboard }) => {
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
    col.innerHTML = `
      ${avatarImg(p, 'avatar-img-podium')}
      <div>${p.pseudo}</div>
      <div class="podium-block ${heightClass}">${idx + 1}</div>
    `;
    stage.appendChild(col);
  });

  renderLeaderboard(document.getElementById('final-leaderboard'), leaderboard, false);

  if (window.confetti) {
    confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
    setTimeout(() => confetti({ particleCount: 100, spread: 120, origin: { y: 0.4 } }), 400);
  }
});

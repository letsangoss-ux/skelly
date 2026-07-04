const socket = io();

const AVATARS = ['👛', '👜', '🛍️', '💎', '👑', '✨', '🦋', '🌸', '🔥', '💅'];
let selectedAvatar = AVATARS[0];
let myPseudo = '';
let timerInterval = null;
let answered = false;

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

// ---------- Avatars ----------
const avatarGrid = document.getElementById('avatar-grid');
AVATARS.forEach((a, i) => {
  const el = document.createElement('div');
  el.className = 'avatar-choice' + (i === 0 ? ' selected' : '');
  el.textContent = a;
  el.addEventListener('click', () => {
    document.querySelectorAll('.avatar-choice').forEach((c) => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedAvatar = a;
  });
  avatarGrid.appendChild(el);
});

// Pré-remplir le code si on arrive via un QR code (?code=XXXXX)
const params = new URLSearchParams(window.location.search);
if (params.get('code')) {
  document.getElementById('input-code').value = params.get('code').toUpperCase();
}

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
  socket.emit('player:join-game', { code, pseudo, avatar: selectedAvatar });
}

socket.on('player:join-error', ({ message }) => {
  document.getElementById('join-error').textContent = message;
});

socket.on('player:joined', ({ pseudo, avatar }) => {
  document.getElementById('wait-avatar').textContent = avatar;
  document.getElementById('wait-pseudo').textContent = pseudo;
  showScreen('wait');
});

// ---------- Question ----------
const answerColors = ['answer-0', 'answer-1', 'answer-2', 'answer-3'];

socket.on('question:show', (q) => {
  answered = false;
  showScreen('play');
  document.getElementById('p-progress').textContent = `Question ${q.index + 1} / ${q.total}`;
  document.getElementById('p-waiting-msg').classList.add('hidden');

  const wrap = document.getElementById('p-answers');
  wrap.innerHTML = '';
  document.getElementById('p-answers').classList.remove('hidden');
  q.answers.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.className = `answer-btn ${answerColors[i]}`;
    btn.innerHTML = `<span class="answer-shape"></span> ${text}`;
    btn.addEventListener('click', () => submitAnswer(i, wrap));
    wrap.appendChild(btn);
  });

  startTimer(q.duration);
});

function submitAnswer(index, wrap) {
  if (answered) return;
  answered = true;
  socket.emit('player:submit-answer', { answerIndex: index });
  const buttons = wrap.querySelectorAll('.answer-btn');
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === index) b.classList.add('chosen');
  });
  document.getElementById('p-waiting-msg').classList.remove('hidden');
}

function startTimer(duration) {
  clearInterval(timerInterval);
  const circle = document.getElementById('p-timer-circle');
  const numEl = document.getElementById('p-timer-num');
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
    if (remaining <= 0) {
      clearInterval(timerInterval);
      if (!answered) {
        document.querySelectorAll('#p-answers .answer-btn').forEach((b) => (b.disabled = true));
      }
    }
  }, 1000);
}

// ---------- Résultat individuel ----------
socket.on('player:result', ({ correct, points, totalScore }) => {
  clearInterval(timerInterval);
  showScreen('result');
  document.getElementById('result-emoji').textContent = correct ? '🎉' : '😬';
  document.getElementById('result-text').textContent = correct ? 'Bonne réponse !' : 'Raté cette fois...';
  document.getElementById('result-points').textContent = correct ? `+${points} points` : '+0 point';
  document.getElementById('result-total').textContent = `${totalScore} points`;
});

// ---------- Fin de partie ----------
socket.on('game:over', ({ leaderboard }) => {
  showScreen('final');
  const myRank = leaderboard.findIndex((p) => p.pseudo === myPseudo);
  const title = myRank === 0 ? '👑 Tu remportes la partie !' : myRank <= 2 ? '🏅 Sur le podium !' : 'Merci d\'avoir joué !';
  document.getElementById('final-title').textContent = title;

  const lb = document.getElementById('final-player-leaderboard');
  lb.innerHTML = '';
  leaderboard.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.style.animationDelay = `${i * 0.05}s`;
    row.innerHTML = `<span class="lb-rank">${i + 1}</span><span class="lb-name">${p.avatar} ${p.pseudo}</span><span class="lb-score">${p.score} pts</span>`;
    lb.appendChild(row);
  });

  if (myRank <= 2 && window.confetti) {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
  }
});

socket.on('game:host-left', () => {
  alert("L'animateur a quitté la partie.");
});

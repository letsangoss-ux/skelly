const socket = io();
let gameCode = null;

const screens = {
  create: document.getElementById('screen-create'),
  lobby: document.getElementById('screen-lobby'),
  writing: document.getElementById('screen-writing'),
  guessing: document.getElementById('screen-guessing'),
  reveal: document.getElementById('screen-reveal'),
  podium: document.getElementById('screen-podium'),
};
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}
function avatarImg(p, cls) { return `<img class="${cls}" src="${p.avatar}" alt="${p.pseudo}">`; }

document.getElementById('btn-create').addEventListener('click', () => socket.emit('tl:create-game'));

socket.on('tl:game-created', ({ code }) => {
  gameCode = code;
  document.getElementById('lobby-code').textContent = code;
  const joinUrl = `${window.location.origin}/truth-player.html?code=${code}`;
  document.getElementById('qrcode').innerHTML = '';
  new QRCode(document.getElementById('qrcode'), { text: joinUrl, width: 200, height: 200, colorDark: '#16130F', colorLight: '#F8F3EA' });
  showScreen('lobby');
});

socket.on('tl:player-joined', ({ players }) => {
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
  socket.emit('tl:host-start');
});

socket.on('tl:error', ({ message }) => {
  const errEl = document.getElementById('lobby-error');
  if (errEl) errEl.textContent = message;
});

// ---------- Écriture ----------
socket.on('tl:writing-started', () => {
  document.getElementById('writing-count').textContent = '0';
  showScreen('writing');
});
socket.on('tl:writing-progress', ({ count, total }) => {
  document.getElementById('writing-count').textContent = count;
  document.getElementById('writing-total').textContent = total;
});
document.getElementById('btn-force-guessing').addEventListener('click', () => socket.emit('tl:force-start-guessing'));

// ---------- Vote ----------
const LETTERS = ['A', 'B', 'C'];
socket.on('tl:guess-phase', ({ subjectPseudo, subjectAvatar, statements, index, total }) => {
  document.getElementById('subject-progress').textContent = `${index} / ${total}`;
  document.getElementById('subject-avatar').src = subjectAvatar;
  document.getElementById('subject-pseudo').textContent = subjectPseudo;
  document.getElementById('guess-count').textContent = '0';
  document.getElementById('guess-total').textContent = '';

  const list = document.getElementById('tl-statements-list');
  list.innerHTML = '';
  statements.forEach((text, i) => {
    const row = document.createElement('div');
    row.className = 'tl-option';
    row.innerHTML = `<span class="tl-option-letter">${LETTERS[i]}</span><span>${text}</span>`;
    list.appendChild(row);
  });

  showScreen('guessing');
});

socket.on('tl:guess-progress', ({ answeredCount, totalGuessers }) => {
  document.getElementById('guess-count').textContent = answeredCount;
  document.getElementById('guess-total').textContent = totalGuessers;
});

document.getElementById('btn-force-reveal').addEventListener('click', () => socket.emit('tl:force-reveal'));

// ---------- Révélation ----------
socket.on('tl:reveal', ({ subjectPseudo, statements, lieIndex, guesses, subjectPoints, index, total }) => {
  document.getElementById('reveal-progress').textContent = `${index} / ${total}`;
  document.getElementById('reveal-pseudo').textContent = subjectPseudo;

  const list = document.getElementById('reveal-statements-list');
  list.innerHTML = '';
  statements.forEach((text, i) => {
    const row = document.createElement('div');
    row.className = 'tl-option revealed ' + (i === lieIndex ? 'is-lie' : 'is-true');
    row.innerHTML = `<span class="tl-option-letter">${LETTERS[i]}</span><span>${text}</span><span class="tl-option-tag">${i === lieIndex ? 'Le mensonge' : 'Vrai'}</span>`;
    list.appendChild(row);
  });

  const correctCount = guesses.filter((g) => g.correct).length;
  document.getElementById('reveal-points').textContent = subjectPoints > 0
    ? `${subjectPseudo} a trompé ${guesses.length - correctCount} joueur(s) — +${subjectPoints} pts`
    : `Personne n'a été trompé cette fois.`;

  const guessesEl = document.getElementById('reveal-guesses');
  guessesEl.innerHTML = '';
  guesses.forEach((g) => {
    const row = document.createElement('div');
    row.className = 'res-guess-row ' + (g.correct ? 'correct' : 'wrong');
    row.innerHTML = `
      <img class="avatar-img-sm" src="${g.guesserAvatar}">
      <span>${g.guesserPseudo} pensait que c'était ${LETTERS[g.guessIndex]}</span>
      <span class="res-guess-mark">${g.correct ? '✅' : '❌'}</span>
    `;
    guessesEl.appendChild(row);
  });

  showScreen('reveal');
});

document.getElementById('btn-next-subject').addEventListener('click', () => socket.emit('tl:next-subject'));

// ---------- Fin ----------
socket.on('tl:game-over', ({ leaderboard }) => {
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
  socket.emit('tl:end-game');
  window.location.href = '/index.html';
});

// ---------- Rejouer (retour au lobby, sans recréer de partie) ----------
document.getElementById('btn-replay').addEventListener('click', () => socket.emit('tl:host-restart'));

socket.on('tl:game-reset', ({ players }) => {
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

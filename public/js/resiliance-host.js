const socket = io();
let gameCode = null;

const screens = {
  create: document.getElementById('screen-create'),
  lobby: document.getElementById('screen-lobby'),
  writing: document.getElementById('screen-writing'),
  guessing: document.getElementById('screen-guessing'),
  reveal: document.getElementById('screen-reveal'),
  end: document.getElementById('screen-end'),
};
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

document.getElementById('btn-create').addEventListener('click', () => socket.emit('res:create-game'));

socket.on('res:game-created', ({ code }) => {
  gameCode = code;
  document.getElementById('lobby-code').textContent = code;
  const joinUrl = `${window.location.origin}/resiliance-player.html?code=${code}`;
  document.getElementById('qrcode').innerHTML = '';
  new QRCode(document.getElementById('qrcode'), { text: joinUrl, width: 200, height: 200, colorDark: '#16130F', colorLight: '#F8F3EA' });
  showScreen('lobby');
});

socket.on('res:player-joined', ({ players }) => {
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
  socket.emit('res:host-start');
});

socket.on('res:error', ({ message }) => {
  const errEl = document.getElementById('lobby-error');
  if (errEl) errEl.textContent = message;
});

// ---------- Écriture ----------
// Panneau de modération : l'animateur voit chaque anecdote arriver en direct
// (comme le flux de la manche de dessin) et peut corriger le texte tant que
// la partie n'est pas passée aux devinettes, pour éviter tout contenu
// inapproprié.
socket.on('res:writing-started', () => {
  document.getElementById('writing-count').textContent = '0';
  document.getElementById('writing-feed').innerHTML = '';
  document.getElementById('writing-mod-hint').classList.remove('hidden');
  const btn = document.getElementById('btn-force-guessing');
  btn.textContent = 'Passer aux devinettes maintenant';
  btn.classList.remove('btn-primary');
  btn.classList.add('btn-ghost');
  showScreen('writing');
});
socket.on('res:writing-progress', ({ count, total }) => {
  document.getElementById('writing-count').textContent = count;
  document.getElementById('writing-total').textContent = total;
});
socket.on('res:writing-all-done', () => {
  const btn = document.getElementById('btn-force-guessing');
  btn.textContent = 'Tout le monde a fini — Lancer les devinettes →';
  btn.classList.add('btn-primary');
  btn.classList.remove('btn-ghost');
});
document.getElementById('btn-force-guessing').addEventListener('click', () => socket.emit('res:force-start-guessing'));

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function makeAnecdoteCard({ subjectId, subjectPseudo, subjectAvatar, authorPseudo, text }) {
  const card = document.createElement('div');
  card.className = 'res-mod-card';
  card.dataset.subjectId = subjectId;
  card.innerHTML = `
    <div class="res-mod-card-head">
      <img class="avatar-img-sm" src="${escapeHtml(subjectAvatar)}">
      <span>À propos de <strong>${escapeHtml(subjectPseudo)}</strong> — écrite par ${escapeHtml(authorPseudo)}</span>
    </div>
    <textarea maxlength="200" rows="2"></textarea>
    <div class="res-mod-card-actions">
      <span class="res-mod-saved-tag">✅ Enregistré</span>
      <button class="res-mod-save-btn" disabled>Enregistrer la correction</button>
    </div>
  `;
  const textarea = card.querySelector('textarea');
  const saveBtn = card.querySelector('.res-mod-save-btn');
  const savedTag = card.querySelector('.res-mod-saved-tag');
  textarea.value = text;
  textarea.addEventListener('input', () => {
    saveBtn.disabled = textarea.value.trim() === '' || textarea.value === card.dataset.lastSaved;
    savedTag.classList.remove('show');
  });
  saveBtn.addEventListener('click', () => {
    const clean = textarea.value.trim();
    if (!clean) return;
    socket.emit('res:host-edit-anecdote', { subjectId, text: clean });
  });
  card.dataset.lastSaved = text;
  return card;
}

socket.on('res:anecdote-submitted', (data) => {
  const feed = document.getElementById('writing-feed');
  const card = makeAnecdoteCard(data);
  feed.appendChild(card);
  feed.scrollTop = feed.scrollHeight;
});

socket.on('res:anecdote-edit-confirmed', ({ subjectId, text }) => {
  const card = document.querySelector(`.res-mod-card[data-subject-id="${subjectId}"]`);
  if (!card) return;
  card.dataset.lastSaved = text;
  card.querySelector('.res-mod-save-btn').disabled = true;
  const tag = card.querySelector('.res-mod-saved-tag');
  tag.classList.add('show');
  card.classList.add('saved');
  setTimeout(() => card.classList.remove('saved'), 1200);
});

// ---------- Devinettes (manches simultanées) ----------
let allPlayersSnapshot = [];
socket.on('res:round-started', ({ round, totalRounds }) => {
  document.getElementById('round-num').textContent = round;
  document.getElementById('round-total').textContent = totalRounds;
  document.getElementById('round-count').textContent = '0';
  renderGuessingTable();
  showScreen('guessing');
});

function renderGuessingTable() {
  const container = document.getElementById('uc-table-guessing');
  container.innerHTML = '';
  allPlayersSnapshot.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'uc-player-card';
    card.innerHTML = `<img src="${p.avatar}" alt="${p.pseudo}"><span class="uc-name">${p.pseudo}</span>`;
    container.appendChild(card);
  });
}

// on garde une trace des joueurs pour l'affichage de la table pendant les devinettes
socket.on('res:player-joined', ({ players }) => { allPlayersSnapshot = players; });

socket.on('res:round-progress', ({ answeredCount, totalGuessers }) => {
  document.getElementById('round-count').textContent = answeredCount;
  document.getElementById('round-total-players').textContent = totalGuessers;
});

document.getElementById('btn-force-round').addEventListener('click', () => socket.emit('res:force-next-round'));

// ---------- Révélation ----------
socket.on('res:guessing-done', () => {
  socket.emit('res:start-reveal');
});

socket.on('res:reveal-anecdote', ({ subjectPseudo, subjectAvatar, authorPseudo, authorAvatar, text, guesses, index, total }) => {
  document.getElementById('reveal-progress').textContent = `${index + 1} / ${total}`;
  document.getElementById('reveal-avatar').src = subjectAvatar;
  document.getElementById('reveal-pseudo').textContent = subjectPseudo;
  document.getElementById('reveal-text').textContent = `« ${text} »`;
  document.getElementById('reveal-author-avatar').src = authorAvatar;
  document.getElementById('reveal-author-pseudo').textContent = authorPseudo;

  const guessesEl = document.getElementById('reveal-guesses');
  guessesEl.innerHTML = '';
  guesses.forEach((g) => {
    const row = document.createElement('div');
    row.className = 'res-guess-row ' + (g.correct ? 'correct' : 'wrong');
    row.innerHTML = `
      <img class="avatar-img-sm" src="${g.guesserAvatar}">
      <span>${g.guesserPseudo} pensait que c'était</span>
      <span class="res-guess-arrow">→</span>
      <img class="avatar-img-sm" src="${g.guessedAvatar}">
      <span>${g.guessedPseudo}</span>
      <span class="res-guess-mark">${g.correct ? '✅' : '❌'}</span>
    `;
    guessesEl.appendChild(row);
  });

  showScreen('reveal');
});

document.getElementById('btn-next-reveal').addEventListener('click', () => socket.emit('res:next-reveal'));

socket.on('res:reveal-done', () => showScreen('end'));

// ---------- Fin ----------
document.getElementById('btn-new-manche').addEventListener('click', () => socket.emit('res:new-manche'));
document.getElementById('btn-end-game').addEventListener('click', () => {
  socket.emit('res:end-game');
  window.location.href = '/index.html';
});

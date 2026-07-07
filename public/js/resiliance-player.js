const socket = io();

const AVATAR_GALLERY = [
  '/avatars/avatar1.svg', '/avatars/avatar2.svg', '/avatars/avatar3.svg', '/avatars/avatar4.svg', '/avatars/avatar5.svg',
  '/avatars/avatar6.svg', '/avatars/avatar7.svg', '/avatars/avatar8.svg', '/avatars/avatar9.svg', '/avatars/avatar10.svg',
];
let selectedAvatar = AVATAR_GALLERY[0];
let myPlayerId = localStorage.getItem('resPlayerId');
if (!myPlayerId) {
  myPlayerId = Math.random().toString(16).slice(2) + Date.now().toString(16);
  localStorage.setItem('resPlayerId', myPlayerId);
}

const screens = {
  join: document.getElementById('screen-join'),
  wait: document.getElementById('screen-wait'),
  write: document.getElementById('screen-write'),
  guess: document.getElementById('screen-guess'),
  reveal: document.getElementById('screen-reveal'),
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

document.getElementById('btn-join').addEventListener('click', join);
document.getElementById('input-pseudo').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

function join() {
  const code = document.getElementById('input-code').value.trim();
  const pseudo = document.getElementById('input-pseudo').value.trim();
  document.getElementById('join-error').textContent = '';
  if (!code || !pseudo) { document.getElementById('join-error').textContent = 'Merci de remplir le code et ton pseudo.'; return; }
  socket.emit('res:join-game', { code, pseudo, avatar: selectedAvatar, playerId: myPlayerId });
}

socket.on('res:join-error', ({ message }) => { document.getElementById('join-error').textContent = message; });

socket.on('res:joined', ({ pseudo, avatar }) => {
  if (avatar) selectedAvatar = avatar;
  document.getElementById('wait-avatar').src = avatar || selectedAvatar;
  document.getElementById('wait-pseudo').textContent = pseudo;
  showScreen('wait');
});

const avatarPickerPanel = document.getElementById('avatar-picker-panel');
document.getElementById('btn-change-avatar').addEventListener('click', () => {
  avatarPickerPanel.classList.toggle('hidden');
  if (!avatarPickerPanel.classList.contains('hidden')) {
    buildAvatarGallery(document.getElementById('wait-avatar-grid'), selectedAvatar, (url) => {
      selectedAvatar = url;
      document.getElementById('wait-avatar').src = url;
      socket.emit('res:update-avatar', { avatar: url });
      avatarPickerPanel.classList.add('hidden');
    }, document.getElementById('wait-avatar-upload-input'));
  }
});

// ---------- Écriture de l'anecdote ----------
let anecdoteSent = false;

socket.on('res:your-target', ({ targetPseudo, targetAvatar }) => {
  document.getElementById('target-pseudo').textContent = targetPseudo;
  document.getElementById('target-avatar').src = targetAvatar;
});

socket.on('res:writing-started', () => {
  anecdoteSent = false;
  document.getElementById('anecdote-text').value = '';
  document.getElementById('anecdote-text').disabled = false;
  document.getElementById('btn-submit-anecdote').disabled = false;
  document.getElementById('anecdote-sent-msg').classList.add('hidden');
  showScreen('write');
});

document.getElementById('btn-submit-anecdote').addEventListener('click', () => {
  const text = document.getElementById('anecdote-text').value.trim();
  if (!text || anecdoteSent) return;
  anecdoteSent = true;
  socket.emit('res:submit-anecdote', { text });
});

socket.on('res:anecdote-received', () => {
  document.getElementById('anecdote-text').disabled = true;
  document.getElementById('btn-submit-anecdote').disabled = true;
  document.getElementById('anecdote-sent-msg').classList.remove('hidden');
});

// ---------- Manches de devinettes ----------
let guessSentThisRound = false;

socket.on('res:your-turn-to-guess', ({ text, options, round, totalRounds }) => {
  guessSentThisRound = false;
  document.getElementById('guess-round').textContent = round;
  document.getElementById('guess-total-rounds').textContent = totalRounds;
  document.getElementById('guess-text').textContent = `« ${text} »`;
  document.getElementById('guess-sent-msg').classList.add('hidden');

  const container = document.getElementById('guess-options');
  container.innerHTML = '';
  options.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'uc-player-card clickable';
    card.innerHTML = `<img src="${p.avatar}" alt="${p.pseudo}"><span class="uc-name">${p.pseudo}</span>`;
    card.addEventListener('click', () => {
      if (guessSentThisRound) return;
      guessSentThisRound = true;
      container.querySelectorAll('.uc-player-card').forEach((c) => c.classList.remove('voted-for'));
      card.classList.add('voted-for');
      socket.emit('res:submit-guess', { guessedSocketId: p.socketId });
    });
    container.appendChild(card);
  });

  showScreen('guess');
});

socket.on('res:guess-received', () => {
  document.getElementById('guess-sent-msg').classList.remove('hidden');
});

// ---------- Révélation ----------
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

socket.on('res:reveal-done', () => showScreen('end'));

socket.on('res:game-ended', () => {
  alert("La partie est terminée. Merci d'avoir joué !");
  window.location.href = '/index.html';
});
socket.on('res:host-left', () => {
  alert("L'animateur a quitté la partie.");
  window.location.href = '/index.html';
});

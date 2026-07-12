const socket = io();

const AVATAR_GALLERY = [
  '/avatars/avatar1.svg', '/avatars/avatar2.svg', '/avatars/avatar3.svg', '/avatars/avatar4.svg', '/avatars/avatar5.svg',
  '/avatars/avatar6.svg', '/avatars/avatar7.svg', '/avatars/avatar8.svg', '/avatars/avatar9.svg', '/avatars/avatar10.svg',
];
let selectedAvatar = AVATAR_GALLERY[0];
let myPlayerId = localStorage.getItem('tlPlayerId');
if (!myPlayerId) {
  myPlayerId = Math.random().toString(16).slice(2) + Date.now().toString(16);
  localStorage.setItem('tlPlayerId', myPlayerId);
}
let lastCode = localStorage.getItem('tlLastCode') || '';
let lastPseudo = localStorage.getItem('tlLastPseudo') || '';
let myPseudo = '';

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
else if (lastCode) document.getElementById('input-code').value = lastCode;
if (lastPseudo) document.getElementById('input-pseudo').value = lastPseudo;

document.getElementById('btn-join').addEventListener('click', join);
document.getElementById('input-pseudo').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

function join() {
  const code = document.getElementById('input-code').value.trim();
  const pseudo = document.getElementById('input-pseudo').value.trim();
  document.getElementById('join-error').textContent = '';
  if (!code || !pseudo) { document.getElementById('join-error').textContent = 'Merci de remplir le code et ton pseudo.'; return; }
  localStorage.setItem('tlLastCode', code.toUpperCase());
  localStorage.setItem('tlLastPseudo', pseudo);
  socket.emit('tl:join-game', { code, pseudo, avatar: selectedAvatar, playerId: myPlayerId });
}

const wasInGame = localStorage.getItem('tlInGame') === '1';
if (wasInGame && lastCode && lastPseudo && !params.get('code')) {
  socket.emit('tl:join-game', { code: lastCode, pseudo: lastPseudo, avatar: selectedAvatar, playerId: myPlayerId });
}
socket.on('connect', () => {
  if (localStorage.getItem('tlInGame') === '1' && lastCode && lastPseudo) {
    socket.emit('tl:join-game', { code: lastCode, pseudo: lastPseudo, avatar: selectedAvatar, playerId: myPlayerId });
  }
});

socket.on('tl:join-error', ({ message }) => {
  document.getElementById('join-error').textContent = message;
  localStorage.removeItem('tlInGame');
});

socket.on('tl:joined', ({ pseudo, avatar }) => {
  localStorage.setItem('tlInGame', '1');
  myPseudo = pseudo;
  if (avatar) selectedAvatar = avatar;
  document.getElementById('wait-avatar').src = avatar || selectedAvatar;
  document.getElementById('wait-pseudo').textContent = pseudo;
  showScreen('wait');
});

socket.on('tl:game-ended', () => localStorage.removeItem('tlInGame'));
socket.on('tl:host-left', () => localStorage.removeItem('tlInGame'));

const avatarPickerPanel = document.getElementById('avatar-picker-panel');
document.getElementById('btn-change-avatar').addEventListener('click', () => {
  avatarPickerPanel.classList.toggle('hidden');
  if (!avatarPickerPanel.classList.contains('hidden')) {
    buildAvatarGallery(document.getElementById('wait-avatar-grid'), selectedAvatar, (url) => {
      selectedAvatar = url;
      document.getElementById('wait-avatar').src = url;
      socket.emit('tl:update-avatar', { avatar: url });
      avatarPickerPanel.classList.add('hidden');
    }, document.getElementById('wait-avatar-upload-input'));
  }
});

// ---------- Écriture des affirmations ----------
let statementsSent = false;

socket.on('tl:writing-started', () => {
  statementsSent = false;
  document.querySelectorAll('.tl-statement-input').forEach((el) => { el.value = ''; el.disabled = false; });
  document.querySelectorAll('input[name=lie]').forEach((el) => { el.checked = false; el.disabled = false; });
  document.getElementById('btn-submit-statements').disabled = false;
  document.getElementById('statements-sent-msg').classList.add('hidden');
  document.getElementById('write-error').textContent = '';
  showScreen('write');
});

document.getElementById('btn-submit-statements').addEventListener('click', () => {
  if (statementsSent) return;
  const inputs = Array.from(document.querySelectorAll('.tl-statement-input'));
  const statements = inputs.map((el) => el.value.trim());
  const lieChecked = document.querySelector('input[name=lie]:checked');
  const errEl = document.getElementById('write-error');
  if (statements.some((s) => !s)) { errEl.textContent = 'Remplis les 3 affirmations.'; return; }
  if (!lieChecked) { errEl.textContent = 'Indique laquelle est le mensonge.'; return; }
  errEl.textContent = '';
  statementsSent = true;
  socket.emit('tl:submit-statements', { statements, lieIndex: parseInt(lieChecked.value, 10) });
});

socket.on('tl:statements-received', () => {
  document.querySelectorAll('.tl-statement-input').forEach((el) => { el.disabled = true; });
  document.querySelectorAll('input[name=lie]').forEach((el) => { el.disabled = true; });
  document.getElementById('btn-submit-statements').disabled = true;
  document.getElementById('statements-sent-msg').classList.remove('hidden');
});

// ---------- Vote ----------
const LETTERS = ['A', 'B', 'C'];
let guessSent = false;
let isCurrentSubject = false;

socket.on('tl:guess-phase', ({ subjectSocketId, subjectPseudo, subjectAvatar, statements, index, total }) => {
  guessSent = false;
  isCurrentSubject = subjectSocketId === socket.id;
  document.getElementById('guess-progress').textContent = `${index} / ${total}`;
  document.getElementById('guess-avatar').src = subjectAvatar;
  document.getElementById('guess-pseudo').textContent = subjectPseudo;
  document.getElementById('guess-sent-msg').classList.add('hidden');
  document.getElementById('guess-own-msg').classList.toggle('hidden', !isCurrentSubject);

  const container = document.getElementById('tl-guess-options');
  container.innerHTML = '';
  statements.forEach((text, i) => {
    const row = document.createElement('div');
    row.className = 'tl-option' + (isCurrentSubject ? ' disabled' : ' clickable');
    row.innerHTML = `<span class="tl-option-letter">${LETTERS[i]}</span><span>${text}</span>`;
    if (!isCurrentSubject) {
      row.addEventListener('click', () => {
        if (guessSent) return;
        guessSent = true;
        container.querySelectorAll('.tl-option').forEach((r) => r.classList.remove('selected'));
        row.classList.add('selected');
        socket.emit('tl:submit-guess', { guessIndex: i });
      });
    }
    container.appendChild(row);
  });

  showScreen('guess');
});

socket.on('tl:guess-received', () => {
  document.getElementById('guess-sent-msg').classList.remove('hidden');
});

// ---------- Révélation ----------
socket.on('tl:reveal', ({ subjectPseudo, statements, lieIndex, subjectPoints, guesses, index, total }) => {
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

  showScreen('reveal');
});

socket.on('tl:game-over', ({ leaderboard }) => {
  const mine = leaderboard.find((p) => p.pseudo === myPseudo);
  const rank = mine ? leaderboard.indexOf(mine) + 1 : null;
  document.getElementById('final-score-msg').textContent = mine
    ? `Tu termines ${rank}${rank === 1 ? 'er' : 'ème'} avec ${mine.score} points.`
    : "En attente de l'animateur pour la suite...";
  showScreen('end');
});

// ---------- Rejouer (l'hôte relance une nouvelle partie) ----------
socket.on('tl:game-reset', () => {
  showScreen('wait');
});

socket.on('tl:game-ended', () => {
  alert("La partie est terminée. Merci d'avoir joué !");
  window.location.href = '/index.html';
});
socket.on('tl:host-left', () => {
  alert("L'animateur a quitté la partie.");
  window.location.href = '/index.html';
});

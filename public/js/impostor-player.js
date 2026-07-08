const socket = io();

const AVATAR_GALLERY = [
  '/avatars/avatar1.svg', '/avatars/avatar2.svg', '/avatars/avatar3.svg', '/avatars/avatar4.svg', '/avatars/avatar5.svg',
  '/avatars/avatar6.svg', '/avatars/avatar7.svg', '/avatars/avatar8.svg', '/avatars/avatar9.svg', '/avatars/avatar10.svg',
];
let selectedAvatar = AVATAR_GALLERY[0];
let myPlayerId = localStorage.getItem('ucPlayerId');
if (!myPlayerId) {
  myPlayerId = Math.random().toString(16).slice(2) + Date.now().toString(16);
  localStorage.setItem('ucPlayerId', myPlayerId);
}
let mySocketId = null;

const screens = {
  join: document.getElementById('screen-join'),
  wait: document.getElementById('screen-wait'),
  yourWord: document.getElementById('screen-your-word'),
  turns: document.getElementById('screen-turns'),
  vote: document.getElementById('screen-vote'),
  reveal: document.getElementById('screen-reveal'),
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
  socket.emit('uc:join-game', { code, pseudo, avatar: selectedAvatar, playerId: myPlayerId });
}

socket.on('uc:join-error', ({ message }) => { document.getElementById('join-error').textContent = message; });

socket.on('uc:joined', ({ pseudo, avatar }) => {
  mySocketId = socket.id;
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
      socket.emit('uc:update-avatar', { avatar: url });
      avatarPickerPanel.classList.add('hidden');
    }, document.getElementById('wait-avatar-upload-input'));
  }
});

// ---------- Révélation privée du mot ----------
let wordAcknowledged = false;
let pendingTurnInfo = null;

socket.on('uc:your-word', ({ word }) => {
  wordAcknowledged = false;
  pendingTurnInfo = null;
  const hasWord = !!word;
  document.getElementById('has-word-block').classList.toggle('hidden', !hasWord);
  document.getElementById('no-word-block').classList.toggle('hidden', hasWord);
  if (hasWord) document.getElementById('your-word-text').textContent = word;
  showScreen('yourWord');
});

function renderTurnScreen({ socketId, round }) {
  document.getElementById('turn-round').textContent = round;
  const player = lastOrder.find((p) => p.socketId === socketId);
  document.getElementById('turn-indicator').textContent = player ? `C'est au tour de ${player.pseudo}` : '';
  showScreen('turns');
}

document.getElementById('btn-word-continue').addEventListener('click', () => {
  wordAcknowledged = true;
  if (pendingTurnInfo) renderTurnScreen(pendingTurnInfo);
});

// ---------- Tour de table (le joueur regarde l'écran principal) ----------
let lastOrder = [];
socket.on('uc:manche-started-players', ({ order }) => { lastOrder = order; });

socket.on('uc:turn-changed', (data) => {
  // Tant que le joueur n'a pas cliqué sur "J'ai vu mon mot", on ne bascule pas
  // automatiquement sur l'écran du tour de table (sinon le mot n'a jamais le temps d'être lu).
  if (!screens.yourWord.classList.contains('hidden') && !wordAcknowledged) {
    pendingTurnInfo = data;
    return;
  }
  renderTurnScreen(data);
});

// ---------- Vote ----------
socket.on('uc:voting-started', ({ order }) => {
  lastOrder = order;
  document.getElementById('vote-confirmed').classList.add('hidden');
  const container = document.getElementById('uc-vote-table');
  container.innerHTML = '';
  order.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'uc-player-card clickable';
    card.innerHTML = `<img src="${p.avatar}" alt="${p.pseudo}"><span class="uc-name">${p.pseudo}</span>`;
    card.addEventListener('click', () => {
      container.querySelectorAll('.uc-player-card').forEach((c) => c.classList.remove('voted-for'));
      card.classList.add('voted-for');
      socket.emit('uc:submit-vote', { votedSocketId: p.socketId });
    });
    container.appendChild(card);
  });
  showScreen('vote');
});

socket.on('uc:vote-received', () => {
  document.getElementById('vote-confirmed').classList.remove('hidden');
});

// ---------- Révélation ----------
socket.on('uc:reveal', ({ players, word, mostVotedSocketId, impostorCaught }) => {
  document.getElementById('reveal-word').textContent = word;
  const banner = document.getElementById('reveal-result-banner');
  banner.textContent = impostorCaught ? "🎉 L'imposteur a été démasqué !" : "😈 L'imposteur s'en sort indemne...";
  banner.className = 'uc-result-banner ' + (impostorCaught ? 'caught' : 'escaped');

  const container = document.getElementById('uc-table-reveal');
  container.innerHTML = '';
  players.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'uc-player-card' + (p.isImpostor ? ' is-impostor' : '') + (p.socketId === mostVotedSocketId ? ' most-voted' : '');
    card.innerHTML = `
      <img src="${p.avatar}" alt="${p.pseudo}">
      <span class="uc-name">${p.pseudo}</span>
      <span class="uc-word">${p.isImpostor ? ('🎭 Imposteur' + (p.word ? ` (${p.word})` : '')) : p.word}</span>
      ${p.votes ? `<span class="uc-vote-count">${p.votes} vote${p.votes > 1 ? 's' : ''}</span>` : ''}
    `;
    container.appendChild(card);
  });

  showScreen('reveal');
  if (window.confetti && impostorCaught) confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
});

socket.on('uc:game-ended', () => {
  alert('La partie est terminée. Merci d\'avoir joué !');
  window.location.href = '/index.html';
});
socket.on('uc:host-left', () => {
  alert("L'animateur a quitté la partie.");
  window.location.href = '/index.html';
});

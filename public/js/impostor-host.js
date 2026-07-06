const socket = io();
let gameCode = null;

const screens = {
  create: document.getElementById('screen-create'),
  lobby: document.getElementById('screen-lobby'),
  turns: document.getElementById('screen-turns'),
  voting: document.getElementById('screen-voting'),
  reveal: document.getElementById('screen-reveal'),
};
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

document.getElementById('btn-create').addEventListener('click', () => socket.emit('uc:create-game'));

socket.on('uc:game-created', ({ code }) => {
  gameCode = code;
  document.getElementById('lobby-code').textContent = code;
  const joinUrl = `${window.location.origin}/impostor-player.html?code=${code}`;
  document.getElementById('qrcode').innerHTML = '';
  new QRCode(document.getElementById('qrcode'), { text: joinUrl, width: 200, height: 200, colorDark: '#16130F', colorLight: '#F8F3EA' });
  showScreen('lobby');
});

socket.on('uc:player-joined', ({ players }) => {
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
  socket.emit('uc:host-start');
});

socket.on('uc:error', ({ message }) => {
  document.getElementById('lobby-error').textContent = message;
});

function renderTable(container, order, activeSocketId) {
  container.innerHTML = '';
  order.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'uc-player-card' + (p.socketId === activeSocketId ? ' active' : '');
    card.innerHTML = `<img src="${p.avatar}" alt="${p.pseudo}"><span class="uc-name">${p.pseudo}</span>`;
    container.appendChild(card);
  });
}

let lastOrder = [];

socket.on('uc:manche-started', ({ order, round }) => {
  lastOrder = order;
  document.getElementById('turn-round').textContent = round;
  renderTable(document.getElementById('uc-table-turns'), order, order[0] && order[0].socketId);
  showScreen('turns');
});

socket.on('uc:turn-changed', ({ socketId, round }) => {
  document.getElementById('turn-round').textContent = round;
  renderTable(document.getElementById('uc-table-turns'), lastOrder, socketId);
});

document.getElementById('btn-next-turn').addEventListener('click', () => socket.emit('uc:next-turn'));
document.getElementById('btn-start-vote').addEventListener('click', () => socket.emit('uc:start-vote'));

socket.on('uc:voting-started', ({ order }) => {
  lastOrder = order;
  renderTable(document.getElementById('uc-table-voting'), order, null);
  document.getElementById('vote-count').textContent = '0';
  document.getElementById('vote-total').textContent = order.length;
  showScreen('voting');
});

socket.on('uc:votes-update', ({ votedCount, totalPlayers }) => {
  document.getElementById('vote-count').textContent = votedCount;
  document.getElementById('vote-total').textContent = totalPlayers;
});

document.getElementById('btn-force-reveal').addEventListener('click', () => socket.emit('uc:force-reveal'));

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
      <span class="uc-word">${p.isImpostor ? '🎭 Imposteur' : p.word}</span>
      ${p.votes ? `<span class="uc-vote-count">${p.votes} vote${p.votes > 1 ? 's' : ''}</span>` : ''}
    `;
    container.appendChild(card);
  });

  showScreen('reveal');
  if (window.confetti && impostorCaught) confetti({ particleCount: 130, spread: 90, origin: { y: 0.6 } });
});

document.getElementById('btn-new-manche').addEventListener('click', () => socket.emit('uc:new-manche'));
document.getElementById('btn-end-game').addEventListener('click', () => {
  socket.emit('uc:end-game');
  window.location.href = '/index.html';
});

socket.on('uc:host-left', () => { /* n'arrive jamais côté animateur lui-même */ });

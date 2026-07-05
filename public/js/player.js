const socket = io();

const AVATAR_GALLERY = [
  '/avatars/avatar1.svg', '/avatars/avatar2.svg', '/avatars/avatar3.svg', '/avatars/avatar4.svg', '/avatars/avatar5.svg',
  '/avatars/avatar6.svg', '/avatars/avatar7.svg', '/avatars/avatar8.svg', '/avatars/avatar9.svg', '/avatars/avatar10.svg',
];
let selectedAvatar = AVATAR_GALLERY[0];
let myPseudo = '';
let timerInterval = null;
let answered = false;
let isMultipleChoice = false;
let selectedIndexes = [];

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
    } catch (e) { }
  };
}

buildAvatarGallery(document.getElementById('avatar-grid'), selectedAvatar, (url) => { selectedAvatar = url; }, document.getElementById('join-avatar-upload-input'));

const params = new URLSearchParams(window.location.search);
if (params.get('code')) {
  document.getElementById('input-code').value = params.get('code').toUpperCase();
}

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
  document.getElementById('wait-avatar').src = avatar;
  document.getElementById('wait-pseudo').textContent = pseudo;
  showScreen('wait');
});

const avatarPickerPanel = document.getElementById('avatar-picker-panel');
document.getElementById('btn-change-avatar').addEventListener('click', () => {
  avatarPickerPanel.classList.toggle('hidden');
  if (!avatarPickerPanel.classList.contains('hidden')) {
    buildAvatarGallery(
      document.getElementById('wait-avatar-grid'),
      selectedAvatar,
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

const answerColors = ['answer-0', 'answer-1', 'answer-2', 'answer-3'];

socket.on('question:show', (q) => {
  answered = false;
  selectedIndexes = [];
  isMultipleChoice = q.correctIndexes && q.correctIndexes.length > 1;
  
  showScreen('play');
  document.getElementById('p-progress').textContent = `Question ${q.index + 1} / ${q.total}`;
  document.getElementById('p-waiting-msg').classList.add('hidden');
  
  document.getElementById('p-text').textContent = q.text || '';
  
  if(isMultipleChoice) {
      document.getElementById('p-multi-answers-msg').classList.remove('hidden');
  } else {
      document.getElementById('p-multi-answers-msg').classList.add('hidden');
  }

  const imgFrame = document.getElementById('p-image-frame');
  if(q.image) {
      document.getElementById('p-image').src = q.image;
      imgFrame.classList.remove('hidden');
  } else {
      imgFrame.classList.add('hidden');
  }

  const wrap = document.getElementById('p-answers');
  wrap.innerHTML = '';
  document.getElementById('p-answers').classList.remove('hidden');
  
  const btnSubmit = document.getElementById('btn-submit-answers');
  if (isMultipleChoice) {
      btnSubmit.classList.remove('hidden');
      btnSubmit.onclick = () => {
          if(selectedIndexes.length > 0 && !answered) submitAnswersArray();
      };
  } else {
      btnSubmit.classList.add('hidden');
  }

  q.answers.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.className = `answer-btn ${answerColors[i]}`;
    btn.innerHTML = `<span class="answer-shape"></span> ${text}`;
    btn.addEventListener('click', () => toggleOrSubmitAnswer(i, btn));
    wrap.appendChild(btn);
  });

  startTimer(q.duration);
});

function toggleOrSubmitAnswer(index, btn) {
    if (answered) return;
    if (isMultipleChoice) {
        const pos = selectedIndexes.indexOf(index);
        if (pos > -1) {
            selectedIndexes.splice(pos, 1);
            btn.classList.remove('chosen');
        } else {
            selectedIndexes.push(index);
            btn.classList.add('chosen');
        }
    } else {
        selectedIndexes = [index];
        btn.classList.add('chosen');
        submitAnswersArray();
    }
}

function submitAnswersArray() {
    answered = true;
    socket.emit('player:submit-answer', { answerIndexes: selectedIndexes });
    document.querySelectorAll('#p-answers .answer-btn').forEach(b => b.disabled = true);
    document.getElementById('btn-submit-answers').classList.add('hidden');
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
        document.getElementById('btn-submit-answers').classList.add('hidden');
      }
    }
  }, 1000);
}

socket.on('player:result', ({ correct, points, totalScore }) => {
  clearInterval(timerInterval);
  showScreen('result');
  document.getElementById('result-emoji').textContent = correct ? '🎉' : '😬';
  document.getElementById('result-text').textContent = correct ? 'Bonne réponse !' : 'Raté cette fois...';
  document.getElementById('result-points').textContent = correct ? `+${points} points` : '+0 point';
  document.getElementById('result-total').textContent = `${totalScore} points`;
});

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
    row.innerHTML = `<span class="lb-rank">${i + 1}</span><img class="avatar-img-sm" src="${p.avatar}"><span class="lb-name">${p.pseudo}</span><span class="lb-score">${p.score} pts</span>`;
    lb.appendChild(row);
  });

  if (myRank <= 2 && window.confetti) {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
  }
});

socket.on('game:host-left', () => {
  alert("L'animateur a quitté la partie.");
});

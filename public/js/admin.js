let adminToken = localStorage.getItem('adminToken') || null;
let editingQuizId = null;
let currentMusicUrl = null;
let currentMusicQUrl = null;

const screens = {
  login: document.getElementById('screen-login'),
  dashboard: document.getElementById('screen-dashboard'),
  history: document.getElementById('screen-history'),
  global: document.getElementById('screen-global'),
  editor: document.getElementById('screen-editor'),
};
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { ...(options.headers || {}), 'x-admin-token': adminToken || '' } });
  if (res.status === 401) {
    localStorage.removeItem('adminToken');
    adminToken = null;
    showScreen('login');
    throw new Error('Session expirée');
  }
  return res;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Connexion ----------
document.getElementById('btn-login').addEventListener('click', login);
document.getElementById('input-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

async function login() {
  const password = document.getElementById('input-password').value;
  document.getElementById('login-error').textContent = '';
  try {
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const data = await res.json();
    if (!res.ok) { document.getElementById('login-error').textContent = data.error || 'Erreur de connexion.'; return; }
    adminToken = data.token;
    localStorage.setItem('adminToken', adminToken);
    loadDashboard();
  } catch (e) {
    document.getElementById('login-error').textContent = 'Impossible de contacter le serveur.';
  }
}

if (adminToken) loadDashboard().catch(() => showScreen('login'));
else showScreen('login');

// ---------- Tableau de bord ----------
async function loadDashboard() {
  const res = await api('/api/admin/quizzes');
  const quizzes = await res.json();
  const list = document.getElementById('quiz-list');
  list.innerHTML = '';
  if (quizzes.length === 0) list.innerHTML = '<p class="subtitle">Aucun quiz pour le moment. Cliquez sur « + Nouveau quiz ».</p>';
  quizzes.forEach((quiz) => {
    const item = document.createElement('div');
    item.className = 'quiz-list-item';
    item.innerHTML = `
      <div class="qli-info">
        <div class="qli-title">${escapeHtml(quiz.title)}</div>
        <div class="qli-meta">${quiz.questions.length} question${quiz.questions.length > 1 ? 's' : ''}${quiz.music || quiz.musicQuestion ? ' · 🎵 musique' : ''}</div>
      </div>
      <div class="qli-actions">
        <button class="btn btn-primary btn-launch">Lancer</button>
        <button class="btn btn-ghost btn-edit">Modifier</button>
        <button class="btn btn-ghost btn-duplicate">Dupliquer</button>
        <button class="btn btn-danger btn-delete">Supprimer</button>
      </div>
    `;
    item.querySelector('.btn-launch').addEventListener('click', () => { window.location.href = `/host.html?quizId=${quiz.id}`; });
    item.querySelector('.btn-edit').addEventListener('click', () => openEditor(quiz));
    item.querySelector('.btn-duplicate').addEventListener('click', () => duplicateQuiz(quiz.id));
    item.querySelector('.btn-delete').addEventListener('click', () => deleteQuiz(quiz.id, quiz.title));
    list.appendChild(item);
  });
  showScreen('dashboard');
}

async function deleteQuiz(id, title) {
  if (!confirm(`Supprimer définitivement le quiz « ${title} » ?`)) return;
  await api(`/api/admin/quizzes/${id}`, { method: 'DELETE' });
  loadDashboard();
}
async function duplicateQuiz(id) {
  await api(`/api/admin/quizzes/${id}/duplicate`, { method: 'POST' });
  loadDashboard();
}

document.getElementById('btn-new-quiz').addEventListener('click', () => openEditor(null));

// ---------- Historique ----------
document.getElementById('btn-show-history').addEventListener('click', async () => {
  const res = await api('/api/admin/history');
  const history = await res.json();
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  if (history.length === 0) list.innerHTML = '<p class="subtitle">Aucune partie jouée pour le moment.</p>';
  history.forEach((h) => {
    const winner = h.leaderboard[0];
    const div = document.createElement('div');
    div.className = 'history-item';
    const date = new Date(h.date).toLocaleString('fr-FR');
    div.innerHTML = `
      <div class="hi-top"><span>${escapeHtml(h.quizTitle)}</span><span>${date}</span></div>
      <div class="hi-winner">${winner ? `🏆 <img class="avatar-img-sm" src="${winner.avatar}"> ${escapeHtml(winner.pseudo)} — ${winner.score} pts` : 'Aucun joueur'}</div>
    `;
    list.appendChild(div);
  });
  showScreen('history');
});
document.getElementById('btn-back-dashboard').addEventListener('click', loadDashboard);

// ---------- Classement général ----------
document.getElementById('btn-show-global').addEventListener('click', async () => {
  const res = await api('/api/admin/global-leaderboard');
  const ranking = await res.json();
  const list = document.getElementById('global-list');
  list.innerHTML = '';
  if (ranking.length === 0) list.innerHTML = '<p class="subtitle">Pas encore de données. Jouez quelques parties !</p>';
  ranking.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'global-lb-row';
    row.innerHTML = `
      <span class="lb-rank">${i + 1}</span>
      <img class="avatar-img-sm" src="${p.avatar}">
      <span class="lb-name" style="flex:1;">${escapeHtml(p.pseudo)}</span>
      <span class="glb-wins">${p.wins} victoire${p.wins > 1 ? 's' : ''}</span>
      <span class="glb-meta">${p.gamesPlayed} partie${p.gamesPlayed > 1 ? 's' : ''} · ${p.totalPoints} pts cumulés</span>
    `;
    list.appendChild(row);
  });
  showScreen('global');
});
document.getElementById('btn-back-dashboard-2').addEventListener('click', loadDashboard);

// ---------- Éditeur de quiz ----------
document.getElementById('btn-cancel-edit').addEventListener('click', loadDashboard);
document.getElementById('btn-add-question').addEventListener('click', () => addQuestionCard(null));
document.getElementById('btn-save-quiz').addEventListener('click', saveQuiz);

function openEditor(quiz) {
  editingQuizId = quiz ? quiz.id : null;
  document.getElementById('editor-title').textContent = quiz ? 'Modifier le quiz' : 'Nouveau quiz';
  document.getElementById('quiz-title-input').value = quiz ? quiz.title : '';
  document.getElementById('questions-list').innerHTML = '';
  document.getElementById('editor-error').textContent = '';

  currentMusicUrl = quiz && quiz.music ? quiz.music : null;
  currentMusicQUrl = quiz && quiz.musicQuestion ? quiz.musicQuestion : null;
  updateMusicUI();

  if (quiz && quiz.questions.length) quiz.questions.forEach((q) => addQuestionCard(q));
  else addQuestionCard(null);
  showScreen('editor');
}

function updateMusicUI() {
  const currentBlock = document.getElementById('music-current');
  const preview = document.getElementById('music-preview');
  if (currentMusicUrl) { preview.src = currentMusicUrl; currentBlock.classList.remove('hidden'); }
  else { preview.src = ''; currentBlock.classList.add('hidden'); }

  const currentBlockQ = document.getElementById('music-q-current');
  const previewQ = document.getElementById('music-q-preview');
  if (currentMusicQUrl) { previewQ.src = currentMusicQUrl; currentBlockQ.classList.remove('hidden'); }
  else { previewQ.src = ''; currentBlockQ.classList.add('hidden'); }
}

document.getElementById('music-upload-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('music', file);
  try {
    const res = await api('/api/admin/upload-audio', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.url) { currentMusicUrl = data.url; updateMusicUI(); }
  } catch (err) { document.getElementById('editor-error').textContent = "Impossible d'importer ce fichier audio."; }
  e.target.value = '';
});
document.getElementById('btn-remove-music').addEventListener('click', () => { currentMusicUrl = null; updateMusicUI(); });

document.getElementById('music-q-upload-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('music', file);
  try {
    const res = await api('/api/admin/upload-audio', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.url) { currentMusicQUrl = data.url; updateMusicUI(); }
  } catch (err) { document.getElementById('editor-error').textContent = "Impossible d'importer ce fichier audio."; }
  e.target.value = '';
});
document.getElementById('btn-remove-music-q').addEventListener('click', () => { currentMusicQUrl = null; updateMusicUI(); });

function addQuestionCard(question) {
  const template = document.getElementById('question-card-template');
  const clone = template.content.cloneNode(true);
  const card = clone.querySelector('.question-card');

  const photoInput = card.querySelector('.qc-photo-input');
  const photoPreview = card.querySelector('.qc-photo-preview');
  const removePhotoBtn = card.querySelector('.qc-remove-photo');
  let photoUrl = question ? question.image || '' : '';
  if (photoUrl) { photoPreview.src = photoUrl; photoPreview.classList.remove('hidden'); removePhotoBtn.classList.remove('hidden'); }
  card.dataset.photoUrl = photoUrl;

  const typeSelect = card.querySelector('.qc-type');
  const questionType = question && question.type === 'truefalse' ? 'truefalse' : 'classic';
  typeSelect.value = questionType;

  card.querySelector('.qc-question-text').value = question && question.text ? question.text : '';

  const answers = question ? question.answers : ['', '', '', ''];
  const correctIndexes = question ? (question.correctIndexes && question.correctIndexes.length ? question.correctIndexes : [question.correctIndex || 0]) : [0];
  for (let i = 0; i < 4; i++) {
    card.querySelector(`.qc-answer-${i}`).value = answers[i] || '';
    const checkbox = card.querySelector(`.qc-correct-${i}`);
    checkbox.checked = correctIndexes.includes(i);
    updateCheckboxVisual(checkbox);
    checkbox.addEventListener('change', () => {
      // En mode "Vrai ou pas", une seule bonne réponse a de sens : on décoche l'autre automatiquement
      if (typeSelect.value === 'truefalse' && checkbox.checked) {
        [0, 1].forEach((j) => {
          if (j !== i) {
            const other = card.querySelector(`.qc-correct-${j}`);
            other.checked = false;
            updateCheckboxVisual(other);
          }
        });
      }
      updateCheckboxVisual(checkbox);
    });
  }

  function applyTypeVisibility() {
    const isTrueFalse = typeSelect.value === 'truefalse';
    card.querySelectorAll('.qc-answer-row-23').forEach((row) => row.classList.toggle('hidden', isTrueFalse));
    const a0 = card.querySelector('.qc-answer-0');
    const a1 = card.querySelector('.qc-answer-1');
    a0.placeholder = isTrueFalse ? 'Ex : Vrai (ou Estelle, etc.)' : 'Réponse 1';
    a1.placeholder = isTrueFalse ? 'Ex : Faux (ou Pas Estelle, etc.)' : 'Réponse 2';
    card.querySelector('.qc-question-label').textContent = isTrueFalse ? 'Affirmation à juger' : 'Intitulé de la question';
    card.querySelector('.qc-question-text').placeholder = isTrueFalse ? 'Ex : Estelle a acheté ce sac plus de 500€' : 'Ex : Quel est ce sac ?';
  }
  typeSelect.addEventListener('change', applyTypeVisibility);
  applyTypeVisibility();

  card.querySelector('.qc-duration').value = question ? question.duration : 20;
  card.querySelector('.qc-points').value = question ? question.points : 1000;

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('photo', file);
    const res = await api('/api/admin/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.url) {
      photoUrl = data.url;
      card.dataset.photoUrl = photoUrl;
      photoPreview.src = photoUrl;
      photoPreview.classList.remove('hidden');
      removePhotoBtn.classList.remove('hidden');
    }
  });

  removePhotoBtn.addEventListener('click', () => {
    photoUrl = '';
    card.dataset.photoUrl = '';
    photoPreview.classList.add('hidden');
    photoPreview.src = '';
    removePhotoBtn.classList.add('hidden');
  });

  card.querySelector('.qc-remove').addEventListener('click', () => { card.remove(); renumberQuestions(); });
  card.querySelector('.qc-move-up').addEventListener('click', () => moveCard(card, -1));
  card.querySelector('.qc-move-down').addEventListener('click', () => moveCard(card, 1));

  document.getElementById('questions-list').appendChild(card);
  renumberQuestions();
}

function updateCheckboxVisual(checkbox) {
  const label = checkbox.closest('.qc-checkbox-label');
  if (checkbox.checked) label.classList.add('checked');
  else label.classList.remove('checked');
}

function moveCard(card, direction) {
  const list = document.getElementById('questions-list');
  const cards = Array.from(list.querySelectorAll('.question-card'));
  const idx = cards.indexOf(card);
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= cards.length) return;
  if (direction === -1) list.insertBefore(card, cards[targetIdx]);
  else list.insertBefore(cards[targetIdx], card);
  renumberQuestions();
}

function renumberQuestions() {
  document.querySelectorAll('#questions-list .question-card').forEach((card, i) => {
    card.querySelector('.qc-number').textContent = `Question ${i + 1}`;
  });
}

async function saveQuiz() {
  const errorEl = document.getElementById('editor-error');
  errorEl.textContent = '';
  const title = document.getElementById('quiz-title-input').value.trim();
  if (!title) { errorEl.textContent = 'Merci de donner un titre au quiz.'; return; }

  const cards = document.querySelectorAll('#questions-list .question-card');
  if (cards.length === 0) { errorEl.textContent = 'Ajoutez au moins une question.'; return; }

  const questions = [];
  for (const card of cards) {
    const photoUrl = card.dataset.photoUrl || null;
    const questionType = card.querySelector('.qc-type').value === 'truefalse' ? 'truefalse' : 'classic';
    const questionText = card.querySelector('.qc-question-text').value.trim();
    const indexes = questionType === 'truefalse' ? [0, 1] : [0, 1, 2, 3];

    const answers = indexes.map((i) => card.querySelector(`.qc-answer-${i}`).value.trim());
    const correctFlags = indexes.map((i) => card.querySelector(`.qc-correct-${i}`).checked);
    const duration = parseInt(card.querySelector('.qc-duration').value, 10) || 20;
    const points = parseInt(card.querySelector('.qc-points').value, 10) || 1000;

    if (answers.some((a) => !a)) {
      errorEl.textContent = questionType === 'truefalse'
        ? 'Merci de remplir les 2 réponses de la question "Vrai ou pas".'
        : 'Merci de remplir les 4 réponses de chaque question.';
      return;
    }
    if (!correctFlags.some(Boolean)) { errorEl.textContent = 'Cochez au moins une bonne réponse par question.'; return; }
    if (questionType === 'truefalse' && correctFlags.filter(Boolean).length > 1) {
      errorEl.textContent = 'Une question "Vrai ou pas" ne peut avoir qu\'une seule bonne réponse.';
      return;
    }

    // On mélange l'ordre des réponses pour que la bonne ne soit pas toujours au même endroit
    const pairs = answers.map((text, i) => ({ text, correct: correctFlags[i] }));
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    const shuffledAnswers = pairs.map((p) => p.text);
    const correctIndexes = pairs.map((p, i) => (p.correct ? i : -1)).filter((i) => i !== -1);

    questions.push({ type: questionType, image: photoUrl, text: questionText || null, answers: shuffledAnswers, correctIndexes, duration, points });
  }

  const payload = { title, questions, music: currentMusicUrl || null, musicQuestion: currentMusicQUrl || null };
  try {
    if (editingQuizId) await api(`/api/admin/quizzes/${editingQuizId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    else await api('/api/admin/quizzes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    loadDashboard();
  } catch (e) {
    errorEl.textContent = "Erreur lors de l'enregistrement.";
  }
}

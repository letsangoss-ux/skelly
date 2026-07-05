let adminToken = localStorage.getItem('adminToken') || null;
let editingQuizId = null; // null = création
let currentMusicUrl = null;

const screens = {
  login: document.getElementById('screen-login'),
  dashboard: document.getElementById('screen-dashboard'),
  history: document.getElementById('screen-history'),
  editor: document.getElementById('screen-editor'),
};
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'x-admin-token': adminToken || '',
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('adminToken');
    adminToken = null;
    showScreen('login');
    throw new Error('Session expirée');
  }
  return res;
}

// ---------- Connexion ----------
document.getElementById('btn-login').addEventListener('click', login);
document.getElementById('input-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

async function login() {
  const password = document.getElementById('input-password').value;
  document.getElementById('login-error').textContent = '';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('login-error').textContent = data.error || 'Erreur de connexion.';
      return;
    }
    adminToken = data.token;
    localStorage.setItem('adminToken', adminToken);
    loadDashboard();
  } catch (e) {
    document.getElementById('login-error').textContent = 'Impossible de contacter le serveur.';
  }
}

// Si un token existe déjà, on tente de charger directement le tableau de bord
if (adminToken) {
  loadDashboard().catch(() => showScreen('login'));
} else {
  showScreen('login');
}

// ---------- Tableau de bord ----------
async function loadDashboard() {
  const res = await api('/api/admin/quizzes');
  const quizzes = await res.json();
  const list = document.getElementById('quiz-list');
  list.innerHTML = '';
  if (quizzes.length === 0) {
    list.innerHTML = '<p class="subtitle">Aucun quiz pour le moment. Cliquez sur « + Nouveau quiz ».</p>';
  }
  quizzes.forEach((quiz) => {
    const item = document.createElement('div');
    item.className = 'quiz-list-item';
    item.innerHTML = `
      <div class="qli-info">
        <div class="qli-title">${escapeHtml(quiz.title)}</div>
        <div class="qli-meta">${quiz.questions.length} question${quiz.questions.length > 1 ? 's' : ''}${quiz.music ? ' · 🎵 musique de fond' : ''}</div>
      </div>
      <div class="qli-actions">
        <button class="btn btn-primary btn-launch">Lancer</button>
        <button class="btn btn-ghost btn-edit">Modifier</button>
        <button class="btn btn-danger btn-delete">Supprimer</button>
      </div>
    `;
    item.querySelector('.btn-launch').addEventListener('click', () => {
      window.location.href = `/host.html?quizId=${quiz.id}`;
    });
    item.querySelector('.btn-edit').addEventListener('click', () => openEditor(quiz));
    item.querySelector('.btn-delete').addEventListener('click', () => deleteQuiz(quiz.id, quiz.title));
    list.appendChild(item);
  });
  showScreen('dashboard');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function deleteQuiz(id, title) {
  if (!confirm(`Supprimer définitivement le quiz « ${title} » ?`)) return;
  await api(`/api/admin/quizzes/${id}`, { method: 'DELETE' });
  loadDashboard();
}

document.getElementById('btn-new-quiz').addEventListener('click', () => openEditor(null));

// ---------- Historique ----------
document.getElementById('btn-show-history').addEventListener('click', async () => {
  const res = await api('/api/admin/history');
  const history = await res.json();
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  if (history.length === 0) {
    list.innerHTML = '<p class="subtitle">Aucune partie jouée pour le moment.</p>';
  }
  history.forEach((h) => {
    const winner = h.leaderboard[0];
    const div = document.createElement('div');
    div.className = 'history-item';
    const date = new Date(h.date).toLocaleString('fr-FR');
    div.innerHTML = `
      <div class="hi-top"><span>${escapeHtml(h.quizTitle)}</span><span>${date}</span></div>
      <div class="hi-winner">${winner ? `🏆 ${winner.avatar} ${escapeHtml(winner.pseudo)} — ${winner.score} pts` : 'Aucun joueur'}</div>
    `;
    list.appendChild(div);
  });
  showScreen('history');
});
document.getElementById('btn-back-dashboard').addEventListener('click', loadDashboard);

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
  updateMusicUI();

  if (quiz && quiz.questions.length) {
    quiz.questions.forEach((q) => addQuestionCard(q));
  } else {
    addQuestionCard(null);
  }
  showScreen('editor');
}

function updateMusicUI() {
  const currentBlock = document.getElementById('music-current');
  const preview = document.getElementById('music-preview');
  if (currentMusicUrl) {
    preview.src = currentMusicUrl;
    currentBlock.classList.remove('hidden');
  } else {
    preview.src = '';
    currentBlock.classList.add('hidden');
  }
}

document.getElementById('music-upload-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('music', file);
  try {
    const res = await api('/api/admin/upload-audio', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.url) {
      currentMusicUrl = data.url;
      updateMusicUI();
    }
  } catch (err) {
    document.getElementById('editor-error').textContent = "Impossible d'importer ce fichier audio.";
  }
  e.target.value = '';
});

document.getElementById('btn-remove-music').addEventListener('click', () => {
  currentMusicUrl = null;
  updateMusicUI();
});

function addQuestionCard(question) {
  const template = document.getElementById('question-card-template');
  const clone = template.content.cloneNode(true);
  const card = clone.querySelector('.question-card');

  const photoInput = card.querySelector('.qc-photo-input');
  const photoPreview = card.querySelector('.qc-photo-preview');
  let photoUrl = question ? question.image : '';

  if (photoUrl) {
    photoPreview.src = photoUrl;
    photoPreview.classList.remove('hidden');
  }

  card.querySelector('.qc-correct').value = question ? question.answers[question.correctIndex] : '';
  const wrongAnswers = question
    ? question.answers.filter((_, i) => i !== question.correctIndex)
    : ['', '', ''];
  card.querySelectorAll('.qc-wrong').forEach((input, i) => { input.value = wrongAnswers[i] || ''; });
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
    }
  });

  card.dataset.photoUrl = photoUrl;

  card.querySelector('.qc-remove').addEventListener('click', () => {
    card.remove();
    renumberQuestions();
  });

  document.getElementById('questions-list').appendChild(card);
  renumberQuestions();
}

function renumberQuestions() {
  const cards = document.querySelectorAll('#questions-list .question-card');
  cards.forEach((card, i) => {
    card.querySelector('.qc-number').textContent = `Question ${i + 1}`;
  });
}

async function saveQuiz() {
  const errorEl = document.getElementById('editor-error');
  errorEl.textContent = '';
  const title = document.getElementById('quiz-title-input').value.trim();
  if (!title) {
    errorEl.textContent = 'Merci de donner un titre au quiz.';
    return;
  }

  const cards = document.querySelectorAll('#questions-list .question-card');
  if (cards.length === 0) {
    errorEl.textContent = 'Ajoutez au moins une question.';
    return;
  }

  const questions = [];
  for (const card of cards) {
    const photoUrl = card.dataset.photoUrl;
    const correct = card.querySelector('.qc-correct').value.trim();
    const wrongs = Array.from(card.querySelectorAll('.qc-wrong')).map((i) => i.value.trim());
    const duration = parseInt(card.querySelector('.qc-duration').value, 10) || 20;
    const points = parseInt(card.querySelector('.qc-points').value, 10) || 1000;

    if (!photoUrl) { errorEl.textContent = 'Chaque question doit avoir une photo.'; return; }
    if (!correct || wrongs.some((w) => !w)) { errorEl.textContent = 'Merci de remplir les 4 réponses de chaque question.'; return; }

    const answers = [correct, ...wrongs];
    // on mélange l'ordre pour que la bonne réponse ne soit pas toujours en 1ère position
    const correctText = answers[0];
    for (let i = answers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [answers[i], answers[j]] = [answers[j], answers[i]];
    }
    const correctIndex = answers.indexOf(correctText);

    questions.push({ image: photoUrl, answers, correctIndex, duration, points });
  }

  const payload = { title, questions, music: currentMusicUrl || null };
  try {
    if (editingQuizId) {
      await api(`/api/admin/quizzes/${editingQuizId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await api('/api/admin/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    loadDashboard();
  } catch (e) {
    errorEl.textContent = "Erreur lors de l'enregistrement.";
  }
}

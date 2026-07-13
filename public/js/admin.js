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
  ucWords: document.getElementById('screen-uc-words'),
  vote: document.getElementById('screen-vote'),
  drawWords: document.getElementById('screen-draw-words'),
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
  if (typeof stopDrawWordsAutoRefresh === 'function') stopDrawWordsAutoRefresh();
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

// ---------- Export ----------
document.getElementById('btn-export').addEventListener('click', async () => {
  const msgEl = document.getElementById('import-export-msg');
  msgEl.textContent = 'Préparation du fichier...';
  try {
    const res = await api('/api/admin/export');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `quiz-berdah-export-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    msgEl.textContent = '✅ Export téléchargé. Gardez ce fichier de côté (email, drive, clé USB...).';
  } catch (e) {
    msgEl.textContent = "❌ Erreur lors de l'export.";
  }
});

// ---------- Import ----------
document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file-input').click());
document.getElementById('import-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const msgEl = document.getElementById('import-export-msg');
  msgEl.textContent = 'Import en cours...';
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await api('/api/admin/import', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) { msgEl.textContent = `❌ ${data.error || "Échec de l'import."}`; return; }
    msgEl.textContent = `✅ Import terminé : ${data.added} quiz ajouté(s), ${data.updated} mis à jour, ${data.filesRestored} fichier(s) (photos/musiques) restauré(s).`;
    loadDashboard();
  } catch (err) {
    msgEl.textContent = "❌ Erreur lors de l'import.";
  }
  e.target.value = '';
});

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

// ---------- Vote spécial "Le sort d'Alan" ----------
document.getElementById('btn-show-vote').addEventListener('click', loadVoteResults);
document.getElementById('btn-refresh-vote').addEventListener('click', loadVoteResults);
document.getElementById('btn-back-dashboard-4').addEventListener('click', loadDashboard);

async function loadVoteResults() {
  const res = await api('/api/admin/votes');
  const data = await res.json();
  const totalMsg = document.getElementById('vote-total-msg');
  const list = document.getElementById('vote-results-list');
  totalMsg.textContent = `${data.total} vote${data.total > 1 ? 's' : ''} enregistré${data.total > 1 ? 's' : ''} au total.`;
  list.innerHTML = '';
  if (data.total === 0) {
    list.innerHTML = '<p class="subtitle">Aucun vote pour le moment.</p>';
  } else {
    const sorted = [...data.results].sort((a, b) => b.count - a.count);
    sorted.forEach((r) => {
      const pct = data.total > 0 ? Math.round((r.count / data.total) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'question-card';
      row.innerHTML = `
        <div class="qc-body" style="flex-direction:column; align-items:stretch; gap:6px;">
          <div style="display:flex; justify-content:space-between; gap:10px;">
            <span>${escapeHtml(r.label)}</span>
            <strong>${r.count} vote${r.count > 1 ? 's' : ''} (${pct}%)</strong>
          </div>
          <div style="background:rgba(248,243,234,0.1); border-radius:8px; overflow:hidden; height:10px;">
            <div style="background:var(--gold); height:100%; width:${pct}%;"></div>
          </div>
        </div>
      `;
      list.appendChild(row);
    });
  }
  showScreen('vote');
}

// ---------- Vue secrète "Mots du Dessin" (visible admin uniquement) ----------
let drawWordsInterval = null;
document.getElementById('btn-show-draw-words').addEventListener('click', () => { loadDrawWords(); startDrawWordsAutoRefresh(); });
document.getElementById('btn-refresh-draw-words').addEventListener('click', loadDrawWords);
document.getElementById('btn-back-dashboard-5').addEventListener('click', () => { stopDrawWordsAutoRefresh(); loadDashboard(); });

function startDrawWordsAutoRefresh() {
  stopDrawWordsAutoRefresh();
  drawWordsInterval = setInterval(loadDrawWords, 4000);
}
function stopDrawWordsAutoRefresh() {
  if (drawWordsInterval) { clearInterval(drawWordsInterval); drawWordsInterval = null; }
}

async function loadDrawWords() {
  let data;
  try {
    const res = await api('/api/admin/draw-games');
    data = await res.json();
  } catch (e) { return; }
  const list = document.getElementById('draw-words-list');
  if (!list) return;
  list.innerHTML = '';
  if (!data.games || data.games.length === 0) {
    list.innerHTML = '<p class="subtitle">Aucune partie de dessin en cours.</p>';
  } else {
    data.games.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'question-card';
      const stateLabel = g.state === 'drawing' ? `Manche ${g.round}/${g.totalRounds} — ${escapeHtml(g.drawerPseudo || '?')} dessine` : (g.state === 'lobby' ? 'En attente dans le lobby' : g.state);
      row.innerHTML = `
        <div class="qc-body" style="flex-direction:column; align-items:stretch; gap:6px;">
          <div style="display:flex; justify-content:space-between; gap:10px;">
            <span>Partie <strong>${escapeHtml(g.code)}</strong> — ${g.playersCount} joueur(s)</span>
          </div>
          <div class="subtitle" style="margin:0;">${stateLabel}</div>
          ${g.currentWord ? `<div style="font-size:1.1rem;"><strong>Mot en cours :</strong> ${escapeHtml(g.currentWord)}</div>` : ''}
        </div>
      `;
      list.appendChild(row);
    });
  }
  showScreen('drawWords');
}

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

// ---------- Mots du mode Imposteur ----------
document.getElementById('btn-show-uc-words').addEventListener('click', loadUcWords);
document.getElementById('btn-back-dashboard-3').addEventListener('click', loadDashboard);

async function loadUcWords() {
  document.getElementById('uc-words-error').textContent = '';
  const res = await api('/api/admin/undercover-words');
  const pairs = await res.json();
  const list = document.getElementById('uc-words-list');
  list.innerHTML = '';
  if (pairs.length === 0) list.innerHTML = '<p class="subtitle">Aucune paire de mots pour le moment. Ajoutez-en une ci-dessus.</p>';
  const template = document.getElementById('uc-word-row-template');
  pairs.forEach((pair) => {
    const node = template.content.cloneNode(true);
    const row = node.querySelector('.uc-word-row');
    const civilInput = node.querySelector('.uc-row-civil');
    const impostorInput = node.querySelector('.uc-row-impostor');
    civilInput.value = pair.civil;
    impostorInput.value = pair.impostor || '';
    node.querySelector('.uc-row-save').addEventListener('click', () => saveUcWord(pair.id, civilInput.value, impostorInput.value));
    node.querySelector('.uc-row-remove').addEventListener('click', () => deleteUcWord(pair.id, pair.civil));
    list.appendChild(node);
  });
  showScreen('ucWords');
}

document.getElementById('btn-uc-add').addEventListener('click', async () => {
  const civilInput = document.getElementById('uc-new-civil');
  const impostorInput = document.getElementById('uc-new-impostor');
  const errorEl = document.getElementById('uc-words-error');
  errorEl.textContent = '';
  const civil = civilInput.value.trim();
  if (!civil) { errorEl.textContent = 'Merci de saisir un mot civil.'; return; }
  try {
    await api('/api/admin/undercover-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ civil, impostor: impostorInput.value.trim() }),
    });
    civilInput.value = '';
    impostorInput.value = '';
    loadUcWords();
  } catch (e) { errorEl.textContent = 'Impossible d\'ajouter cette paire.'; }
});

async function saveUcWord(id, civil, impostor) {
  const errorEl = document.getElementById('uc-words-error');
  errorEl.textContent = '';
  if (!civil.trim()) { errorEl.textContent = 'Le mot civil est obligatoire.'; return; }
  try {
    await api(`/api/admin/undercover-words/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ civil: civil.trim(), impostor: impostor.trim() }),
    });
  } catch (e) { errorEl.textContent = 'Impossible d\'enregistrer cette paire.'; }
}

async function deleteUcWord(id, civil) {
  if (!confirm(`Supprimer la paire « ${civil} » ?`)) return;
  await api(`/api/admin/undercover-words/${id}`, { method: 'DELETE' });
  loadUcWords();
}

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

  const soundInput = card.querySelector('.qc-sound-input');
  const soundPreviewBlock = card.querySelector('.qc-sound-preview');
  const soundAudio = card.querySelector('.qc-sound-audio');
  const removeSoundBtn = card.querySelector('.qc-remove-sound');
  let soundUrl = question ? question.sound || '' : '';
  if (soundUrl) { soundAudio.src = soundUrl; soundPreviewBlock.classList.remove('hidden'); removeSoundBtn.classList.remove('hidden'); }
  card.dataset.soundUrl = soundUrl;

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

  soundInput.addEventListener('change', async () => {
    const file = soundInput.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('music', file); // même champ que l'upload de musique de fond, endpoint réutilisé
    const res = await api('/api/admin/upload-audio', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.url) {
      soundUrl = data.url;
      card.dataset.soundUrl = soundUrl;
      soundAudio.src = soundUrl;
      soundPreviewBlock.classList.remove('hidden');
      removeSoundBtn.classList.remove('hidden');
    }
  });

  removeSoundBtn.addEventListener('click', () => {
    soundUrl = '';
    card.dataset.soundUrl = '';
    soundPreviewBlock.classList.add('hidden');
    soundAudio.src = '';
    removeSoundBtn.classList.add('hidden');
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
    const soundUrl = card.dataset.soundUrl || null;
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

    questions.push({ type: questionType, image: photoUrl, sound: soundUrl, text: questionText || null, answers: shuffledAnswers, correctIndexes, duration, points });
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

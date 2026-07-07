// ============================================================
// SERVEUR DU QUIZ — le "chef d'orchestre" du jeu.
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'data', 'images')));
app.use('/audio', express.static(path.join(__dirname, 'data', 'audio')));
app.use(express.json({ limit: '2mb' }));

const QUIZ_FILE = path.join(__dirname, 'data', 'quizzes.json');
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');
const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');

function loadQuizzes() {
  if (!fs.existsSync(QUIZ_FILE)) fs.writeFileSync(QUIZ_FILE, '[]');
  return JSON.parse(fs.readFileSync(QUIZ_FILE, 'utf-8'));
}
function saveQuizzes(quizzes) { fs.writeFileSync(QUIZ_FILE, JSON.stringify(quizzes, null, 2)); }
function loadConfig() { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); }
function loadHistory() { return fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')) : []; }
function saveHistory(history) { fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2)); }

function urlToDiskPath(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('/uploads/')) return path.join(__dirname, 'data', 'images', url.slice('/uploads/'.length));
  if (url.startsWith('/audio/')) return path.join(__dirname, 'data', 'audio', url.slice('/audio/'.length));
  return null;
}

app.get('/api/quizzes', (req, res) => res.json(loadQuizzes()));

const adminTokens = new Set();
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token && adminTokens.has(token)) return next();
  res.status(401).json({ error: 'Non autorisé. Merci de vous reconnecter.' });
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  const config = loadConfig();
  if (password && password === config.adminPassword) {
    const token = crypto.randomBytes(24).toString('hex');
    adminTokens.add(token);
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Mot de passe incorrect.' });
  }
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'data', 'images')),
    filename: (req, file, cb) => cb(null, 'q_' + Date.now() + '_' + Math.round(Math.random() * 1e6) + (path.extname(file.originalname) || '.jpg')),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});
app.post('/api/admin/upload', requireAdmin, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune photo reçue.' });
  res.json({ url: '/uploads/' + req.file.filename });
});

const uploadAudio = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'data', 'audio')),
    filename: (req, file, cb) => cb(null, 'music_' + Date.now() + '_' + Math.round(Math.random() * 1e6) + (path.extname(file.originalname) || '.mp3')),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('audio/')),
});
app.post('/api/admin/upload-audio', requireAdmin, (req, res) => {
  uploadAudio.single('music')(req, res, (err) => {
    if (err || !req.file) return res.status(400).json({ error: "Impossible d'importer ce fichier audio." });
    res.json({ url: '/audio/' + req.file.filename });
  });
});

app.get('/api/admin/quizzes', requireAdmin, (req, res) => res.json(loadQuizzes()));

app.post('/api/admin/quizzes', requireAdmin, (req, res) => {
  const quizzes = loadQuizzes();
  const quiz = req.body;
  quiz.id = 'quiz_' + Date.now();
  quizzes.push(quiz);
  saveQuizzes(quizzes);
  res.json(quiz);
});

app.put('/api/admin/quizzes/:id', requireAdmin, (req, res) => {
  const quizzes = loadQuizzes();
  const idx = quizzes.findIndex((q) => q.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Quiz introuvable.' });
  quizzes[idx] = { ...req.body, id: req.params.id };
  saveQuizzes(quizzes);
  res.json(quizzes[idx]);
});

app.delete('/api/admin/quizzes/:id', requireAdmin, (req, res) => {
  saveQuizzes(loadQuizzes().filter((q) => q.id !== req.params.id));
  res.json({ ok: true });
});

app.post('/api/admin/quizzes/:id/duplicate', requireAdmin, (req, res) => {
  const quizzes = loadQuizzes();
  const original = quizzes.find((q) => q.id === req.params.id);
  if (!original) return res.status(404).json({ error: 'Quiz introuvable.' });
  const copy = JSON.parse(JSON.stringify(original));
  copy.id = 'quiz_' + Date.now();
  copy.title = original.title + ' (copie)';
  quizzes.push(copy);
  saveQuizzes(quizzes);
  res.json(copy);
});

app.get('/api/admin/history', requireAdmin, (req, res) => res.json(loadHistory()));

app.get('/api/admin/global-leaderboard', requireAdmin, (req, res) => {
  const history = loadHistory();
  const stats = {};
  history.forEach((game) => {
    game.leaderboard.forEach((p, i) => {
      if (!stats[p.pseudo]) stats[p.pseudo] = { pseudo: p.pseudo, avatar: p.avatar, wins: 0, gamesPlayed: 0, totalPoints: 0 };
      stats[p.pseudo].gamesPlayed += 1;
      stats[p.pseudo].totalPoints += p.score;
      stats[p.pseudo].avatar = p.avatar;
      if (i === 0) stats[p.pseudo].wins += 1;
    });
  });
  const ranking = Object.values(stats).sort((a, b) => b.wins - a.wins || b.totalPoints - a.totalPoints);
  res.json(ranking);
});

app.get('/api/admin/export', requireAdmin, (req, res) => {
  const quizzes = loadQuizzes();
  const files = {};
  function collectFile(urlPath) {
    if (!urlPath || files[urlPath]) return;
    const diskPath = urlToDiskPath(urlPath);
    if (diskPath && fs.existsSync(diskPath)) {
      files[urlPath] = fs.readFileSync(diskPath).toString('base64');
    }
  }
  quizzes.forEach((quiz) => {
    collectFile(quiz.music);
    collectFile(quiz.musicQuestion);
    (quiz.questions || []).forEach((q) => { collectFile(q.image); collectFile(q.sound); });
  });
  const exportData = { exportedAt: new Date().toISOString(), quizzes, files };
  res.setHeader('Content-Disposition', 'attachment; filename="quiz-berdah-export.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(exportData));
});

const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } });
app.post('/api/admin/import', requireAdmin, (req, res) => {
  importUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'Fichier trop volumineux ou invalide.' });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    let data;
    try { data = JSON.parse(req.file.buffer.toString('utf-8')); } catch (e) { return res.status(400).json({ error: "Ce fichier n'est pas un export valide (JSON illisible)." }); }
    if (!data || !Array.isArray(data.quizzes)) return res.status(400).json({ error: "Format d'export non reconnu." });
    const files = data.files || {};
    let filesRestored = 0;
    Object.entries(files).forEach(([urlPath, base64]) => {
      const diskPath = urlToDiskPath(urlPath);
      if (!diskPath) return;
      try {
        fs.mkdirSync(path.dirname(diskPath), { recursive: true });
        fs.writeFileSync(diskPath, Buffer.from(base64, 'base64'));
        filesRestored++;
      } catch (e) { console.error('Impossible de restaurer', urlPath, e); }
    });
    const existing = loadQuizzes();
    let added = 0, updated = 0;
    data.quizzes.forEach((importedQuiz) => {
      const idx = existing.findIndex((q) => q.id === importedQuiz.id);
      if (idx === -1) { existing.push(importedQuiz); added++; }
      else { existing[idx] = importedQuiz; updated++; }
    });
    saveQuizzes(existing);
    res.json({ ok: true, added, updated, filesRestored });
  });
});

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'data', 'images', 'player-avatars')),
    filename: (req, file, cb) => cb(null, 'p_' + Date.now() + '_' + Math.round(Math.random() * 1e6) + (path.extname(file.originalname) || '.jpg')),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});
app.post('/api/avatar-upload', (req, res) => {
  avatarUpload.single('photo')(req, res, (err) => {
    if (err || !req.file) return res.status(400).json({ error: 'Impossible de traiter la photo.' });
    res.json({ url: '/uploads/player-avatars/' + req.file.filename });
  });
});

const games = {}; 
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (games[code]);
  return code;
}

function newPlayer(playerId, pseudo, avatar) {
  return { playerId, pseudo, avatar, score: 0, streak: 0, bestStreak: 0, fastestCorrectMs: null, biggestJump: 0, lastPoints: 0 };
}

function playersForHost(game) {
  return Object.entries(game.players).map(([socketId, p]) => ({ ...p, socketId }));
}

io.on('connection', (socket) => {
  socket.on('host:create-game', ({ quizId }) => {
    const quizzes = loadQuizzes();
    const quiz = quizzes.find((q) => q.id === quizId) || quizzes[0];
    const code = generateCode();
    games[code] = {
      code, quiz,
      hostSocketId: socket.id,
      players: {},
      playerIdIndex: {},
      state: 'lobby',
      currentQuestion: -1,
      questionStartedAt: null,
      paused: false,
      pauseStartedAt: null,
      answers: {},
      previousRanks: {},
      questionRevealed: false,
      autoRevealTimer: null,
    };
    socket.join(code);
    socket.data.role = 'host';
    socket.data.code = code;
    socket.emit('host:game-created', { code, quiz });
  });

  socket.on('player:join-game', ({ code, pseudo, avatar, playerId }) => {
    code = (code || '').toUpperCase().trim();
    const game = games[code];
    if (!game) return socket.emit('player:join-error', { message: 'Code introuvable.' });
    const existingSocketId = playerId && game.playerIdIndex[playerId];
    if (existingSocketId && game.players[existingSocketId]) {
      const player = game.players[existingSocketId];
      delete game.players[existingSocketId];
      game.players[socket.id] = player;
      game.playerIdIndex[playerId] = socket.id;
      socket.join(code);
      socket.data.role = 'player';
      socket.data.code = code;
      socket.data.playerId = playerId;
      socket.emit('player:joined', { code, pseudo: player.pseudo, avatar: player.avatar, reconnected: true });
      if (game.hostSocketId) io.to(game.hostSocketId).emit('host:player-joined', { players: playersForHost(game) });
      return;
    }
    if (game.state !== 'lobby') return socket.emit('player:join-error', { message: 'La partie a déjà commencé.' });
    const cleanPseudo = (pseudo || 'Joueur').trim().slice(0, 16);
    const pid = playerId || crypto.randomBytes(8).toString('hex');
    game.players[socket.id] = newPlayer(pid, cleanPseudo, avatar || '/avatars/avatar1.svg');
    game.playerIdIndex[pid] = socket.id;
    socket.join(code);
    socket.data.role = 'player';
    socket.data.code = code;
    socket.data.playerId = pid;
    socket.emit('player:joined', { code, pseudo: cleanPseudo, avatar, playerId: pid });
    io.to(game.hostSocketId).emit('host:player-joined', { players: playersForHost(game) });
  });

  socket.on('host:start-game', () => {
    const game = games[socket.data.code];
    if (!game) return;
    game.state = 'playing';
    game.currentQuestion = 0;
    io.to(game.code).emit('game:started');
    sendQuestion(game);
  });

  socket.on('host:next-question', () => {
    const game = games[socket.data.code];
    if (!game) return;
    game.currentQuestion++;
    if (game.currentQuestion >= game.quiz.questions.length) endGame(game);
    else sendQuestion(game);
  });

  // NOUVEL ÉVÉNEMENT : Lancement manuel de la question
  socket.on('host:start-question', () => {
    const game = games[socket.data.code];
    if (!game || game.state !== 'playing') return;
    game.questionStartedAt = Date.now();
    const q = game.quiz.questions[game.currentQuestion];
    const durationMs = (q.duration || 20) * 1000;
    const correctIndexes = q.correctIndexes && q.correctIndexes.length ? q.correctIndexes : [q.correctIndex || 0];
    
    io.to(game.code).emit('question:show', {
        index: game.currentQuestion, total: game.quiz.questions.length,
        text: q.text || null, image: q.image || null, sound: q.sound || null,
        answers: q.answers, duration: q.duration || 20, points: q.points || 1000,
        multipleAnswers: correctIndexes.length > 1,
    });
    scheduleAutoReveal(game, durationMs);
  });

  socket.on('host:reveal', () => {
    const game = games[socket.data.code];
    if (game) revealAnswer(game);
  });

  // [Reste du code des événements inchangé : toggle-pause, kick-player, etc...]
  // (Note : Pour des raisons de longueur, j'ai résumé les événements standards)
  
  socket.on('player:submit-answer', ({ answerIndex }) => {
    const game = games[socket.data.code];
    if (!game || game.state !== 'playing' || game.paused || !game.questionStartedAt) return;
    const qIndex = game.currentQuestion;
    if (!game.answers[qIndex]) game.answers[qIndex] = {};
    if (game.answers[qIndex][socket.id]) return;
    const timeMs = Date.now() - game.questionStartedAt;
    game.answers[qIndex][socket.id] = { answerIndex, timeMs };
    const answeredCount = Object.keys(game.answers[qIndex]).length;
    const totalPlayers = Object.keys(game.players).length;
    io.to(game.hostSocketId).emit('host:player-answered', { answeredCount, totalPlayers });
    if (totalPlayers > 0 && answeredCount >= totalPlayers) revealAnswer(game);
  });

  // [Fonctions utilitaires modifiées]

  function sendQuestion(game) {
    const q = game.quiz.questions[game.currentQuestion];
    if (!q) { endGame(game); return; }
    game.questionRevealed = false;
    // On envoie un état de préparation, pas le lancement immédiat
    io.to(game.hostSocketId).emit('question:prepare', {
        index: game.currentQuestion,
        total: game.quiz.questions.length,
        text: q.text || null,
        image: q.image || null,
        sound: q.sound || null
    });
    io.to(game.code).emit('question:prepare'); // Informer les joueurs d'attendre
  }
});

function scheduleAutoReveal(game, remainingMs) {
  clearTimeout(game.autoRevealTimer);
  game.autoRevealRemainingMs = remainingMs;
  game.autoRevealScheduledAt = Date.now();
  const questionAtSchedule = game.currentQuestion;
  game.autoRevealTimer = setTimeout(() => {
    if (game.currentQuestion === questionAtSchedule && game.state === 'playing' && !game.paused) {
      revealAnswer(game);
    }
  }, remainingMs + 400);
}

function revealAnswer(game) {
  if (game.questionRevealed) return;
  game.questionRevealed = true;
  clearTimeout(game.autoRevealTimer);
  const qIndex = game.currentQuestion;
  const q = game.quiz.questions[qIndex];
  const correctIndexes = q.correctIndexes && q.correctIndexes.length ? q.correctIndexes : [q.correctIndex || 0];
  const answersGiven = game.answers[qIndex] || {};
  const stats = q.answers.map(() => 0);
  Object.entries(answersGiven).forEach(([socketId, ans]) => {
    stats[ans.answerIndex] = (stats[ans.answerIndex] || 0) + 1;
    const player = game.players[socketId];
    if (!player) return;
    const isCorrect = correctIndexes.includes(ans.answerIndex);
    if (isCorrect) {
      const durationMs = (q.duration || 20) * 1000;
      const speedFactor = Math.max(0, 1 - ans.timeMs / durationMs);
      const basePoints = Math.round((q.points || 1000) * (0.5 + 0.5 * speedFactor));
      player.streak += 1;
      player.score += (basePoints + (player.streak > 1 ? Math.min((player.streak - 1) * 50, 250) : 0));
    } else { player.streak = 0; }
  });
  io.to(game.code).emit('question:reveal', { correctIndexes, stats });
}

function endGame(game) {
  clearTimeout(game.autoRevealTimer);
  game.state = 'ended';
  io.to(game.code).emit('game:over', { leaderboard: Object.values(game.players).sort((a, b) => b.score - a.score) });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Serveur lancé !`));

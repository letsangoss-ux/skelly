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

app.get('/api/quizzes', (req, res) => res.json(loadQuizzes()));

// ------------------------------------------------------------
// ESPACE ADMIN — protégé par mot de passe (data/config.json)
// ------------------------------------------------------------
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
  const stats = {}; // pseudo -> { wins, gamesPlayed, totalPoints }
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

// Upload de photo de profil par un joueur (pas besoin d'être admin)
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

// ------------------------------------------------------------
// MOTEUR DE JEU EN TEMPS RÉEL
// ------------------------------------------------------------
const games = {}; // code -> game state

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (games[code]);
  return code;
}

function newPlayer(playerId, pseudo, avatar) {
  return {
    playerId, pseudo, avatar, score: 0,
    streak: 0, bestStreak: 0,
    fastestCorrectMs: null,
    biggestJump: 0,
    lastPoints: 0,
  };
}

function playersForHost(game) {
  return Object.entries(game.players).map(([socketId, p]) => ({ ...p, socketId }));
}

io.on('connection', (socket) => {
  // ----- ANIMATEUR : créer une partie -----
  socket.on('host:create-game', ({ quizId }) => {
    const quizzes = loadQuizzes();
    const quiz = quizzes.find((q) => q.id === quizId) || quizzes[0];
    const code = generateCode();
    games[code] = {
      code, quiz,
      hostSocketId: socket.id,
      players: {},
      playerIdIndex: {}, // playerId -> socketId (pour la reconnexion)
      state: 'lobby',
      currentQuestion: -1,
      questionStartedAt: null,
      paused: false,
      pauseStartedAt: null,
      answers: {},
      previousRanks: {},
    };
    socket.join(code);
    socket.data.role = 'host';
    socket.data.code = code;
    socket.emit('host:game-created', { code, quiz });
  });

  // ----- JOUEUR : rejoindre une partie (avec reconnexion possible) -----
  socket.on('player:join-game', ({ code, pseudo, avatar, playerId }) => {
    code = (code || '').toUpperCase().trim();
    const game = games[code];
    if (!game) return socket.emit('player:join-error', { message: 'Code introuvable. Vérifiez le code et réessayez.' });

    const existingSocketId = playerId && game.playerIdIndex[playerId];
    if (existingSocketId && game.players[existingSocketId]) {
      // Reconnexion : on récupère le joueur existant (score, streak...) sur le nouveau socket
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

      if (game.state === 'playing' && game.currentQuestion >= 0) {
        const q = game.quiz.questions[game.currentQuestion];
        const alreadyAnswered = !!(game.answers[game.currentQuestion] && game.answers[game.currentQuestion][socket.id]);
        if (q && !alreadyAnswered) {
          const correctIndexes = q.correctIndexes && q.correctIndexes.length ? q.correctIndexes : [q.correctIndex || 0];
          socket.emit('question:show', {
            index: game.currentQuestion, total: game.quiz.questions.length,
            text: q.text || null,
            image: q.image || null,
            answers: q.answers, duration: q.duration || 20, points: q.points || 1000,
            multipleAnswers: correctIndexes.length > 1,
          });
        }
      } else if (game.state === 'ended') {
        const leaderboard = Object.values(game.players).sort((a, b) => b.score - a.score)
          .map((p) => ({ pseudo: p.pseudo, avatar: p.avatar, score: p.score }));
        socket.emit('game:over', { leaderboard });
      }
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

  socket.on('player:update-avatar', ({ avatar }) => {
    const game = games[socket.data.code];
    if (!game) return;
    const player = game.players[socket.id];
    if (!player || !avatar) return;
    player.avatar = avatar;
    socket.emit('player:avatar-updated', { avatar });
    if (game.hostSocketId) io.to(game.hostSocketId).emit('host:player-joined', { players: playersForHost(game) });
  });

  socket.on('player:reaction', ({ emoji }) => {
    const game = games[socket.data.code];
    if (!game) return;
    const player = game.players[socket.id];
    if (!player || !emoji) return;
    if (game.hostSocketId) io.to(game.hostSocketId).emit('host:reaction', { emoji, pseudo: player.pseudo });
  });

  // ----- ANIMATEUR : lancer la partie -----
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

  socket.on('host:reveal', () => {
    const game = games[socket.data.code];
    if (game) revealAnswer(game);
  });

  socket.on('host:toggle-pause', () => {
    const game = games[socket.data.code];
    if (!game || game.state !== 'playing') return;
    if (!game.paused) {
      game.paused = true;
      game.pauseStartedAt = Date.now();
      io.to(game.code).emit('game:paused');
    } else {
      const pausedDuration = Date.now() - game.pauseStartedAt;
      game.questionStartedAt += pausedDuration;
      game.paused = false;
      game.pauseStartedAt = null;
      io.to(game.code).emit('game:resumed');
    }
  });

  socket.on('host:kick-player', ({ socketId }) => {
    const game = games[socket.data.code];
    if (!game || !game.players[socketId]) return;
    const player = game.players[socketId];
    delete game.players[socketId];
    delete game.playerIdIndex[player.playerId];
    io.to(socketId).emit('player:kicked');
    io.to(game.hostSocketId).emit('host:player-joined', { players: playersForHost(game) });
  });

  socket.on('player:submit-answer', ({ answerIndex }) => {
    const game = games[socket.data.code];
    if (!game || game.state !== 'playing' || game.paused) return;
    const qIndex = game.currentQuestion;
    if (!game.answers[qIndex]) game.answers[qIndex] = {};
    if (game.answers[qIndex][socket.id]) return;
    const timeMs = Date.now() - game.questionStartedAt;
    game.answers[qIndex][socket.id] = { answerIndex, timeMs };
    io.to(game.hostSocketId).emit('host:player-answered', {
      answeredCount: Object.keys(game.answers[qIndex]).length,
      totalPlayers: Object.keys(game.players).length,
    });
    socket.emit('player:answer-received');
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    if (!code || !games[code]) return;
    const game = games[code];
    if (socket.data.role === 'player') {
      // On ne supprime pas tout de suite : le joueur peut se reconnecter (perte wifi, page rechargée)
      io.to(game.hostSocketId).emit('host:player-joined', { players: playersForHost(game) });
    } else if (socket.data.role === 'host') {
      io.to(code).emit('game:host-left');
      delete games[code];
    }
  });
});

function sendQuestion(game) {
  const q = game.quiz.questions[game.currentQuestion];
  if (!q) { console.error('Question introuvable, fin de partie forcée.'); endGame(game); return; }
  game.questionStartedAt = Date.now();
  const correctIndexes = q.correctIndexes && q.correctIndexes.length ? q.correctIndexes : [q.correctIndex || 0];
  io.to(game.code).emit('question:show', {
    index: game.currentQuestion, total: game.quiz.questions.length,
    text: q.text || null,
    image: q.image || null,
    answers: q.answers, duration: q.duration || 20, points: q.points || 1000,
    multipleAnswers: correctIndexes.length > 1,
  });
}

function revealAnswer(game) {
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
      const streakBonus = player.streak > 1 ? Math.min((player.streak - 1) * 50, 250) : 0;
      const points = basePoints + streakBonus;
      player.score += points;
      player.lastPoints = points;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      if (player.fastestCorrectMs === null || ans.timeMs < player.fastestCorrectMs) player.fastestCorrectMs = ans.timeMs;
    } else {
      player.streak = 0;
      player.lastPoints = 0;
    }
  });

  Object.entries(game.players).forEach(([socketId, player]) => {
    if (!answersGiven[socketId]) { player.streak = 0; player.lastPoints = 0; }
  });

  const sortedPlayers = Object.entries(game.players).sort((a, b) => b[1].score - a[1].score);
  const leaderboard = sortedPlayers.map(([socketId, p], i) => {
    const rank = i + 1;
    const previousRank = game.previousRanks[socketId];
    const rankChange = previousRank ? previousRank - rank : 0;
    if (rankChange > p.biggestJump) p.biggestJump = rankChange;
    return {
      pseudo: p.pseudo, avatar: p.avatar, score: p.score, lastPoints: p.lastPoints || 0,
      rankChange, isNew: !previousRank, streak: p.streak,
    };
  });
  sortedPlayers.forEach(([socketId], i) => { game.previousRanks[socketId] = i + 1; });

  io.to(game.code).emit('question:reveal', { correctIndexes, stats, leaderboard });

  Object.entries(game.players).forEach(([socketId, player]) => {
    const givenAnswer = answersGiven[socketId];
    io.to(socketId).emit('player:result', {
      correct: !!(givenAnswer && correctIndexes.includes(givenAnswer.answerIndex)),
      points: player.lastPoints || 0,
      totalScore: player.score,
      streak: player.streak,
    });
  });
}

function endGame(game) {
  game.state = 'ended';
  const players = Object.values(game.players);
  const leaderboard = players.sort((a, b) => b.score - a.score)
    .map((p) => ({ pseudo: p.pseudo, avatar: p.avatar, score: p.score }));

  let awards = null;
  if (players.length > 0) {
    const fastest = players.filter((p) => p.fastestCorrectMs !== null).sort((a, b) => a.fastestCorrectMs - b.fastestCorrectMs)[0];
    const streakiest = [...players].sort((a, b) => b.bestStreak - a.bestStreak)[0];
    const comeback = [...players].sort((a, b) => b.biggestJump - a.biggestJump)[0];
    awards = {
      fastest: fastest ? { pseudo: fastest.pseudo, avatar: fastest.avatar } : null,
      streak: streakiest && streakiest.bestStreak >= 2 ? { pseudo: streakiest.pseudo, avatar: streakiest.avatar, value: streakiest.bestStreak } : null,
      comeback: comeback && comeback.biggestJump >= 2 ? { pseudo: comeback.pseudo, avatar: comeback.avatar, value: comeback.biggestJump } : null,
    };
  }

  io.to(game.code).emit('game:over', { leaderboard, awards });

  try {
    const history = loadHistory();
    history.unshift({ date: new Date().toISOString(), quizTitle: game.quiz.title, code: game.code, leaderboard });
    saveHistory(history.slice(0, 200));
  } catch (e) {
    console.error("Impossible d'enregistrer l'historique :", e);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Serveur lancé ! Ouvrez votre navigateur sur http://localhost:${PORT}`));

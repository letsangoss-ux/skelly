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
  if (!fs.existsSync(QUIZ_FILE)) return [];
  return JSON.parse(fs.readFileSync(QUIZ_FILE, 'utf-8'));
}
function saveQuizzes(quizzes) {
  fs.writeFileSync(QUIZ_FILE, JSON.stringify(quizzes, null, 2));
}
function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}
function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
}
function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

app.get('/api/quizzes', (req, res) => {
  res.json(loadQuizzes());
});

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

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'data', 'images')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'q_' + Date.now() + '_' + Math.round(Math.random() * 1e6) + ext);
  },
});
const upload = multer({ storage: uploadStorage, limits: { fileSize: 8 * 1024 * 1024 } });

app.post('/api/admin/upload', requireAdmin, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune photo reçue.' });
  res.json({ url: '/uploads/' + req.file.filename });
});

const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'data', 'audio')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp3';
    cb(null, 'music_' + Date.now() + '_' + Math.round(Math.random() * 1e6) + ext);
  },
});
const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) return cb(new Error('Fichier audio non valide'));
    cb(null, true);
  },
});

app.post('/api/admin/upload-audio', requireAdmin, (req, res) => {
  uploadAudio.single('music')(req, res, (err) => {
    if (err || !req.file) return res.status(400).json({ error: "Impossible d'importer ce fichier audio." });
    res.json({ url: '/audio/' + req.file.filename });
  });
});

app.get('/api/admin/quizzes', requireAdmin, (req, res) => {
  res.json(loadQuizzes());
});

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
  let quizzes = loadQuizzes();
  quizzes = quizzes.filter((q) => q.id !== req.params.id);
  saveQuizzes(quizzes);
  res.json({ ok: true });
});

app.get('/api/admin/history', requireAdmin, (req, res) => {
  res.json(loadHistory());
});

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'data', 'images', 'player-avatars')),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, 'p_' + Date.now() + '_' + Math.round(Math.random() * 1e6) + ext);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Fichier non valide'));
    cb(null, true);
  },
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
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (games[code]);
  return code;
}

io.on('connection', (socket) => {
  socket.on('host:create-game', ({ quizId }) => {
    const quizzes = loadQuizzes();
    const quiz = quizzes.find((q) => q.id === quizId) || quizzes[0];
    const code = generateCode();
    games[code] = {
      code,
      quiz,
      hostSocketId: socket.id,
      players: {},
      state: 'lobby',
      currentQuestion: -1,
      questionStartedAt: null,
      answers: {},
      previousRanks: {},
    };
    socket.join(code);
    socket.data.role = 'host';
    socket.data.code = code;
    socket.emit('host:game-created', { code, quiz });
  });

  socket.on('player:join-game', ({ code, pseudo, avatar }) => {
    code = (code || '').toUpperCase().trim();
    const game = games[code];
    if (!game) {
      socket.emit('player:join-error', { message: 'Code introuvable. Vérifiez le code et réessayez.' });
      return;
    }
    if (game.state !== 'lobby') {
      socket.emit('player:join-error', { message: 'La partie a déjà commencé.' });
      return;
    }
    const cleanPseudo = (pseudo || 'Joueur').trim().slice(0, 16);
    game.players[socket.id] = { pseudo: cleanPseudo, avatar: avatar || '🙂', score: 0 };
    socket.join(code);
    socket.data.role = 'player';
    socket.data.code = code;
    socket.emit('player:joined', { code, pseudo: cleanPseudo, avatar });
    io.to(game.hostSocketId).emit('host:player-joined', { players: Object.values(game.players) });
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
    if (game.currentQuestion >= game.quiz.questions.length) {
      endGame(game);
    } else {
      sendQuestion(game);
    }
  });

  socket.on('host:reveal', () => {
    const game = games[socket.data.code];
    if (!game) return;
    revealAnswer(game);
  });

  // Modifié pour accepter un tableau de réponses
  socket.on('player:submit-answer', ({ answerIndexes }) => {
    const game = games[socket.data.code];
    if (!game || game.state !== 'playing') return;
    const qIndex = game.currentQuestion;
    if (!game.answers[qIndex]) game.answers[qIndex] = {};
    if (game.answers[qIndex][socket.id]) return;
    const timeMs = Date.now() - game.questionStartedAt;
    game.answers[qIndex][socket.id] = { answerIndexes, timeMs };
    io.to(game.hostSocketId).emit('host:player-answered', {
      answeredCount: Object.keys(game.answers[qIndex]).length,
      totalPlayers: Object.keys(game.players).length,
    });
    socket.emit('player:answer-received');
  });

  socket.on('player:update-avatar', ({ avatar }) => {
    const game = games[socket.data.code];
    if (!game) return;
    const player = game.players[socket.id];
    if (!player || !avatar) return;
    player.avatar = avatar;
    socket.emit('player:avatar-updated', { avatar });
    if (game.hostSocketId) {
      io.to(game.hostSocketId).emit('host:player-joined', { players: Object.values(game.players) });
    }
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    if (!code || !games[code]) return;
    const game = games[code];
    if (socket.data.role === 'player') {
      delete game.players[socket.id];
      io.to(game.hostSocketId).emit('host:player-joined', { players: Object.values(game.players) });
    } else if (socket.data.role === 'host') {
      io.to(code).emit('game:host-left');
      delete games[code];
    }
  });
});

function sendQuestion(game) {
  const q = game.quiz.questions[game.currentQuestion];
  if (!q) {
    endGame(game);
    return;
  }
  game.questionStartedAt = Date.now();
  io.to(game.code).emit('question:show', {
    index: game.currentQuestion,
    total: game.quiz.questions.length,
    image: q.image,
    text: q.text,
    answers: q.answers,
    correctIndexes: q.correctIndexes || [q.correctIndex || 0],
    duration: q.duration || 20,
    points: q.points || 1000,
  });
}

function revealAnswer(game) {
  const qIndex = game.currentQuestion;
  const q = game.quiz.questions[qIndex];
  const answersGiven = game.answers[qIndex] || {};
  const stats = q.answers.map(() => 0);
  const correctIndexes = q.correctIndexes || [q.correctIndex || 0];

  Object.entries(answersGiven).forEach(([socketId, ans]) => {
    ans.answerIndexes.forEach(idx => {
      stats[idx] = (stats[idx] || 0) + 1;
    });
    
    const player = game.players[socketId];
    if (!player) return;
    
    // Vérification stricte : il faut toutes les bonnes réponses, et aucune mauvaise
    const isCorrect = ans.answerIndexes.length === correctIndexes.length && 
                      ans.answerIndexes.every(val => correctIndexes.includes(val));

    if (isCorrect) {
      const durationMs = (q.duration || 20) * 1000;
      const speedFactor = Math.max(0, 1 - ans.timeMs / durationMs);
      const points = Math.round((q.points || 1000) * (0.5 + 0.5 * speedFactor));
      player.score += points;
      player.lastPoints = points;
    } else {
      player.lastPoints = 0;
    }
  });

  Object.entries(game.players).forEach(([socketId, player]) => {
    if (!answersGiven[socketId]) player.lastPoints = 0;
  });

  const sortedPlayers = Object.entries(game.players).sort((a, b) => b[1].score - a[1].score);
  const leaderboard = sortedPlayers.map(([socketId, p], i) => {
    const rank = i + 1;
    const previousRank = game.previousRanks[socketId];
    const rankChange = previousRank ? previousRank - rank : 0;
    return { pseudo: p.pseudo, avatar: p.avatar, score: p.score, lastPoints: p.lastPoints || 0, rankChange, isNew: !previousRank };
  });
  sortedPlayers.forEach(([socketId], i) => { game.previousRanks[socketId] = i + 1; });

  io.to(game.code).emit('question:reveal', { correctIndexes, stats, leaderboard });

  Object.entries(game.players).forEach(([socketId, player]) => {
    const ans = answersGiven[socketId];
    const isCorrect = ans && ans.answerIndexes.length === correctIndexes.length && 
                      ans.answerIndexes.every(val => correctIndexes.includes(val));
    io.to(socketId).emit('player:result', {
      correct: !!isCorrect,
      points: player.lastPoints || 0,
      totalScore: player.score,
    });
  });
}

function endGame(game) {
  game.state = 'ended';
  const leaderboard = Object.values(game.players)
    .sort((a, b) => b.score - a.score)
    .map((p) => ({ pseudo: p.pseudo, avatar: p.avatar, score: p.score }));
  io.to(game.code).emit('game:over', { leaderboard });

  try {
    const history = loadHistory();
    history.unshift({
      date: new Date().toISOString(),
      quizTitle: game.quiz.title,
      code: game.code,
      leaderboard,
    });
    saveHistory(history.slice(0, 200));
  } catch (e) {
    console.error("Impossible d'enregistrer l'historique :", e);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Serveur lancé ! Ouvrez votre navigateur sur http://localhost:${PORT}`);
});

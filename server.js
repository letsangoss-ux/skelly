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

// Convertit une URL publique ("/uploads/xxx.jpg" ou "/audio/xxx.mp3") en chemin réel sur le disque
function urlToDiskPath(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('/uploads/')) return path.join(__dirname, 'data', 'images', url.slice('/uploads/'.length));
  if (url.startsWith('/audio/')) return path.join(__dirname, 'data', 'audio', url.slice('/audio/'.length));
  return null;
}

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

// ------------------------------------------------------------
// EXPORT / IMPORT — sauvegarde manuelle des quiz (texte + photos + musiques)
// Utile car l'hébergement gratuit peut effacer le disque à chaque redémarrage.
// ------------------------------------------------------------
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
    try {
      data = JSON.parse(req.file.buffer.toString('utf-8'));
    } catch (e) {
      return res.status(400).json({ error: "Ce fichier n'est pas un export valide (JSON illisible)." });
    }
    if (!data || !Array.isArray(data.quizzes)) {
      return res.status(400).json({ error: "Format d'export non reconnu." });
    }

    // Restaurer les fichiers (photos, musiques) exactement à leur emplacement d'origine
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

    // Fusionner les quiz : on remplace ceux qui ont le même id, on ajoute les autres
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
      questionRevealed: false,
      autoRevealTimer: null,
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
            sound: q.sound || null,
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
      clearTimeout(game.autoRevealTimer);
      if (game.autoRevealScheduledAt) {
        const elapsed = Date.now() - game.autoRevealScheduledAt;
        game.autoRevealRemainingMs = Math.max(0, (game.autoRevealRemainingMs || 0) - elapsed);
      }
      io.to(game.code).emit('game:paused');
    } else {
      const pausedDuration = Date.now() - game.pauseStartedAt;
      game.questionStartedAt += pausedDuration;
      game.paused = false;
      game.pauseStartedAt = null;
      scheduleAutoReveal(game, game.autoRevealRemainingMs || 0);
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
    const answeredCount = Object.keys(game.answers[qIndex]).length;
    const totalPlayers = Object.keys(game.players).length;
    io.to(game.hostSocketId).emit('host:player-answered', { answeredCount, totalPlayers });
    socket.emit('player:answer-received');

    // Tout le monde a répondu : on révèle tout de suite, pas besoin d'attendre la fin du chrono
    if (totalPlayers > 0 && answeredCount >= totalPlayers) {
      revealAnswer(game);
    }
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    if (!code || !games[code]) return;
    const game = games[code];
    if (socket.data.role === 'player') {
      // On ne supprime pas tout de suite : le joueur peut se reconnecter (perte wifi, page rechargée)
      io.to(game.hostSocketId).emit('host:player-joined', { players: playersForHost(game) });
    } else if (socket.data.role === 'host') {
      clearTimeout(game.autoRevealTimer);
      io.to(code).emit('game:host-left');
      delete games[code];
    }
  });
});

// ============================================================
// MODE "IMPOSTEUR" (Undercover) — jeu indépendant du quiz.
// Tous les joueurs reçoivent le même mot secret, sauf un seul
// "imposteur" qui ne reçoit aucun mot et doit bluffer.
// ============================================================
const UNDERCOVER_WORDS_FILE = path.join(__dirname, 'data', 'undercover-words.json');
function loadUndercoverWords() {
  if (!fs.existsSync(UNDERCOVER_WORDS_FILE)) fs.writeFileSync(UNDERCOVER_WORDS_FILE, '[]');
  return JSON.parse(fs.readFileSync(UNDERCOVER_WORDS_FILE, 'utf-8'));
}

function ucPlayersForHost(game) {
  return Object.entries(game.players).map(([socketId, p]) => ({ ...p, socketId }));
}
function ucPublicOrder(game) {
  // Liste ordonnée des joueurs (avatar + nom uniquement, jamais le mot) pour l'affichage "tour de table"
  return game.order.map((socketId) => {
    const p = game.players[socketId];
    return { socketId, pseudo: p.pseudo, avatar: p.avatar };
  });
}

io.on('connection', (socket) => {
  socket.on('uc:create-game', () => {
    const code = generateCode();
    games[code] = {
      code,
      mode: 'undercover',
      hostSocketId: socket.id,
      players: {},
      playerIdIndex: {},
      state: 'lobby', // lobby -> turns -> voting -> reveal
      order: [],
      currentTurnIndex: 0,
      round: 1,
      word: null,
      impostorSocketId: null,
      votes: {},
    };
    socket.join(code);
    socket.data.role = 'uc-host';
    socket.data.code = code;
    socket.emit('uc:game-created', { code });
  });

  socket.on('uc:join-game', ({ code, pseudo, avatar, playerId }) => {
    code = (code || '').toUpperCase().trim();
    const game = games[code];
    if (!game || game.mode !== 'undercover') return socket.emit('uc:join-error', { message: 'Code introuvable. Vérifiez le code et réessayez.' });

    const existingSocketId = playerId && game.playerIdIndex[playerId];
    if (existingSocketId && game.players[existingSocketId]) {
      const player = game.players[existingSocketId];
      delete game.players[existingSocketId];
      game.players[socket.id] = player;
      game.playerIdIndex[playerId] = socket.id;
      game.order = game.order.map((id) => (id === existingSocketId ? socket.id : id));
      if (game.impostorSocketId === existingSocketId) game.impostorSocketId = socket.id;
      socket.join(code);
      socket.data.role = 'uc-player';
      socket.data.code = code;
      socket.data.playerId = playerId;
      socket.emit('uc:joined', { code, pseudo: player.pseudo, avatar: player.avatar, reconnected: true });
      if (game.hostSocketId) io.to(game.hostSocketId).emit('uc:player-joined', { players: ucPlayersForHost(game) });
      return;
    }

    if (game.state !== 'lobby') return socket.emit('uc:join-error', { message: 'La partie a déjà commencé.' });

    const cleanPseudo = (pseudo || 'Joueur').trim().slice(0, 16);
    const pid = playerId || crypto.randomBytes(8).toString('hex');
    game.players[socket.id] = { playerId: pid, pseudo: cleanPseudo, avatar: avatar || '/avatars/avatar1.svg' };
    game.playerIdIndex[pid] = socket.id;
    socket.join(code);
    socket.data.role = 'uc-player';
    socket.data.code = code;
    socket.data.playerId = pid;
    socket.emit('uc:joined', { code, pseudo: cleanPseudo, avatar, playerId: pid });
    io.to(game.hostSocketId).emit('uc:player-joined', { players: ucPlayersForHost(game) });
  });

  socket.on('uc:update-avatar', ({ avatar }) => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'undercover') return;
    const player = game.players[socket.id];
    if (!player || !avatar) return;
    player.avatar = avatar;
    if (game.hostSocketId) io.to(game.hostSocketId).emit('uc:player-joined', { players: ucPlayersForHost(game) });
  });

  function ucStartManche(game) {
    const playerIds = Object.keys(game.players);
    const words = loadUndercoverWords();
    game.word = words.length ? words[Math.floor(Math.random() * words.length)] : 'Mot mystère';
    game.impostorSocketId = playerIds[Math.floor(Math.random() * playerIds.length)];
    // Ordre de passage mélangé à chaque manche
    game.order = [...playerIds].sort(() => Math.random() - 0.5);
    game.currentTurnIndex = 0;
    game.state = 'turns';
    game.votes = {};

    io.to(game.hostSocketId).emit('uc:manche-started', { order: ucPublicOrder(game), round: game.round });
    io.to(game.code).emit('uc:manche-started-players', { order: ucPublicOrder(game) });

    playerIds.forEach((socketId) => {
      const isImpostor = socketId === game.impostorSocketId;
      io.to(socketId).emit('uc:your-word', { word: isImpostor ? null : game.word, isImpostor });
    });

    io.to(game.code).emit('uc:turn-changed', { socketId: game.order[0], round: game.round });
  }

  socket.on('uc:host-start', () => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'undercover') return;
    if (Object.keys(game.players).length < 3) {
      socket.emit('uc:error', { message: 'Il faut au moins 3 joueurs pour commencer.' });
      return;
    }
    game.round = 1;
    ucStartManche(game);
  });

  socket.on('uc:next-turn', () => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'undercover' || game.state !== 'turns') return;
    game.currentTurnIndex++;
    if (game.currentTurnIndex >= game.order.length) {
      game.currentTurnIndex = 0;
      game.round++;
    }
    io.to(game.code).emit('uc:turn-changed', { socketId: game.order[game.currentTurnIndex], round: game.round });
  });

  socket.on('uc:start-vote', () => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'undercover') return;
    game.state = 'voting';
    game.votes = {};
    io.to(game.code).emit('uc:voting-started', { order: ucPublicOrder(game) });
  });

  socket.on('uc:submit-vote', ({ votedSocketId }) => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'undercover' || game.state !== 'voting') return;
    if (!game.players[votedSocketId]) return;
    game.votes[socket.id] = votedSocketId;
    socket.emit('uc:vote-received');
    io.to(game.hostSocketId).emit('uc:votes-update', {
      votedCount: Object.keys(game.votes).length,
      totalPlayers: Object.keys(game.players).length,
    });
  });

  function ucReveal(game) {
    game.state = 'reveal';
    const tally = {};
    Object.values(game.votes).forEach((votedId) => { tally[votedId] = (tally[votedId] || 0) + 1; });
    let mostVotedSocketId = null;
    let maxVotes = -1;
    Object.entries(tally).forEach(([socketId, count]) => {
      if (count > maxVotes) { maxVotes = count; mostVotedSocketId = socketId; }
    });

    const players = Object.entries(game.players).map(([socketId, p]) => ({
      socketId, pseudo: p.pseudo, avatar: p.avatar,
      word: socketId === game.impostorSocketId ? null : game.word,
      isImpostor: socketId === game.impostorSocketId,
      votes: tally[socketId] || 0,
    }));

    io.to(game.code).emit('uc:reveal', {
      players,
      word: game.word,
      impostorSocketId: game.impostorSocketId,
      mostVotedSocketId,
      impostorCaught: mostVotedSocketId === game.impostorSocketId,
    });
  }

  socket.on('uc:force-reveal', () => {
    const game = games[socket.data.code];
    if (game && game.mode === 'undercover') ucReveal(game);
  });

  socket.on('uc:new-manche', () => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'undercover') return;
    game.round = 1;
    ucStartManche(game);
  });

  socket.on('uc:end-game', () => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'undercover') return;
    io.to(game.code).emit('uc:game-ended');
    delete games[game.code];
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    if (!code || !games[code] || games[code].mode !== 'undercover') return;
    const game = games[code];
    if (socket.data.role === 'uc-player') {
      io.to(game.hostSocketId).emit('uc:player-joined', { players: ucPlayersForHost(game) });
    } else if (socket.data.role === 'uc-host') {
      io.to(code).emit('uc:host-left');
      delete games[code];
    }
  });
});

function scheduleAutoReveal(game, remainingMs) {
  clearTimeout(game.autoRevealTimer);
  game.autoRevealRemainingMs = remainingMs;
  game.autoRevealScheduledAt = Date.now();
  const questionAtSchedule = game.currentQuestion;
  game.autoRevealTimer = setTimeout(() => {
    // On vérifie qu'on est toujours sur la même question avant de révéler automatiquement
    if (game.currentQuestion === questionAtSchedule && game.state === 'playing' && !game.paused) {
      revealAnswer(game);
    }
  }, remainingMs + 400); // petite marge pour laisser le temps aux dernières réponses d'arriver
}

function sendQuestion(game) {
  const q = game.quiz.questions[game.currentQuestion];
  if (!q) { console.error('Question introuvable, fin de partie forcée.'); endGame(game); return; }
  game.questionStartedAt = Date.now();
  game.questionRevealed = false;
  const durationMs = (q.duration || 20) * 1000;
  const correctIndexes = q.correctIndexes && q.correctIndexes.length ? q.correctIndexes : [q.correctIndex || 0];
  io.to(game.code).emit('question:show', {
    index: game.currentQuestion, total: game.quiz.questions.length,
    text: q.text || null,
    image: q.image || null,
    sound: q.sound || null,
    answers: q.answers, duration: q.duration || 20, points: q.points || 1000,
    multipleAnswers: correctIndexes.length > 1,
  });
  scheduleAutoReveal(game, durationMs);
}

function revealAnswer(game) {
  if (game.questionRevealed) return; // déjà révélée (manuellement ou automatiquement) — on ne le refait pas
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
  clearTimeout(game.autoRevealTimer);
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

// ============================================================
// MODE "RÉSILIANCE" — chacun écrit une anecdote, puis tout le
// monde devine EN MÊME TEMPS (sur une anecdote différente à
// chaque manche) qui a écrit quoi. Personne n'attend jamais :
// à chaque manche, tous les joueurs devinent simultanément,
// chacun sur une anecdote différente (jamais la sienne).
// ============================================================
const RES_WRITING_DURATION_MS = 45000;
const RES_GUESS_ROUND_DURATION_MS = 20000;

function resPlayersForHost(game) {
  return Object.entries(game.players).map(([socketId, p]) => ({ ...p, socketId }));
}

// Pour la manche game.round (1-indexée), chaque joueur à la position i de
// game.order devine l'anecdote du sujet à la position (i + offset) % N, avec
// offset = round + 1. Le décalage de +1 (on saute "round=1 tout court") garantit
// qu'on ne devine JAMAIS ni sa propre anecdote (sujet = soi), ni l'anecdote
// qu'on a soi-même écrite (l'auteur, situé juste avant soi dans l'ordre du
// cycle d'écriture — voir resStartWritingPhase). Après N-2 manches, chaque
// joueur a deviné l'anecdote de tous les autres sauf la sienne et celle qu'il
// a écrite, exactement une fois chacune.
function resBuildRoundAssignment(game) {
  const N = game.order.length;
  const offset = game.round + 1;
  const assignment = {};
  game.order.forEach((guesserSocketId, i) => {
    assignment[guesserSocketId] = game.order[(i + offset) % N];
  });
  return assignment;
}

function resSendRound(game) {
  clearTimeout(game.roundTimer);
  game.roundGuesses = {};
  game.currentAssignment = resBuildRoundAssignment(game);
  const totalRounds = game.order.length - 2;

  const optionsList = game.order
    .filter((sid) => game.players[sid])
    .map((sid) => ({ socketId: sid, pseudo: game.players[sid].pseudo, avatar: game.players[sid].avatar }));

  Object.entries(game.currentAssignment).forEach(([guesserSocketId, authorSocketId]) => {
    io.to(guesserSocketId).emit('res:your-turn-to-guess', {
      text: game.anecdotes[authorSocketId],
      options: optionsList,
      round: game.round,
      totalRounds,
    });
  });
  io.to(game.code).emit('res:round-started', {
    round: game.round,
    totalRounds,
    duration: RES_GUESS_ROUND_DURATION_MS / 1000,
  });
  game.roundTimer = setTimeout(() => resFinishRound(game), RES_GUESS_ROUND_DURATION_MS + 400);
}

function resFinishRound(game) {
  if (game.state !== 'guessing') return;
  clearTimeout(game.roundTimer);

  Object.entries(game.currentAssignment).forEach(([guesserSocketId, authorSocketId]) => {
    if (!game.guesses[authorSocketId]) game.guesses[authorSocketId] = {};
    if (game.roundGuesses[guesserSocketId] !== undefined) {
      game.guesses[authorSocketId][guesserSocketId] = game.roundGuesses[guesserSocketId];
    }
  });

  const totalRounds = game.order.length - 2;
  if (game.round >= totalRounds) {
    resStartReveal(game);
  } else {
    game.round++;
    resSendRound(game);
  }
}

function resStartReveal(game) {
  game.state = 'reveal';
  game.revealIndex = 0;
  io.to(game.code).emit('res:guessing-done');
}

// Permutation "sans point fixe" : chaque écrivain se voit assigné un AUTRE joueur
// comme sujet de son anecdote (jamais lui-même). Chaque joueur est aussi sujet
// d'exactement une anecdote (écrite par quelqu'un d'autre).
function resSendCurrentReveal(game) {
  const subjectSocketId = game.order[game.revealIndex];
  const subject = game.players[subjectSocketId];
  if (!subject) { // le sujet s'est déconnecté définitivement : on saute sa révélation
    game.revealIndex++;
    if (game.revealIndex >= game.order.length) { io.to(game.code).emit('res:reveal-done'); return; }
    return resSendCurrentReveal(game);
  }
  const realAuthorId = game.anecdoteAuthors ? game.anecdoteAuthors[subjectSocketId] : null;
  const realAuthor = realAuthorId ? game.players[realAuthorId] : null;
  const guessesForThis = game.guesses[subjectSocketId] || {};
  const guessList = Object.entries(guessesForThis).map(([guesserSocketId, guessedSocketId]) => {
    const guesser = game.players[guesserSocketId];
    const guessed = game.players[guessedSocketId];
    return {
      guesserPseudo: guesser ? guesser.pseudo : '?',
      guesserAvatar: guesser ? guesser.avatar : '/avatars/avatar1.svg',
      guessedPseudo: guessed ? guessed.pseudo : '(pas de réponse)',
      guessedAvatar: guessed ? guessed.avatar : '/avatars/avatar1.svg',
      correct: guessedSocketId === subjectSocketId,
    };
  });
  io.to(game.code).emit('res:reveal-anecdote', {
    subjectPseudo: subject.pseudo,
    subjectAvatar: subject.avatar,
    authorPseudo: realAuthor ? realAuthor.pseudo : '?',
    authorAvatar: realAuthor ? realAuthor.avatar : '/avatars/avatar1.svg',
    text: game.anecdotes[subjectSocketId],
    guesses: guessList,
    index: game.revealIndex,
    total: game.order.length,
  });
}

function resFinishWriting(game) {
  if (game.state !== 'writing') return;
  clearTimeout(game.writingTimer);
  // IMPORTANT : on ne re-mélange pas l'ordre ici. game.order a été fixé dans
  // resStartWritingPhase et sert à la fois de cycle d'écriture (qui a écrit
  // sur qui) et de base pour la rotation des devinettes (resBuildRoundAssignment).
  // Les deux doivent rester alignés sur le même ordre, sinon le décalage +1 qui
  // exclut l'auteur ne correspond plus à rien.
  game.order = game.order.filter((id) => game.anecdotes[id] !== undefined);
  if (game.order.length < 3) {
    io.to(game.hostSocketId).emit('res:error', { message: "Pas assez d'anecdotes reçues (3 minimum) pour continuer." });
    game.state = 'lobby';
    return;
  }
  game.round = 1;
  game.guesses = {};
  game.state = 'guessing';
  resSendRound(game);
}

function resStartWritingPhase(game) {
  game.state = 'writing';
  game.anecdotes = {};
  game.anecdoteAuthors = {};

  const playerIds = Object.keys(game.players);
  // Un seul grand cycle mélangé : le joueur à la position i écrit sur celui à la
  // position i+1. Ce même ordre sert ensuite de base à la rotation des devinettes
  // (resBuildRoundAssignment), ce qui garantit qu'on ne devine jamais sa propre
  // anecdote NI celle qu'on a soi-même écrite.
  game.order = [...playerIds].sort(() => Math.random() - 0.5);
  const N = game.order.length;
  game.assignments = {}; // écrivain -> sujet (la personne sur qui il doit écrire)
  game.order.forEach((writerId, i) => { game.assignments[writerId] = game.order[(i + 1) % N]; });

  playerIds.forEach((writerId) => {
    const subjectId = game.assignments[writerId];
    const subject = game.players[subjectId];
    io.to(writerId).emit('res:your-target', { targetPseudo: subject.pseudo, targetAvatar: subject.avatar });
  });

  io.to(game.code).emit('res:writing-started', { duration: RES_WRITING_DURATION_MS / 1000 });
  clearTimeout(game.writingTimer);
  game.writingTimer = setTimeout(() => resFinishWriting(game), RES_WRITING_DURATION_MS + 400);
}

io.on('connection', (socket) => {
  socket.on('res:create-game', () => {
    const code = generateCode();
    games[code] = {
      code, mode: 'resiliance',
      hostSocketId: socket.id,
      players: {}, playerIdIndex: {},
      state: 'lobby',
      anecdotes: {},
      anecdoteAuthors: {},
      assignments: {},
      order: [],
      round: 1,
      roundGuesses: {},
      currentAssignment: {},
      guesses: {},
      revealIndex: 0,
      writingTimer: null,
      roundTimer: null,
    };
    socket.join(code);
    socket.data.role = 'res-host';
    socket.data.code = code;
    socket.emit('res:game-created', { code });
  });

  socket.on('res:join-game', ({ code, pseudo, avatar, playerId }) => {
    code = (code || '').toUpperCase().trim();
    const game = games[code];
    if (!game || game.mode !== 'resiliance') return socket.emit('res:join-error', { message: 'Code introuvable. Vérifiez le code et réessayez.' });

    const existingSocketId = playerId && game.playerIdIndex[playerId];
    if (existingSocketId && game.players[existingSocketId]) {
      const player = game.players[existingSocketId];
      delete game.players[existingSocketId];
      game.players[socket.id] = player;
      game.playerIdIndex[playerId] = socket.id;
      if (game.anecdotes[existingSocketId] !== undefined) { game.anecdotes[socket.id] = game.anecdotes[existingSocketId]; delete game.anecdotes[existingSocketId]; }
      if (game.anecdoteAuthors) {
        Object.keys(game.anecdoteAuthors).forEach((subjectId) => {
          if (game.anecdoteAuthors[subjectId] === existingSocketId) game.anecdoteAuthors[subjectId] = socket.id;
        });
        if (game.anecdoteAuthors[existingSocketId] !== undefined) { game.anecdoteAuthors[socket.id] = game.anecdoteAuthors[existingSocketId]; delete game.anecdoteAuthors[existingSocketId]; }
      }
      if (game.assignments) {
        if (game.assignments[existingSocketId] !== undefined) { game.assignments[socket.id] = game.assignments[existingSocketId]; delete game.assignments[existingSocketId]; }
        Object.keys(game.assignments).forEach((writerId) => {
          if (game.assignments[writerId] === existingSocketId) game.assignments[writerId] = socket.id;
        });
      }
      game.order = game.order.map((id) => (id === existingSocketId ? socket.id : id));
      Object.keys(game.guesses).forEach((authorId) => {
        const g = game.guesses[authorId];
        if (g[existingSocketId] !== undefined) { g[socket.id] = g[existingSocketId]; delete g[existingSocketId]; }
      });
      if (game.guesses[existingSocketId]) { game.guesses[socket.id] = game.guesses[existingSocketId]; delete game.guesses[existingSocketId]; }
      socket.join(code);
      socket.data.role = 'res-player';
      socket.data.code = code;
      socket.data.playerId = playerId;
      socket.emit('res:joined', { code, pseudo: player.pseudo, avatar: player.avatar, reconnected: true });
      if (game.hostSocketId) io.to(game.hostSocketId).emit('res:player-joined', { players: resPlayersForHost(game) });
      return;
    }

    if (game.state !== 'lobby') return socket.emit('res:join-error', { message: 'La partie a déjà commencé.' });

    const cleanPseudo = (pseudo || 'Joueur').trim().slice(0, 16);
    const pid = playerId || crypto.randomBytes(8).toString('hex');
    game.players[socket.id] = { playerId: pid, pseudo: cleanPseudo, avatar: avatar || '/avatars/avatar1.svg' };
    game.playerIdIndex[pid] = socket.id;
    socket.join(code);
    socket.data.role = 'res-player';
    socket.data.code = code;
    socket.data.playerId = pid;
    socket.emit('res:joined', { code, pseudo: cleanPseudo, avatar, playerId: pid });
    io.to(game.hostSocketId).emit('res:player-joined', { players: resPlayersForHost(game) });
  });

  socket.on('res:update-avatar', ({ avatar }) => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'resiliance') return;
    const player = game.players[socket.id];
    if (!player || !avatar) return;
    player.avatar = avatar;
    if (game.hostSocketId) io.to(game.hostSocketId).emit('res:player-joined', { players: resPlayersForHost(game) });
  });

  socket.on('res:host-start', () => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'resiliance') return;
    if (Object.keys(game.players).length < 3) return socket.emit('res:error', { message: 'Il faut au moins 3 joueurs pour commencer.' });
    resStartWritingPhase(game);
  });

  socket.on('res:submit-anecdote', ({ text }) => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'resiliance' || game.state !== 'writing') return;
    const subjectId = game.assignments[socket.id];
    if (!subjectId) return;
    const clean = (text || '').trim().slice(0, 200);
    if (!clean) return;
    game.anecdotes[subjectId] = clean;
    game.anecdoteAuthors[subjectId] = socket.id;
    const count = Object.keys(game.anecdotes).length;
    const total = Object.keys(game.players).length;
    io.to(game.hostSocketId).emit('res:writing-progress', { count, total });
    socket.emit('res:anecdote-received');
    if (count >= total) resFinishWriting(game);
  });

  socket.on('res:force-start-guessing', () => {
    const game = games[socket.data.code];
    if (game && game.mode === 'resiliance' && game.state === 'writing') resFinishWriting(game);
  });

  socket.on('res:submit-guess', ({ guessedSocketId }) => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'resiliance' || game.state !== 'guessing') return;
    if (!game.currentAssignment[socket.id]) return;
    if (game.roundGuesses[socket.id] !== undefined) return;
    game.roundGuesses[socket.id] = guessedSocketId;
    socket.emit('res:guess-received');
    const answeredCount = Object.keys(game.roundGuesses).length;
    const totalGuessers = Object.keys(game.currentAssignment).length;
    io.to(game.hostSocketId).emit('res:round-progress', { answeredCount, totalGuessers });
    if (answeredCount >= totalGuessers) resFinishRound(game);
  });

  socket.on('res:force-next-round', () => {
    const game = games[socket.data.code];
    if (game && game.mode === 'resiliance' && game.state === 'guessing') resFinishRound(game);
  });

  socket.on('res:start-reveal', () => {
    const game = games[socket.data.code];
    if (game && game.mode === 'resiliance' && game.state === 'reveal') resSendCurrentReveal(game);
  });

  socket.on('res:next-reveal', () => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'resiliance' || game.state !== 'reveal') return;
    game.revealIndex++;
    if (game.revealIndex >= game.order.length) io.to(game.code).emit('res:reveal-done');
    else resSendCurrentReveal(game);
  });

  socket.on('res:new-manche', () => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'resiliance') return;
    game.order = [];
    game.round = 1;
    game.roundGuesses = {};
    game.currentAssignment = {};
    game.guesses = {};
    game.revealIndex = 0;
    resStartWritingPhase(game);
  });

  socket.on('res:end-game', () => {
    const game = games[socket.data.code];
    if (!game || game.mode !== 'resiliance') return;
    clearTimeout(game.writingTimer);
    clearTimeout(game.roundTimer);
    io.to(game.code).emit('res:game-ended');
    delete games[game.code];
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    if (!code || !games[code] || games[code].mode !== 'resiliance') return;
    const game = games[code];
    if (socket.data.role === 'res-player') {
      io.to(game.hostSocketId).emit('res:player-joined', { players: resPlayersForHost(game) });
    } else if (socket.data.role === 'res-host') {
      clearTimeout(game.writingTimer);
      clearTimeout(game.roundTimer);
      io.to(code).emit('res:host-left');
      delete games[code];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Serveur lancé ! Ouvrez votre navigateur sur http://localhost:${PORT}`));

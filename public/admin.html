<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tableau de bord — Le Quiz des Sacs</title>
<link rel="stylesheet" href="/css/style.css">
</head>
<body>

  <!-- ÉCRAN : connexion -->
  <div id="screen-login" class="screen">
    <div class="card" style="text-align:center;">
      <div class="eyebrow">Accès réservé</div>
      <h1 class="title-xl">Tableau de bord</h1>
      <div class="field" style="text-align:left;">
        <label for="input-password">Mot de passe administrateur</label>
        <input type="text" id="input-password" placeholder="••••••••" autocomplete="off">
      </div>
      <div class="btn-row"><button class="btn btn-primary" id="btn-login">Se connecter</button></div>
      <div class="error-msg" id="login-error"></div>
    </div>
  </div>

  <!-- ÉCRAN : liste des quiz -->
  <div id="screen-dashboard" class="screen hidden">
    <div class="admin-shell">
      <div class="admin-header">
        <div><div class="eyebrow">Tableau de bord</div><h1 class="title-xl">Mes quiz</h1></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-ghost" id="btn-show-global" style="width:auto;">Classement général</button>
          <button class="btn btn-ghost" id="btn-show-history" style="width:auto;">Historique</button>
          <button class="btn btn-primary" id="btn-new-quiz" style="width:auto;">+ Nouveau quiz</button>
        </div>
      </div>
      <div id="quiz-list" class="quiz-list"></div>
    </div>
  </div>

  <!-- ÉCRAN : historique -->
  <div id="screen-history" class="screen hidden">
    <div class="admin-shell">
      <div class="admin-header">
        <div><div class="eyebrow">Historique</div><h1 class="title-xl">Parties jouées</h1></div>
        <button class="btn btn-ghost" id="btn-back-dashboard" style="width:auto;">← Retour</button>
      </div>
      <div id="history-list"></div>
    </div>
  </div>

  <!-- ÉCRAN : classement général -->
  <div id="screen-global" class="screen hidden">
    <div class="admin-shell">
      <div class="admin-header">
        <div><div class="eyebrow">Toutes parties confondues</div><h1 class="title-xl">Classement général</h1></div>
        <button class="btn btn-ghost" id="btn-back-dashboard-2" style="width:auto;">← Retour</button>
      </div>
      <div id="global-list"></div>
    </div>
  </div>

  <!-- ÉCRAN : éditeur de quiz -->
  <div id="screen-editor" class="screen hidden">
    <div class="admin-shell">
      <div class="admin-header">
        <div><div class="eyebrow">Éditeur</div><h1 class="title-xl" id="editor-title">Nouveau quiz</h1></div>
        <button class="btn btn-ghost" id="btn-cancel-edit" style="width:auto;">← Annuler</button>
      </div>

      <div class="field">
        <label for="quiz-title-input">Titre du quiz</label>
        <input type="text" id="quiz-title-input" placeholder="Ex : Spécial sacs — Live du 12 juillet">
      </div>

      <div class="field">
        <label>Musique de salle d'attente (optionnel)</label>
        <div id="music-current" class="hidden" style="margin-bottom:10px;">
          <audio id="music-preview" controls style="width:100%;"></audio>
          <button class="icon-btn" id="btn-remove-music">✕ Retirer</button>
        </div>
        <label class="qc-upload-label" style="display:inline-block;width:auto;padding:10px 18px;">
          <input type="file" id="music-upload-input" accept="audio/*" class="hidden">
          <span>Choisir un fichier audio</span>
        </label>
      </div>

      <div class="field">
        <label>Musique pendant les questions (optionnel, sinon la musique d'attente continue)</label>
        <div id="music-q-current" class="hidden" style="margin-bottom:10px;">
          <audio id="music-q-preview" controls style="width:100%;"></audio>
          <button class="icon-btn" id="btn-remove-music-q">✕ Retirer</button>
        </div>
        <label class="qc-upload-label" style="display:inline-block;width:auto;padding:10px 18px;">
          <input type="file" id="music-q-upload-input" accept="audio/*" class="hidden">
          <span>Choisir un fichier audio</span>
        </label>
      </div>

      <h3 style="margin-top:30px;">Questions</h3>
      <div id="questions-list"></div>
      <button class="btn btn-ghost" id="btn-add-question" style="margin-top:14px;">+ Ajouter une question</button>

      <div class="host-controls" style="justify-content:flex-start; margin-top:36px;">
        <button class="btn btn-primary" id="btn-save-quiz" style="width:auto;">Enregistrer le quiz</button>
      </div>
      <div class="error-msg" id="editor-error"></div>
    </div>
  </div>

  <!-- Modèle d'une carte question -->
  <template id="question-card-template">
    <div class="question-card">
      <div class="qc-header">
        <span class="qc-number"></span>
        <div style="display:flex; gap:10px; align-items:center;">
          <div class="qc-order-btns">
            <button class="icon-btn qc-move-up" title="Monter">▲</button>
            <button class="icon-btn qc-move-down" title="Descendre">▼</button>
          </div>
          <button class="icon-btn qc-remove" title="Supprimer la question">✕</button>
        </div>
      </div>
      <div class="qc-body">
        <div class="qc-photo-zone">
          <img class="qc-photo-preview hidden">
          <label class="qc-upload-label">
            <input type="file" accept="image/*" class="qc-photo-input hidden">
            <span>Choisir une photo (facultatif)</span>
          </label>
          <button class="icon-btn qc-remove-photo hidden" type="button">✕ Retirer la photo</button>
        </div>
        <div class="qc-fields">
          <div class="field"><label>Intitulé de la question</label><input type="text" class="qc-question-text" placeholder="Ex : Quel est ce sac ?"></div>

          <div class="qc-answer-row">
            <input type="text" class="qc-answer qc-answer-0" placeholder="Réponse 1">
            <label class="qc-checkbox-label"><input type="checkbox" class="qc-correct-check qc-correct-0"><span class="qc-checkbox-visual"></span> bonne réponse</label>
          </div>
          <div class="qc-answer-row">
            <input type="text" class="qc-answer qc-answer-1" placeholder="Réponse 2">
            <label class="qc-checkbox-label"><input type="checkbox" class="qc-correct-check qc-correct-1"><span class="qc-checkbox-visual"></span> bonne réponse</label>
          </div>
          <div class="qc-answer-row">
            <input type="text" class="qc-answer qc-answer-2" placeholder="Réponse 3">
            <label class="qc-checkbox-label"><input type="checkbox" class="qc-correct-check qc-correct-2"><span class="qc-checkbox-visual"></span> bonne réponse</label>
          </div>
          <div class="qc-answer-row">
            <input type="text" class="qc-answer qc-answer-3" placeholder="Réponse 4">
            <label class="qc-checkbox-label"><input type="checkbox" class="qc-correct-check qc-correct-3"><span class="qc-checkbox-visual"></span> bonne réponse</label>
          </div>

          <div style="display:flex; gap:14px; margin-top:14px;">
            <div class="field" style="flex:1;"><label>Temps (secondes)</label><input type="text" class="qc-duration" placeholder="20"></div>
            <div class="field" style="flex:1;"><label>Points</label><input type="text" class="qc-points" placeholder="1000"></div>
          </div>
        </div>
      </div>
    </div>
  </template>

  <script src="/js/admin.js"></script>
</body>
</html>

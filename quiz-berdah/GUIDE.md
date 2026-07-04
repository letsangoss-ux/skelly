# Guide pas à pas — Le Quiz des Sacs

## 1. Ouvrir le projet
1. Dézippez le fichier `quiz-berdah.zip` où vous voulez sur votre ordinateur.
2. Ouvrez **Visual Studio Code**.
3. Menu **Fichier → Ouvrir le dossier...** → sélectionnez le dossier `quiz-berdah`.

## 2. Installer Node.js (une seule fois, seulement si pas déjà fait)
1. Allez sur **https://nodejs.org**.
2. Téléchargez la version "LTS" (recommandée) et installez-la comme n'importe quel logiciel (Suivant, Suivant, Terminer).
3. Redémarrez VS Code après l'installation.

## 3. Installer les briques du projet (une seule fois)
1. Dans VS Code, ouvrez le terminal : menu **Terminal → Nouveau terminal**.
2. Tapez cette commande puis Entrée :
   ```
   npm install
   ```
3. Attendez que ça se termine (quelques secondes à 1 minute).

## 4. Lancer le site sur votre ordinateur
1. Dans le même terminal, tapez :
   ```
   npm start
   ```
2. Vous verrez écrit : `✅ Serveur lancé ! Ouvrez votre navigateur sur http://localhost:3000`
3. Ouvrez votre navigateur (Chrome, Safari...) et allez sur cette adresse : **http://localhost:3000**
4. Pour tester avec vos amis sur le même réseau Wi-Fi, remplacez juste `localhost` par l'adresse IP de votre ordinateur (je vous montrerai comment la trouver quand on préparera la mise en ligne).

Pour arrêter le serveur : cliquez dans le terminal et faites `Ctrl + C`.

## 5. Utiliser le tableau de bord pour créer vos quiz (Phase 2)
1. Depuis la page d'accueil (`http://localhost:3000`), cliquez sur **« Gérer mes quiz »** en bas de page (ou allez directement sur `http://localhost:3000/admin.html`).
2. Mot de passe par défaut : **sacs2026**
   ⚠️ **Changez-le tout de suite** : ouvrez le fichier `data/config.json` et remplacez `"sacs2026"` par le mot de passe de votre choix, entre les guillemets. Enregistrez, puis relancez le serveur (`Ctrl + C` puis `npm start`).
3. Cliquez sur **« + Nouveau quiz »**.
4. Donnez un titre à votre quiz.
5. Pour chaque question :
   - cliquez sur **« Choisir une photo »** pour importer votre vraie photo du sac (elle est automatiquement enregistrée) ;
   - remplissez la bonne réponse et les 3 mauvaises réponses (l'ordre sera mélangé automatiquement au moment du jeu, pas de souci) ;
   - réglez le temps (en secondes) et les points si vous le souhaitez.
6. Cliquez sur **« + Ajouter une question »** pour en ajouter d'autres.
7. Cliquez sur **« Enregistrer le quiz »**.
8. Vous pouvez ensuite cliquer sur **« Lancer »** directement depuis le tableau de bord pour démarrer une partie avec ce quiz, ou sur **« Modifier »** / **« Supprimer »** à tout moment.
9. Le bouton **« Historique des parties »** en haut du tableau de bord vous montre toutes les parties déjà jouées avec le gagnant de chacune.

Vous pouvez aussi toujours supprimer le quiz de démonstration une fois que vous avez créé les vôtres.

## 6. Publier le site gratuitement (pour jouer avec vos amis, de partout)
On fera cette étape ensemble à l'étape suivante avec **Render.com** (gratuit, sans carte bancaire). Dites-moi quand vous êtes prêt(e) et je vous guide clic par clic.

## Ce qui arrive en Phase 3
- Mise en ligne gratuite sur Render.com, avec une adresse que vous pourrez partager à vos amis.

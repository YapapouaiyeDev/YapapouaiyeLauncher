# Yapapouaiye Launcher sur ChromeOS

Le launcher PC dispose d'une cible Debian pour l'environnement Linux de ChromeOS (Crostini), sur les Chromebook **Intel/AMD 64 bits**. Il ne s'exécute pas dans un onglet Chrome. Les Chromebook ARM et ceux dont l'environnement Linux est indisponible ou interdit par l'administrateur ne sont pas couverts par cette cible.

## Installation

1. Dans les paramètres ChromeOS, activer **Développeurs → Environnement de développement Linux**. Le mode développeur de ChromeOS n'est pas nécessaire.
2. Dans le terminal Linux, vérifier que `uname -m` affiche `x86_64`, puis actualiser les paquets :

   ```sh
   sudo apt update
   ```

3. Récupérer `Yapapouaiye-Launcher-ChromeOS-<version>-x64.deb`, le placer dans **Fichiers Linux**, puis double-cliquer dessus et choisir **Installer avec Linux**. Les bibliothèques graphiques et audio sont déclarées comme dépendances du paquet et installées automatiquement. Alternative dans le terminal, depuis le dossier contenant le fichier :

   ```sh
   sudo apt install ./Yapapouaiye-Launcher-ChromeOS-*-x64.deb
   ```

4. Ouvrir **Yapapouaiye Launcher** depuis les applications Linux du Chromebook. La commande `yapapouaiye-launcher` permet aussi de le démarrer depuis le terminal pour consulter les erreurs.

Le launcher conserve l'authentification, les serveurs, les vérifications d'accès et la synchronisation des mods existants. Le moteur télécharge automatiquement le Java requis par Minecraft. Un Java installé manuellement peut être choisi dans les paramètres, par exemple `/usr/bin/java`.

Les données sont dans `${XDG_CONFIG_HOME:-$HOME/.config}/.yapapouaiye-launcher/`. Le PC de confiance est lié à l'identité du conteneur Linux ; sa recréation exige une nouvelle autorisation. Ajuster la RAM du jeu à la mémoire disponible pour Linux et conserver de la place pour ChromeOS. Le support OpenGL et les performances dépendent du Chromebook et de son pilote graphique.

## Compilation et mises à jour

Compiler depuis Linux x64 avec Node.js 22 et npm :

```sh
npm ci
npm run test:chromeos
npm run build:chromeos
```

Le paquet est produit dans `dist/`. Le workflow manuel **Build ChromeOS (Linux x64)** permet aussi de le compiler sur GitHub Actions et de télécharger l'artefact avec son empreinte SHA-256. Il ne publie aucune release.

Sur Windows, avec Node.js 22+ et Python 3.11+ accessible via `py -3`, exécuter `npm run build:chromeos:windows`. Electron-builder prépare les binaires Linux x64 ; `scripts/package-chromeos.py` crée le paquet Debian avec la bibliothèque standard Python et les scripts d’installation d’electron-builder. Il conserve le sandbox Chromium, les permissions exécutables, l’entrée du menu, les dépendances et la configuration de mise à jour Debian. Le paquet et son manifeste sont produits sans WSL ni FUSE. Cette procédure permet la compilation quand WSL est indisponible ; elle ne remplace pas un essai d’installation Linux.

Le site utilise `site/downloads.json` comme catalogue public des fichiers publiés. Lors d’une nouvelle publication, mettre à jour ce fichier avec les URL GitHub des assets réellement disponibles puis redéployer le site. Windows utilise une version stable ; ChromeOS/Linux peut proposer une bêta identifiée comme telle. Le navigateur détecte la plateforme et l’architecture quand elles sont disponibles ; un sélecteur permet une correction manuelle. Une plateforme sans paquet ou un Chromebook ARM n’est pas redirigé vers un installateur Windows.

Pour distribuer une mise à jour, joindre le `.deb` et le manifeste Linux généré à la release de la même version : `beta-linux.yml` en bêta, `latest-linux.yml` en stable. Le manifeste Windows `beta.yml`/`latest.yml` reste nécessaire pour Windows. Respecter `AGENTS.md` et `VERSION.md` : titre égal au tag, bêta en préversion, jamais dernière version stable. L'updater choisit le manifeste Linux et vérifie la présence du paquet Debian ; il ne télécharge pas l'installateur Windows. L'installation peut demander une élévation Linux ; en cas d'échec, réinstaller le nouveau `.deb` avec `sudo apt install ./<fichier.deb>` préserve les données utilisateur.

## État de validation

Les tests automatisés couvrent la configuration de packaging, l'identité Linux, le sélecteur Java et les manifestes de mise à jour Windows/Linux. **L'installation du paquet, l'authentification Microsoft, le rendu, le son et une partie Minecraft restent à vérifier sur un Chromebook réel.** Les tests sous Windows ne prouvent pas ces comportements. Aucun changement du système ChromeOS ni désactivation du sandbox Chromium n'est requis par cette implémentation.

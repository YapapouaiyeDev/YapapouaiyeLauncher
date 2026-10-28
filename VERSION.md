# Changer la version du launcher

Modifiez uniquement `version.json` à la racine, puis enregistrez :

```json
{
  "version": "1.6.1"
}
```

Formats acceptés : `1.6.1`, `1.6.1-2`, `1.7.0-beta.1`, `1.7.0-alpha.1`. Ne mettez pas de `v` devant le numéro.

Double-cliquez sur `appliquer-version.cmd` ou exécutez `npm run version:sync` pour appliquer la version partout. Node.js doit être installé.

La synchronisation se fait aussi automatiquement avec `npm start`, `npm run build`, `npm run build:publish`, `npm run tauri:dev` et `npm run tauri:build`. Pour une commande Cargo ou Electron directe, exécutez d'abord la synchronisation.

Les métadonnées Electron, les fichiers Cargo et le numéro affiché sont synchronisés. Les requêtes réseau et la version Tauri utilisent la version de l'application. Les versions des dépendances, de Minecraft et du site restent indépendantes.

Changer ce fichier ne publie aucune mise à jour : compilez ensuite le launcher et utilisez votre procédure habituelle de publication. Une application déjà compilée conserve sa version jusqu'à la prochaine compilation.

Pour une bêta, utilisez un numéro contenant `beta`, par exemple `1.6.1-4-beta.1` (le numéro de build `4` suit la stable `1.6.1-3`). La synchronisation configure GitHub en préversion et utilise `beta.yml`. Les builds stables utilisent `latest.yml`. Un build bêta ne génère pas de manifeste stable.

Le format des titres et le statut des publications GitHub sont définis dans [AGENTS.md](AGENTS.md), à respecter pour chaque release.

## Versions Android indépendantes

Pour une publication Android, modifier uniquement `Android/version.json` : `version` est le nom affiché et publié, par exemple `1.0.0-A`, et `versionCode` est un entier strictement croissant pour les mises à jour Android. Le suffixe `-A` identifie la série Android. Ne pas modifier la version PC dans le fichier racine pour publier un APK.

Les APK de test précédents utilisaient la version PC `1.6.1-4` et le code Android `1060104`. La première publication Android `1.0.0-A` utilise donc `1060105` pour permettre leur mise à jour sans désinstallation. Les scripts Android appliquent et vérifient ces deux valeurs à la compilation. Pour les versions suivantes, augmenter le numéro Android et son code.

Le tag et le titre GitHub doivent être identiques, par exemple `v1.0.0-A`. Une publication Android doit utiliser `make_latest: false` pour conserver la dernière release du launcher PC. L'APK, son empreinte et les sources correspondantes doivent accompagner la release ; renseigner ensuite l'entrée `android` de `site/downloads.json` et déployer le site.

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

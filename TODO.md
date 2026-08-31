# Fix Auto-Updates v1.4 - Frontend UI

## ✅ Plan approved

**Problème v1.4:** Backend autoUpdater fonctionne (console), mais pas d'UI visible pour utilisateurs.

## 📋 Étapes à compléter:

### ☐ Étape 1: `src/preload.js` - Exposer IPC updates
- `window.electronAPI.checkForUpdates()`
- Événements: `update-status`, `update-progress`

### ☐ Étape 2: `src/renderer.js` - Logique UI
- Event listeners IPC
- Mettre à jour DOM (status, bouton, progress)

### ☐ Étape 3: `src/index.html` - Section "Mises à jour"  
- Statut, bouton "Vérifier", barre de progression

### ☐ Étape 4: `src/style.css` - Styles progress

### ☐ Étape 5: Test
- `npm start`
- Vérifier GitHub releases v1.5.1 (.exe + latest.yml)
- Tester flux complet

## 🔧 Suivi des changements

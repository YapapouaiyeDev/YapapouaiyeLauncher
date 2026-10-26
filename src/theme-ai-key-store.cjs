const fs = require('node:fs');
const path = require('node:path');

function createThemeAiKeyStore(directory, safeStorage) {
  const file = path.join(directory, 'theme-ai-key.enc');
  function encryptionAvailable() {
    return safeStorage.isEncryptionAvailable()
      && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
  }
  return {
    get() {
      try {
        if (!fs.existsSync(file)) return { success: true, apiKey: '' };
        if (!encryptionAvailable()) return { success: false, error: 'Le stockage sécurisé est indisponible. Saisissez votre clé pour cette session.' };
        return { success: true, apiKey: safeStorage.decryptString(fs.readFileSync(file)) };
      } catch {
        return { success: false, error: 'Impossible de relire la clé enregistrée. Saisissez-la à nouveau ou utilisez « Oublier ».' };
      }
    },
    save(value) {
      if (typeof value !== 'string' || value.length > 1024 || /[\r\n]/.test(value)) {
        return { success: false, error: 'Clé API NVIDIA NIM invalide.' };
      }
      const apiKey = value.trim();
      try {
        if (!apiKey) {
          fs.rmSync(file, { force: true });
          return { success: true };
        }
        if (!encryptionAvailable()) return { success: false, error: 'Le stockage sécurisé est indisponible. La clé reste utilisable pour cette session.' };
        const encrypted = safeStorage.encryptString(apiKey);
        fs.mkdirSync(directory, { recursive: true });
        const temporary = `${file}.tmp`;
        try {
          fs.writeFileSync(temporary, encrypted, { mode: 0o600 });
          fs.renameSync(temporary, file);
        } finally {
          fs.rmSync(temporary, { force: true });
        }
        return { success: true };
      } catch {
        return { success: false, error: 'Impossible de sauvegarder la clé sur cet appareil. Elle reste utilisable pour cette session.' };
      }
    }
  };
}

module.exports = { createThemeAiKeyStore };

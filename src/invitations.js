const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Admission belongs to the main process, outside renderer-editable settings.
function createInvitationGate({ directory, verifyRemote }) {
  const file = path.join(directory, 'invitation.json');
  let busy = false;
  function read() {
    if (!fs.existsSync(file)) return { clientId: randomUUID(), accepted: false, retryAt: 0 };
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!state || typeof state.clientId !== 'string' || !/^[0-9a-f-]{36}$/i.test(state.clientId)) throw new Error('État d’invitation illisible.');
    return state;
  }
  function write(state) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(state), 'utf8');
    fs.renameSync(`${file}.tmp`, file);
  }
  function status() {
    const state = read();
    return { accepted: state.accepted === true, retryAfter: Math.max(0, Math.ceil(((state.retryAt || 0) - Date.now()) / 1000)) };
  }
  function required() {
    try { if (status().accepted) return null; } catch {}
    return { success: false, code: 'INVITATION_REQUIRED', error: 'Validez votre code d’invitation dans l’assistant de premier démarrage.' };
  }
  async function verify(code) {
    if (busy) return { success: false, error: 'Validation déjà en cours.' };
    busy = true;
    try {
      const state = read();
      if (state.accepted === true) return { success: true };
      const remaining = status().retryAfter;
      if (remaining) return { success: false, code: 'INVITATION_COOLDOWN', retryAfter: remaining };
      if (typeof code !== 'string' || !code.trim()) return { success: false, error: 'Le code d’invitation est obligatoire.' };
      if (code.trim().length > 128) return { success: false, error: 'Le code est trop long.' };
      write(state); // Keep the installation ID across a lost response or restart.
      const result = await verifyRemote({ code: code.trim(), clientId: state.clientId });
      if (result?.success === true && typeof result.invitationId === 'string') {
        write({ ...state, accepted: true, invitationId: result.invitationId, retryAt: 0 });
        return { success: true };
      }
      if (result?.code === 'INVITATION_INVALID' || result?.code === 'INVITATION_COOLDOWN') {
        const retryAfter = Math.max(result.code === 'INVITATION_INVALID' ? 10 : 1, Math.min(60, Number(result.retryAfter) || 10));
        write({ ...state, retryAt: Date.now() + retryAfter * 1000 });
        return { success: false, code: result.code, retryAfter, error: result.error };
      }
      return { success: false, error: result?.error || 'Validation des invitations indisponible.' };
    } catch {
      return { success: false, error: 'Impossible de valider ou d’enregistrer l’invitation. Réessayez.' };
    } finally { busy = false; }
  }
  return { status, required, verify };
}

module.exports = { createInvitationGate };

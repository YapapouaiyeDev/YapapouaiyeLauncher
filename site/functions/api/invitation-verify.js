import { readJsonBody } from "../_lib/request.js";
import { json } from "../_lib/auth.js";
import { hashInvitation } from "../_lib/invitations.js";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ success: false, error: "Méthode non autorisée." }, 405);
  if (!env.INVITATIONS_DB) return json({ success: false, error: "Validation des invitations indisponible." }, 503);
  let body;
  try { body = await readJsonBody(request); }
  catch { return json({ success: false, error: "Requête JSON invalide." }, 400); }
  if (typeof body.clientId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.clientId)) {
    return json({ success: false, error: "Identifiant du launcher invalide." }, 400);
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) return json({ success: false, error: "Le code d’invitation est obligatoire." }, 400);
  const ipHash = await hashInvitation(request.headers.get("cf-connecting-ip") || "local");
  const attemptId = crypto.randomUUID();
  try {
    const now = Date.now();
    await env.INVITATIONS_DB.prepare("INSERT OR IGNORE INTO invitation_attempts (ip_hash, retry_at, attempt_id) VALUES (?, 0, '')").bind(ipHash).run();
    // Claim the attempt atomically across requests and Worker instances.
    const claim = await env.INVITATIONS_DB.prepare("UPDATE invitation_attempts SET retry_at = ?, attempt_id = ? WHERE ip_hash = ? AND retry_at <= ? RETURNING ip_hash")
      .bind(now + 60000, attemptId, ipHash, now).first();
    if (!claim) {
      const pending = await env.INVITATIONS_DB.prepare("SELECT retry_at FROM invitation_attempts WHERE ip_hash = ?").bind(ipHash).first();
      const retryAfter = Math.max(1, Math.ceil(((pending?.retry_at || now + 10000) - now) / 1000));
      return json({ success: false, code: "INVITATION_COOLDOWN", retryAfter, error: "Patientez avant de réessayer." });
    }
    const codeHash = await hashInvitation(code.length <= 128 ? code : "");
    // A single-use code can be retried by the same installation if its response was lost.
    const invitation = await env.INVITATIONS_DB.prepare("UPDATE invitations SET redeemed_at = COALESCE(redeemed_at, ?), redeemed_by = ? WHERE code_hash = ? AND revoked = 0 AND (redeemed_by IS NULL OR redeemed_by = ?) RETURNING id")
      .bind(Date.now(), body.clientId, codeHash, body.clientId).first();
    if (invitation) {
      await env.INVITATIONS_DB.prepare("DELETE FROM invitation_attempts WHERE ip_hash = ? AND attempt_id = ?").bind(ipHash, attemptId).run();
      return json({ success: true, invitationId: invitation.id });
    }
    await env.INVITATIONS_DB.prepare("UPDATE invitation_attempts SET retry_at = ? WHERE ip_hash = ? AND attempt_id = ?").bind(Date.now() + 10000, ipHash, attemptId).run();
    return json({ success: false, code: "INVITATION_INVALID", retryAfter: 10, error: "Code incorrect, révoqué ou déjà utilisé." });
  } catch {
    console.error(JSON.stringify({ event: "invitation_validation_failed" }));
    return json({ success: false, error: "Validation des invitations indisponible. Réessayez plus tard." }, 503);
  }
}

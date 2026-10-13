import { readJsonBody } from "../../_lib/request.js";
import { verifyAdminRequest, json } from "../../_lib/auth.js";
import { hashInvitation } from "../../_lib/invitations.js";

export async function onRequest({ request, env }) {
  // The site's development defaults must never grant invitation management.
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD === "admin" || env.ADMIN_TOKEN_SECRET === "yapapouaiye-launcher-secret-key-2026") {
    return json({ error: "Configurez des secrets administrateur privés pour gérer les invitations." }, 503);
  }
  if (!await verifyAdminRequest(request, env)) return json({ error: "Session administrateur requise." }, 401);
  if (!env.INVITATIONS_DB) return json({ error: "Base des invitations indisponible." }, 503);
  try {
    if (request.method === "GET") {
      const { results } = await env.INVITATIONS_DB.prepare("SELECT id, label, created_at, redeemed_at, revoked FROM invitations ORDER BY created_at DESC").all();
      return json({ invitations: results });
    }
    if (!["POST", "DELETE"].includes(request.method)) return json({ error: "Méthode non autorisée." }, 405);
    let body;
    try { body = await readJsonBody(request); }
    catch { return json({ error: "Requête JSON invalide." }, 400); }
    if (request.method === "DELETE") {
      if (typeof body.id !== "string" || body.id.length > 64) return json({ error: "Identifiant invalide." }, 400);
      const revoked = await env.INVITATIONS_DB.prepare("UPDATE invitations SET revoked = 1 WHERE id = ? RETURNING id").bind(body.id).first();
      return revoked ? json({ success: true }) : json({ error: "Invitation introuvable." }, 404);
    }
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label || label.length > 100) return json({ error: "Indiquez le nom de l’invité (100 caractères maximum)." }, 400);
    if (body.code != null && typeof body.code !== "string") return json({ error: "Code invalide." }, 400);
    const code = body.code?.trim() || crypto.randomUUID().replace(/-/g, "");
    if (code.length < 8 || code.length > 128) return json({ error: "Le code doit contenir entre 8 et 128 caractères." }, 400);
    const codeHash = await hashInvitation(code);
    const id = crypto.randomUUID();
    const created = await env.INVITATIONS_DB.prepare("INSERT INTO invitations (id, code_hash, label, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(code_hash) DO NOTHING RETURNING id")
      .bind(id, codeHash, label, Date.now()).first();
    if (!created) return json({ error: "Ce code existe déjà. Choisissez un autre code." }, 409);
    return json({ success: true, id, code }, 201);
  } catch {
    console.error(JSON.stringify({ event: "invitation_admin_failed" }));
    return json({ error: "Gestion des invitations indisponible. Vérifiez la migration de la base." }, 503);
  }
}

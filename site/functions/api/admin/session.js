import { verifyAdminRequest, json } from "../../_lib/auth.js";

export async function onRequest({ request, env }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "Méthode non autorisée" }, 405);
  }

  const payload = await verifyAdminRequest(request, env);
  if (!payload) {
    return json({ error: "Session invalide ou expirée." }, 401);
  }

  return json({
    ok: true,
    user: {
      username: payload.sub || "admin",
      role: payload.role || "admin",
      exp: payload.exp,
    }
  });
}

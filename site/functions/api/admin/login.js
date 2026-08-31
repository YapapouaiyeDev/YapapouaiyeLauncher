import {
  issueAdminToken,
  rateLimited,
  rateLimitResponse,
  json,
} from "../../_lib/auth.js";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return json({ error: "Méthode non autorisée" }, 405);
  }

  const expectedUsername = env.ADMIN_USERNAME || "admin";
  const expectedPassword = env.ADMIN_PASSWORD || "admin";

  if (rateLimited(request, { limit: 5, windowMs: 60000, scope: "admin-login" })) {
    return rateLimitResponse(60);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();

  if (!username || !password) {
    return json({ error: "Veuillez renseigner l'identifiant et le mot de passe." }, 400);
  }

  if (username !== expectedUsername || password !== expectedPassword) {
    return json({ error: "Identifiant ou mot de passe incorrect." }, 401);
  }

  const token = await issueAdminToken(env);
  return json({
    ok: true,
    token,
    user: {
      username: expectedUsername,
      role: "admin",
    },
    message: "Connexion réussie !"
  });
}

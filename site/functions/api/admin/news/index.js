import { verifyAdminRequest, json } from "../../../_lib/auth.js";
import { getAllNews, createNews } from "../../../_lib/db.js";

export async function onRequest(context) {
  const { request, env } = context;

  // 1. Verify Admin Auth Token
  const admin = await verifyAdminRequest(request, env);
  if (!admin) {
    return json({ error: "Accès refusé : session administrateur requise." }, 401);
  }

  const url = new URL(request.url);

  // GET: list all news from database
  if (request.method === "GET") {
    try {
      const list = await getAllNews(env, url.origin);
      return json({ ok: true, total: list.length, news: list });
    } catch (err) {
      return json({ error: "Erreur lors de la lecture de la base de données : " + err.message }, 500);
    }
  }

  // POST: create a new news entry in the database
  if (request.method === "POST") {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "Corps de requête JSON invalide." }, 400);
    }

    const title = String(body.title || "").trim();
    if (!title) {
      return json({ error: "Le titre de la nouveauté est obligatoire." }, 400);
    }

    const content = String(body.content || "").trim();
    if (!content) {
      return json({ error: "Le contenu de l'annonce ne peut pas être vide." }, 400);
    }

    const badge = String(body.badge || "Mise à jour").trim();
    const version = String(body.version || "").trim();
    const author = String(body.author || admin.sub || "Admin").trim();
    const summary = String(body.summary || "").trim();
    const image = String(body.image || "").trim();
    const featured = Boolean(body.featured);

    const now = new Date();
    const formattedDate = body.date
      ? String(body.date).trim()
      : now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    try {
      const createdItem = await createNews(env, {
        title,
        badge,
        version,
        date: formattedDate,
        author,
        featured,
        summary,
        content,
        image,
      }, url.origin);

      return json({
        ok: true,
        message: "Nouveauté enregistrée dans la base de données avec succès !",
        news: createdItem,
      }, 201);
    } catch (err) {
      return json({ error: "Erreur lors de l'insertion dans la base de données : " + err.message }, 500);
    }
  }

  return json({ error: "Méthode non autorisée" }, 405);
}

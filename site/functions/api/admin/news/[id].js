import { verifyAdminRequest, json } from "../../../_lib/auth.js";
import { getNewsById, updateNews, deleteNews } from "../../../_lib/db.js";

export async function onRequest(context) {
  const { request, env, params } = context;

  // 1. Verify Admin Auth
  const admin = await verifyAdminRequest(request, env);
  if (!admin) {
    return json({ error: "Accès refusé : session administrateur requise." }, 401);
  }

  const id = params.id;
  if (!id) {
    return json({ error: "ID de nouveauté manquant." }, 400);
  }

  const url = new URL(request.url);

  // GET: Fetch single entry
  if (request.method === "GET") {
    try {
      const item = await getNewsById(env, id, url.origin);
      if (!item) {
        return json({ error: `Nouveauté "${id}" introuvable.` }, 404);
      }
      return json({ ok: true, news: item });
    } catch (err) {
      return json({ error: "Erreur lecture base de données : " + err.message }, 500);
    }
  }

  // PUT: Update news entry
  if (request.method === "PUT") {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "Corps JSON invalide." }, 400);
    }

    try {
      const existing = await getNewsById(env, id, url.origin);
      if (!existing) {
        return json({ error: `Nouveauté avec l'ID "${id}" introuvable.` }, 404);
      }

      const updated = await updateNews(env, id, {
        title: body.title,
        badge: body.badge,
        version: body.version,
        date: body.date,
        author: body.author,
        summary: body.summary,
        content: body.content,
        image: body.image,
        featured: body.featured,
      }, url.origin);

      return json({
        ok: true,
        message: "Nouveauté mise à jour dans la base de données avec succès !",
        news: updated,
      });
    } catch (err) {
      return json({ error: "Erreur lors de la modification : " + err.message }, 500);
    }
  }

  // DELETE: Remove news entry
  if (request.method === "DELETE") {
    try {
      const existing = await getNewsById(env, id, url.origin);
      if (!existing) {
        return json({ error: `Nouveauté "${id}" introuvable.` }, 404);
      }

      const success = await deleteNews(env, id, url.origin);
      if (!success) {
        return json({ error: "Échec de la suppression dans la base de données." }, 500);
      }

      return json({
        ok: true,
        message: `Nouveauté "${existing.title}" supprimée de la base de données.`,
        deletedId: id,
      });
    } catch (err) {
      return json({ error: "Erreur lors de la suppression : " + err.message }, 500);
    }
  }

  return json({ error: "Méthode non autorisée" }, 405);
}

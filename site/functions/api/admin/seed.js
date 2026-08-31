import { verifyAdminRequest, json } from "../../_lib/auth.js";
import { seedInitialNews, getAllNews } from "../../_lib/db.js";

export async function onRequest(context) {
  const { request, env } = context;

  // Verify Admin Auth
  const admin = await verifyAdminRequest(request, env);
  if (!admin) {
    return json({ error: "Accès refusé : session administrateur requise." }, 401);
  }

  if (request.method !== "POST") {
    return json({ error: "Méthode non autorisée" }, 405);
  }

  let listToSeed = undefined;
  try {
    const body = await request.json();
    if (body && Array.isArray(body.news)) {
      listToSeed = body.news;
    }
  } catch {
    // Body is optional, default seed if omitted
  }

  try {
    const url = new URL(request.url);
    await seedInitialNews(env, listToSeed);
    const updatedList = await getAllNews(env, url.origin);

    return json({
      ok: true,
      message: "Base de données initialisée avec succès !",
      total: updatedList.length,
      news: updatedList,
    });
  } catch (err) {
    return json({ error: "Erreur lors de l'initialisation de la base : " + err.message }, 500);
  }
}

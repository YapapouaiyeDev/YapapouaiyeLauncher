import { json } from "../_lib/auth.js";
import { getAllNews } from "../_lib/db.js";

export async function onRequest({ request, env }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "Méthode non autorisée" }, 405);
  }

  const url = new URL(request.url);
  const badge = url.searchParams.get("badge");
  const featured = url.searchParams.get("featured");
  const limit = url.searchParams.get("limit") || "50";
  const search = url.searchParams.get("search") || url.searchParams.get("q");

  try {
    const list = await getAllNews(env, url.origin, {
      badge,
      featured,
      limit,
      search,
    });

    return new Response(JSON.stringify({
      ok: true,
      total: list.length,
      news: list,
      entries: list, // Fully compatible with desktop launcher & web apps
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
      }
    });
  } catch (err) {
    console.error("[API /api/news] Erreur:", err);
    return json({
      ok: false,
      error: "Erreur lors de la récupération des nouveautés",
      news: [],
      entries: []
    }, 500);
  }
}

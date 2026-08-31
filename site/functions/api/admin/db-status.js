import { verifyAdminRequest, json } from "../../_lib/auth.js";
import { getDbStatus } from "../../_lib/db.js";

export async function onRequest(context) {
  const { request, env } = context;

  // Verify Admin Auth
  const admin = await verifyAdminRequest(request, env);
  if (!admin) {
    return json({ error: "Accès refusé : session administrateur requise." }, 401);
  }

  const url = new URL(request.url);
  try {
    const status = await getDbStatus(env, url.origin);
    return json({ ok: true, status });
  } catch (err) {
    return json({ ok: false, error: err.message }, 500);
  }
}

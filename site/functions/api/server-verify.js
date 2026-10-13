import { readJsonBody } from '../_lib/request.js';
import { json, rateLimited, rateLimitResponse } from '../_lib/auth.js';
import { readState, codesMatch } from '../_lib/servers.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
  if (rateLimited(request, { limit: 5, windowMs: 10000, scope: 'server-codes' })) return rateLimitResponse(10);
  try {
    const body = await readJsonBody(request, 16384);
    const { value } = await readState(env, 'servers.json');
    const server = value.find(s => s.id === body.serverId && !s.deleted && s.enabled !== false);
    if (!server) return json({ ok: false, valid: false, error: 'Serveur introuvable.' }, 404);
    const codes = Array.isArray(server.accessCodes) ? server.accessCodes : [];
    const valid = !server.codesRequired || (codes.length > 0 && await codesMatch(body.codes, codes));
    return json({ ok: true, valid, serverId: server.id, codesRequired: !!server.codesRequired, codesCount: codes.length });
  } catch (error) { return json({ ok: false, valid: false, error: error.status ? error.message : 'Vérification indisponible.' }, error.status || 503); }
}

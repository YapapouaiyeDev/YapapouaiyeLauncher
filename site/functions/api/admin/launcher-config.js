import { readJsonBody } from '../../_lib/request.js';
import { json, verifyAdminRequest } from '../../_lib/auth.js';
import { readState, updateState, ServerError } from '../../_lib/servers.js';

export async function onRequest({ request, env }) {
  if (!await verifyAdminRequest(request, env)) return json({ error: 'Session administrateur requise.' }, 401);
  try {
    let value;
    if (request.method === 'GET') value = (await readState(env, 'launcher-config.json')).value;
    else if (request.method === 'PUT') {
      const body = await readJsonBody(request, 16384);
      if (typeof body.maintenance !== 'boolean' || typeof body.message !== 'string' || body.message.length > 500) throw new ServerError('Configuration de maintenance invalide.');
      value = await updateState(env, 'launcher-config.json', existing => ({ ...existing, maintenance: body.maintenance, message: body.message, updatedAt: new Date().toISOString() }));
    } else return json({ error: 'Méthode non autorisée.' }, 405);
    return json({ ok: true, ...value });
  } catch (error) { return json({ error: error.status ? error.message : 'Configuration indisponible.' }, error.status || 503); }
}

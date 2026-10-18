import { readJsonBody } from '../../../_lib/request.js';
import { json, verifyAdminRequest } from '../../../_lib/auth.js';
import { readState, updateState, validateServer, sortedServers } from '../../../_lib/servers.js';

export async function onRequest({ request, env }) {
  if (!await verifyAdminRequest(request, env)) return json({ error: 'Session administrateur requise.' }, 401);
  try {
    if (request.method === 'GET') {
      const { value } = await readState(env, 'servers.json');
      const servers = sortedServers(value.filter(server => !server.deleted));
      return json({ ok: true, total: servers.length, servers });
    }
    if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
    const server = validateServer(await readJsonBody(request, 16384));
    await updateState(env, 'servers.json', servers => [...servers, server]);
    return json({ ok: true, server, message: 'Serveur enregistré.' }, 201);
  } catch (error) { return json({ error: error.status ? error.message : 'Enregistrement impossible.' }, error.status || 503); }
}

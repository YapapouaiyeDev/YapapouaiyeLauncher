import { json } from '../_lib/auth.js';
import { readState, publicServer, sortedServers } from '../_lib/servers.js';

export async function onRequest({ request, env }) {
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Méthode non autorisée.' }, 405);
  try {
    const { value } = await readState(env, 'servers.json');
    // Include disabled records so the launcher can override its local defaults.
    const servers = sortedServers(value).map(publicServer);
    return json({ ok: true, total: servers.length, servers });
  } catch (error) { return json({ ok: false, error: error.status ? error.message : 'Serveurs indisponibles.' }, error.status || 503); }
}

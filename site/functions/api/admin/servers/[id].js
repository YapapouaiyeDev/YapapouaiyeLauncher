import { readJsonBody } from '../../../_lib/request.js';
import { json, verifyAdminRequest } from '../../../_lib/auth.js';
import { updateState, validateServer, ServerError } from '../../../_lib/servers.js';

export async function onRequest({ request, env, params }) {
  if (!await verifyAdminRequest(request, env)) return json({ error: 'Session administrateur requise.' }, 401);
  if (!['PUT', 'DELETE'].includes(request.method)) return json({ error: 'Méthode non autorisée.' }, 405);
  try {
    const body = request.method === 'PUT' ? await readJsonBody(request, 16384) : null;
    let server;
    await updateState(env, 'servers.json', servers => {
      const index = servers.findIndex(item => item.id === params.id && !item.deleted);
      if (index < 0) throw new ServerError('Serveur introuvable.', 404);
      server = body ? validateServer(body, servers[index]) : { ...servers[index], enabled: false, deleted: true, updatedAt: new Date().toISOString() };
      return servers.map((item, i) => i === index ? server : item);
    });
    return json({ ok: true, server: body ? server : undefined, message: body ? 'Serveur mis à jour.' : 'Serveur supprimé.' });
  } catch (error) { return json({ error: error.status ? error.message : 'Enregistrement impossible.' }, error.status || 503); }
}

import { json } from '../_lib/auth.js';
import { readState } from '../_lib/servers.js';

export async function onRequest({ request, env }) {
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Méthode non autorisée.' }, 405);
  try {
    const { value } = await readState(env, 'launcher-config.json');
    return json({ ok: true, maintenance: value.maintenance === true, message: value.message || '' });
  } catch (error) { return json({ ok: false, error: error.status ? error.message : 'Configuration indisponible.' }, error.status || 503); }
}

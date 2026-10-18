import { json, rateLimited, rateLimitResponse } from '../_lib/auth.js';
import { readJsonBody } from '../_lib/request.js';
import { readState, codesMatch, ServerError } from '../_lib/servers.js';
import { listMods, downloadMod, safeModName } from '../_lib/android-mods.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Méthode non autorisée.' }, 405);
  // Each file request is re-authorized, including maintenance and revoked server codes.
  if (rateLimited(request, { scope: 'android-mods', limit: 600, windowMs: 60000 })) return rateLimitResponse();
  try {
    const body = await readJsonBody(request, 16384);
    const { value: config } = await readState(env, 'launcher-config.json');
    if (config.maintenance === true) throw new ServerError(config.message || 'Launcher en maintenance.', 503);
    const { value: servers } = await readState(env, 'servers.json');
    const server = servers.find(s => s.id === body.serverId && !s.deleted && s.enabled !== false);
    if (!server) throw new ServerError('Serveur indisponible.', 404);
    if (server.codesRequired) {
      if (!server.accessCodes?.length || !await codesMatch(body.codes, server.accessCodes)) {
        if (rateLimited(request, { scope: 'android-mod-codes', limit: 5, windowMs: 10000 })) return rateLimitResponse(10);
        throw new ServerError('Codes d’accès incorrects.', 403);
      }
    }
    if (body.file !== undefined && !safeModName(body.file)) throw new ServerError('Nom de mod invalide.');
    const files = await listMods(server, env);
    if (body.file === undefined) return json({ ok: true, serverId: server.id, gameVersion: server.gameVersion,
      loader: server.defaultLoader, files: files.map(({ name, size, hash, algorithm }) => ({ name, size, hash, algorithm })) });
    const file = files.find(f => f.name === body.file);
    if (!file) throw new ServerError('Mod introuvable.', 404);
    const remote = await downloadMod(file, env);
    return new Response(remote.body, { headers: { 'Content-Type': 'application/java-archive', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    return json({ ok: false, error: error.status ? error.message : 'Synchronisation des mods indisponible.' }, error.status || 503);
  }
}

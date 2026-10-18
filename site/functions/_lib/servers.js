const SERVER_FIELDS = [
  'id', 'name', 'shortName', 'host', 'pingPort', 'gamePort', 'displayIp',
  'gameVersion', 'defaultLoader', 'modsRepoOwner', 'modsRepoRepo', 'modsRepoBranch',
  'apiType', 'apiUrl', 'apiServerId', 'activationUrl', 'badgeTag', 'description',
  'codesRequired', 'codesCount', 'enabled', 'sortOrder', 'createdAt', 'updatedAt',
];

export class ServerError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export async function readState(env, key) {
  if (!env.LAUNCHER_BUCKET) throw new ServerError('Stockage du launcher indisponible.', 503);
  const object = await env.LAUNCHER_BUCKET.get(key);
  if (!object) return { value: key === 'servers.json' ? [] : { maintenance: false, message: '' }, etag: null };
  const value = await object.json();
  if (key === 'servers.json' ? !Array.isArray(value) : (!value || typeof value !== 'object' || Array.isArray(value))) {
    throw new ServerError('Configuration enregistrée invalide. Aucun écrasement effectué.', 503);
  }
  return { value, etag: object.etag };
}

export async function updateState(env, key, change) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { value, etag } = await readState(env, key);
    const next = change(value);
    const written = await env.LAUNCHER_BUCKET.put(key, JSON.stringify(next), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' },
    });
    if (written) return next;
  }
  throw new ServerError('Une autre modification a eu lieu. Rechargez les serveurs et réessayez.', 409);
}

export function publicServer(server) {
  const result = Object.fromEntries(SERVER_FIELDS.filter(key => server[key] !== undefined).map(key => [key, server[key]]));
  result.codesCount = Array.isArray(server.accessCodes) ? server.accessCodes.length : 0;
  result.enabled = !server.deleted && server.enabled !== false;
  return result;
}

export function sortedServers(servers) {
  return [...servers].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.id).localeCompare(String(b.id)));
}

export function validateServer(body, existing = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ServerError('Objet serveur requis.');
  const server = existing ? { ...existing } : {
    id: crypto.randomUUID(), pingPort: 25565, gamePort: 25565, gameVersion: '1.21.1',
    defaultLoader: 'neoforge', enabled: true, codesRequired: false, accessCodes: [],
    sortOrder: 0, createdAt: new Date().toISOString(),
  };
  for (const field of ['name', 'shortName', 'host', 'displayIp', 'gameVersion', 'defaultLoader', 'modsRepoOwner', 'modsRepoRepo', 'modsRepoBranch', 'apiType', 'apiUrl', 'apiServerId', 'activationUrl', 'badgeTag', 'description']) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'string' || body[field].length > (field === 'description' ? 500 : 255)) throw new ServerError(`Champ ${field} invalide.`);
    server[field] = body[field].trim();
  }
  if (!server.name || !server.host) throw new ServerError('Le nom et l’adresse du serveur sont obligatoires.');
  if (!/^[a-z0-9.:[\]_-]+$/i.test(server.host)) throw new ServerError('Adresse du serveur invalide.');
  if (!['neoforge', 'forge', 'fabric', 'vanilla'].includes(server.defaultLoader)) throw new ServerError('Loader invalide.');
  for (const field of ['pingPort', 'gamePort', 'sortOrder']) {
    if (body[field] === undefined) continue;
    if (!Number.isInteger(body[field]) || body[field] < (field === 'sortOrder' ? 0 : 1) || body[field] > (field === 'sortOrder' ? 999 : 65535)) throw new ServerError(`Champ ${field} invalide.`);
    server[field] = body[field];
  }
  for (const field of ['enabled', 'codesRequired']) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'boolean') throw new ServerError(`Champ ${field} invalide.`);
    server[field] = body[field];
  }
  if (body.accessCodes !== undefined) {
    if (!Array.isArray(body.accessCodes) || body.accessCodes.length > 20 || body.accessCodes.some(code => typeof code !== 'string' || !code.trim() || code.length > 128)) throw new ServerError('Codes d’accès invalides (20 codes de 128 caractères maximum).');
    server.accessCodes = body.accessCodes.map(code => code.trim());
  }
  if (server.codesRequired && !server.accessCodes?.length) throw new ServerError('Ajoutez au moins un code ou désactivez les codes obligatoires.');
  server.codesCount = server.accessCodes.length;
  server.updatedAt = new Date().toISOString();
  return server;
}

export async function codesMatch(provided, expected) {
  if (!Array.isArray(provided) || provided.length !== expected.length || provided.some(code => typeof code !== 'string' || code.length > 128)) return false;
  const hash = text => crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(text)));
  const [left, right] = await Promise.all([hash(provided), hash(expected)]);
  return crypto.subtle.timingSafeEqual(left, right);
}

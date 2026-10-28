import { ServerError } from './servers.js';

const encoder = new TextEncoder();
const hex = value => [...new Uint8Array(value)].map(b => b.toString(16).padStart(2, '0')).join('');
const hash = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
async function hmac(key, value) {
  const imported = await crypto.subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', imported, encoder.encode(value));
}
export function safeModName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9_().+ -]+\.jar$/.test(name) && name.length <= 240;
}

async function upstream(url, headers = {}) {
  const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(25000) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new ServerError('Dépôt de mods indisponible.', 502);
  }
  return response;
}

// These provider settings belong to the server, never to the public catalog or APK.
async function b2Request(env, objectKey, list = false) {
  if (!env.B2_KEY_ID || !env.B2_APP_KEY) throw new ServerError('Source B2 non configurée.', 503);
  const endpoint = new URL(env.B2_ENDPOINT || 'https://s3.eu-central-003.backblazeb2.com');
  if (endpoint.protocol !== 'https:' || !/^[a-z0-9.-]+\.backblazeb2\.com$/.test(endpoint.hostname)) throw new ServerError('Source B2 invalide.', 503);
  const bucket = env.B2_BUCKET || 'adoserv67';
  const region = env.B2_REGION || 'eu-central-003';
  const uri = `/${encodeURIComponent(bucket)}${list ? '' : '/' + objectKey.split('/').map(encodeURIComponent).join('/')}`;
  const query = list ? `list-type=2&prefix=${encodeURIComponent(env.B2_MODS_PREFIX || '')}` : '';
  const date = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const day = date.slice(0, 8);
  const payload = await hash('');
  const headers = { host: endpoint.host, 'x-amz-content-sha256': payload, 'x-amz-date': date };
  const names = 'host;x-amz-content-sha256;x-amz-date';
  const canonical = `GET\n${uri}\n${query}\nhost:${endpoint.host}\nx-amz-content-sha256:${payload}\nx-amz-date:${date}\n\n${names}\n${payload}`;
  const scope = `${day}/${region}/s3/aws4_request`;
  const key = await hmac(await hmac(await hmac(await hmac('AWS4' + env.B2_APP_KEY, day), region), 's3'), 'aws4_request');
  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${env.B2_KEY_ID}/${scope}, SignedHeaders=${names}, Signature=${hex(await hmac(key, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${await hash(canonical)}`))}`;
  return upstream(`${endpoint.origin}${uri}${query ? '?' + query : ''}`, headers);
}

export async function listMods(server, env) {
  let files;
  if (server.id === 'adoserv67' && !server.modsRepoRepo) {
    const response = await b2Request(env, '', true);
    const xml = await limitedText(response, 4 * 1024 * 1024);
    if (/<IsTruncated>true<\/IsTruncated>/.test(xml)) throw new ServerError('Dépôt trop volumineux pour le catalogue Android.', 502);
    const unescape = text => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    files = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(([, block]) => {
      const key = unescape(block.match(/<Key>([^<]+)<\/Key>/)?.[1] || '');
      const etag = block.match(/<ETag>([^<]+)<\/ETag>/)?.[1]?.replace(/&quot;|"/g, '') || '';
      return { name: key.split('/').pop(), key, size: Number(block.match(/<Size>(\d+)<\/Size>/)?.[1]), hash: etag, algorithm: 'md5' };
    }).filter(file => file.name.toLowerCase().endsWith('.jar'));
  } else if (server.modsRepoOwner && server.modsRepoRepo) {
    const repo = [server.modsRepoOwner, server.modsRepoRepo].map(encodeURIComponent).join('/');
    const ref = encodeURIComponent(server.modsRepoBranch || 'main');
    const headers = env.GITEA_TOKEN ? { Authorization: `token ${env.GITEA_TOKEN}` } : {};
    const response = await upstream(`https://gitea.com/api/v1/repos/${repo}/contents?ref=${ref}`, headers);
    const data = JSON.parse(await limitedText(response, 4 * 1024 * 1024));
    if (!Array.isArray(data)) throw new ServerError('Catalogue de mods invalide.', 502);
    files = data.filter(f => ['file', 'blob'].includes(f.type) && f.name?.toLowerCase().endsWith('.jar'))
      .map(f => ({ name: f.name, size: f.size, hash: f.sha, algorithm: 'git-sha1', repo, ref }));
  } else if (server.defaultLoader === 'vanilla') files = [];
  else throw new ServerError('Aucun dépôt de mods configuré pour ce serveur.', 503);
  const seen = new Set();
  for (const file of files) {
    if (!safeModName(file.name) || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 1024 ** 3 ||
        !(file.algorithm === 'git-sha1' ? /^[a-f0-9]{40}$/ : /^[a-f0-9]{32}$/).test(file.hash) || seen.has(file.name.toLowerCase())) {
      throw new ServerError('Inventaire de mods invalide ou empreinte non prise en charge.', 502);
    }
    seen.add(file.name.toLowerCase());
  }
  if (files.length > 500) throw new ServerError('Trop de mods dans le dépôt.', 502);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function downloadMod(file, env) {
  if (file.key !== undefined) return b2Request(env, file.key);
  return upstream(`https://gitea.com/api/v1/repos/${file.repo}/raw/${encodeURIComponent(file.name)}?ref=${file.ref}`,
    env.GITEA_TOKEN ? { Authorization: `token ${env.GITEA_TOKEN}` } : {});
}

export async function limitedText(response, limit) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, result = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new ServerError('Réponse du dépôt trop volumineuse.', 502);
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally { await reader.cancel(); }
}

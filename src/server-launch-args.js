const { isIP } = require('node:net');

function parseServerDestination(server) {
  let host = String(server.host || '').trim();
  let port = server.gamePort ?? 25565;
  // Admin configuration can contain a complete address in host. Split it
  // before formatting Quick Play (or passing the legacy --server option).
  // An embedded port is authoritative, as it is for a manual connection.
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(host);
  if (bracketed) {
    host = bracketed[1];
    if (isIP(host) !== 6) throw new Error('Adresse ou port du serveur invalide.');
    if (bracketed[2] !== undefined) port = bracketed[2];
  } else if (host.includes(':') && isIP(host) !== 6) {
    const address = /^([^:\s]+):(\d+)$/.exec(host);
    if (!address) throw new Error('Adresse ou port du serveur invalide.');
    host = address[1];
    port = address[2];
  }
  port = Number(port);
  if (!host || /[\s/\\\[\]]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Adresse ou port du serveur invalide.');
  }
  return { host, port };
}

// Minecraft 1.20+ replaced --server/--port with Quick Play.
function getServerLaunchArgs(version, server) {
  const { host, port } = parseServerDestination(server);
  const match = /^(\d+)\.(\d+)/.exec(String(version));
  const quickPlay = match && (Number(match[1]) > 1 || Number(match[2]) >= 20);
  if (quickPlay) {
    const address = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
    return ['--quickPlayMultiplayer', `${address}:${port}`];
  }
  return ['--server', host, '--port', String(port)];
}

module.exports = { getServerLaunchArgs };

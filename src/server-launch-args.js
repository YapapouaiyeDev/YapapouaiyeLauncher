// Minecraft 1.20+ replaced --server/--port with Quick Play.
function getServerLaunchArgs(version, server) {
  const host = String(server.host || '').trim();
  const port = Number(server.gamePort ?? 25565);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Adresse ou port du serveur invalide.');
  }
  const match = /^(\d+)\.(\d+)/.exec(String(version));
  const quickPlay = match && (Number(match[1]) > 1 || Number(match[2]) >= 20);
  if (quickPlay) {
    const address = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
    return ['--quickPlayMultiplayer', `${address}:${port}`];
  }
  return ['--server', host, '--port', String(port)];
}

module.exports = { getServerLaunchArgs };

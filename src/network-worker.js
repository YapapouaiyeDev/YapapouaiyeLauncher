const { parentPort } = require('node:worker_threads');
const { NetworkClient } = require('./network-client');
const { SessionRelay } = require('./session-relay');

// One worker for every account. Tokens and packets never reach the renderer.
const clients = new Map();
parentPort.on('message', async ({ action, id, options, request }) => {
  if (action === 'stop') { clients.get(id)?.close(); return; }
  if (action === 'detach' || action === 'focus') {
    try {
      const client = clients.get(id);
      if (!(client instanceof SessionRelay)) throw new Error('Cette session ne possède pas de relais continu.');
      await client[action]();
      parentPort.postMessage({ event: 'reply', id, request });
    } catch (error) { parentPort.postMessage({ event: 'reply', id, request, error: error.message }); }
    return;
  }
  if (!['start', 'relay'].includes(action) || clients.has(id)) return;
  try {
    const client = action === 'relay' ? new SessionRelay(options) : new NetworkClient(options);
    clients.set(id, client);
    client.once('ready', () => parentPort.postMessage({ event: 'ready', id }));
    client.once('closed', error => {
      clients.delete(id);
      parentPort.postMessage({ event: 'closed', id, error });
    });
    if (action === 'relay') {
      client.on('state', state => parentPort.postMessage({ event: 'relay-state', id, state }));
      const endpoint = await client.listen();
      if (!client.closed) parentPort.postMessage({ event: 'listening', id, port: endpoint.port });
    } else client.start().catch(() => {}); // closed owns error delivery, including cancellation.
  } catch (error) { parentPort.postMessage({ event: 'closed', id, error: error.message }); }
});

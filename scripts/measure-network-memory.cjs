// Reproducible synthetic loopback load. The fixture lives outside the measured
// process. --relay measures a shared continuous relay after simulated graphical
// clients detach. Neither mode includes Java, Microsoft auth or real terrain.
const { fork } = require('node:child_process');
const { NetworkSessions } = require('../src/network-sessions');
const { fixture } = require('./network-fixture.cjs');
const mb = value => Math.round(value / 1024 / 1024 * 10) / 10;

async function startRelay(service, id, options) {
  const crypto = require('node:crypto');
  const { NetworkClient, varint } = require('../src/network-client');
  const { readControl, OPS } = require('../src/session-relay');
  const secret = crypto.randomBytes(32).toString('hex');
  class Graphical extends NetworkClient {
    async handle(packet, reader) {
      const ids = this.protocol[this.state];
      if (this.state === 'login' && packet === ids.CLIENTBOUND_CUSTOM_QUERY) {
        const transaction = reader.varint(), channel = reader.string();
        const proof = crypto.createHmac('sha256', secret).update(channel, 'ascii').digest();
        this.send(ids.SERVERBOUND_CUSTOM_QUERY_ANSWER, varint(transaction), Buffer.from([1]), proof); return;
      }
      if (this.state === 'game' && packet === ids.CLIENTBOUND_CUSTOM_PAYLOAD) {
        if (readControl(reader.take(reader.buffer.length - reader.offset))?.op === OPS.EXIT) this.close();
        return;
      }
      return super.handle(packet, reader);
    }
  }
  const until = async check => {
    const deadline = Date.now() + 5000;
    while (!check()) {
      if (Date.now() > deadline) throw new Error('Memory probe relay timed out');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  };
  const { port } = await service.openRelay(id, { ...options, secret });
  const graphical = new Graphical({ ...options, host: '127.0.0.1', port });
  try {
    await graphical.start();
    await until(() => service.relayStatus(id)?.canDetach);
    await service.detach(id);
    await until(() => service.relayStatus(id)?.phase === 'background');
  } finally { graphical.close(); }
}

if (process.argv[2] === 'client') {
  (async () => {
    const [count, port] = process.argv.slice(3, 5).map(Number), version = process.argv[5];
    const relay = process.argv[6] === 'relay';
    const baseline = process.memoryUsage().rss;
    let peak = baseline, backgroundPeak = 0, background = false;
    const sample = setInterval(() => {
      const rss = process.memoryUsage().rss;
      peak = Math.max(peak, rss);
      if (background) backgroundPeak = Math.max(backgroundPeak, rss);
    }, 10);
    const service = new NetworkSessions();
    try {
      const start = relay ? (id, options) => startRelay(service, id, options) : (id, options) => service.start(id, options);
      await Promise.all(Array.from({ length: count }, (_, index) => start(String(index), {
        host: '127.0.0.1', port, version,
        account: { uuid: index.toString(16).padStart(32, '0'), name: `Probe${index}` },
      })));
      background = true; backgroundPeak = process.memoryUsage().rss;
      process.send({ ready: true });
      await new Promise(resolve => setTimeout(resolve, 2500));
      const rss = process.memoryUsage().rss;
      peak = Math.max(peak, rss);
      backgroundPeak = Math.max(backgroundPeak, rss);
      process.send({ mode: relay ? 'continuous-relay-background' : 'legacy-network', version, accounts: count, node: process.versions.node,
        baselineRssMiB: mb(baseline), totalRssMiB: mb(rss), peakRssMiB: mb(peak),
        backgroundPeakRssMiB: mb(backgroundPeak), backgroundAddedPeakMiB: mb(backgroundPeak - baseline),
        backgroundAddedPeakPerAccountMiB: mb((backgroundPeak - baseline) / count),
        addedPeakMiB: mb(peak - baseline), addedPeakPerAccountMiB: mb((peak - baseline) / count),
        averageTotalPeakPerAccountMiB: mb(peak / count), forcedGc: false,
      });
    } finally { clearInterval(sample); await service.stopAll(); process.disconnect(); }
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
} else {
  (async () => {
    const relay = process.argv.includes('--relay');
    for (const version of ['1.21.1', '26.2']) {
      for (const count of [1, 10]) {
        const server = await fixture(version, { relaySupport: relay });
        // Unhandled payloads simulate incoming bulk state, deliberately without
        // interpreting them as valid terrain or building a Minecraft world.
        const payload = require('node:crypto').randomBytes(64 * 1024);
        let sentPayloadBytes = 0, ready = false;
        const traffic = setInterval(() => {
          if (!ready) return;
          for (const peer of server.peers) if (peer.state === 'game') {
            peer.send(0x7fff, payload); peer.send(0x7fff, payload);
            sentPayloadBytes += payload.length * 2;
            peer.send(server.wire.keepalive, Buffer.alloc(8));
          }
        }, 100);
        try {
          await new Promise((resolve, reject) => {
            const child = fork(__filename, ['client', String(count), String(server.port), version, relay ? 'relay' : 'legacy'], {
              stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
            });
            child.stderr.on('data', bytes => process.stderr.write(bytes));
            child.on('message', result => { if (result.ready) ready = true; else console.log(JSON.stringify({ ...result, syntheticSentPayloadMiB: mb(sentPayloadBytes) })); });
            child.once('error', reject);
            child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Probe exit ${code}`)));
          });
          if (server.errors.length) throw server.errors[0];
        } finally { clearInterval(traffic); await server.close(); }
      }
    }
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createInvitationGate } = require('../src/invitations');

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-invitation-test-'));
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  let attempts = 0;
  let clientId;
  const verifyRemote = async payload => {
    attempts++;
    if (clientId) assert.equal(payload.clientId, clientId);
    clientId = payload.clientId;
    return payload.code === 'my-assigned-code' ? { success: true, invitationId: 'invitation-test' } : { success: false, code: 'INVITATION_INVALID', retryAfter: 10 };
  };
  try {
    let gate = createInvitationGate({ directory, verifyRemote });
    assert.equal(gate.status().accepted, false);
    assert.equal(gate.required().code, 'INVITATION_REQUIRED');
    assert.equal((await gate.verify('')).success, false);
    assert.equal(attempts, 0);
    assert.equal((await gate.verify('wrong')).retryAfter, 10);
    now += 9999;
    gate = createInvitationGate({ directory, verifyRemote });
    assert.equal((await gate.verify('my-assigned-code')).code, 'INVITATION_COOLDOWN');
    assert.equal(attempts, 1, 'Restart must not bypass the cooldown');
    now++;
    assert.equal((await gate.verify('  my-assigned-code  ')).success, true);
    assert.equal(gate.required(), null);
    gate = createInvitationGate({ directory, verifyRemote });
    assert.equal(gate.status().accepted, true);
    assert.equal((await gate.verify('')).success, true);
    assert.equal(attempts, 2, 'Successful admission persists without another request');
    const networkDir = path.join(directory, 'network');
    gate = createInvitationGate({ directory: networkDir, verifyRemote: async () => { throw new Error('offline'); } });
    assert.equal((await gate.verify('my-assigned-code')).success, false);
    assert.equal(gate.status().accepted, false);
    fs.writeFileSync(path.join(networkDir, 'invitation.json'), '{broken');
    assert.equal(gate.required().code, 'INVITATION_REQUIRED');
    assert.equal((await gate.verify('my-assigned-code')).success, false);
    let finish;
    gate = createInvitationGate({ directory: path.join(directory, 'race'), verifyRemote: () => new Promise(resolve => { finish = resolve; }) });
    const pending = gate.verify('test-code');
    assert.equal((await gate.verify('test-code')).success, false);
    finish({ success: true, invitationId: 'race-test' });
    assert.equal((await pending).success, true);
    console.log('Launcher: admission obligatoire, délai persistant, réseau et concurrence validés.');
  } finally {
    Date.now = originalNow;
    // Only the exact directory generated above, inside the OS temp directory.
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('launcher-invitation-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

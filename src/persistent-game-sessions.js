const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id);
const markerFor = id => `-Dyapapouaiye.session=${id}`;

function spawnIndependentGame(executable, args, directory, logFile) {
  const output = fs.openSync(logFile, 'a', 0o600);
  try {
    // No pipes owned by Electron: the client can keep writing after app.quit().
    return spawn(executable, args, { cwd: directory, detached: true,
      windowsHide: true, stdio: ['ignore', output, output] });
  } finally { fs.closeSync(output); }
}

// A PID alone is insufficient: Windows can reuse it for an unrelated process.
async function isSessionProcess(session) {
  if (!validId(session.id) || !Number.isInteger(session.pid) || session.pid < 1) return false;
  try { process.kill(session.pid, 0); } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
  const marker = markerFor(session.id);
  if (process.platform === 'linux') {
    try {
      return fs.readFileSync(`/proc/${session.pid}/cmdline`, 'utf8').split('\0').includes(marker);
    } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  const command = process.platform === 'win32'
    ? ['powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      String.raw`$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${session.pid}' -ErrorAction Stop; if ($null -eq $p) { 'false' } elseif ($null -eq $p.CommandLine) { throw 'Process command line unavailable' } else { [bool]($p.CommandLine -match '(?:^|[\s"])${marker.replace('.', '\\.')}($|[\s"])') }`]]
    : ['ps', ['-p', String(session.pid), '-o', 'command=']];
  return new Promise((resolve, reject) => {
    execFile(command[0], command[1], { windowsHide: true, timeout: 10000 }, (error, stdout) => {
      if (error) return reject(error);
      if (process.platform === 'win32') resolve(stdout.trim().toLowerCase() === 'true');
      else resolve(stdout.trim().split(/\s+/).includes(marker));
    });
  });
}

function publicSession(session) {
  return { id: session.id, accountUuid: session.accountUuid, accountName: session.accountName,
    serverId: session.serverId, serverName: session.serverName, mode: 'game',
    ram: session.ram, state: 'running', pid: session.pid };
}

class PersistentGameSessions {
  constructor(file, inspect = isSessionProcess) { this.file = file; this.inspect = inspect; }

  save(sessions) {
    const live = sessions.filter(s => validId(s.id) && Number.isInteger(s.pid) && s.pid > 0 && s.mode === 'game');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(live.map(publicSession)), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  async recover() {
    let saved;
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return []; throw error; }
    if (!Array.isArray(saved)) return [];
    const recovered = [];
    for (const session of saved) {
      if (!session || !validId(session.id) || !Number.isInteger(session.pid) || session.pid < 1 ||
          typeof session.accountUuid !== 'string' || !session.accountUuid ||
          typeof session.accountName !== 'string' || typeof session.serverId !== 'string' ||
          !Number.isInteger(session.ram) || session.ram < 2) continue;
      if (await this.inspect(session)) recovered.push(publicSession(session));
    }
    return recovered;
  }
}

class RecoveredGame extends EventEmitter {
  constructor(session, inspect = isSessionProcess) {
    super();
    this.session = session;
    this.inspect = inspect;
    this.exited = new Promise(resolve => this.once('close', resolve));
    this.timer = setInterval(() => { void this.poll(); }, 3000);
    this.timer.unref();
  }

  async poll() {
    if (this.polling || this.closed) return;
    this.polling = true;
    try { if (!await this.inspect(this.session)) this.finish(); }
    catch (error) { this.emit('monitor-error', error); }
    finally { this.polling = false; }
  }

  finish() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    this.emit('close', null);
  }
}

module.exports = { PersistentGameSessions, RecoveredGame, isSessionProcess, markerFor, spawnIndependentGame };

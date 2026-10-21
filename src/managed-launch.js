const { Launch } = require('minecraft-java-core');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

// minecraft-java-core 4.2.7 does not expose the child process or await start().
// Reuse its download/argument builders; own only spawning and process events.
const coreBuild = path.dirname(require.resolve('minecraft-java-core'));
const MinecraftArguments = require(path.join(coreBuild, 'Minecraft/Minecraft-Arguments.js')).default;
const MinecraftLoader = require(path.join(coreBuild, 'Minecraft/Minecraft-Loader.js')).default;

class ManagedLaunch extends Launch {
  constructor() {
    super();
    this.on('error', error => { this.failure ||= error || new Error('Préparation Minecraft impossible.'); });
    this.exited = new Promise(resolve => this.once('close', resolve));
  }

  async Launch(options) {
    await super.Launch(options);
    await this.preparation;
    if (this.failure) throw new Error(this.failure.message || this.failure.error || String(this.failure));
  }

  start() {
    this.preparation = this.startProcess();
    return this.preparation;
  }

  async startProcess() {
    try {
      const data = await this.DownloadGame();
      if (this.failure) return;
      if (!data || data.error) throw new Error(data?.error || 'Préparation Minecraft impossible.');
      const { minecraftJson, minecraftLoader, minecraftVersion, minecraftJava } = data;
      this.loaderId = minecraftLoader?.id;
      const args = await new MinecraftArguments(this.options).GetArguments(minecraftJson, minecraftLoader);
      if (this.failure) return;
      if (args.error) throw new Error(String(args.error));
      const loader = await new MinecraftLoader(this.options).GetArguments(minecraftLoader, minecraftVersion);
      if (this.failure) return;
      if (loader.error) throw new Error(String(loader.error));
      const directory = this.options.instance ? path.join(this.options.path, 'instances', this.options.instance) : this.options.path;
      fs.mkdirSync(directory, { recursive: true });
      const natives = path.join(directory, 'natives', minecraftVersion);
      fs.mkdirSync(natives, { recursive: true });
      const sharedNatives = path.join(this.options.path, 'versions', minecraftJson.id, 'natives');
      if (fs.existsSync(sharedNatives)) fs.cpSync(sharedNatives, natives, { recursive: true });
      const nativeProperties = ['-Djava.library.path=', '-Djna.tmpdir=', '-Dorg.lwjgl.system.SharedLibraryExtractPath=', '-Dio.netty.native.workdir='];
      const commandArgs = [...args.jvm, ...args.classpath, ...loader.jvm, args.mainClass, ...args.game, ...loader.game]
        .map(arg => nativeProperties.some(prefix => arg.startsWith(prefix)) ? `${arg.split('=')[0]}=${natives}` : arg);
      this.child = spawn(this.options.java.path || minecraftJava.path, commandArgs, { cwd: directory, detached: false });
      this.child.stdout.on('data', data => this.emit('data', data.toString('utf8')));
      this.child.stderr.on('data', data => this.emit('data', data.toString('utf8')));
      this.child.once('close', code => this.emit('close', code));
      await new Promise((resolve, reject) => {
        this.child.once('spawn', () => { this.emit('spawn', this.child.pid); resolve(); });
        this.child.once('error', error => { this.emit('error', error); reject(error); });
      });
    } catch (error) {
      if (!this.failure) this.emit('error', error);
    }
  }

  async requestClose() {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    if (!Number.isInteger(child.pid) || child.pid < 1) throw new Error('Fenêtre du jeu introuvable.');
    if (process.platform !== 'win32') {
      if (!child.kill('SIGTERM')) throw new Error('Fermez la fenêtre Minecraft directement.');
      return;
    }
    // CloseMainWindow sends WM_CLOSE to this owned Java process only. Node's
    // child.kill() on Windows would forcibly terminate Java and skip cleanup.
    await new Promise((resolve, reject) => {
      const helper = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
        `$gameProcess = Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue; if ($null -eq $gameProcess) { exit 0 }; if ($gameProcess.CloseMainWindow()) { exit 0 }; exit 2`],
      { windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => { helper.kill(); reject(new Error('Fermez la fenêtre Minecraft directement.')); }, 10000);
      helper.once('error', () => { clearTimeout(timer); reject(new Error('Fermez la fenêtre Minecraft directement.')); });
      helper.once('close', code => {
        clearTimeout(timer);
        if (code === 0 || child.exitCode !== null || child.signalCode !== null) resolve();
        else reject(new Error('Impossible de fermer cette fenêtre automatiquement. Fermez Minecraft directement.'));
      });
    });
  }

  async waitForExit() {
    let timer;
    try {
      await Promise.race([this.exited, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('La fenêtre met du temps à se fermer. La connexion reste conservée ; fermez la fenêtre du jeu avant de reprendre le contrôle.')), 30000);
      })]);
    } finally { clearTimeout(timer); }
  }
}

module.exports = { ManagedLaunch };

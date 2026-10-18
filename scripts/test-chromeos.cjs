const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { validateConfiguration } = require('app-builder-lib/out/util/config/config');
const FpmTarget = require('app-builder-lib/out/targets/FpmTarget').default;
const pkg = require('../package.json');
const source = fs.readFileSync(require.resolve('../src/main.js'), 'utf8');

test('electron-builder accepts the ChromeOS Debian configuration', async () => {
  await validateConfiguration(pkg.build, { isEnabled: false });
  await FpmTarget.prototype.checkOptions.call({
    computeFpmMetaInfoOptions: FpmTarget.prototype.computeFpmMetaInfoOptions,
    packager: { appInfo: { computePackageUrl: async () => pkg.homepage, linuxPackageName: pkg.name },
      info: { metadata: pkg } },
    options: pkg.build.linux,
  });
});

function identity(platform, readFileSync) {
  const context = vm.createContext({
    process: { platform }, fs: { readFileSync }, cachedHwidRaw: '',
    commands: 0,
    execQuiet: () => { context.commands++; throw new Error('Windows command called on Linux'); },
    os: { hostname: () => 'penguin', cpus: () => [], totalmem: () => 8192,
      platform: () => platform, arch: () => 'x64' },
  });
  vm.runInContext(source.slice(source.indexOf('function getMotherboardRawId()'), source.indexOf('function getCurrentHwidHash()')), context);
  return context;
}

test('Crostini identity uses machine-id, stays cached, and never runs Windows commands', () => {
  let reads = 0;
  const id = '1234567890abcdef1234567890abcdef';
  const context = identity('linux', file => {
    assert.equal(file, '/etc/machine-id'); reads++; return `${id}\n`;
  });
  assert.equal(context.getMotherboardRawId(), `linux:${id}`);
  assert.equal(context.getMotherboardRawId(), `linux:${id}`);
  assert.equal(reads, 1);
  assert.equal(context.commands, 0);
});

test('Linux identity rejects invalid IDs and handles an unavailable machine-id', () => {
  const context = identity('linux', file => file === '/etc/machine-id' ? '0'.repeat(32) : 'a'.repeat(32));
  assert.equal(context.getMotherboardRawId(), `linux:${'a'.repeat(32)}`);
  const missing = identity('linux', () => { throw new Error('ENOENT'); });
  assert.match(missing.getMotherboardRawId(), /^fallback:penguin/);
});

test('Linux Java picker accepts executables without a Windows extension', async () => {
  let options;
  const context = vm.createContext({
    process: { platform: 'linux' }, mainWindow: {},
    require: () => ({ dialog: { showOpenDialog: async (_window, value) => {
      options = value; return { canceled: false, filePaths: ['/usr/bin/java'] };
    } } }),
    ipcMain: { handle: (_name, callback) => { context.handler = callback; } },
  });
  vm.runInContext(source.slice(source.indexOf('ipcMain.handle("select-java-path"'), source.indexOf('// Custom Theme File Import')), context);
  assert.equal((await context.handler()).path, '/usr/bin/java');
  assert.equal(options.filters[0].extensions[0], '*');
});

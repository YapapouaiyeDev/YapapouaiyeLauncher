const fs = require('node:fs');
const path = require('node:path');

function syncVersion(root = path.resolve(__dirname, '..')) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const { version } = JSON.parse(read('version.json'));
  const number = '(0|[1-9][0-9]*)';
  const identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
  const semver = new RegExp(`^${number}\\.${number}\\.${number}(?:-${identifier}(?:\\.${identifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);
  if (typeof version !== 'string' || version !== version.trim() || !semver.test(version)) {
    throw new Error('version.json : version invalide. Exemples : 1.6.1, 1.6.1-2, 1.7.0-beta.1 (sans préfixe v).');
  }

  // Prepare every update before writing, so invalid or missing files fail early.
  const updates = new Map();
  function json(file, update) {
    const data = JSON.parse(read(file));
    update(data);
    updates.set(file, JSON.stringify(data, null, 2) + '\n');
  }
  function replace(file, pattern, replacement) {
    const source = read(file);
    if (!pattern.test(source)) throw new Error(`Version introuvable dans ${file}`);
    updates.set(file, source.replace(pattern, replacement));
  }
  json('package.json', data => {
    data.version = version;
    const channel = /(?:^|[.-])beta(?:[.-]|$)/i.test(version) ? 'beta'
      : /(?:^|[.-])alpha(?:[.-]|$)/i.test(version) ? 'alpha' : 'latest';
    for (const publisher of data.build.publish) {
      if (publisher.provider !== 'github') continue;
      publisher.releaseType = channel === 'latest' ? 'release' : 'prerelease';
      publisher.channel = channel;
    }
  });
  json('package-lock.json', data => {
    data.version = version;
    data.packages[''].version = version;
  });
  replace('src/index.html', /(id="app-version">)v[^<]+/, `$1v${version}`);
  replace('src-tauri/Cargo.toml', /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+/, `$1${version}`);
  replace('src-tauri/Cargo.lock', /(\[\[package\]\]\r?\nname = "yapapouaiye-launcher"\r?\nversion = ")[^"]+/, `$1${version}`);
  let changed = 0;
  for (const [file, content] of updates) {
    if (read(file) !== content) {
      fs.writeFileSync(path.join(root, file), content);
      changed++;
    }
  }
  return { version, changed };
}

if (require.main === module) {
  try {
    const { version, changed } = syncVersion();
    console.log(`Version ${version} synchronisée (${changed} fichier(s) modifié(s)).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { syncVersion };

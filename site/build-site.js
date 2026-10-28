import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = fileURLToPath(new URL('.', import.meta.url));
const stateDir = path.join(siteDir, '.wrangler');
const outputDir = path.join(stateDir, 'publish');
fs.mkdirSync(stateDir, { recursive: true });
// Only clean this build's output, inside the real site workspace.
if (!fs.realpathSync(stateDir).startsWith(fs.realpathSync(siteDir) + path.sep)) {
  throw new Error('Le dossier de publication doit rester dans le projet.');
}
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir);
const publicFiles = fs.readdirSync(siteDir).filter(name => /\.(html|css)$/.test(name));
publicFiles.push('app.js', 'admin.js', 'admin-servers.js', 'downloads.js', 'downloads.json', 'android-updates.json', 'news.json', '_headers');
for (const name of publicFiles) fs.copyFileSync(path.join(siteDir, name), path.join(outputDir, name));
fs.cpSync(path.join(siteDir, 'assets'), path.join(outputDir, 'assets'), { recursive: true });
console.log(`Site prêt à publier : ${publicFiles.length} fichiers publics et leurs assets.`);

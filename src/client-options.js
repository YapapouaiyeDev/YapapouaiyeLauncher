const fs = require('node:fs');
const path = require('node:path');

// Both companion clients can save their own file. The last valid save wins;
// fields absent from that file remain available from the other client.
function readClientOptions(configDir) {
  const saves = [];
  for (const name of ['lunar_client.json', 'yapapouaiye_client.json']) {
    try {
      const file = path.join(configDir, name);
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        saves.push({ data, modified: fs.statSync(file).mtimeMs });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn(`[ClientMods] Cannot read ${name}: ${error.message}`);
    }
  }
  saves.sort((a, b) => a.modified - b.modified);
  return Object.assign({}, ...saves.map(save => save.data));
}

module.exports = { readClientOptions };

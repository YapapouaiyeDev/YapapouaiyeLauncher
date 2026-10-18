const { GitHubProvider } = require('electron-updater/out/providers/GitHubProvider');
const { parseUpdateInfo } = require('electron-updater/out/providers/Provider');

const normalizeVersion = value => String(value || '').trim().replace(/^v/i, '');

// Resolve our historical build suffixes through the release API instead of
// treating the first suffix (e.g. "2-1-beta") as an updater channel name.
class LauncherUpdateProvider extends GitHubProvider {
  async getLatestVersion() {
    const releases = (await this.options.loadReleases()).filter(release => !release.draft);
    const requested = this.options.getRequestedVersion();
    const candidates = releases.filter(release => {
      const version = normalizeVersion(release.tag_name);
      if (!this.options.isValidVersion(version)) return false;
      if (requested) return version === requested;
      return this.updater.allowPrerelease || !(release.prerelease || this.options.isPrerelease(version));
    });
    const release = candidates.reduce((latest, item) => !latest || this.options.isNewer(
      normalizeVersion(item.tag_name), normalizeVersion(latest.tag_name)
    ) ? item : latest, null);
    if (!release) throw new Error(requested
      ? `La version ${requested} n'est plus disponible. Vérifiez à nouveau les mises à jour.`
      : 'Aucune version disponible pour ce canal.');

    const version = normalizeVersion(release.tag_name);
    const preferred = this.options.getChannel(version);
    const names = [this.getCustomChannelName(preferred), this.getDefaultChannelName()].map(name => `${name}.yml`);
    const asset = names.map(name => release.assets?.find(item => item.name === name)).find(Boolean);
    if (!asset) throw new Error(`La release ${version} est incomplète : publiez ${names.join(' ou ')} avec l'installateur.`);
    const url = new URL(this.getBaseDownloadPath(release.tag_name, asset.name), this.baseUrl);
    const info = parseUpdateInfo(await this.httpRequest(url), asset.name, url);
    if (normalizeVersion(info?.version) !== version) {
      throw new Error(`Le manifeste de ${version} annonce une autre version. Republiez le manifeste correspondant à l'installateur.`);
    }
    const files = info.files?.length ? info.files : [{ url: info.path }];
    const linux = this.runtimeOptions.platform === 'linux';
    const extension = linux ? /\.deb$/i : /\.exe$/i;
    if (!files.some(file => typeof file.url === 'string' && extension.test(file.url)
      && release.assets?.some(item => item.name === file.url))) {
      throw new Error(`Installateur ${linux ? 'Linux/ChromeOS' : 'Windows'} absent de la release ${version}. Publiez le fichier ${linux ? '.deb' : '.exe'} indiqué dans le manifeste.`);
    }
    return { ...info, tag: release.tag_name, releaseName: release.name || version, releaseNotes: release.body || '' };
  }
}

async function installRequestedUpdate(updater, version, setRequestedVersion) {
  if (!version) throw new Error('Choisissez une version à installer.');
  if (updater.checkForUpdatesPromise || updater.downloadPromise) {
    throw new Error('Une vérification ou un téléchargement est déjà en cours. Réessayez après sa fin.');
  }
  const previousAutoDownload = updater.autoDownload;
  setRequestedVersion(version);
  updater.autoDownload = false;
  try {
    const result = await updater.checkForUpdates();
    if (normalizeVersion(result?.updateInfo?.version) !== version || !result?.isUpdateAvailable) {
      throw new Error(`La version ${version} n'a pas pu être sélectionnée. Vérifiez les mises à jour puis réessayez.`);
    }
    await updater.downloadUpdate();
    return { success: true, version, requested: version };
  } finally {
    updater.autoDownload = previousAutoDownload;
    setRequestedVersion(null);
  }
}

module.exports = { LauncherUpdateProvider, installRequestedUpdate, normalizeVersion };

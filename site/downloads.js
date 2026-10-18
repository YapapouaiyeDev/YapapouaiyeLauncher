const releasesUrl = 'https://github.com/YapapouaiyeDev/YapapouaiyeLauncher/releases';
const names = { windows: 'Windows', chromeos: 'ChromeOS', linux: 'Linux', android: 'Android', macos: 'macOS', ios: 'iOS' };

export function detectSystem(navigatorInfo, hints = {}) {
  const ua = navigatorInfo.userAgent || '';
  const platform = hints.platform || navigatorInfo.userAgentData?.platform || '';
  let os = '';
  if (/CrOS/i.test(ua) || /chrome\s*os|chromium\s*os/i.test(platform)) os = 'chromeos';
  else if (/Android/i.test(ua) || /android/i.test(platform)) os = 'android';
  else if (/iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(ua) && navigatorInfo.maxTouchPoints > 1)) os = 'ios';
  else if (/Windows/i.test(ua) || /windows/i.test(platform)) os = 'windows';
  else if (/Macintosh|Mac OS X/i.test(ua) || /macOS/i.test(platform)) os = 'macos';
  else if (/Linux/i.test(ua) || /linux/i.test(platform)) os = 'linux';

  let arch = 'unknown';
  if (/arm|aarch/i.test(hints.architecture || '') || /\b(?:aarch64|arm\w*)\b/i.test(ua)) arch = 'arm';
  else if (/x86_64|amd64|Win64|WOW64/i.test(ua) || (hints.architecture === 'x86' && hints.bitness === '64')) arch = 'x64';
  else if (/i[3-6]86/i.test(ua) || hints.bitness === '32') arch = 'ia32';
  return { os, arch };
}

export function selectDownload(catalog, system) {
  const name = names[system.os] || 'ce système';
  if (['chromeos', 'linux'].includes(system.os) && system.arch !== 'x64') {
    return { url: releasesUrl, label: 'Voir toutes les versions', note: system.arch === 'arm'
      ? `${name} ARM : aucun paquet compatible. La version Linux nécessite Intel/AMD 64 bits.`
      : `${name} : vérifiez que votre appareil est Intel/AMD 64 bits, puis choisissez-le ci-dessous.` };
  }
  if (system.os === 'windows' && system.arch === 'ia32') {
    return { url: releasesUrl, label: 'Voir toutes les versions', note: 'Le launcher Windows nécessite un système 64 bits.' };
  }
  const item = catalog[system.os];
  const extension = { windows: '.exe', chromeos: '.deb', linux: '.deb', android: '.apk', macos: '.dmg' }[system.os];
  if (extension && item?.url?.startsWith(`${releasesUrl}/download/`) && item.url.endsWith(extension)) {
    return { url: item.url, label: `Télécharger pour ${name}`, note: `Version ${item.version}${item.prerelease ? ' · Bêta' : ''}${['chromeos', 'linux'].includes(system.os) ? ' · Intel/AMD 64 bits' : ''}` };
  }
  return { url: releasesUrl, label: 'Voir toutes les versions', note: system.os
    ? `Aucun téléchargement ${name} disponible pour le moment.`
    : 'Système non reconnu. Choisissez votre plateforme ci-dessous.' };
}

export async function initDownloads() {
  const button = document.getElementById('download-button');
  const label = document.getElementById('download-label');
  const note = document.getElementById('download-note');
  const selector = document.getElementById('download-platform');
  if (!button || !label || !note || !selector) return;
  let catalog = {};
  let system = detectSystem(navigator);
  let chosenManually = false;
  function render() {
    const selected = selectDownload(catalog, system);
    button.href = selected.url;
    label.textContent = selected.label;
    note.textContent = `${!chosenManually && names[system.os] ? `${names[system.os]} détecté. ` : ''}${selected.note}`;
    selector.value = system.os;
  }
  selector.addEventListener('change', () => {
    chosenManually = true;
    system = { os: selector.value, arch: 'x64' };
    render();
  });
  render();
  const hintsTask = (async () => {
    try {
      const hints = await navigator.userAgentData?.getHighEntropyValues(['platform', 'architecture', 'bitness']);
      if (hints && !chosenManually) { system = detectSystem(navigator, hints); render(); }
    } catch { /* Browser hints are optional; the user can choose manually. */ }
  })();
  try {
    const response = await fetch('/downloads.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Catalogue indisponible');
    catalog = await response.json();
    render();
    const chromeos = selectDownload(catalog, { os: 'chromeos', arch: 'x64' });
    const status = document.getElementById('chromeos-package-status');
    const link = document.getElementById('chromeos-download');
    if (status && link && chromeos.url !== releasesUrl) {
      status.textContent = `${chromeos.note}. Installation via Linux ; Minecraft reste à valider sur un Chromebook réel.`;
      link.href = chromeos.url;
      link.hidden = false;
    }
  } catch {
    note.textContent = 'Téléchargements temporairement indisponibles. Consultez les versions GitHub ou réessayez plus tard.';
  }
  await hintsTask;
}

if (typeof document !== 'undefined') initDownloads();

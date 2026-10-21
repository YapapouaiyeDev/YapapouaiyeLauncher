(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AccountAvatars = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const requests = new WeakMap();
  const heads = new Map();
  const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%231e293b'/%3E%3Cpath fill='%2364748b' d='M20 8a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm-10 22c0-4 4-7 10-7s10 3 10 7v2H10z'/%3E%3C/svg%3E";

  function skinForAccount(account) {
    const skins = account?.profile?.skins;
    const skin = Array.isArray(skins) && (skins.find(item => item?.state === 'ACTIVE') || skins.find(item => item && !item.state));
    if (!skin) return null;
    if (typeof skin.base64 === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(skin.base64) && skin.base64.length <= 524288) return skin.base64;
    try {
      const url = new URL(skin.url);
      if (['http:', 'https:'].includes(url.protocol) && url.hostname === 'textures.minecraft.net' && /^\/texture\/[a-f0-9]+$/i.test(url.pathname) && !url.username && !url.password && !url.port) {
        return `https://textures.minecraft.net${url.pathname}`;
      }
    } catch {}
    return null;
  }

  function candidates(name, uuid, size = 48) {
    const cleanUuid = typeof uuid === 'string' ? uuid.replace(/-/g, '').trim().toLowerCase() : '';
    const official = /^[a-f0-9]{32}$/.test(cleanUuid) && cleanUuid[12] !== '3';
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const query = official ? cleanUuid : /^[A-Za-z0-9_]{3,16}$/.test(cleanName) && !['Joueur', 'Non connecté'].includes(cleanName) ? cleanName : '';
    if (!query) return [];
    const pixels = Math.max(8, Math.min(256, Number(size) || 48));
    return [
      `https://mc-heads.net/avatar/${query}/${pixels}`,
      `https://minotar.net/helm/${query}/${pixels}`,
      `https://crafthead.net/helm/${query}/${pixels}`,
    ];
  }

  function headFromSkin(source) {
    if (heads.has(source)) return heads.get(source);
    const result = new Promise((resolve, reject) => {
      const skin = new Image();
      if (!source.startsWith('data:')) skin.crossOrigin = 'anonymous';
      skin.onerror = () => reject(new Error('Skin indisponible'));
      skin.onload = () => {
        try {
          const scale = skin.naturalWidth / 64;
          if (!Number.isInteger(scale) || scale < 1 || scale > 16 || ![32 * scale, 64 * scale].includes(skin.naturalHeight)) throw new Error('Dimensions de skin invalides');
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 64;
          const context = canvas.getContext('2d');
          context.imageSmoothingEnabled = false;
          context.drawImage(skin, 8 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, 64, 64);
          context.drawImage(skin, 40 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, 64, 64);
          resolve(canvas.toDataURL('image/png'));
        } catch (error) { reject(error); }
      };
      skin.src = source;
    });
    heads.set(source, result);
    if (heads.size > 32) heads.delete(heads.keys().next().value);
    result.catch(() => { if (heads.get(source) === result) heads.delete(source); });
    return result;
  }

  async function apply(image, account, size = 48) {
    if (!image) return;
    const request = {};
    requests.set(image, request);
    image.onerror = null;
    image.src = fallback;
    image.alt = account?.name ? `Avatar de ${account.name}` : 'Avatar du compte';
    if (typeof account?.skin === 'string') {
      try {
        const head = await headFromSkin(account.skin);
        if (requests.get(image) === request) image.src = head;
        return;
      } catch {}
    }
    if (requests.get(image) !== request) return;
    const sources = candidates(account?.name, account?.uuid, size);
    let index = 0;
    const next = () => {
      if (requests.get(image) !== request) return;
      if (index < sources.length) image.src = sources[index++];
      else { image.onerror = null; image.src = fallback; }
    };
    image.onerror = next;
    next();
  }

  return { skinForAccount, candidates, apply, fallback };
});

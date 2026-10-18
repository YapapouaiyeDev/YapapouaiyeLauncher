// Bundled CC0 recordings. Profile IDs stay compatible with saved themes.
(function (root) {
  const profiles = {
    click: ['minecraft_stone', 'minecraft_wood', 'cyber_beep', 'laser_click', 'magic_chime', 'anvil_heavy', 'bubble_pop', 'retro_8bit'],
    launch: ['minecraft_levelup', 'portal_warp', 'cyber_charge', 'forge_impact', 'dragon_roar'],
  };

  function createPlayer(AudioClass = root.Audio) {
    const cache = new Map();
    const active = new Map();
    let lastClick = -Infinity;

    function getAudio(source) {
      if (cache.has(source)) return cache.get(source);
      const audio = new AudioClass(source);
      audio.preload = 'auto';
      // Keep imported files from accumulating in memory while editing themes.
      if (cache.size >= 16) cache.delete(cache.keys().next().value);
      cache.set(source, audio);
      return audio;
    }

    function stop(channel) {
      const audio = active.get(channel)?.audio;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        active.delete(channel);
      }
    }

    async function play(kind, profile, customSource, preview = false) {
      const channel = preview ? 'preview' : kind;
      if (!profiles[kind]) return false;
      if (preview) {
        stop('click');
        stop('launch');
        stop('preview');
      } else if (kind === 'click') {
        const listening = active.get('preview')?.audio;
        if (listening && !listening.paused && !listening.ended) return false;
        const now = performance.now();
        if (now - lastClick < 60) return false;
        lastClick = now;
      } else {
        stop('click');
        stop('preview');
      }
      stop(channel);
      if (profile === 'none') return true;
      let source;
      if (profile === 'custom') {
        if (!customSource) return false;
        source = customSource;
      } else {
        const id = profiles[kind].includes(profile) ? profile : profiles[kind][0];
        source = `assets/sounds/${id}.ogg`;
      }
      const audio = getAudio(source);
      audio.volume = kind === 'click' ? 0.35 : 0.55;
      audio.currentTime = 0;
      const playback = { audio };
      active.set(channel, playback);
      try {
        await audio.play();
        return true;
      } catch (error) {
        if (active.get(channel) === playback) active.delete(channel);
        if (error.name !== 'AbortError') console.warn('[Audio] Lecture impossible :', error.message);
        return error.name === 'AbortError';
      }
    }

    // Small local files are preloaded so the first interaction is responsive.
    Object.values(profiles).flat().forEach(id => getAudio(`assets/sounds/${id}.ogg`));
    function validate(source) {
      return new Promise(resolve => {
        const audio = new AudioClass();
        const finish = valid => {
          clearTimeout(timer);
          audio.onloadedmetadata = audio.onerror = null;
          audio.removeAttribute('src');
          audio.load();
          resolve(valid);
        };
        const timer = setTimeout(() => finish(false), 8000);
        audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) && audio.duration > 0);
        audio.onerror = () => finish(false);
        audio.preload = 'metadata';
        audio.src = source;
      });
    }
    return { play, stop, validate };
  }

  const api = { createPlayer, profiles };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LauncherSounds = api;
})(globalThis);

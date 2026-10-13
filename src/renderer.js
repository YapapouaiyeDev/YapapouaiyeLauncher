const DEFAULT_GAME_VERSION = '1.21.1';
// Version Minecraft effective du serveur actif (mise à jour par applyServerUI)
let currentGameVersion = DEFAULT_GAME_VERSION;
let currentLoader = 'neoforge';
const SKIN_HEAD_URL = 'https://mc-heads.net/avatar/';
let currentServerIp = '158.178.200.70:25565';
let currentServerId = 'adoserv2';

let isCheckingForUpdates = false;
let systemRamGB = 16;
let ramMin = 2;
let ramMax = 16;

// RAM slider elements - declare early so initRamLimits can use them
const ramSlider = document.getElementById('input-ram');
const ramValue = document.getElementById('ram-value');
const settingsRam = document.getElementById('settings-ram');
const settingsRamValue = document.getElementById('settings-ram-value');

// ============================================================
// Theme Registry & Custom AI Theme Management System
// ============================================================
const AI_PROMPT_TEMPLATE = `Tu es un designer d'interface expert pour le launcher Minecraft Yapapouaiye.
Crée un thème personnalisé complet et immersif au format JSON STRICT valide (réponds UNIQUEMENT avec le bloc de code JSON, sans texte superflu).

Voici le schéma JSON supporté :

{
  "name": "Nom de ton Thème",
  "icon": "gem",
  "tag": "Style IA",
  "desc": "Description concise de l'ambiance visuelle du thème.",
  "author": "Créateur / IA",
  "styleMode": "cyber",
  "fontFamily": "Inter",
  "layout": "top",
  "colors": {
    "primary": "#38bdf8",
    "primaryHover": "#7dd3fc",
    "primaryDark": "#0284c7",
    "bgDark": "#0b1118",
    "accentRgb": "56, 189, 248",
    "panelBg": "rgba(18, 28, 40, 0.85)",
    "playGradientA": "#38bdf8",
    "playGradientB": "#0284c7",
    "playText": "#ffffff",
    "validateGradientA": "#38bdf8",
    "validateGradientB": "#0284c7",
    "validateText": "#ffffff",
    "heroCardA": "rgba(20, 32, 46, 0.95)",
    "heroCardB": "rgba(12, 20, 30, 0.85)"
  },
  "images": {
    "backgroundImage": "",
    "backgroundBlur": "8px",
    "backgroundBrightness": 0.45,
    "playButtonText": "JOUER",
    "playButtonIcon": "play"
  },
  "audio": {
    "soundProfile": "laser_click",
    "launchSoundProfile": "cyber_charge",
    "customClickSound": "",
    "customLaunchSound": ""
  }
}

Valeurs disponibles :
- styleMode : "cyber" (polygone néon), "forged" (armure 3D lourde), "rounded" (arrondi moderne), "glass" (verre givré), "classic" (Minecraft)
- layout : "top" (barre de boutons en haut), "right" (barre de boutons verticale à droite), "bottom" (barre de boutons en bas)
- fontFamily : "Inter", "Orbitron", "Rajdhani", "Cinzel", "Press Start 2P", "Montserrat", "Poppins"
- playButtonIcon : "play", "rocket", "swords", "pickaxe", "shield", "zap", "fire", "star", "eye", "diamond", "cube", "heart", "crown", "gamepad", "skull", "compass", "portal", "axe", "potion"
- soundProfile : "minecraft_stone", "minecraft_wood", "cyber_beep", "laser_click", "magic_chime", "anvil_heavy", "bubble_pop", "retro_8bit"
- launchSoundProfile : "minecraft_levelup", "portal_warp", "cyber_charge", "forge_impact"`;

const THEME_ICONS_SVG = {
  classic: `<svg class="theme-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 3h12l4 7-10 11L2 10l4-7z" fill="#38cc56" stroke="#1fa33a" stroke-width="1.5"/></svg>`,
  emerald: `<svg class="theme-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 3h12l4 7-10 11L2 10l4-7z" fill="#38cc56" stroke="#1fa33a" stroke-width="1.5"/></svg>`,
  gem: `<svg class="theme-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 3h12l4 7-10 11L2 10l4-7z" fill="var(--mc-green-primary)" stroke="currentColor" stroke-width="1.5"/></svg>`,
  custom: `<svg class="theme-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14"/></svg>`,
  sidebar: `<svg class="theme-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="15" y1="4" x2="15" y2="20"/><line x1="17.5" y1="9" x2="17.5" y2="9.01"/><line x1="17.5" y1="12" x2="17.5" y2="12.01"/><line x1="17.5" y1="15" x2="17.5" y2="15.01"/></svg>`,
  dock: `<svg class="theme-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="16" x2="21" y2="16"/><circle cx="9" cy="18.5" r="0.6" fill="currentColor"/><circle cx="12" cy="18.5" r="0.6" fill="currentColor"/><circle cx="15" cy="18.5" r="0.6" fill="currentColor"/></svg>`
};

function getThemeFaviconSvg(theme) {
  if (!theme) return THEME_ICONS_SVG.classic;
  if (THEME_ICONS_SVG[theme.id]) return THEME_ICONS_SVG[theme.id];
  if (theme.icon && THEME_ICONS_SVG[theme.icon]) return THEME_ICONS_SVG[theme.icon];
  if (theme.icon && typeof theme.icon === 'string' && theme.icon.trim()) {
    const trimmed = theme.icon.trim();
    const iconKey = trimmed.toLowerCase();
    const aliases = { sword: 'swords', crystal: 'diamond' };
    const resolvedKey = aliases[iconKey] || iconKey;
    if (BUTTON_ICONS_SVG[resolvedKey]) {
      return BUTTON_ICONS_SVG[resolvedKey].replace('<svg ', '<svg class="theme-icon-svg" aria-hidden="true" ');
    }
    if (iconKey === 'brick' || iconKey === 'pulse') {
      const shape = iconKey === 'brick'
        ? '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 12h18M12 4v8M8 12v8M16 12v8"/>'
        : '<path d="M2 12h5l3-8 4 16 3-8h5"/>';
      return `<svg class="theme-icon-svg" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${shape}</svg>`;
    }
    if (trimmed.startsWith('<svg')) return trimmed;
    return `<span class="theme-custom-favicon-emoji" style="font-size: 14px; line-height: 1; display: inline-flex; align-items: center; justify-content: center;">${escapeHtml(trimmed)}</span>`;
  }
  return THEME_ICONS_SVG.classic;
}

const THEME_REGISTRY = [
  {
    id: 'classic',
    name: 'Classic',
    tag: 'Défaut',
    icon: 'classic',
    desc: 'L\'esprit Minecraft original : boutons biseautés verts et accents soignés.',
    colors: ['#38cc56', '#1fa33a', '#0d1810'],
    audio: { soundProfile: 'minecraft_stone', launchSoundProfile: 'minecraft_levelup' }
  },
  {
    id: 'sidebar',
    name: 'Sidebar',
    tag: 'Barre à droite',
    icon: 'sidebar',
    desc: 'Barre de boutons verticale sur le côté droit, accents indigo électriques.',
    colors: ['#818cf8', '#4f46e5', '#0d1023'],
    styleMode: 'rounded',
    layout: 'right',
    audio: { soundProfile: 'cyber_beep', launchSoundProfile: 'cyber_charge' }
  },
  {
    id: 'dock',
    name: 'Dock',
    tag: 'Barre en bas',
    icon: 'dock',
    desc: 'Barre de boutons en dock sous le contenu, accents orange braise.',
    colors: ['#fb923c', '#c2410c', '#170e06'],
    styleMode: 'rounded',
    layout: 'bottom',
    audio: { soundProfile: 'minecraft_wood', launchSoundProfile: 'forge_impact' }
  }
];

const DEFAULT_THEME = 'classic';
let customThemes = [];
// Surcharge des thèmes par défaut (id builtin -> objet thème complet).
// Permet de "Modifier" Classic / Sidebar / Dock sans perdre l'original
// (reset = suppression de l'entrée). Persisté dans config.themeOverrides.
let themeOverrides = {};

function isBuiltinThemeId(id) {
  return THEME_REGISTRY.some(t => t.id === id);
}

function isCustomThemeId(id) {
  return typeof id === 'string' && id.startsWith('custom-');
}

// Construit un objet thème COMPLET (éditable) à partir d'un builtin minimal.
// Utilisé par l'éditeur visuel pour pré-remplir tous les champs.
function expandBuiltinToFullTheme(builtin) {
  if (!builtin) return null;
  const arr = Array.isArray(builtin.colors) ? builtin.colors : [];
  const primary = (builtin.colors && builtin.colors.primary) || arr[0] || '#38cc56';
  const secondary = (builtin.colors && (builtin.colors.primaryDark || builtin.colors.secondary)) || arr[1] || primary;
  const bg = (builtin.colors && builtin.colors.bgDark) || arr[2] || '#0d1810';
  const pRgb = hexToRgb(primary);
  const sRgb = hexToRgb(secondary);
  const bgRgb = hexToRgb(bg);
  const isPLight = isLightColor(primary);
  const isBgLight = isLightColor(bg);
  const styleMode = builtin.styleMode || 'classic';
  const layout = normalizeNavLayout(builtin.layout);
  return {
    id: builtin.id,
    name: builtin.name,
    icon: builtin.icon || 'gem',
    tag: builtin.tag || 'Défaut',
    desc: builtin.desc || '',
    author: 'Défaut',
    styleMode,
    layout,
    fontFamily: builtin.fontFamily || 'Inter',
    builtin: true,
    colors: {
      primary,
      primaryHover: primary,
      primaryDark: secondary,
      bevelTop: isPLight ? '#000000' : '#ffffff',
      bevelBottom: '#000000',
      accentRgb: pRgb,
      accentRgb2: sRgb,
      bgDark: bg,
      bgDarkRgb: bgRgb,
      panelBg: isBgLight ? `rgba(${bgRgb}, 0.92)` : `rgba(${bgRgb}, 0.85)`,
      playGradientA: primary,
      playGradientB: secondary,
      playGradientHoverA: primary,
      playGradientHoverB: secondary,
      playText: isPLight ? '#090d14' : '#ffffff',
      validateGradientA: primary,
      validateGradientB: secondary,
      validateBorder: primary,
      validateText: isPLight ? '#090d14' : '#ffffff',
      heroCardA: isBgLight ? `rgba(${bgRgb}, 0.96)` : `rgba(${bgRgb}, 0.95)`,
      heroCardB: isBgLight ? `rgba(${bgRgb}, 0.88)` : `rgba(${bgRgb}, 0.85)`
    },
    images: {
      backgroundImage: builtin.images?.backgroundImage || '',
      backgroundBlur: builtin.images?.backgroundBlur || '8px',
      backgroundBrightness: builtin.images?.backgroundBrightness !== undefined ? builtin.images.backgroundBrightness : 0.45,
      playButtonText: builtin.images?.playButtonText || 'JOUER',
      playButtonIcon: builtin.images?.playButtonIcon || 'play'
    },
    audio: {
      soundProfile: builtin.audio?.soundProfile || 'minecraft_stone',
      launchSoundProfile: builtin.audio?.launchSoundProfile || 'minecraft_levelup',
      customClickSound: builtin.audio?.customClickSound || '',
      customLaunchSound: builtin.audio?.customLaunchSound || ''
    }
  };
}

function getBuiltinBase(id) {
  return THEME_REGISTRY.find(t => t.id === id) || null;
}

function getEffectiveBuiltin(id) {
  const base = getBuiltinBase(id);
  if (!base) return null;
  if (themeOverrides[id]) return themeOverrides[id];
  return base;
}

let currentClickSoundProfile = 'minecraft_stone';
let currentCustomClickAudio = '';
let currentLaunchSoundProfile = 'minecraft_levelup';
let currentCustomLaunchAudio = '';

function getAllThemes() {
  const builtins = THEME_REGISTRY.map(t => themeOverrides[t.id] || t);
  return [...builtins, ...customThemes];
}

function getThemeObj(themeId) {
  const id = themeId === 'emerald' ? 'classic' : themeId;
  return getAllThemes().find(t => t.id === id) || getEffectiveBuiltin(DEFAULT_THEME) || THEME_REGISTRY[0];
}

// Disposition de la barre de boutons : "top" (défaut), "right" ou "bottom".
// Toute valeur inconnue retombe sur "top".
function normalizeNavLayout(layout) {
  return (layout === 'right' || layout === 'bottom') ? layout : 'top';
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return '56, 189, 248';
  let clean = hex.replace('#', '');
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  const num = parseInt(clean, 16);
  if (isNaN(num)) return '56, 189, 248';
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

function getLuminance(hex) {
  if (!hex || typeof hex !== 'string') return 0;
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  if (clean.length !== 6) return 0;
  const num = parseInt(clean, 16);
  if (isNaN(num)) return 0;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isLightColor(hex) {
  return getLuminance(hex) > 160;
}

function getContrastingTextColor(bgHex, lightText = '#ffffff', darkText = '#090d14') {
  return isLightColor(bgHex) ? darkText : lightText;
}


function applyGoogleFont(fontName) {
  const cleanName = (fontName || 'Inter').trim().replace(/['"]/g, '');
  if (!cleanName || cleanName === 'Inter' || cleanName === 'sans-serif') {
    document.body.style.fontFamily = '';
    return;
  }
  const linkId = 'theme-google-font';
  let link = document.getElementById(linkId);
  if (!link) {
    link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  const fontParam = encodeURIComponent(cleanName).replace(/%20/g, '+');
  link.href = `https://fonts.googleapis.com/css2?family=${fontParam}:wght@400;600;700;800;900&display=swap`;
  document.body.style.fontFamily = `'${cleanName}', 'Inter', system-ui, sans-serif`;
}

const BUTTON_ICONS_SVG = {
  play: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  rocket: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path></svg>`,
  swords: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l2 2 4-4-2-2M19 13l2 2-4 4-2-2" stroke-linecap="round"/></svg>`,
  pickaxe: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4.5l5 5M4 20l9.5-9.5M20 2c-1.5 0-3.5 1-4.5 2L13 6.5l4.5 4.5L20 8.5C21 7.5 22 5.5 22 4c0-1-1-2-2-2z" stroke-linecap="round"/></svg>`,
  shield: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  zap: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  fire: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"/></svg>`,
  star: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  eye: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/></svg>`,
  diamond: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6 3 18 3 22 9 12 22 2 9 6 3"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="12" y1="22" x2="6" y2="3"/><line x1="12" y1="22" x2="18" y2="3"/></svg>`,
  cube: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  heart: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  crown: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5v-2z"/></svg>`,
  gamepad: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="6"/><path d="M6 12h4m-2-2v4"/><circle cx="15" cy="11" r="1" fill="currentColor"/><circle cx="17" cy="13" r="1" fill="currentColor"/></svg>`,
  skull: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="8"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/><circle cx="15" cy="9" r="1.5" fill="currentColor"/><path d="M8 18h8v2H8z"/><line x1="10" y1="18" x2="10" y2="20"/><line x1="14" y1="18" x2="14" y2="20"/></svg>`,
  compass: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
  portal: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="9" ry="5" transform="rotate(-30 12 12)"/><ellipse cx="12" cy="12" rx="6" ry="3" transform="rotate(-30 12 12)"/><ellipse cx="12" cy="12" rx="3" ry="1.5" transform="rotate(-30 12 12)"/></svg>`,
  axe: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2c2 2 2 6-1 9L4 20l-2-2 9-9c3-3 7-3 9-1zM15 7l2 2"/></svg>`,
  potion: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2v3a2 2 0 0 1-.5 1.4L4.5 13a6 6 0 1 0 15 0l-5-6.6A2 2 0 0 1 14 5V2"/><line x1="8" y1="2" x2="16" y2="2"/><path d="M7 14h10"/></svg>`
};

function getButtonIconSvg(iconKey) {
  if (!iconKey) return BUTTON_ICONS_SVG.play;
  if (BUTTON_ICONS_SVG[iconKey]) return BUTTON_ICONS_SVG[iconKey];
  if (typeof iconKey === 'string' && iconKey.trim()) {
    const trimmed = iconKey.trim();
    if (trimmed.startsWith('<svg')) return trimmed;
    return `<span class="custom-btn-emoji-symbol" style="font-size: 15px; line-height: 1; display: inline-flex; align-items: center; justify-content: center;">${escapeHtml(trimmed)}</span>`;
  }
  return BUTTON_ICONS_SVG.play;
}

function applyThemeMediaAndCustomization(theme) {
  if (!theme) return;

  // 1. Google Font
  applyGoogleFont(theme.fontFamily);

  // 2. Wallpaper & background styles
  const bgImg = theme.images?.backgroundImage;
  if (bgImg && bgImg.trim()) {
    document.documentElement.style.setProperty('--theme-bg-image', `url("${bgImg.trim()}")`);
  } else {
    document.documentElement.style.removeProperty('--theme-bg-image');
  }

  const bgBlur = theme.images?.backgroundBlur || '8px';
  document.documentElement.style.setProperty('--theme-bg-blur', bgBlur);

  const bgBrightness = theme.images?.backgroundBrightness || 0.45;
  document.documentElement.style.setProperty('--theme-bg-brightness', bgBrightness);

  // 3. Play Button custom text & icon
  const btnPlayText = document.querySelector('#btn-play .play-text');
  const btnPlayIcon = document.querySelector('#btn-play .play-icon-mc');
  if (btnPlayText) {
    btnPlayText.textContent = theme.images?.playButtonText || 'JOUER';
  }
  if (btnPlayIcon) {
    btnPlayIcon.innerHTML = getButtonIconSvg(theme.images?.playButtonIcon || 'play');
  }

  // 4. Audio profiles
  currentClickSoundProfile = theme.audio?.soundProfile || (theme.id === 'cyber' ? 'laser_click' : theme.id === 'netherite' ? 'anvil_heavy' : theme.id === 'amethyst' ? 'magic_chime' : theme.id === 'sculk' ? 'bubble_pop' : 'minecraft_stone');
  currentCustomClickAudio = theme.audio?.customClickSound || '';
  currentLaunchSoundProfile = theme.audio?.launchSoundProfile || (theme.id === 'cyber' ? 'cyber_charge' : theme.id === 'netherite' ? 'forge_impact' : theme.id === 'ender' ? 'portal_warp' : 'minecraft_levelup');
  currentCustomLaunchAudio = theme.audio?.customLaunchSound || '';
}

function generateThemeCss(theme) {
  if (!theme || !theme.id) return '';
  const c = theme.colors || {};
  const id = theme.id;
  const primary = c.primary || '#38bdf8';
  const primaryHover = c.primaryHover || primary;
  const primaryDark = c.primaryDark || primary;
  const isPrimaryLight = isLightColor(primary);
  const bevelTop = c.bevelTop || (isPrimaryLight ? '#000000' : '#ffffff');
  const bevelBottom = c.bevelBottom || '#000000';
  const accentRgb = c.accentRgb || hexToRgb(primary);
  const accentRgb2 = c.accentRgb2 || accentRgb;
  const bgDark = c.bgDark || '#090d14';
  const bgDarkRgb = c.bgDarkRgb || hexToRgb(bgDark);
  const isBgLight = isLightColor(bgDark);
  const panelBg = c.panelBg || (isBgLight ? `rgba(${bgDarkRgb}, 0.92)` : `rgba(${bgDarkRgb}, 0.85)`);
  const playA = c.playGradientA || primary;
  const playB = c.playGradientB || primaryDark;
  const playHoverA = c.playGradientHoverA || primaryHover;
  const playHoverB = c.playGradientHoverB || primaryDark;
  const isPlayLight = isLightColor(playA);
  const btnPrimaryText = isPrimaryLight ? '#090d14' : '#ffffff';
  const playText = c.playText || (isPlayLight ? '#090d14' : '#ffffff');
  const valA = c.validateGradientA || primary;
  const valB = c.validateGradientB || primaryDark;
  const isValLight = isLightColor(valA);
  const valBorder = c.validateBorder || bevelTop;
  const valText = c.validateText || (isValLight ? '#090d14' : '#ffffff');
  const heroA = c.heroCardA || (isBgLight ? `rgba(${bgDarkRgb}, 0.96)` : `rgba(${bgDarkRgb}, 0.95)`);
  const heroB = c.heroCardB || (isBgLight ? `rgba(${bgDarkRgb}, 0.88)` : `rgba(${bgDarkRgb}, 0.85)`);
  const textMain = isBgLight ? '#090d14' : '#f1f5f9';
  const textMuted = isBgLight ? '#475569' : '#94a3b8';
  const panelBorder = isBgLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.08)';

  let css = `
/* --- CUSTOM THEME: ${escapeHtml(theme.name || id)} --- */
body[data-theme="${id}"] {
  --mc-green-primary: ${primary};
  --mc-green-hover: ${primaryHover};
  --mc-green-dark: ${primaryDark};
  --mc-green-bevel-top: ${bevelTop};
  --mc-green-bevel-bottom: ${bevelBottom};
  --accent-rgb: ${accentRgb};
  --accent-rgb-2: ${accentRgb2};
  --mc-obsidian: ${bgDark};
  --mc-stone: ${isBgLight ? `rgba(0, 0, 0, 0.08)` : `rgba(${accentRgb}, 0.15)`};
  --bg-dark: ${bgDark};
  --bg-dark-rgb: ${bgDarkRgb};
  --panel-bg: ${panelBg};
  --panel-border: ${panelBorder};
  --text-main: ${textMain};
  --text-muted: ${textMuted};
  --play-gradient-a: ${playA};
  --play-gradient-b: ${playB};
  --play-gradient-hover-a: ${playHoverA};
  --play-gradient-hover-b: ${playHoverB};
  --btn-primary-text: ${btnPrimaryText};
  --play-btn-text: ${playText};
  --validate-gradient-a: ${valA};
  --validate-gradient-b: ${valB};
  --validate-border: ${valBorder};
  --validate-text: ${valText};
  --hero-card-a: ${heroA};
  --hero-card-b: ${heroB};
  ${isBgLight ? `color: ${textMain};` : ''}
}
body[data-theme="${id}"] .btn-mc-primary,
body[data-theme="${id}"] .btn-primary {
  color: ${btnPrimaryText};
}
body[data-theme="${id}"] .footer-validate-btn {
  color: ${valText};
}
body[data-theme="${id}"] .btn-mc-play-huge {
  color: ${playText};
}

${isBgLight ? `
body[data-theme="${id}"] .mc-card,
body[data-theme="${id}"] .mc-box,
body[data-theme="${id}"] .modal-dialog,
body[data-theme="${id}"] .custom-modal-dialog,
body[data-theme="${id}"] .news-card,
body[data-theme="${id}"] .server-card,
body[data-theme="${id}"] .account-card,
body[data-theme="${id}"] .settings-group,
body[data-theme="${id}"] .theme-card,
body[data-theme="${id}"] .theme-card-name,
body[data-theme="${id}"] .news-card-title,
body[data-theme="${id}"] .server-name {
  color: ${textMain};
}
body[data-theme="${id}"] .mc-select,
body[data-theme="${id}"] .mc-input-text,
body[data-theme="${id}"] .input-field {
  color: ${textMain};
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.18);
}
body[data-theme="${id}"] .btn-secondary,
body[data-theme="${id}"] .btn-mc-action,
body[data-theme="${id}"] .btn-switch,
body[data-theme="${id}"] .win-btn,
body[data-theme="${id}"] .nav-item {
  color: ${textMain};
  border-color: rgba(0, 0, 0, 0.15);
}
body[data-theme="${id}"] .btn-mc-play-huge {
  color: ${playText};
  text-shadow: ${isPlayLight ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.4)'};
}
` : ''}
`;

  if (theme.styleMode === 'cyber') {
    css += `
body[data-theme="${id}"] .btn-mc-play-huge {

  clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
  border-radius: 0;
  background: linear-gradient(135deg, ${playA} 0%, ${playB} 100%);
  border: 1px solid ${valBorder};
  border-bottom: 3px solid ${primary};
  color: ${valText};
  letter-spacing: 3px;
  text-transform: uppercase;
  box-shadow: 0 0 20px rgba(${accentRgb}, 0.45);
}
body[data-theme="${id}"] .btn-mc-play-huge:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 0 35px rgba(${accentRgb}, 0.75);
}
body[data-theme="${id}"] .btn-secondary,
body[data-theme="${id}"] .btn-mc-action,
body[data-theme="${id}"] .btn-switch,
body[data-theme="${id}"] .win-btn,
body[data-theme="${id}"] .nav-item {
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  border-radius: 0;
  border: 1px solid rgba(${accentRgb}, 0.35);
}
body[data-theme="${id}"] .nav-item.active {
  border-left: 3px solid ${primary};
  background: linear-gradient(90deg, rgba(${accentRgb}, 0.25) 0%, rgba(16, 22, 32, 0.6) 100%);
}
`;
  } else if (theme.styleMode === 'forged') {
    css += `
body[data-theme="${id}"] .btn-mc-play-huge {
  border-radius: 8px;
  background: linear-gradient(180deg, #3d394b 0%, #23212d 40%, #15141c 100%);
  border: 2px solid ${primary};
  border-top: 2px solid ${bevelTop};
  border-bottom: 6px solid ${bevelBottom};
  color: ${bevelTop};
  box-shadow: 0 6px 0 #0d0c11, 0 10px 25px rgba(${accentRgb}, 0.35);
}
body[data-theme="${id}"] .btn-mc-play-huge:hover {
  background: linear-gradient(180deg, #4b465c 0%, #2c2a39 40%, #1c1b25 100%);
  transform: translateY(-2px);
}
body[data-theme="${id}"] .btn-mc-play-huge:active {
  transform: translateY(4px);
  border-bottom-width: 2px;
}
body[data-theme="${id}"] .btn-secondary,
body[data-theme="${id}"] .btn-mc-action,
body[data-theme="${id}"] .nav-item {
  border-radius: 6px;
  border-bottom: 3px solid #14131a;
}
`;
  } else if (theme.styleMode === 'rounded') {
    css += `
body[data-theme="${id}"] .btn-mc-play-huge {
  border-radius: 24px;
  background: linear-gradient(135deg, ${playA} 0%, ${playB} 100%);
  border: 2px solid ${bevelTop};
  box-shadow: 0 8px 24px rgba(${accentRgb}, 0.4);
}
body[data-theme="${id}"] .btn-secondary,
body[data-theme="${id}"] .btn-mc-action,
body[data-theme="${id}"] .nav-item,
body[data-theme="${id}"] .mc-box,
body[data-theme="${id}"] .server-badge {
  border-radius: 12px;
}
`;
  } else if (theme.styleMode === 'glass') {
    css += `
body[data-theme="${id}"] .btn-mc-play-huge {
  border-radius: 12px;
  background: rgba(${accentRgb}, 0.35);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 0 15px rgba(255, 255, 255, 0.2);
}
body[data-theme="${id}"] .btn-secondary,
body[data-theme="${id}"] .btn-mc-action,
body[data-theme="${id}"] .nav-item,
body[data-theme="${id}"] .mc-box {
  backdrop-filter: blur(12px);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
`;
  }

  if (theme.customCss && typeof theme.customCss === 'string') {
    css += `\n${theme.customCss}\n`;
  }

  return css;
}

function updateDynamicThemeStyles() {
  let styleEl = document.getElementById('dynamic-custom-themes-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-custom-themes-style';
    document.head.appendChild(styleEl);
  }
  // Customs + overrides des thèmes par défaut (ces derniers doivent passer
  // APRÈS le CSS statique pour écraser Classic / Sidebar / Dock).
  const overrideList = Object.values(themeOverrides || {});
  styleEl.textContent = [...overrideList, ...customThemes].map(t => generateThemeCss(t)).join('\n\n');
}

function persistThemes() {
  try { window.launcher.saveConfig({ customThemes, themeOverrides }); } catch {}
}

function applyTheme(theme, notify = false) {
  const all = getAllThemes();
  const requested = (theme === 'emerald' ? 'classic' : theme) || DEFAULT_THEME;
  const found = all.find(t => t.id === requested);
  const t = found ? requested : DEFAULT_THEME;
  document.body.dataset.theme = t;

  updateDynamicThemeStyles();

  const currentThemeObj = getThemeObj(t);

  // Disposition de la barre de boutons (haut / droite / bas)
  document.body.dataset.navLayout = normalizeNavLayout(currentThemeObj.layout);

  // Apply fonts, background image/blur, play button icon/text & audio
  applyThemeMediaAndCustomization(currentThemeObj);

  // Sync settings dropdown options & value
  syncSettingsThemeDropdown(t);

  // Sync settings badge pill with SVG favicon
  const pillEl = document.getElementById('current-theme-pill');
  if (pillEl) {
    pillEl.innerHTML = `${getThemeFaviconSvg(currentThemeObj)} <span>${escapeHtml(currentThemeObj.name)}</span>`;
  }

  // Sync topbar quick theme button tooltip & dynamic icon
  const btnQuickThemeEl = document.getElementById('btn-quick-theme');
  if (btnQuickThemeEl) {
    btnQuickThemeEl.title = `Thème : ${currentThemeObj.name} (Cliquer pour changer)`;
    btnQuickThemeEl.innerHTML = getThemeFaviconSvg(currentThemeObj);
  }

  // Sync visual cards active state
  document.querySelectorAll('.theme-card').forEach(card => {
    if (card.dataset.theme === t) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  if (notify) {
    showToast(`Thème activé : ${currentThemeObj.name}`, 'info', 2000);
  }

  return t;
}

function syncSettingsThemeDropdown(activeId) {
  const themeSelect = document.getElementById('settings-theme');
  if (!themeSelect) return;

  const all = getAllThemes();
  themeSelect.innerHTML = all.map(t => {
    const suffix = isCustomThemeId(t.id) ? ' (Personnalisé)' : (themeOverrides[t.id] ? ' (Modifié)' : '');
    return `
    <option value="${escapeHtml(t.id)}" ${t.id === activeId ? 'selected' : ''}>
      ${escapeHtml(t.name)}${suffix}
    </option>
  `;}).join('');
}

function sanitizeAndParseJson(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') throw new Error('Texte vide ou non valide');
  let clean = rawInput.trim();

  // 1. Strip markdown code fences if present
  if (clean.includes('```')) {
    const match = clean.match(/```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
      clean = match[1].trim();
    }
  }

  // 2. Locate outermost JSON object boundaries { ... }
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }

  // 3. Remove single-line JS comments (e.g. // ...), preserving http:// or https://
  clean = clean.replace(/(?<!https?:)\/\/.*$/gm, '');

  // 4. Remove multi-line JS comments /* ... */
  clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');

  // 5. Remove trailing commas before closing braces or brackets
  clean = clean.replace(/,\s*([}\]])/g, '$1');

  // 6. First attempt: standard JSON.parse
  try {
    return JSON.parse(clean);
  } catch (err1) {
    // 7. Second attempt: relaxed quote fixing
    try {
      const quoteFixed = clean
        .replace(/'/g, '"')
        .replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(quoteFixed);
    } catch (err2) {
      // 8. Third attempt: safe Function evaluation for JS object literals
      try {
        const fn = new Function(`"use strict"; return (${clean});`);
        const res = fn();
        if (res && typeof res === 'object') return res;
      } catch (err3) {
        throw new Error('Format JSON invalide. Assurez-vous d\'avoir copié le code JSON complet.');
      }
    }
  }
  throw new Error('Impossible d\'analyser le format JSON.');
}

function parseThemeJson(rawInput) {
  const parsed = sanitizeAndParseJson(rawInput);
  if (!parsed || typeof parsed !== 'object') throw new Error('Structure JSON invalide');

  const name = (parsed.name || parsed.themeName || 'Thème IA Personnalisé').trim();
  const slug = (parsed.id || name).toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 20);
  const id = parsed.id && parsed.id.startsWith('custom-') ? parsed.id : `custom-${slug}-${Date.now().toString(36)}`;
  
  // Extract or normalize colors object
  let c = parsed.colors;
  if (!c || typeof c !== 'object' || Array.isArray(c)) {
    c = {
      primary: parsed.primary || parsed.primaryColor || (Array.isArray(c) ? c[0] : '#38bdf8'),
      primaryHover: parsed.primaryHover || (Array.isArray(c) ? c[1] : '#7dd3fc'),
      primaryDark: parsed.primaryDark || (Array.isArray(c) ? c[2] : '#0284c7'),
      bgDark: parsed.bgDark || parsed.background || (Array.isArray(c) ? c[2] : '#0b1118')
    };
  }

  const primary = c.primary || parsed.primary || '#38bdf8';
  const primaryHover = c.primaryHover || primary;
  const primaryDark = c.primaryDark || primary;
  const bgDark = c.bgDark || parsed.bgDark || '#0b1118';
  const bgDarkRgb = c.bgDarkRgb || hexToRgb(bgDark);
  const accentRgb = c.accentRgb || hexToRgb(primary);
  const accentRgb2 = c.accentRgb2 || accentRgb;
  const isPrimaryLight = isLightColor(primary);
  const isBgLight = isLightColor(bgDark);

  const playA = c.playGradientA || primary;
  const playB = c.playGradientB || primaryDark;
  const isPlayLight = isLightColor(playA);

  const valA = c.validateGradientA || primary;
  const valB = c.validateGradientB || primaryDark;
  const isValLight = isLightColor(valA);

  const colors = {
    primary,
    primaryHover,
    primaryDark,
    bevelTop: c.bevelTop || (isPrimaryLight ? '#000000' : '#ffffff'),
    bevelBottom: c.bevelBottom || '#000000',
    accentRgb,
    accentRgb2,
    bgDark,
    bgDarkRgb,
    panelBg: c.panelBg || (isBgLight ? `rgba(${bgDarkRgb}, 0.92)` : `rgba(${bgDarkRgb}, 0.85)`),
    playGradientA: playA,
    playGradientB: playB,
    playGradientHoverA: c.playGradientHoverA || primaryHover,
    playGradientHoverB: c.playGradientHoverB || primaryDark,
    playText: c.playText || (isPlayLight ? '#090d14' : '#ffffff'),
    validateGradientA: valA,
    validateGradientB: valB,
    validateBorder: c.validateBorder || (isPrimaryLight ? '#000000' : primary),
    validateText: c.validateText || (isValLight ? '#090d14' : '#ffffff'),
    heroCardA: c.heroCardA || (isBgLight ? `rgba(${bgDarkRgb}, 0.96)` : `rgba(${bgDarkRgb}, 0.95)`),
    heroCardB: c.heroCardB || (isBgLight ? `rgba(${bgDarkRgb}, 0.88)` : `rgba(${bgDarkRgb}, 0.85)`)
  };

  const images = parsed.images || {};
  const audio = parsed.audio || {};

  return {
    id,
    name,
    icon: parsed.icon || 'custom',
    tag: parsed.tag || 'IA',
    desc: parsed.desc || 'Thème personnalisé complet.',
    author: parsed.author || 'Moi / IA',
    styleMode: parsed.styleMode || 'cyber',
    fontFamily: parsed.fontFamily || 'Inter',
    layout: normalizeNavLayout(parsed.layout),
    colors,
    images: {
      backgroundImage: images.backgroundImage || parsed.backgroundImage || '',
      backgroundBlur: images.backgroundBlur || parsed.backgroundBlur || '8px',
      backgroundBrightness: images.backgroundBrightness !== undefined ? images.backgroundBrightness : (parsed.backgroundBrightness !== undefined ? parsed.backgroundBrightness : 0.45),
      playButtonText: images.playButtonText || parsed.playButtonText || 'JOUER',
      playButtonIcon: images.playButtonIcon || parsed.playButtonIcon || 'play'
    },
    audio: {
      soundProfile: audio.soundProfile || parsed.soundProfile || 'laser_click',
      launchSoundProfile: audio.launchSoundProfile || parsed.launchSoundProfile || 'cyber_charge',
      customClickSound: audio.customClickSound || parsed.customClickSound || '',
      customLaunchSound: audio.customLaunchSound || parsed.customLaunchSound || ''
    }
  };
}

let currentEditingThemeId = null;
let currentEditingBuiltinId = null;
let setVisualEditorCustomAudio = null;
let updateVisualEditorPreviewFn = null;

function getEditingContext() {
  if (currentEditingThemeId && customThemes.some(t => t.id === currentEditingThemeId)) {
    return { kind: 'custom', id: currentEditingThemeId };
  }
  if (currentEditingBuiltinId && isBuiltinThemeId(currentEditingBuiltinId)) {
    return { kind: 'builtin', id: currentEditingBuiltinId };
  }
  return { kind: 'new', id: null };
}

function clearEditingContext() {
  currentEditingThemeId = null;
  currentEditingBuiltinId = null;
}

function refreshEditorSaveUI() {
  const ctx = getEditingContext();
  const labelSave = document.getElementById('label-save-editor-theme');
  const btnSaveAsNew = document.getElementById('btn-editor-save-as-new');
  const notice = document.getElementById('editor-builtin-notice');
  const noticeName = document.getElementById('editor-builtin-notice-name');
  if (ctx.kind === 'custom') {
    const t = customThemes.find(x => x.id === ctx.id);
    if (labelSave) labelSave.textContent = t ? `Mettre à jour « ${t.name} »` : 'Mettre à jour ce thème';
    if (btnSaveAsNew) btnSaveAsNew.classList.remove('hidden');
    if (notice) notice.classList.add('hidden');
  } else if (ctx.kind === 'builtin') {
    const t = getEffectiveBuiltin(ctx.id);
    if (labelSave) labelSave.textContent = t ? `Mettre à jour « ${t.name} » (défaut)` : 'Mettre à jour le thème par défaut';
    if (btnSaveAsNew) btnSaveAsNew.classList.remove('hidden');
    if (notice) notice.classList.remove('hidden');
    if (noticeName && t) noticeName.textContent = t.name;
  } else {
    if (labelSave) labelSave.textContent = 'Créer & Activer le thème';
    if (btnSaveAsNew) btnSaveAsNew.classList.add('hidden');
    if (notice) notice.classList.add('hidden');
  }
}

function populateExistingThemesDropdown() {
  const selectEl = document.getElementById('editor-select-existing-theme');
  if (!selectEl) return;

  const ctx = getEditingContext();
  const activeVal = ctx.id || selectEl.value;
  const officialThemes = THEME_REGISTRY;
  const customs = customThemes;

  let html = '<option value="">-- Choisir un thème existant à modifier --</option>';

  html += `<optgroup label="Thèmes par défaut (${officialThemes.length}) — modifiables">`;
  officialThemes.forEach(t => {
    const eff = getEffectiveBuiltin(t.id);
    const mod = themeOverrides[t.id] ? ' ● modifié' : '';
    html += `<option value="${t.id}">${escapeHtml(eff.name || t.name)} (${escapeHtml(eff.tag || t.tag || 'Défaut')})${mod}</option>`;
  });
  html += '</optgroup>';

  if (customs.length > 0) {
    html += '<optgroup label="Vos Thèmes Personnalisés">';
    customs.forEach(t => {
      html += `<option value="${t.id}">⭐ ${escapeHtml(t.name)} (${escapeHtml(t.styleMode || 'Personnalisé')})</option>`;
    });
    html += '</optgroup>';
  }

  selectEl.innerHTML = html;
  if (activeVal) selectEl.value = activeVal;
}

function loadThemeIntoVisualEditor(themeOrId, openModalAndSwitchTab = false) {
  let theme;
  if (typeof themeOrId === 'object' && themeOrId !== null) {
    theme = themeOrId;
  } else if (typeof themeOrId === 'string') {
    theme = getAllThemes().find(t => t.id === themeOrId);
  }
  if (!theme) return;

  const isCustom = isCustomThemeId(theme.id);
  const isBuiltin = isBuiltinThemeId(theme.id);
  // Mémorise ce qu'on édite : custom (mise à jour par id) ou builtin (override).
  // Pour un builtin on charge la version effective (override si déjà modifié).
  if (isCustom) {
    currentEditingThemeId = theme.id;
    currentEditingBuiltinId = null;
  } else if (isBuiltin) {
    currentEditingThemeId = null;
    currentEditingBuiltinId = theme.id;
    theme = getEffectiveBuiltin(theme.id) || theme;
  } else {
    clearEditingContext();
  }
  // Un builtin minimal (colors = tableau) devient un objet complet éditable.
  if (isBuiltin && Array.isArray(theme.colors)) {
    const base = getBuiltinBase(theme.id) || theme;
    const expanded = expandBuiltinToFullTheme(base);
    const eff = getEffectiveBuiltin(theme.id);
    // Si un override existe déjà, on édite l'override (complet).
    theme = (eff && !Array.isArray(eff.colors)) ? eff : { ...expanded, id: base.id, name: eff?.name || base.name, tag: eff?.tag || base.tag };
  }

  const editorName = document.getElementById('editor-theme-name');
  const editorIcon = document.getElementById('editor-theme-icon');
  const editorTag = document.getElementById('editor-theme-tag');
  const editorStyle = document.getElementById('editor-theme-style-mode');
  const editorLayout = document.getElementById('editor-theme-layout');
  const editorFont = document.getElementById('editor-font-family');
  const editorPlayText = document.getElementById('editor-play-text');
  const editorPlayIcon = document.getElementById('editor-play-icon');
  const editorPlayCustomIcon = document.getElementById('editor-play-custom-icon');
  const editorSoundProfile = document.getElementById('editor-sound-profile');
  const editorLaunchProfile = document.getElementById('editor-launch-profile');
  const editorBgImage = document.getElementById('editor-bg-image');
  const editorBgBlur = document.getElementById('editor-bg-blur');
  const editorBgBrightness = document.getElementById('editor-bg-brightness');
  const colPrimary = document.getElementById('editor-color-primary');
  const colSecondary = document.getElementById('editor-color-secondary');
  const colBg = document.getElementById('editor-color-bg');
  const colPlay = document.getElementById('editor-color-play');
  const valPrimary = document.getElementById('val-color-primary');
  const valSecondary = document.getElementById('val-color-secondary');
  const valBg = document.getElementById('val-color-bg');
  const valPlay = document.getElementById('val-color-play');
  const labelSave = document.getElementById('label-save-editor-theme');
  const btnSaveAsNew = document.getElementById('btn-editor-save-as-new');
  const labelCustomAudio = document.getElementById('label-custom-audio');
  const btnClearCustomAudio = document.getElementById('btn-clear-custom-audio');

  if (editorName) editorName.value = theme.name || '';
  if (editorIcon) editorIcon.value = theme.icon || 'gem';
  if (editorTag) editorTag.value = theme.tag || (isBuiltin ? theme.tag : 'Perso');
  if (editorStyle) editorStyle.value = theme.styleMode || 'classic';
  if (editorLayout) editorLayout.value = normalizeNavLayout(theme.layout);
  if (editorFont) editorFont.value = theme.fontFamily || 'Inter';
  if (editorPlayText) editorPlayText.value = theme.images?.playButtonText || 'JOUER';

  const iconVal = theme.images?.playButtonIcon || 'play';
  if (editorPlayIcon) {
    if (BUTTON_ICONS_SVG[iconVal]) {
      editorPlayIcon.value = iconVal;
      if (editorPlayCustomIcon) {
        editorPlayCustomIcon.classList.add('hidden');
        editorPlayCustomIcon.value = '';
      }
    } else {
      editorPlayIcon.value = 'custom';
      if (editorPlayCustomIcon) {
        editorPlayCustomIcon.classList.remove('hidden');
        editorPlayCustomIcon.value = iconVal;
      }
    }
  }
  if (editorSoundProfile) editorSoundProfile.value = theme.audio?.soundProfile || 'minecraft_stone';
  if (editorLaunchProfile) editorLaunchProfile.value = theme.audio?.launchSoundProfile || 'minecraft_levelup';
  if (editorBgImage) editorBgImage.value = theme.images?.backgroundImage || '';
  if (editorBgBlur) editorBgBlur.value = theme.images?.backgroundBlur || '8px';
  if (editorBgBrightness) editorBgBrightness.value = theme.images?.backgroundBrightness !== undefined ? String(theme.images.backgroundBrightness) : '0.45';

  const c = theme.colors || {};
  const p = c.primary || (Array.isArray(c) ? c[0] : '#38bdf8');
  const s = c.primaryDark || c.secondary || (Array.isArray(c) ? c[1] : '#0284c7');
  const bg = c.bgDark || (Array.isArray(c) ? c[2] : '#0b1118');
  const play = c.playGradientA || p;

  if (colPrimary) colPrimary.value = p;
  if (colSecondary) colSecondary.value = s;
  if (colBg) colBg.value = bg;
  if (colPlay) colPlay.value = play;
  if (valPrimary) valPrimary.textContent = p;
  if (valSecondary) valSecondary.textContent = s;
  if (valBg) valBg.textContent = bg;
  if (valPlay) valPlay.textContent = play;

  if (theme.audio?.customClickSound) {
    if (typeof setVisualEditorCustomAudio === 'function') setVisualEditorCustomAudio(theme.audio.customClickSound);
    if (labelCustomAudio) labelCustomAudio.textContent = 'Audio importé personnalisé ✓';
    if (btnClearCustomAudio) btnClearCustomAudio.classList.remove('hidden');
  } else {
    if (typeof setVisualEditorCustomAudio === 'function') setVisualEditorCustomAudio('');
    if (labelCustomAudio) labelCustomAudio.textContent = 'Importer un fichier Audio (.mp3 / .wav / .ogg)';
    if (btnClearCustomAudio) btnClearCustomAudio.classList.add('hidden');
  }

  refreshEditorSaveUI();

  if (openModalAndSwitchTab) {
    const modal = document.getElementById('modal-custom-theme');
    if (modal) {
      modal.classList.remove('hidden');
      const tabBtns = modal.querySelectorAll('.modal-tab-btn');
      const tabPanes = modal.querySelectorAll('.modal-tab-pane');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      const tabVisualBtn = modal.querySelector('.modal-tab-btn[data-tab="tab-visual-editor"]');
      const tabVisualPane = document.getElementById('tab-visual-editor');
      if (tabVisualBtn) tabVisualBtn.classList.add('active');
      if (tabVisualPane) tabVisualPane.classList.add('active');
    }
  }

  populateExistingThemesDropdown();
  const selectExisting = document.getElementById('editor-select-existing-theme');
  if (selectExisting && theme.id) selectExisting.value = theme.id;

  updateVisualEditorPreview();
}

let lastRenderedThemesSignature = '';

function renderThemeGrid(force = false) {
  const grid = document.getElementById('theme-cards-grid');
  if (!grid) return;

  const activeTheme = document.body.dataset.theme || DEFAULT_THEME;
  const allThemes = getAllThemes();
  const signature = allThemes.map(t => `${t.id}:${t.name}:${themeOverrides[t.id] ? 'mod' : ''}`).join('|');

  // If already rendered and themes haven't changed, just sync active classes (0ms CPU/DOM)
  if (!force && grid.children.length > 0 && lastRenderedThemesSignature === signature) {
    grid.querySelectorAll('.theme-card').forEach(card => {
      card.classList.toggle('active', card.dataset.theme === activeTheme);
    });
    syncSettingsThemeDropdown(activeTheme);
    return;
  }

  lastRenderedThemesSignature = signature;

  grid.innerHTML = allThemes.map(theme => {
    const isActive = theme.id === activeTheme;
    const isCustom = isCustomThemeId(theme.id);
    const isOverridden = !isCustom && !!themeOverrides[theme.id];
    const colors = Array.isArray(theme.colors)
      ? theme.colors
      : [theme.colors?.primary || '#38cc56', theme.colors?.playGradientB || theme.colors?.primaryDark || '#1fa33a', theme.colors?.bgDark || '#0d1810'];

    const swatchesHtml = colors.map(c => `<span class="theme-swatch" style="background: ${c};" title="${c}"></span>`).join('');

    return `
      <div class="theme-card ${isActive ? 'active' : ''} ${isCustom ? 'custom-theme-card' : ''}" data-theme="${theme.id}" title="Cliquer pour appliquer le thème ${escapeHtml(theme.name)}">
        <div class="theme-card-top">
          <div class="theme-card-header">
            <span class="theme-card-icon">${getThemeFaviconSvg(theme)}</span>
            <span class="theme-card-name" title="${escapeHtml(theme.name)}">${escapeHtml(theme.name)}</span>
          </div>
          <div class="theme-card-badges">
            <span class="theme-card-active-badge"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>Actif</span>
            ${isOverridden ? '<span class="theme-card-tag tag-modified">● modifié</span>' : ''}
            <span class="theme-card-tag ${isCustom ? 'tag-custom' : ''}">${escapeHtml(theme.tag || (isCustom ? 'IA' : 'Style'))}</span>
          </div>
        </div>
        <p class="theme-card-desc">${escapeHtml(theme.desc || 'Thème personnalisé')}</p>
        <div class="theme-card-bottom">
          <div class="theme-swatches" title="Palette de couleurs">
            ${swatchesHtml}
          </div>
          <div class="theme-card-actions">
            <button class="theme-mini-btn edit" data-action="edit" data-theme-id="${theme.id}" title="Modifier ce thème dans l'éditeur visuel">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              <span>Modifier</span>
            </button>
            ${isOverridden ? `
              <button class="theme-mini-btn reset" data-action="reset" data-theme-id="${theme.id}" title="Restaurer le thème par défaut d'origine">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/></svg>
              </button>
            ` : ''}
            ${isCustom ? `
              <button class="theme-mini-btn export" data-action="export" data-theme-id="${theme.id}" title="Exporter ce thème (.json)">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              </button>
              <button class="theme-mini-btn delete" data-action="delete" data-theme-id="${theme.id}" title="Supprimer ce thème">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach card click handlers
  grid.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't activate if clicking mini action buttons
      if (e.target.closest('.theme-mini-btn')) return;
      const themeId = card.dataset.theme;
      applyTheme(themeId, true);
      window.launcher.saveConfig({ theme: themeId });
      playMinecraftClickSound();
    });
  });

  // Attach mini edit, export & delete handlers
  grid.querySelectorAll('.theme-mini-btn[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const themeId = btn.dataset.themeId;
      loadThemeIntoVisualEditor(themeId, true);
    });
  });

  grid.querySelectorAll('.theme-mini-btn[data-action="export"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const themeId = btn.dataset.themeId;
      const theme = getAllThemes().find(t => t.id === themeId);
      if (theme && window.launcher.exportCustomTheme) {
        const res = await window.launcher.exportCustomTheme(theme);
        if (res?.success) showToast('Thème exporté avec succès !', 'info');
      }
    });
  });

  grid.querySelectorAll('.theme-mini-btn[data-action="reset"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetBuiltinTheme(btn.dataset.themeId);
    });
  });

  grid.querySelectorAll('.theme-mini-btn[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const themeId = btn.dataset.themeId;
      deleteCustomTheme(themeId);
    });
  });

  syncSettingsThemeDropdown(activeTheme);
  populateExistingThemesDropdown();
}

function saveCustomTheme(themeObj, andActivate = true) {
  // Replace if id exists or append
  const idx = customThemes.findIndex(t => t.id === themeObj.id);
  if (idx >= 0) {
    customThemes[idx] = themeObj;
  } else {
    customThemes.push(themeObj);
  }

  updateDynamicThemeStyles();
  persistThemes();
  renderThemeGrid(true);

  if (andActivate) {
    applyTheme(themeObj.id, true);
    window.launcher.saveConfig({ theme: themeObj.id });
  }

  updateCustomThemesManageList();
  populateExistingThemesDropdown();
}

function saveBuiltinOverride(themeObj, andActivate = true) {
  if (!themeObj || !isBuiltinThemeId(themeObj.id)) return;
  themeOverrides[themeObj.id] = { ...themeObj, builtin: true };
  updateDynamicThemeStyles();
  persistThemes();
  renderThemeGrid(true);

  if (andActivate) {
    applyTheme(themeObj.id, true);
    window.launcher.saveConfig({ theme: themeObj.id });
  }

  updateCustomThemesManageList();
  populateExistingThemesDropdown();
  refreshEditorSaveUI();
}

function resetBuiltinTheme(themeId) {
  if (!isBuiltinThemeId(themeId) || !themeOverrides[themeId]) return;
  const base = getBuiltinBase(themeId);
  const name = base ? base.name : themeId;
  showConfirmDialog(
    'Restaurer le thème par défaut ?',
    `Restaurer le thème <strong>"${escapeHtml(name)}"</strong> à son apparence d'origine ? Vos modifications seront perdues.`,
    () => {
      delete themeOverrides[themeId];
      updateDynamicThemeStyles();
      persistThemes();
      renderThemeGrid(true);
      if (currentEditingBuiltinId === themeId) {
        loadThemeIntoVisualEditor(themeId);
      } else {
        populateExistingThemesDropdown();
      }
      if (document.body.dataset.theme === themeId) applyTheme(themeId, true);
      showToast(`Thème "${name}" restauré à l'original.`, 'info');
    }
  );
}

function showConfirmDialog(title, messageHtml, onConfirm) {
  const modal = document.getElementById('modal-confirm-dialog');
  const titleEl = document.getElementById('confirm-dialog-title');
  const msgEl = document.getElementById('confirm-dialog-message');
  const btnCancel = document.getElementById('btn-confirm-cancel');
  const btnProceed = document.getElementById('btn-confirm-proceed');
  if (!modal || !btnProceed || !btnCancel) {
    if (confirm(messageHtml.replace(/<[^>]*>/g, ''))) onConfirm();
    return;
  }

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.innerHTML = messageHtml;

  modal.classList.remove('hidden');

  const cleanup = () => {
    modal.classList.add('hidden');
    btnProceed.removeEventListener('click', onProceed);
    btnCancel.removeEventListener('click', onCancel);
    modal.removeEventListener('click', onBackdrop);
  };

  const onProceed = () => {
    cleanup();
    onConfirm();
  };

  const onCancel = () => {
    cleanup();
  };

  const onBackdrop = (e) => {
    if (e.target === modal) cleanup();
  };

  btnProceed.addEventListener('click', onProceed);
  btnCancel.addEventListener('click', onCancel);
  modal.addEventListener('click', onBackdrop);
}

function deleteCustomTheme(themeId) {
  const theme = customThemes.find(t => t.id === themeId);
  const name = theme ? theme.name : themeId;

  showConfirmDialog(
    'Supprimer ce thème ?',
    `Voulez-vous vraiment supprimer définitivement le thème <strong>"${escapeHtml(name)}"</strong> ?`,
    () => {
      customThemes = customThemes.filter(t => t.id !== themeId);
      if (currentEditingThemeId === themeId) clearEditingContext();
      persistThemes();
      updateDynamicThemeStyles();

      if (document.body.dataset.theme === themeId) {
        applyTheme(DEFAULT_THEME, true);
        window.launcher.saveConfig({ theme: DEFAULT_THEME });
      }

      renderThemeGrid(true);
      updateCustomThemesManageList();
      populateExistingThemesDropdown();
      refreshEditorSaveUI();
      showToast(`Thème "${name}" supprimé.`, 'info');
    }
  );
}

function updateCustomThemesManageList() {
  const listEl = document.getElementById('custom-themes-manage-list');
  const countEl = document.getElementById('custom-themes-count');
  if (countEl) countEl.textContent = customThemes.length;
  if (!listEl) return;

  const overriddenIds = Object.keys(themeOverrides || {}).filter(id => isBuiltinThemeId(id));
  const overriddenHtml = overriddenIds.map(id => {
    const theme = themeOverrides[id];
    return `
    <div class="custom-manage-item manage-item-builtin">
      <div class="custom-manage-info">
        <span class="custom-manage-icon">${getThemeFaviconSvg(theme)}</span>
        <div>
          <strong>${escapeHtml(theme.name)}</strong>
          <span class="custom-manage-sub">Thème par défaut ● modifié • ${escapeHtml(theme.styleMode || 'classic')}</span>
        </div>
      </div>
      <div class="custom-manage-actions">
        <button class="custom-manage-btn edit btn-edit-builtin-from-list" data-theme-id="${id}" title="Modifier ce thème par défaut">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          <span>Modifier</span>
        </button>
        <button class="custom-manage-btn apply btn-apply-from-list" data-theme-id="${id}" title="Activer ce thème">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Appliquer</span>
        </button>
        <button class="custom-manage-btn reset btn-reset-builtin-from-list" data-theme-id="${id}" title="Restaurer l'original">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/></svg>
          <span>Restaurer</span>
        </button>
      </div>
    </div>
  `;}).join('');

  if (customThemes.length === 0 && overriddenIds.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p>Aucun thème personnalisé créé pour l'instant.</p>
        <p class="empty-sub">Utilisez l'onglet "🎨 Éditeur Visuel" ou "Générateur IA" pour créer ou modifier un thème !</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = overriddenHtml + customThemes.map(theme => `
    <div class="custom-manage-item">
      <div class="custom-manage-info">
        <span class="custom-manage-icon">${getThemeFaviconSvg(theme)}</span>
        <div>
          <strong>${escapeHtml(theme.name)}</strong>
          <span class="custom-manage-sub">${escapeHtml(theme.styleMode || 'cyber')} • ${escapeHtml(theme.tag || 'IA')}</span>
        </div>
      </div>
      <div class="custom-manage-actions">
        <button class="custom-manage-btn edit btn-edit-from-list" data-theme-id="${theme.id}" title="Modifier ce thème dans l'éditeur visuel">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          <span>Modifier</span>
        </button>
        <button class="custom-manage-btn apply btn-apply-from-list" data-theme-id="${theme.id}" title="Activer ce thème">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Appliquer</span>
        </button>
        <button class="custom-manage-btn export btn-export-from-list" data-theme-id="${theme.id}" title="Exporter en fichier .json">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          <span>Exporter</span>
        </button>
        <button class="custom-manage-btn delete btn-delete-from-list" data-theme-id="${theme.id}" title="Supprimer définitivement ce thème">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          <span>Supprimer</span>
        </button>
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('.btn-edit-from-list').forEach(btn => {
    btn.addEventListener('click', () => {
      const themeId = btn.dataset.themeId;
      loadThemeIntoVisualEditor(themeId);
    });
  });

  listEl.querySelectorAll('.btn-apply-from-list').forEach(btn => {
    btn.addEventListener('click', () => {
      const themeId = btn.dataset.themeId;
      applyTheme(themeId, true);
      window.launcher.saveConfig({ theme: themeId });
      document.getElementById('modal-custom-theme')?.classList.add('hidden');
    });
  });

  listEl.querySelectorAll('.btn-export-from-list').forEach(btn => {
    btn.addEventListener('click', async () => {
      const themeId = btn.dataset.themeId;
      const theme = customThemes.find(t => t.id === themeId);
      if (theme && window.launcher.exportCustomTheme) {
        const res = await window.launcher.exportCustomTheme(theme);
        if (res?.success) showToast('Thème exporté avec succès !', 'info');
      }
    });
  });

  listEl.querySelectorAll('.btn-edit-builtin-from-list').forEach(btn => {
    btn.addEventListener('click', () => {
      loadThemeIntoVisualEditor(btn.dataset.themeId);
      const tabBtn = document.querySelector('.modal-tab-btn[data-tab="tab-visual-editor"]');
      if (tabBtn) tabBtn.click();
    });
  });

  listEl.querySelectorAll('.btn-reset-builtin-from-list').forEach(btn => {
    btn.addEventListener('click', () => resetBuiltinTheme(btn.dataset.themeId));
  });

  listEl.querySelectorAll('.btn-delete-from-list').forEach(btn => {
    btn.addEventListener('click', () => {
      const themeId = btn.dataset.themeId;
      deleteCustomTheme(themeId);
    });
  });
}

// ============================================================
// Minecraft Audio SFX (Web Audio API Synthesizer & Custom Audio)
// ============================================================
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSynthesizedSound(profile, customAudioUrl) {
  try {
    if (profile === 'custom' && customAudioUrl) {
      const snd = new Audio(customAudioUrl);
      snd.volume = 0.6;
      snd.play().catch(() => {});
      return;
    }

    const ctx = getAudioContext();
    const t = ctx.currentTime;

    switch (profile) {
      case 'minecraft_wood': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.05);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(t + 0.05);
        break;
      }
      case 'cyber_beep': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(987.77, t);
        osc.frequency.setValueAtTime(1318.51, t + 0.02);
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(t + 0.05);
        break;
      }
      case 'laser_click': {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1400, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.05);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, t);
        filter.Q.value = 4;
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(t + 0.05);
        break;
      }
      case 'magic_chime': {
        [587.33, 880, 1174.66].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + i * 0.02);
          gain.gain.setValueAtTime(0.08, t + i * 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.02 + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t + i * 0.02);
          osc.stop(t + i * 0.02 + 0.25);
        });
        break;
      }
      case 'anvil_heavy': {
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(1480, t);
        osc2.frequency.exponentialRampToValueAtTime(400, t + 0.1);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc2.start();
        osc.stop(t + 0.18);
        osc2.stop(t + 0.18);
        break;
      }
      case 'bubble_pop': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(250, t);
        osc.frequency.exponentialRampToValueAtTime(850, t + 0.04);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(t + 0.04);
        break;
      }
      case 'retro_8bit': {
        [440, 660, 880].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(freq, t + idx * 0.02);
          gain.gain.setValueAtTime(0.06, t + idx * 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.02 + 0.03);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t + idx * 0.02);
          osc.stop(t + idx * 0.02 + 0.03);
        });
        break;
      }
      case 'minecraft_stone':
      default: {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.05);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(t + 0.05);
        break;
      }
    }
  } catch (e) {
    // Ignore audio errors
  }
}

function playMinecraftClickSound() {
  playSynthesizedSound(currentClickSoundProfile, currentCustomClickAudio);
}

function playLaunchSound(profile, customAudioUrl) {
  try {
    if (profile === 'custom' && customAudioUrl) {
      const snd = new Audio(customAudioUrl);
      snd.volume = 0.7;
      snd.play().catch(() => {});
      return;
    }

    const ctx = getAudioContext();
    const t = ctx.currentTime;

    switch (profile) {
      case 'portal_warp': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.exponentialRampToValueAtTime(450, t + 0.4);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.8);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(t + 0.8);
        break;
      }
      case 'cyber_charge': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(t + 0.55);
        break;
      }
      case 'forge_impact': {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(90, t);
        osc1.frequency.exponentialRampToValueAtTime(30, t + 0.4);
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(1200, t);
        osc2.frequency.exponentialRampToValueAtTime(250, t + 0.3);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start();
        osc2.start();
        osc1.stop(t + 0.45);
        osc2.stop(t + 0.45);
        break;
      }
      case 'dragon_roar': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, t);
        osc.frequency.linearRampToValueAtTime(65, t + 0.6);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(t + 0.7);
        break;
      }
      case 'minecraft_levelup':
      default: {
        const notes = [392.00, 523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t + idx * 0.08);
          gain.gain.setValueAtTime(0.12, t + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t + idx * 0.08);
          osc.stop(t + idx * 0.08 + 0.3);
        });
        break;
      }
    }
  } catch (e) {
    // Ignore audio errors
  }
}

function playGameLaunchSound() {
  playLaunchSound(currentLaunchSoundProfile, currentCustomLaunchAudio);
}

// Attach sound to interactive elements
document.addEventListener('click', (e) => {
  if (e.target.closest('button, .nav-item, .server-badge, .server-ip-banner, .footer-profile-widget, .add-account-card')) {
    playMinecraftClickSound();
  }
});

// Toast notification system
function showToast(message, type = 'info', duration = 4000) {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 65px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const colors = {
    error: { bg: '#dc2626', border: '#991b1b' },
    success: { bg: '#22c55e', border: '#15803d' },
    warning: { bg: '#ea580c', border: '#9a3412' },
    info: { bg: '#38bdf8', border: '#0284c7' }
  };
  const color = colors[type] || colors.info;

  toast.style.cssText = `
    background: rgba(15, 20, 30, 0.95);
    border: 1px solid ${color.border};
    border-left: 4px solid ${color.bg};
    color: white;
    padding: 12px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    max-width: 380px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    pointer-events: auto;
    animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    backdrop-filter: blur(10px);
  `;
  toast.textContent = message;
  toast.onclick = () => toastContainer.removeChild(toast);

  toastContainer.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode === toastContainer) {
      toast.style.animation = 'slideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      setTimeout(() => {
        if (toast.parentNode === toastContainer) toastContainer.removeChild(toast);
      }, 300);
    }
  }, duration);
}

// Add CSS keyframe animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

async function initRamLimits() {
  try {
    systemRamGB = await window.launcher.getSystemRam();
    ramMin = 2;
    ramMax = Math.max(ramMin + 1, systemRamGB - 3);

    if (ramSlider) {
      ramSlider.min = ramMin;
      ramSlider.max = ramMax;
    }
    if (settingsRam) {
      settingsRam.min = ramMin;
      settingsRam.max = ramMax;
    }

    if (parseInt(ramSlider.value) > ramMax) ramSlider.value = ramMax;
    if (parseInt(ramSlider.value) < ramMin) ramSlider.value = ramMin;
    if (settingsRam && parseInt(settingsRam.value) > ramMax) settingsRam.value = ramMax;
    if (settingsRam && parseInt(settingsRam.value) < ramMin) settingsRam.value = ramMin;

    if (ramValue) ramValue.textContent = `${ramSlider.value} Go`;
    if (settingsRamValue) settingsRamValue.textContent = `${settingsRam ? settingsRam.value : ramSlider.value} Go`;
  } catch (error) {
    console.error('[RAM] Failed to initialize RAM limits:', error);
  }
}

// Navigation between pages
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const targetPage = item.dataset.page;
    // Maintenance (espace admin du site) : l'onglet Mods est bloqué,
    // les Paramètres restent accessibles.
    if (targetPage === 'mods' && maintenanceState.maintenance) {
      playMinecraftClickSound();
      openMaintenanceModal();
      return;
    }
    navItems.forEach(n => n.classList.remove('active'));
    pages.forEach(p => p.classList.remove('active'));

    item.classList.add('active');
    const pageEl = document.getElementById(`page-${targetPage}`);
    if (pageEl) pageEl.classList.add('active');

    if (targetPage === 'accounts') loadAccountsList();
    if (targetPage === 'client') loadClientPageSettings();
    if (targetPage === 'mods') loadMods();
    if (targetPage === 'settings') { loadSettings(); renderThemeGrid(); }
    if (targetPage === 'news' || targetPage === 'home') loadLatestReleaseInfo();
  });
});

// Window controls
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');

const maximizeIcon = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/></svg>';
const restoreIcon = '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M4 1.5h5a1.5 1.5 0 0 1 1.5 1.5v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="1.5" y="4" width="6.5" height="6.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/></svg>';

function updateMaximizeButton(isMaximized) {
  if (!btnMaximize) return;
  btnMaximize.innerHTML = isMaximized ? restoreIcon : maximizeIcon;
  btnMaximize.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
  btnMaximize.classList.toggle('is-maximized', !!isMaximized);
}

if (btnMinimize) btnMinimize.addEventListener('click', () => window.launcher.minimize());
if (btnMaximize) btnMaximize.addEventListener('click', () => window.launcher.maximize());
if (btnClose) btnClose.addEventListener('click', () => window.launcher.close());

window.launcher.onWindowStateChanged((data) => {
  updateMaximizeButton(!!data?.isMaximized);
});

window.launcher.getWindowState().then((data) => {
  updateMaximizeButton(!!data?.isMaximized);
}).catch(() => {
  updateMaximizeButton(false);
});

// Elements
const authSection = document.getElementById('auth-section');
const playSection = document.getElementById('play-section');
const userNameEl = document.getElementById('user-name');
const userStatusEl = document.getElementById('user-status');
const userSkinHead = document.getElementById('user-skin-head');
const defaultSkinSrc = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'%3E%3Crect fill='%231e293b' width='36' height='36' rx='8'/%3E%3Cpath fill='%2364748b' d='M18 8a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm-8 18c0-3.3 3.6-6 8-6s8 2.7 8 6v2H10v-2z'/%3E%3C/svg%3E";

function isRealMojangUuid(uuid) {
  if (!uuid || typeof uuid !== 'string') return false;
  const clean = uuid.replace(/-/g, '').trim();
  if (clean.length !== 32 || !/^[0-9a-fA-F]{32}$/.test(clean)) return false;
  // Version 3 UUIDs (from MD5 offline hashes) have '3' as the 13th character
  if (uuid.includes('-3') || clean.charAt(12) === '3') return false;
  return true;
}

function getPlayerAvatarUrl(username, uuid, size = 48) {
  const cleanName = (username && username !== 'Joueur' && username !== 'Non connecté') ? username.trim() : '';
  if (cleanName) {
    return `https://mc-heads.net/avatar/${encodeURIComponent(cleanName)}/${size}`;
  }
  if (isRealMojangUuid(uuid)) {
    const cleanUuid = String(uuid).replace(/-/g, '');
    return `https://mc-heads.net/avatar/${cleanUuid}/${size}`;
  }
  return defaultSkinSrc;
}

function setSkinHead(username, uuid) {
  if (!userSkinHead) return;
  const cleanName = (username && username !== 'Joueur' && username !== 'Non connecté') ? username.trim() : '';
  const queryParam = cleanName || (isRealMojangUuid(uuid) ? String(uuid).replace(/-/g, '') : '');

  if (!queryParam) {
    userSkinHead.src = defaultSkinSrc;
    return;
  }

  const sources = [
    `https://mc-heads.net/avatar/${encodeURIComponent(queryParam)}/48`,
    `https://minotar.net/helm/${encodeURIComponent(queryParam)}/48`,
    `https://crafthead.net/helm/${encodeURIComponent(queryParam)}/48`,
    `https://mineskin.eu/helm/${encodeURIComponent(queryParam)}/48`
  ];

  let currentSourceIndex = 0;
  userSkinHead.onerror = () => {
    currentSourceIndex++;
    if (currentSourceIndex < sources.length) {
      userSkinHead.src = sources[currentSourceIndex];
    } else {
      userSkinHead.onerror = null;
      userSkinHead.src = defaultSkinSrc;
    }
  };

  userSkinHead.src = sources[0];
}

function setLoggedIn(username, uuid) {
  if (authSection) authSection.classList.add('hidden');
  if (playSection) playSection.classList.remove('hidden');
  if (userNameEl) userNameEl.textContent = username;
  if (userStatusEl) {
    userStatusEl.textContent = 'En ligne';
    userStatusEl.style.color = 'var(--mc-green-primary)';
  }
  setSkinHead(username, uuid);
  const playerNameEl = document.getElementById('player-name');
  if (playerNameEl) playerNameEl.textContent = username;
}

function setLoggedOut() {
  if (authSection) authSection.classList.remove('hidden');
  if (playSection) playSection.classList.add('hidden');
  if (userNameEl) userNameEl.textContent = 'Non connecté';
  if (userStatusEl) {
    userStatusEl.textContent = 'Hors ligne';
    userStatusEl.style.color = '';
  }
  setSkinHead(null, null);
  const playerNameEl = document.getElementById('player-name');
  if (playerNameEl) playerNameEl.textContent = 'Joueur';
}

// Multi-Server Selector Logic
async function initServerSelector() {
  try {
    const data = await window.launcher.getServers();
    if (data && data.activeServer) {
      currentServerId = data.activeServerId || 'adoserv2';
      if (Array.isArray(data.servers)) {
        renderServerTabs(data.servers, currentServerId);
      }
      applyServerUI(data.activeServer);
    }
    if (data && data.launcherConfig) applyMaintenanceState(data.launcherConfig);
  } catch (e) {
    console.error('[ServerSelector] Initialization error:', e);
  }

  bindServerTabs();
}

function serverTabBadge(server) {
  const lock = server.codesRequired ? ' 🔑' : '';
  if (server.apiType) return `${String(server.apiType).toUpperCase().slice(0, 5)}${lock}`;
  return `${String(server.defaultLoader || server.loader || 'MC').toUpperCase().slice(0, 5)}${lock}`;
}

// Onglets serveurs dynamiques (liste pilotée par l'espace admin du site).
// Le HTML statique sert de repli si l'IPC échoue.
function renderServerTabs(servers, activeId) {
  const group = document.getElementById('server-tabs-group');
  if (!group || !Array.isArray(servers)) return;
  if (servers.length === 0) {
    group.innerHTML = '<p class="server-list-empty">Aucun serveur ouvert pour le moment.</p>';
    return;
  }
  group.innerHTML = servers.map((s) => {
    const isOpen = s.enabled !== false;
    return `
      <button class="server-tab ${s.id === activeId ? 'active' : ''}" data-server-id="${escapeHtml(s.id)}" title="${escapeHtml(s.description || s.name)}${s.codesRequired ? ' — codes d\u2019accès requis' : ''}" aria-pressed="${s.id === activeId}" ${isOpen ? '' : 'disabled aria-disabled="true"'}>
        <span class="server-tab-main">
          <span class="server-tab-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></span>
          <span class="server-tab-name">${escapeHtml(s.shortName || s.name)}</span>
        </span>
        <span class="server-tab-meta">
          <span class="server-tab-badge">${escapeHtml(serverTabBadge(s))}</span>
          <span class="server-open-state ${isOpen ? 'is-open' : 'is-closed'}"><span class="status-dot ${isOpen ? 'online' : 'offline'}"></span>${isOpen ? 'OUVERT' : 'FERMÉ'}</span>
        </span>
      </button>`;
  }).join('');
}

async function onServerTabClick(tab, serverTabs) {
  const serverId = tab.dataset.serverId;
  if (serverId === currentServerId) return;

  serverTabs.forEach((t) => t.classList.remove('active'));
  tab.classList.add('active');

  const res = await window.launcher.setActiveServer(serverId);
  if (res && res.success && res.activeServer) {
    currentServerId = res.activeServer.id;
    applyServerUI(res.activeServer);
    updateLiveServerBadge();
    loadMods();
    showToast(`Serveur sélectionné : ${res.activeServer.name}`, 'info');
  } else {
    showToast(res?.error || 'Serveur indisponible.', 'error');
    tab.classList.remove('active');
    const current = document.querySelector(`.server-tab[data-server-id="${currentServerId}"]`);
    if (current) current.classList.add('active');
  }
}

function bindServerTabs() {
  const serverTabs = document.querySelectorAll('.server-tab');
  serverTabs.forEach((tab) => {
    tab.addEventListener('click', () => onServerTabClick(tab, serverTabs));
  });
}

function applyServerUI(server) {
  currentServerIp = server.displayIp || `${server.host}:${server.gamePort}`;
  currentGameVersion = server.gameVersion || DEFAULT_GAME_VERSION;
  currentLoader = server.defaultLoader || server.loader || 'neoforge';
  const ipTextEl = document.getElementById('server-ip-text');
  const titleEl = document.getElementById('current-server-title');
  const badgeTagEl = document.getElementById('server-badge-tag');

  if (ipTextEl) ipTextEl.textContent = currentServerIp;
  if (titleEl) titleEl.textContent = server.name;
  if (badgeTagEl) badgeTagEl.textContent = server.badgeTag || '1.21.1';

  const serverTabs = document.querySelectorAll('.server-tab');
  serverTabs.forEach((t) => {
    if (t.dataset.serverId === server.id) t.classList.add('active');
    else t.classList.remove('active');
  });
}

// Copy Active Server IP
function copyServerIP() {
  navigator.clipboard.writeText(currentServerIp);
  const serverName = document.getElementById('current-server-title')?.textContent
    || (currentServerId === 'adoserv2' ? 'AdoServ II' : currentServerId === 'adoserv67' ? 'AdoServ67' : 'YapapouaiyeSMP');
  showToast(`IP de ${serverName} copiée dans le presse-papier !`, 'success');
}

const btnCopyIp = document.getElementById('btn-copy-ip');
if (btnCopyIp) btnCopyIp.addEventListener('click', copyServerIP);

const topbarServerBadge = document.getElementById('topbar-server-badge');
if (topbarServerBadge) topbarServerBadge.addEventListener('click', copyServerIP);

async function updateLiveServerBadge() {
  const topbarBadge = document.getElementById('topbar-server-badge');
  const homeBadge = document.getElementById('home-server-badge');

  try {
    const res = await window.launcher.checkServerStatus(currentServerId);

    // 1. Topbar Badge
    if (topbarBadge) {
      const dot = topbarBadge.querySelector('.status-dot');
      const text = topbarBadge.querySelector('.server-text');
      if (res.online) {
        if (dot) dot.className = 'status-dot online';
        if (text) text.textContent = `${res.serverName || 'SERVEUR'} EN LIGNE`;
      } else {
        if (dot) dot.className = 'status-dot offline';
        if (text) text.textContent = `${res.serverName || 'SERVEUR'} HORS LIGNE`;
      }
    }

    // 2. Home Page Hero Card Badge
    if (homeBadge) {
      if (res.online) {
        homeBadge.className = 'mc-tag tag-status online';
        homeBadge.innerHTML = '<span class="status-dot online"></span> EN LIGNE';
      } else {
        homeBadge.className = 'mc-tag tag-status offline';
        homeBadge.innerHTML = '<span class="status-dot offline"></span> HORS LIGNE';
      }
    }
  } catch (e) {}
}

// Initialize server selector and start periodic status pings
updateLiveServerBadge();
setInterval(updateLiveServerBadge, 120000);

// Microsoft Auth
const btnAuthMs = document.getElementById('btn-auth-microsoft');
if (btnAuthMs) {
  btnAuthMs.addEventListener('click', async () => {
    btnAuthMs.disabled = true;
    btnAuthMs.textContent = 'Connexion en cours...';
    const result = await window.launcher.authMicrosoft();
    if (result.success) setLoggedIn(result.username, result.uuid);
    else if (!result.error?.includes('annule')) {
      showToast('Erreur de connexion : ' + (result.error || 'Erreur inconnue'), 'error');
    }
    btnAuthMs.disabled = false;
    btnAuthMs.innerHTML = '<svg class="btn-icon" width="20" height="20" viewBox="0 0 16 16"><rect x="0" y="0" width="7.5" height="7.5" fill="#f25022"/><rect x="8.5" y="0" width="7.5" height="7.5" fill="#7fba00"/><rect x="0" y="8.5" width="7.5" height="7.5" fill="#00a4ef"/><rect x="8.5" y="8.5" width="7.5" height="7.5" fill="#ffb900"/></svg><span>Se connecter avec Microsoft</span>';
  });
}

// Offline Auth
const btnAuthOffline = document.getElementById('btn-auth-offline');
if (btnAuthOffline) {
  btnAuthOffline.addEventListener('click', async () => {
    const username = document.getElementById('input-username').value.trim();
    if (!username) { showToast('Veuillez entrer un pseudo.', 'warning'); return; }
    const result = await window.launcher.authOffline(username);
    if (result.success) setLoggedIn(result.username, result.uuid);
    else showToast('Erreur : ' + result.error, 'error');
  });
}

const inputUsername = document.getElementById('input-username');
if (inputUsername) {
  inputUsername.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnAuthOffline.click();
  });
}

// Logout
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
  btnLogout.addEventListener('click', async (e) => {
    e.stopPropagation();
    await window.launcher.logout();
    setLoggedOut();
  });
}

// User Info Widget Click -> Go to accounts tab
const userInfo = document.getElementById('user-info');
if (userInfo) {
  userInfo.addEventListener('click', () => {
    const accountsTab = document.querySelector('[data-page="accounts"]');
    if (accountsTab) accountsTab.click();
  });
}

// RAM sliders sync
if (ramSlider) {
  ramSlider.addEventListener('input', () => {
    if (ramValue) ramValue.textContent = `${ramSlider.value} Go`;
    if (settingsRam) settingsRam.value = ramSlider.value;
    if (settingsRamValue) settingsRamValue.textContent = `${ramSlider.value} Go`;
    window.launcher.saveConfig({ ram: parseInt(ramSlider.value) });
  });
}

if (settingsRam) {
  settingsRam.addEventListener('input', () => {
    if (settingsRamValue) settingsRamValue.textContent = `${settingsRam.value} Go`;
    if (ramSlider) ramSlider.value = settingsRam.value;
    if (ramValue) ramValue.textContent = `${settingsRam.value} Go`;
    window.launcher.saveConfig({ ram: parseInt(settingsRam.value) });
  });
}

// Settings listeners
const resSelect = document.getElementById('settings-resolution');
const customResRow = document.getElementById('custom-resolution-row');
const customWidth = document.getElementById('custom-width');
const customHeight = document.getElementById('custom-height');

if (resSelect) {
  resSelect.addEventListener('change', () => {
    const val = resSelect.value;
    if (val === 'custom') {
      if (customResRow) customResRow.classList.remove('hidden');
      window.launcher.saveConfig({ resolution: `${customWidth.value || 1280}x${customHeight.value || 720}` });
    } else {
      if (customResRow) customResRow.classList.add('hidden');
      window.launcher.saveConfig({ resolution: val });
    }
  });
}

[customWidth, customHeight].forEach(input => {
  if (input) {
    input.addEventListener('input', () => {
      if (resSelect && resSelect.value === 'custom') {
        window.launcher.saveConfig({ resolution: `${customWidth.value || 1280}x${customHeight.value || 720}` });
      }
    });
  }
});

const fullscreenSetting = document.getElementById('settings-fullscreen');
if (fullscreenSetting) {
  fullscreenSetting.addEventListener('change', (e) => {
    window.launcher.saveConfig({ fullscreen: e.target.checked });
  });
}

const javaPathInput = document.getElementById('settings-java-path');
if (javaPathInput) {
  javaPathInput.addEventListener('change', (e) => {
    window.launcher.saveConfig({ javaPath: e.target.value.trim() || null });
  });
}

const btnBrowseJava = document.getElementById('btn-browse-java');
if (btnBrowseJava) {
  btnBrowseJava.addEventListener('click', async () => {
    const result = await window.launcher.selectJavaPath();
    if (result.success && result.path) {
      if (javaPathInput) javaPathInput.value = result.path;
      window.launcher.saveConfig({ javaPath: result.path });
    }
  });
}

const jvmArgsInput = document.getElementById('settings-jvm-args');
if (jvmArgsInput) {
  jvmArgsInput.addEventListener('change', (e) => {
    window.launcher.saveConfig({ jvmArgs: e.target.value.trim() || null });
  });
}

const langSelect = document.getElementById('settings-language');
if (langSelect) {
  langSelect.addEventListener('change', (e) => {
    window.launcher.saveConfig({ language: e.target.value });
  });
}

const keyboardLayoutSelect = document.getElementById('settings-keyboard-layout');
if (keyboardLayoutSelect) {
  keyboardLayoutSelect.addEventListener('change', async (e) => {
    const layout = e.target.value;
    try {
      await window.launcher.applyKeyboardLayout(layout);
      showToast(`Disposition ${layout.toUpperCase()} appliquée avec succès !`, 'success');
    } catch (err) {
      showToast('Erreur lors de l\'application des touches : ' + err.message, 'error');
    }
  });
}

const btnApplyKeyboardLayout = document.getElementById('btn-apply-keyboard-layout');
if (btnApplyKeyboardLayout) {
  btnApplyKeyboardLayout.addEventListener('click', async () => {
    const layout = keyboardLayoutSelect ? keyboardLayoutSelect.value : 'azerty';
    try {
      await window.launcher.applyKeyboardLayout(layout);
      if (typeof playMinecraftClickSound === 'function') playMinecraftClickSound();
      showToast(`Touches ${layout.toUpperCase()} appliquées à Minecraft !`, 'success');
    } catch (err) {
      showToast('Erreur lors de l\'application des touches : ' + err.message, 'error');
    }
  });
}

const btnClientAzertyNow = document.getElementById('btn-client-azerty-now');
if (btnClientAzertyNow) {
  btnClientAzertyNow.addEventListener('click', async () => {
    try {
      if (keyboardLayoutSelect) keyboardLayoutSelect.value = 'azerty';
      await window.launcher.applyKeyboardLayout('azerty');
      if (typeof playMinecraftClickSound === 'function') playMinecraftClickSound();
      showToast('Touches AZERTY (ZQSD) configurées et synchronisées !', 'success');
    } catch (err) {
      showToast('Erreur lors de la configuration AZERTY : ' + err.message, 'error');
    }
  });
}

const themeSelect = document.getElementById('settings-theme');
if (themeSelect) {
  themeSelect.addEventListener('change', (e) => {
    applyTheme(e.target.value, true);
    window.launcher.saveConfig({ theme: e.target.value });
  });
}

// Topbar Quick Theme Switcher Button
const btnQuickTheme = document.getElementById('btn-quick-theme');
if (btnQuickTheme) {
  btnQuickTheme.addEventListener('click', () => {
    const all = getAllThemes();
    const currentTheme = document.body.dataset.theme || DEFAULT_THEME;
    const currentIndex = all.findIndex(t => t.id === currentTheme);
    const nextIndex = (currentIndex + 1) % all.length;
    const nextTheme = all[nextIndex].id;
    applyTheme(nextTheme, true);
    window.launcher.saveConfig({ theme: nextTheme });
    playMinecraftClickSound();
  });
}

function initCustomThemeModal() {
  const modal = document.getElementById('modal-custom-theme');
  const btnOpenModal = document.getElementById('btn-open-custom-theme-modal');
  const btnCloseModal = document.getElementById('btn-close-custom-theme-modal');

  const btnCopyPromptDirect = document.getElementById('btn-copy-ai-prompt-direct');
  const btnModalCopyPrompt = document.getElementById('btn-modal-copy-ai-prompt');
  const btnImportFileDirect = document.getElementById('btn-import-theme-file-direct');
  const btnModalImportFile = document.getElementById('btn-modal-import-file');
  const btnPasteClipboard = document.getElementById('btn-paste-clipboard-json');
  const btnApplyJson = document.getElementById('btn-apply-custom-json');
  const jsonTextarea = document.getElementById('custom-theme-json-input');

  const tabBtns = document.querySelectorAll('.modal-tab-btn');
  const tabPanes = document.querySelectorAll('.modal-tab-pane');

  if (btnOpenModal && modal) {
    btnOpenModal.addEventListener('click', () => {
      modal.classList.remove('hidden');
      updateCustomThemesManageList();
      updateVisualEditorPreview();
    });
  }

  if (btnCloseModal && modal) {
    btnCloseModal.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  // Modal Backdrop click to close (only if mousedown AND mouseup both started and ended directly on backdrop)
  if (modal) {
    let isBackdropDown = false;
    modal.addEventListener('mousedown', (e) => {
      isBackdropDown = (e.target === modal);
    });
    modal.addEventListener('mouseup', (e) => {
      if (isBackdropDown && e.target === modal) {
        modal.classList.add('hidden');
      }
      isBackdropDown = false;
    });

    const modalBodyEl = modal.querySelector('.modal-body');
    if (modalBodyEl) {
      modalBodyEl.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaY) > 0) {
          modalBodyEl.scrollTop += e.deltaY * 1.25;
        }
      }, { passive: true });
    }
  }

  // Tab navigation in modal
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.getElementById(tabId);
      if (pane) pane.classList.add('active');
      if (tabId === 'tab-manage-custom') updateCustomThemesManageList();
      if (tabId === 'tab-visual-editor') updateVisualEditorPreview();
    });
  });

  // Copy AI Prompt
  const copyPromptHandler = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT_TEMPLATE);
      showToast('Prompt IA copié ! Collez-le dans ChatGPT, Gemini ou Claude.', 'info', 3500);
    } catch (err) {
      showToast('Erreur lors de la copie du prompt', 'error');
    }
  };

  if (btnCopyPromptDirect) btnCopyPromptDirect.addEventListener('click', copyPromptHandler);
  if (btnModalCopyPrompt) btnModalCopyPrompt.addEventListener('click', copyPromptHandler);

  // Live JSON validation feedback
  const jsonStatusEl = document.getElementById('ai-json-validation-status');

  function checkAndValidateJsonInput() {
    const raw = jsonTextarea?.value?.trim();
    if (!raw) {
      if (jsonStatusEl) {
        jsonStatusEl.classList.add('hidden');
        jsonStatusEl.innerHTML = '';
      }
      return;
    }
    try {
      const parsed = parseThemeJson(raw);
      if (jsonStatusEl) {
        jsonStatusEl.classList.remove('hidden');
        jsonStatusEl.style.background = 'rgba(34, 197, 94, 0.12)';
        jsonStatusEl.style.border = '1px solid rgba(34, 197, 94, 0.4)';
        jsonStatusEl.style.color = '#86efac';
        jsonStatusEl.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <div style="flex: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span><strong>JSON Valide :</strong> "${escapeHtml(parsed.name)}" (Style: ${escapeHtml(parsed.styleMode)})</span>
            <div style="display: flex; gap: 4px; align-items: center;">
              <span style="display: inline-block; width: 14px; height: 14px; border-radius: 3px; background: ${parsed.colors.primary}; border: 1px solid rgba(255,255,255,0.3);" title="Primaire: ${parsed.colors.primary}"></span>
              <span style="display: inline-block; width: 14px; height: 14px; border-radius: 3px; background: ${parsed.colors.bgDark}; border: 1px solid rgba(255,255,255,0.3);" title="Fond: ${parsed.colors.bgDark}"></span>
            </div>
          </div>
        `;
      }
    } catch (err) {
      if (jsonStatusEl) {
        jsonStatusEl.classList.remove('hidden');
        jsonStatusEl.style.background = 'rgba(239, 68, 68, 0.12)';
        jsonStatusEl.style.border = '1px solid rgba(239, 68, 68, 0.4)';
        jsonStatusEl.style.color = '#fca5a5';
        jsonStatusEl.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <span><strong>Format JSON :</strong> ${escapeHtml(err.message)}</span>
        `;
      }
    }
  }

  if (jsonTextarea) {
    jsonTextarea.addEventListener('input', checkAndValidateJsonInput);
    jsonTextarea.addEventListener('paste', () => {
      setTimeout(checkAndValidateJsonInput, 50);
    });
  }

  // Paste from clipboard
  if (btnPasteClipboard && jsonTextarea) {
    btnPasteClipboard.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          jsonTextarea.value = text;
          checkAndValidateJsonInput();
          showToast('JSON collé depuis le presse-papier !', 'info');
        } else {
          showToast('Le presse-papier est vide.', 'error');
        }
      } catch (err) {
        showToast('Impossible de lire le presse-papier.', 'error');
      }
    });
  }

  // File import (Direct & Modal)
  const fileImportHandler = async () => {
    if (!window.launcher.importCustomThemeFile) return;
    const res = await window.launcher.importCustomThemeFile();
    if (res?.success && res.content) {
      try {
        const parsed = parseThemeJson(res.content);
        saveCustomTheme(parsed, true);
        loadThemeIntoVisualEditor(parsed);
        if (modal) modal.classList.add('hidden');
        showToast(`Thème "${parsed.name}" importé avec succès !`, 'info', 2500);
      } catch (e) {
        showToast('Fichier JSON invalide : ' + e.message, 'error');
      }
    }
  };

  if (btnImportFileDirect) btnImportFileDirect.addEventListener('click', fileImportHandler);
  if (btnModalImportFile) btnModalImportFile.addEventListener('click', fileImportHandler);

  // Apply JSON from textarea
  if (btnApplyJson && jsonTextarea) {
    btnApplyJson.addEventListener('click', () => {
      const raw = jsonTextarea.value;
      if (!raw || !raw.trim()) {
        showToast('Veuillez coller le JSON du thème généré par l\'IA.', 'error');
        return;
      }
      try {
        const parsed = parseThemeJson(raw);
        saveCustomTheme(parsed, true);
        loadThemeIntoVisualEditor(parsed);
        if (modal) modal.classList.add('hidden');
        jsonTextarea.value = '';
        if (jsonStatusEl) {
          jsonStatusEl.classList.add('hidden');
          jsonStatusEl.innerHTML = '';
        }
        showToast(`Thème "${parsed.name}" importé et activé avec succès !`, 'info', 3000);
      } catch (e) {
        showToast('Erreur d\'analyse JSON : ' + e.message, 'error', 3500);
      }
    });
  }

  // Visual Editor Live Preview & Controls
  const editorName = document.getElementById('editor-theme-name');
  const editorIcon = document.getElementById('editor-theme-icon');
  const editorTag = document.getElementById('editor-theme-tag');
  const editorStyle = document.getElementById('editor-theme-style-mode');
  const editorLayout = document.getElementById('editor-theme-layout');
  const editorPlayText = document.getElementById('editor-play-text');
  const editorPlayIcon = document.getElementById('editor-play-icon');
  const editorPlayCustomIcon = document.getElementById('editor-play-custom-icon');
  const editorFont = document.getElementById('editor-font-family');

  if (editorPlayIcon) {
    editorPlayIcon.addEventListener('change', () => {
      if (editorPlayIcon.value === 'custom') {
        if (editorPlayCustomIcon) {
          editorPlayCustomIcon.classList.remove('hidden');
          editorPlayCustomIcon.focus();
        }
      } else {
        if (editorPlayCustomIcon) {
          editorPlayCustomIcon.classList.add('hidden');
        }
      }
      scheduleVisualEditorPreview();
    });
  }

  if (editorPlayCustomIcon) {
    editorPlayCustomIcon.addEventListener('input', () => {
      scheduleVisualEditorPreview();
    });
  }

  const editorSoundProfile = document.getElementById('editor-sound-profile');
  const editorLaunchProfile = document.getElementById('editor-launch-profile');
  const btnTestClickSound = document.getElementById('btn-test-click-sound');
  const btnTestLaunchSound = document.getElementById('btn-test-launch-sound');
  const btnBrowseCustomAudio = document.getElementById('btn-browse-custom-audio');
  const btnClearCustomAudio = document.getElementById('btn-clear-custom-audio');
  const labelCustomAudio = document.getElementById('label-custom-audio');

  const editorBgImage = document.getElementById('editor-bg-image');
  const editorBgBlur = document.getElementById('editor-bg-blur');
  const editorBgBrightness = document.getElementById('editor-bg-brightness');
  const btnBrowseBgImage = document.getElementById('btn-browse-bg-image');
  const btnClearBgImage = document.getElementById('btn-clear-bg-image');

  const colPrimary = document.getElementById('editor-color-primary');
  const colSecondary = document.getElementById('editor-color-secondary');
  const colBg = document.getElementById('editor-color-bg');
  const colPlay = document.getElementById('editor-color-play');

  const valPrimary = document.getElementById('val-color-primary');
  const valSecondary = document.getElementById('val-color-secondary');
  const valBg = document.getElementById('val-color-bg');
  const valPlay = document.getElementById('val-color-play');

  const btnResetDefaults = document.getElementById('btn-editor-reset-defaults');

  let customAudioUploaded = '';

  // Browse background image
  if (btnBrowseBgImage) {
    btnBrowseBgImage.addEventListener('click', async () => {
      if (!window.launcher.selectImageFile) return;
      const res = await window.launcher.selectImageFile();
      if (res?.success && res.dataUri) {
        if (editorBgImage) editorBgImage.value = res.dataUri;
        updateVisualEditorPreview();
        showToast('Image d\'arrière-plan chargée !', 'info');
      }
    });
  }

  // Clear background image
  if (btnClearBgImage) {
    btnClearBgImage.addEventListener('click', () => {
      if (editorBgImage) editorBgImage.value = '';
      updateVisualEditorPreview();
      showToast('Image d\'arrière-plan supprimée.', 'info');
    });
  }

  // Browse custom audio
  if (btnBrowseCustomAudio) {
    btnBrowseCustomAudio.addEventListener('click', async () => {
      if (!window.launcher.selectAudioFile) return;
      const res = await window.launcher.selectAudioFile();
      if (res?.success && res.dataUri) {
        customAudioUploaded = res.dataUri;
        if (editorSoundProfile) editorSoundProfile.value = 'custom';
        if (labelCustomAudio) labelCustomAudio.textContent = 'Audio importé avec succès ✓';
        if (btnClearCustomAudio) btnClearCustomAudio.classList.remove('hidden');
        showToast('Fichier audio personnalisé chargé !', 'info');
      }
    });
  }

  // Clear custom audio
  if (btnClearCustomAudio) {
    btnClearCustomAudio.addEventListener('click', () => {
      customAudioUploaded = '';
      if (editorSoundProfile && editorSoundProfile.value === 'custom') editorSoundProfile.value = 'laser_click';
      if (labelCustomAudio) labelCustomAudio.textContent = 'Importer un fichier Audio (.mp3 / .wav / .ogg)';
      btnClearCustomAudio.classList.add('hidden');
      showToast('Audio personnalisé retiré.', 'info');
    });
  }

  // Test sound buttons
  if (btnTestClickSound) {
    btnTestClickSound.addEventListener('click', () => {
      const profile = editorSoundProfile ? editorSoundProfile.value : 'laser_click';
      playSynthesizedSound(profile, customAudioUploaded);
    });
  }

  if (btnTestLaunchSound) {
    btnTestLaunchSound.addEventListener('click', () => {
      const profile = editorLaunchProfile ? editorLaunchProfile.value : 'cyber_charge';
      playLaunchSound(profile, customAudioUploaded);
    });
  }

  // Interactive Live Preview Mockup Stage Clicks
  const previewPlayBtn = document.getElementById('editor-preview-play');
  const previewActionBtn = document.getElementById('editor-preview-action');

  if (previewPlayBtn) {
    previewPlayBtn.addEventListener('click', () => {
      const launchProfile = editorLaunchProfile ? editorLaunchProfile.value : 'cyber_charge';
      playLaunchSound(launchProfile, customAudioUploaded);
      previewPlayBtn.style.transform = 'scale(0.96)';
      setTimeout(() => { previewPlayBtn.style.transform = ''; }, 120);
    });
  }

  if (previewActionBtn) {
    previewActionBtn.addEventListener('click', () => {
      const clickProfile = editorSoundProfile ? editorSoundProfile.value : 'laser_click';
      playSynthesizedSound(clickProfile, customAudioUploaded);
      previewActionBtn.style.transform = 'scale(0.96)';
      setTimeout(() => { previewActionBtn.style.transform = ''; }, 120);
    });
  }

  // Visual Editor Presets Dictionary
  const VISUAL_PRESETS = {
    classic: { name: 'Classic', icon: 'gem', tag: 'Classique', style: 'classic', font: 'Inter', primary: '#38cc56', secondary: '#1fa33a', bg: '#0d1810', play: '#38cc56', playText: 'JOUER', playIcon: 'play', sound: 'minecraft_stone', launch: 'minecraft_levelup', desc: 'L\'esprit Minecraft original : boutons biseautés verts et accents soignés.' }
  };

  // Wire Preset Chips
  document.querySelectorAll('#preset-chips-group .preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const presetId = chip.dataset.presetId;
      const p = VISUAL_PRESETS[presetId] || VISUAL_PRESETS.classic;
      if (!p) return;

      document.querySelectorAll('#preset-chips-group .preset-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      if (editorName) editorName.value = p.name;
      if (editorIcon) editorIcon.value = p.icon;
      if (editorTag) editorTag.value = p.tag;
      if (editorStyle) editorStyle.value = p.style;
      if (editorFont) editorFont.value = p.font;
      if (editorPlayText) editorPlayText.value = p.playText;
      if (editorPlayIcon) editorPlayIcon.value = p.playIcon;
      if (editorSoundProfile) editorSoundProfile.value = p.sound;
      if (editorLaunchProfile) editorLaunchProfile.value = p.launch;
      if (colPrimary) colPrimary.value = p.primary;
      if (colSecondary) colSecondary.value = p.secondary;
      if (colBg) colBg.value = p.bg;
      if (colPlay) colPlay.value = p.play;

      syncAllColorSwatches();
      updateVisualEditorPreview();
      showToast(`Modèle "${p.name}" appliqué à l'éditeur !`, 'info');
    });
  });

  function syncAllColorSwatches() {
    const p = (colPrimary?.value || '#38bdf8').trim();
    const s = (colSecondary?.value || '#0284c7').trim();
    const bg = (colBg?.value || '#0b1118').trim();
    const play = (colPlay?.value || p).trim();

    const swatchP = document.getElementById('swatch-color-primary');
    const swatchS = document.getElementById('swatch-color-secondary');
    const swatchBg = document.getElementById('swatch-color-bg');
    const swatchPlay = document.getElementById('swatch-color-play');

    if (swatchP && p) swatchP.style.backgroundColor = p;
    if (swatchS && s) swatchS.style.backgroundColor = s;
    if (swatchBg && bg) swatchBg.style.backgroundColor = bg;
    if (swatchPlay && play) swatchPlay.style.backgroundColor = play;
  }

  // Quick Palettes
  const QUICK_PALETTES = {
    classic: { primary: '#38cc56', secondary: '#1fa33a', bg: '#0d1810', play: '#38cc56' },
    emerald: { primary: '#38cc56', secondary: '#1fa33a', bg: '#0d1810', play: '#38cc56' }
  };

  document.querySelectorAll('#color-palettes-group .color-palette-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const palKey = btn.dataset.palette;
      const pal = QUICK_PALETTES[palKey];
      if (!pal) return;

      if (colPrimary) colPrimary.value = pal.primary;
      if (colSecondary) colSecondary.value = pal.secondary;
      if (colBg) colBg.value = pal.bg;
      if (colPlay) colPlay.value = pal.play;

      syncAllColorSwatches();
      updateVisualEditorPreview();
    });
  });

  // --- CUSTOM DARK THEME COLOR PICKER CONTROLLER ---
  const darkPickerPopover = document.getElementById('dark-color-picker-popover');
  const darkPickerCanvas = document.getElementById('dark-picker-canvas');
  const darkPickerCursor = document.getElementById('dark-picker-cursor');
  const darkPickerHue = document.getElementById('dark-picker-hue');
  const darkPickerPreviewCircle = document.getElementById('dark-picker-preview-circle');
  const darkPickerTargetDot = document.getElementById('dark-picker-target-dot');
  const darkPickerTargetName = document.getElementById('dark-picker-target-name');
  const darkPickerHexField = document.getElementById('dark-picker-hex-field');
  const btnCloseDarkPicker = document.getElementById('btn-close-dark-picker');
  const btnApplyDarkColor = document.getElementById('btn-apply-dark-color');
  const btnPickerEyedropper = document.getElementById('btn-picker-eyedropper');

  let activeColorTarget = 'primary';
  let currentHue = 195;
  let currentSat = 0.8;
  let currentVal = 0.9;
  let isDraggingCanvas = false;

  const TARGET_NAMES = {
    primary: 'Couleur Principale',
    secondary: 'Lueur & Secondaire',
    bg: 'Fond d\'Arrière-Plan',
    play: 'Dégradé Bouton'
  };

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) {
      h = 0;
    } else {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: h * 360, s: s, v: v };
  }

  function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor((h / 60) % 6);
    const f = (h / 60) - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  function hsvToHex(h, s, v) {
    const { r, g, b } = hsvToRgb(h, s, v);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  function hexToHsv(hex) {
    hex = (hex || '').replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length !== 6) return { h: 195, s: 0.8, v: 0.9 };
    const num = parseInt(hex, 16);
    if (isNaN(num)) return { h: 195, s: 0.8, v: 0.9 };
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return rgbToHsv(r, g, b);
  }

  // --- CUSTOM DARK THEME COLOR PICKER CONTROLLER (60FPS RAF-Throttled) ---
  let isCanvasDrawScheduled = false;
  let isPreviewUpdateScheduled = false;
  let isUpdatingFromPicker = false;

  function scheduleDrawDarkPickerCanvas() {
    if (isCanvasDrawScheduled) return;
    isCanvasDrawScheduled = true;
    requestAnimationFrame(() => {
      isCanvasDrawScheduled = false;
      drawDarkPickerCanvas();
    });
  }

  function scheduleVisualEditorPreview() {
    if (isPreviewUpdateScheduled) return;
    isPreviewUpdateScheduled = true;
    requestAnimationFrame(() => {
      isPreviewUpdateScheduled = false;
      executeVisualEditorPreview();
    });
  }

  function drawDarkPickerCanvas() {
    if (!darkPickerCanvas) return;
    const box = darkPickerCanvas.parentElement;
    const displayWidth = box ? (box.clientWidth || 230) : 230;
    const displayHeight = box ? (box.clientHeight || 105) : 105;

    if (darkPickerCanvas.width !== displayWidth || darkPickerCanvas.height !== displayHeight) {
      darkPickerCanvas.width = displayWidth;
      darkPickerCanvas.height = displayHeight;
    }

    const ctx = darkPickerCanvas.getContext('2d', { alpha: false });
    const width = displayWidth;
    const height = displayHeight;

    // 1. Base Hue color
    ctx.fillStyle = `hsl(${currentHue}, 100%, 50%)`;
    ctx.fillRect(0, 0, width, height);

    // 2. White horizontal gradient
    const whiteGrad = ctx.createLinearGradient(0, 0, width, 0);
    whiteGrad.addColorStop(0, '#ffffff');
    whiteGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(0, 0, width, height);

    // 3. Black vertical gradient
    const blackGrad = ctx.createLinearGradient(0, 0, 0, height);
    blackGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    blackGrad.addColorStop(1, '#000000');
    ctx.fillStyle = blackGrad;
    ctx.fillRect(0, 0, width, height);

    // Position cursor
    if (darkPickerCursor) {
      const cx = Math.max(0, Math.min(width, Math.round(currentSat * width)));
      const cy = Math.max(0, Math.min(height, Math.round((1 - currentVal) * height)));
      darkPickerCursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    }
  }

  function getTargetField(target) {
    if (target === 'primary') return { input: colPrimary, swatch: document.getElementById('swatch-color-primary') };
    if (target === 'secondary') return { input: colSecondary, swatch: document.getElementById('swatch-color-secondary') };
    if (target === 'bg') return { input: colBg, swatch: document.getElementById('swatch-color-bg') };
    if (target === 'play') return { input: colPlay, swatch: document.getElementById('swatch-color-play') };
    return { input: colPrimary, swatch: document.getElementById('swatch-color-primary') };
  }

  function updateColorFromPicker(hex) {
    if (!hex.startsWith('#')) hex = '#' + hex;
    const cleanHex = hex.slice(0, 7);
    const targetObj = getTargetField(activeColorTarget);
    
    isUpdatingFromPicker = true;
    if (targetObj?.input) {
      targetObj.input.value = cleanHex;
    }
    if (targetObj?.swatch) {
      targetObj.swatch.style.backgroundColor = cleanHex;
    }
    if (darkPickerPreviewCircle) darkPickerPreviewCircle.style.backgroundColor = cleanHex;
    if (darkPickerTargetDot) darkPickerTargetDot.style.backgroundColor = cleanHex;
    if (darkPickerHexField) darkPickerHexField.value = cleanHex.replace(/^#/, '');
    isUpdatingFromPicker = false;

    scheduleVisualEditorPreview();
  }

  function openDarkColorPicker(target, anchorEl) {
    activeColorTarget = target;
    if (darkPickerTargetName) darkPickerTargetName.textContent = TARGET_NAMES[target] || 'Couleur';

    const targetObj = getTargetField(target);
    const initialHex = (targetObj?.input?.value || '#38bdf8').trim();
    const hsv = hexToHsv(initialHex);
    currentHue = hsv.h;
    currentSat = hsv.s;
    currentVal = hsv.v;

    if (darkPickerHue) darkPickerHue.value = Math.round(currentHue);
    if (darkPickerHexField) darkPickerHexField.value = initialHex.replace(/^#/, '');
    if (darkPickerPreviewCircle) darkPickerPreviewCircle.style.backgroundColor = initialHex;
    if (darkPickerTargetDot) darkPickerTargetDot.style.backgroundColor = initialHex;

    drawDarkPickerCanvas();

    if (darkPickerPopover && anchorEl) {
      darkPickerPopover.classList.remove('hidden');
      const dialog = anchorEl.closest('.custom-modal-dialog') || document.querySelector('#modal-custom-theme .custom-modal-dialog') || document.body;
      const dialogRect = dialog.getBoundingClientRect();
      const anchorRect = anchorEl.getBoundingClientRect();
      
      let top = anchorRect.bottom - dialogRect.top + 8;
      let left = anchorRect.left - dialogRect.left - 60;
      const popWidth = 250;
      const popHeight = 285;

      if (left < 10) left = 10;
      if (left + popWidth > dialogRect.width - 10) {
        left = Math.max(10, dialogRect.width - popWidth - 10);
      }
      if (top + popHeight > dialogRect.height - 10) {
        top = anchorRect.top - dialogRect.top - popHeight - 8;
        if (top < 10) top = 10;
      }

      darkPickerPopover.style.top = `${Math.round(top)}px`;
      darkPickerPopover.style.left = `${Math.round(left)}px`;
    }
  }

  function handleCanvasPick(e) {
    if (!darkPickerCanvas) return;
    const rect = darkPickerCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : (e.clientX !== undefined ? e.clientX : e.pageX);
    const clientY = e.touches ? e.touches[0].clientY : (e.clientY !== undefined ? e.clientY : e.pageY);
    if (clientX === undefined || clientY === undefined) return;

    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));

    currentSat = rect.width > 0 ? (x / rect.width) : 0;
    currentVal = rect.height > 0 ? (1 - (y / rect.height)) : 0;

    scheduleDrawDarkPickerCanvas();
    const hex = hsvToHex(currentHue, currentSat, currentVal);
    updateColorFromPicker(hex);
  }

  if (darkPickerCanvas) {
    const onCanvasDown = (e) => {
      isDraggingCanvas = true;
      e.preventDefault();
      handleCanvasPick(e);
    };
    darkPickerCanvas.addEventListener('mousedown', onCanvasDown);
    darkPickerCanvas.addEventListener('touchstart', onCanvasDown, { passive: false });

    const onCanvasMove = (e) => {
      if (isDraggingCanvas) {
        e.preventDefault();
        handleCanvasPick(e);
      }
    };
    window.addEventListener('mousemove', onCanvasMove);
    window.addEventListener('touchmove', onCanvasMove, { passive: false });

    const onCanvasUp = () => {
      isDraggingCanvas = false;
    };
    window.addEventListener('mouseup', onCanvasUp);
    window.addEventListener('touchend', onCanvasUp);
    window.addEventListener('touchcancel', onCanvasUp);
  }

  if (darkPickerHue) {
    darkPickerHue.addEventListener('input', () => {
      currentHue = parseFloat(darkPickerHue.value);
      scheduleDrawDarkPickerCanvas();
      const hex = hsvToHex(currentHue, currentSat, currentVal);
      updateColorFromPicker(hex);
    });
  }

  if (darkPickerHexField) {
    darkPickerHexField.addEventListener('input', () => {
      let val = darkPickerHexField.value.trim().replace(/^#/, '');
      if (val.length === 3) {
        val = val.split('').map(c => c + c).join('');
      }
      if (val.length === 6 && /^[0-9a-fA-F]{6}$/.test(val)) {
        const hex = '#' + val;
        const hsv = hexToHsv(hex);
        currentHue = hsv.h;
        currentSat = hsv.s;
        currentVal = hsv.v;
        if (darkPickerHue) darkPickerHue.value = Math.round(currentHue);
        scheduleDrawDarkPickerCanvas();
        updateColorFromPicker(hex);
      }
    });
  }

  // Eyedropper API Support
  if (btnPickerEyedropper) {
    if (!window.EyeDropper) {
      btnPickerEyedropper.style.display = 'none';
    } else {
      btnPickerEyedropper.addEventListener('click', async () => {
        try {
          btnPickerEyedropper.classList.add('active');
          const dropper = new window.EyeDropper();
          const result = await dropper.open();
          if (result?.sRGBHex) {
            const hex = result.sRGBHex;
            const hsv = hexToHsv(hex);
            currentHue = hsv.h;
            currentSat = hsv.s;
            currentVal = hsv.v;
            if (darkPickerHue) darkPickerHue.value = Math.round(currentHue);
            scheduleDrawDarkPickerCanvas();
            updateColorFromPicker(hex);
          }
        } catch {
          // Cancelled by user or unsupported
        } finally {
          btnPickerEyedropper.classList.remove('active');
        }
      });
    }
  }

  // Mini Swatches inside Dark Picker
  document.querySelectorAll('#dark-picker-swatches .picker-mini-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      if (!color) return;
      const hsv = hexToHsv(color);
      currentHue = hsv.h;
      currentSat = hsv.s;
      currentVal = hsv.v;
      if (darkPickerHue) darkPickerHue.value = Math.round(currentHue);
      scheduleDrawDarkPickerCanvas();
      updateColorFromPicker(color);
    });
  });

  // Open Popover on Swatch Buttons Click & Bind Text Inputs
  ['primary', 'secondary', 'bg', 'play'].forEach(target => {
    const swatchBtn = document.getElementById(`swatch-color-${target}`);
    if (swatchBtn) {
      swatchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDarkColorPicker(target, swatchBtn);
      });
    }

    const textInput = document.getElementById(`editor-color-${target}`);
    if (textInput) {
      textInput.addEventListener('input', () => {
        if (isUpdatingFromPicker) return;
        let val = textInput.value.trim().replace(/^#/, '');
        if (val.length === 3) {
          val = val.split('').map(c => c + c).join('');
        }
        if (val.length === 6 && /^[0-9a-fA-F]{6}$/.test(val)) {
          const hex = '#' + val;
          const swatch = document.getElementById(`swatch-color-${target}`);
          if (swatch) swatch.style.backgroundColor = hex;
          if (activeColorTarget === target && darkPickerPopover && !darkPickerPopover.classList.contains('hidden')) {
            const hsv = hexToHsv(hex);
            currentHue = hsv.h;
            currentSat = hsv.s;
            currentVal = hsv.v;
            if (darkPickerHue) darkPickerHue.value = Math.round(currentHue);
            if (darkPickerHexField) darkPickerHexField.value = val;
            if (darkPickerPreviewCircle) darkPickerPreviewCircle.style.backgroundColor = hex;
            if (darkPickerTargetDot) darkPickerTargetDot.style.backgroundColor = hex;
            scheduleDrawDarkPickerCanvas();
          }
          scheduleVisualEditorPreview();
        }
      });
    }
  });

  if (btnCloseDarkPicker) {
    btnCloseDarkPicker.addEventListener('click', () => {
      if (darkPickerPopover) darkPickerPopover.classList.add('hidden');
    });
  }

  if (btnApplyDarkColor) {
    btnApplyDarkColor.addEventListener('click', () => {
      if (darkPickerPopover) darkPickerPopover.classList.add('hidden');
    });
  }

  // Close Popover on Outside Click
  document.addEventListener('mousedown', (e) => {
    if (darkPickerPopover && !darkPickerPopover.classList.contains('hidden')) {
      if (!darkPickerPopover.contains(e.target) && !e.target.closest('.color-swatch-btn')) {
        darkPickerPopover.classList.add('hidden');
      }
    }
  });

  // Select Existing Theme Dropdown Listener
  const selectExistingTheme = document.getElementById('editor-select-existing-theme');
  if (selectExistingTheme) {
    selectExistingTheme.addEventListener('change', (e) => {
      if (e.target.value) {
        loadThemeIntoVisualEditor(e.target.value);
      }
    });
  }

  // Reset to Defaults (nouveau thème vierge)
  if (btnResetDefaults) {
    btnResetDefaults.addEventListener('click', () => {
      clearEditingContext();
      if (editorName) editorName.value = '';
      if (editorIcon) editorIcon.value = 'gem';
      if (editorTag) editorTag.value = 'Perso';
      if (editorStyle) editorStyle.value = 'cyber';
      if (editorLayout) editorLayout.value = 'top';
      if (editorFont) editorFont.value = 'Inter';
      if (editorPlayText) editorPlayText.value = 'JOUER';
      if (editorPlayIcon) editorPlayIcon.value = 'play';
      if (editorPlayCustomIcon) { editorPlayCustomIcon.value = ''; editorPlayCustomIcon.classList.add('hidden'); }
      if (editorSoundProfile) editorSoundProfile.value = 'laser_click';
      if (editorLaunchProfile) editorLaunchProfile.value = 'cyber_charge';
      if (editorBgImage) editorBgImage.value = '';
      if (editorBgBlur) editorBgBlur.value = '8px';
      if (editorBgBrightness) editorBgBrightness.value = '0.45';
      if (colPrimary) colPrimary.value = '#38bdf8';
      if (colSecondary) colSecondary.value = '#0284c7';
      if (colBg) colBg.value = '#0b1118';
      if (colPlay) colPlay.value = '#38bdf8';
      customAudioUploaded = '';
      if (typeof setVisualEditorCustomAudio === 'function') setVisualEditorCustomAudio('');
      if (labelCustomAudio) labelCustomAudio.textContent = 'Importer un fichier Audio (.mp3 / .wav / .ogg)';
      if (btnClearCustomAudio) btnClearCustomAudio.classList.add('hidden');

      refreshEditorSaveUI();

      if (selectExistingTheme) selectExistingTheme.value = '';

      updateVisualEditorPreview(true);
      showToast('Éditeur réinitialisé : prêt pour un nouveau thème.', 'info');
    });
  }

  function executeVisualEditorPreview() {
    const p = colPrimary ? colPrimary.value : '#38bdf8';
    const s = colSecondary ? colSecondary.value : '#0284c7';
    const bg = colBg ? colBg.value : '#0b1118';
    const play = colPlay ? colPlay.value : p;

    // Sync swatch button preview background colors
    const swatchP = document.getElementById('swatch-color-primary');
    const swatchS = document.getElementById('swatch-color-secondary');
    const swatchBg = document.getElementById('swatch-color-bg');
    const swatchPlay = document.getElementById('swatch-color-play');
    if (swatchP) swatchP.style.backgroundColor = p;
    if (swatchS) swatchS.style.backgroundColor = s;
    if (swatchBg) swatchBg.style.backgroundColor = bg;
    if (swatchPlay) swatchPlay.style.backgroundColor = play;

    const previewStage = document.getElementById('editor-preview-stage');
    const previewWallpaper = document.getElementById('preview-stage-wallpaper');
    const previewPlay = document.getElementById('editor-preview-play');
    const previewPlayIcon = document.getElementById('preview-play-icon');
    const previewPlayText = document.getElementById('preview-play-text');
    const previewAction = document.getElementById('editor-preview-action');
    const previewFontPill = document.getElementById('preview-font-pill');
    if (!previewStage || !previewPlay || !previewAction) return;

    const style = editorStyle ? editorStyle.value : 'cyber';
    const pText = editorPlayText ? editorPlayText.value : 'JOUER';
    let pIcon = editorPlayIcon ? editorPlayIcon.value : 'play';
    if (pIcon === 'custom' && editorPlayCustomIcon && editorPlayCustomIcon.value.trim()) {
      pIcon = editorPlayCustomIcon.value.trim();
    }
    const fFamily = editorFont ? editorFont.value : 'Inter';
    const bgBlur = editorBgBlur ? editorBgBlur.value : '8px';
    const bgBrightness = editorBgBrightness ? editorBgBrightness.value : '0.45';

    if (previewPlayText) previewPlayText.textContent = pText;
    if (previewPlayIcon) previewPlayIcon.innerHTML = getButtonIconSvg(pIcon);
    if (previewFontPill) previewFontPill.textContent = `Police : ${fFamily}`;

    // Apply font and colors
    previewStage.style.fontFamily = `'${fFamily}', 'Inter', system-ui, sans-serif`;
    previewStage.style.backgroundColor = bg;

    // Apply wallpaper overlay
    const bgUrl = editorBgImage ? editorBgImage.value.trim() : '';
    if (previewWallpaper) {
      if (bgUrl) {
        previewWallpaper.style.backgroundImage = `url("${bgUrl}")`;
        previewWallpaper.style.filter = `blur(${bgBlur}) brightness(${bgBrightness})`;
        previewWallpaper.style.opacity = '1';
        if (btnClearBgImage) btnClearBgImage.classList.remove('hidden');
      } else {
        previewWallpaper.style.backgroundImage = 'none';
        previewWallpaper.style.opacity = '0';
        if (btnClearBgImage) btnClearBgImage.classList.add('hidden');
      }
    }

    const pRgb = hexToRgb(p);
    const isPlayLight = isLightColor(play);
    const isBgLight = isLightColor(bg);

    // Play button dynamic styles & geometry
    previewPlay.style.background = `linear-gradient(135deg, ${play} 0%, ${s} 100%)`;
    previewPlay.style.borderColor = p;
    previewPlay.style.color = isPlayLight ? '#090d14' : '#ffffff';
    previewPlay.style.textShadow = isPlayLight ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.6)';
    previewPlay.style.boxShadow = `0 0 16px rgba(${pRgb}, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.3)`;

    if (previewAction) {
      previewAction.style.color = isBgLight ? '#090d14' : '#e2e8f0';
    }
    const previewBadge = document.querySelector('.preview-badge-chip');
    if (previewBadge) {
      previewBadge.style.color = isBgLight ? '#090d14' : '#e2e8f0';
      previewBadge.style.borderColor = isBgLight ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)';
      previewBadge.style.background = isBgLight ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.6)';
    }
    const previewStatus = document.querySelector('.preview-status-indicator');
    if (previewStatus) {
      previewStatus.style.color = isBgLight ? '#334155' : 'var(--text-muted)';
    }

    if (style === 'cyber') {
      previewPlay.style.clipPath = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
      previewPlay.style.borderRadius = '0';
      previewPlay.style.border = `1px solid ${p}`;
      previewAction.style.clipPath = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
      previewAction.style.borderRadius = '0';
      previewAction.style.borderColor = p;
      previewAction.style.background = isBgLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    } else if (style === 'forged') {
      previewPlay.style.clipPath = 'none';
      previewPlay.style.borderRadius = '6px';
      previewPlay.style.border = '1px solid rgba(255, 255, 255, 0.25)';
      previewPlay.style.borderBottom = '4px solid #000000';
      previewAction.style.clipPath = 'none';
      previewAction.style.borderRadius = '4px';
      previewAction.style.borderBottom = '3px solid #000000';
      previewAction.style.background = isBgLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    } else if (style === 'rounded') {
      previewPlay.style.clipPath = 'none';
      previewPlay.style.borderRadius = '24px';
      previewPlay.style.border = `1px solid ${p}`;
      previewAction.style.clipPath = 'none';
      previewAction.style.borderRadius = '16px';
      previewAction.style.borderColor = `rgba(${pRgb}, 0.4)`;
      previewAction.style.background = isBgLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    } else if (style === 'glass') {
      previewPlay.style.clipPath = 'none';
      previewPlay.style.borderRadius = '8px';
      previewPlay.style.border = `1px solid rgba(${pRgb}, 0.6)`;
      previewPlay.style.backdropFilter = 'blur(10px)';
      previewAction.style.clipPath = 'none';
      previewAction.style.borderRadius = '8px';
      previewAction.style.borderColor = `rgba(${pRgb}, 0.3)`;
      previewAction.style.background = isBgLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    } else {
      // Classic Minecraft
      previewPlay.style.clipPath = 'none';
      previewPlay.style.borderRadius = '4px';
      previewPlay.style.border = '2px solid rgba(255, 255, 255, 0.3)';
      previewPlay.style.borderBottom = '3px solid rgba(0, 0, 0, 0.6)';
      previewAction.style.clipPath = 'none';
      previewAction.style.borderRadius = '4px';
      previewAction.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      previewAction.style.background = isBgLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    }
  }

  function updateVisualEditorPreview(immediate = false) {
    if (immediate) {
      executeVisualEditorPreview();
    } else {
      scheduleVisualEditorPreview();
    }
  }

  setVisualEditorCustomAudio = (audioUri) => {
    customAudioUploaded = audioUri || '';
  };
  updateVisualEditorPreviewFn = updateVisualEditorPreview;

  [editorStyle, editorPlayText, editorPlayIcon, editorFont, editorBgImage, editorBgBlur, editorBgBrightness].forEach(el => {
    if (el) el.addEventListener('input', () => scheduleVisualEditorPreview());
    if (el) el.addEventListener('change', () => scheduleVisualEditorPreview());
  });

  // Save Visual Editor Theme Function
  // - Édition custom  -> mise à jour du custom (même id)
  // - Édition builtin -> override du thème par défaut (même id, ex: "sidebar")
  // - forceNew=true  -> TOUJOURS un nouveau custom-xxx avec le nom saisi
  //   ("Enregistrer sous… / créer un autre thème avec un autre nom")
  function saveThemeFromEditor(forceNew = false) {
    const name = (editorName?.value || '').trim() || 'Mon Thème';
    const icon = (editorIcon?.value || '').trim() || 'custom';
    const tag = (editorTag?.value || '').trim() || 'Perso';
    const styleMode = editorStyle?.value || 'cyber';
    const layout = normalizeNavLayout(editorLayout?.value);
    const fontFamily = editorFont?.value || 'Inter';
    const playText = editorPlayText?.value || 'JOUER';
    let playIcon = (editorPlayIcon?.value || 'play').trim();
    if (playIcon === 'custom' && editorPlayCustomIcon && editorPlayCustomIcon.value.trim()) {
      playIcon = editorPlayCustomIcon.value.trim();
    }
    const soundProfile = editorSoundProfile?.value || 'laser_click';
    const launchSoundProfile = editorLaunchProfile?.value || 'cyber_charge';
    const bgImage = editorBgImage?.value?.trim() || '';
    const bgBlur = editorBgBlur?.value || '8px';
    const bgBrightness = parseFloat(editorBgBrightness?.value || '0.45');

    const p = colPrimary?.value || '#38bdf8';
    const s = colSecondary?.value || '#0284c7';
    const bg = colBg?.value || '#0b1118';
    const play = colPlay?.value || p;

    const ctx = getEditingContext();
    const desc = ctx.kind === 'builtin'
      ? `Thème par défaut personnalisé (${styleMode}).`
      : `Thème personnalisé créé dans l'éditeur visuel (${styleMode}).`;

    const isPrimaryLight = isLightColor(p);
    const isPlayLight = isLightColor(play);
    const isBgLight = isLightColor(bg);

    const buildColors = () => ({
      primary: p,
      primaryHover: p,
      primaryDark: s,
      bevelTop: isPrimaryLight ? '#000000' : '#ffffff',
      bevelBottom: '#000000',
      accentRgb: hexToRgb(p),
      accentRgb2: hexToRgb(s),
      bgDark: bg,
      bgDarkRgb: hexToRgb(bg),
      panelBg: isBgLight ? `rgba(${hexToRgb(bg)}, 0.92)` : `rgba(${hexToRgb(bg)}, 0.85)`,
      playGradientA: play,
      playGradientB: s,
      playGradientHoverA: play,
      playGradientHoverB: s,
      playText: isPlayLight ? '#090d14' : '#ffffff',
      validateGradientA: p,
      validateGradientB: s,
      validateBorder: p,
      validateText: isPrimaryLight ? '#090d14' : '#ffffff',
      heroCardA: isBgLight ? `rgba(${hexToRgb(bg)}, 0.96)` : `rgba(${hexToRgb(bg)}, 0.95)`,
      heroCardB: isBgLight ? `rgba(${hexToRgb(bg)}, 0.88)` : `rgba(${hexToRgb(bg)}, 0.85)`
    });

    const buildImagesAudio = () => ({
      backgroundImage: bgImage,
      backgroundBlur: bgBlur,
      backgroundBrightness: bgBrightness,
      playButtonText: playText,
      playButtonIcon: playIcon
    });

    const buildAudio = () => ({
      soundProfile,
      launchSoundProfile,
      customClickSound: customAudioUploaded,
      customLaunchSound: customAudioUploaded
    });

    // --- Cas 1 : "Enregistrer sous…" -> nouveau thème avec le nom saisi ---
    if (forceNew) {
      const nameTaken = getAllThemes().some(t => t.name.trim().toLowerCase() === name.toLowerCase());
      if (nameTaken) {
        showToast(`Un thème s'appelle déjà "${name}". Choisissez un autre nom pour créer un nouveau thème.`, 'error', 3500);
        if (editorName) editorName.focus();
        return;
      }
      const slugBase = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'theme';
      const themeId = `custom-${slugBase}-${Date.now().toString(36)}`;
      const themeObj = {
        id: themeId, name, icon, tag, desc, author: 'Moi',
        styleMode, layout, fontFamily,
        images: buildImagesAudio(), audio: buildAudio(), colors: buildColors()
      };
      saveCustomTheme(themeObj, true);
      currentEditingThemeId = themeId;
      currentEditingBuiltinId = null;
      refreshEditorSaveUI();
      populateExistingThemesDropdown();
      const sel = document.getElementById('editor-select-existing-theme');
      if (sel) sel.value = themeId;
      if (modal) modal.classList.add('hidden');
      showToast(`Nouveau thème "${name}" créé et activé !`, 'info', 2500);
      return;
    }

    // --- Cas 2 : mise à jour d'un custom existant ---
    if (ctx.kind === 'custom') {
      const themeId = ctx.id;
      const themeObj = {
        id: themeId, name, icon, tag, desc, author: 'Moi',
        styleMode, layout, fontFamily,
        images: buildImagesAudio(), audio: buildAudio(), colors: buildColors()
      };
      saveCustomTheme(themeObj, true);
      refreshEditorSaveUI();
      populateExistingThemesDropdown();
      if (modal) modal.classList.add('hidden');
      showToast(`Thème "${name}" mis à jour et activé avec succès !`, 'info', 2500);
      return;
    }

    // --- Cas 3 : modification d'un thème par défaut (override, même id) ---
    if (ctx.kind === 'builtin') {
      const builtinId = ctx.id;
      const themeObj = {
        id: builtinId, name, icon, tag, desc, author: 'Moi (défaut modifié)',
        styleMode, layout, fontFamily, builtin: true,
        images: buildImagesAudio(), audio: buildAudio(), colors: buildColors()
      };
      saveBuiltinOverride(themeObj, true);
      populateExistingThemesDropdown();
      const sel = document.getElementById('editor-select-existing-theme');
      if (sel) sel.value = builtinId;
      if (modal) modal.classList.add('hidden');
      showToast(`Thème par défaut "${name}" modifié et activé !`, 'info', 2500);
      return;
    }

    // --- Cas 4 : création depuis zéro ---
    if (getAllThemes().some(t => t.name.trim().toLowerCase() === name.toLowerCase())) {
      showToast(`Un thème s'appelle déjà "${name}". Choisissez un autre nom.`, 'error', 3500);
      if (editorName) editorName.focus();
      return;
    }
    const slugBase = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'theme';
    const themeId = `custom-${slugBase}-${Date.now().toString(36)}`;
    const themeObj = {
      id: themeId, name, icon, tag, desc, author: 'Moi',
      styleMode, layout, fontFamily,
      images: buildImagesAudio(), audio: buildAudio(), colors: buildColors()
    };
    saveCustomTheme(themeObj, true);
    currentEditingThemeId = themeId;
    currentEditingBuiltinId = null;
    refreshEditorSaveUI();
    populateExistingThemesDropdown();
    const sel = document.getElementById('editor-select-existing-theme');
    if (sel) sel.value = themeId;
    if (modal) modal.classList.add('hidden');
    showToast(`Nouveau thème "${name}" créé et activé !`, 'info', 2500);
  }

  // Save / Update Visual Editor Theme Button
  const btnSaveEditor = document.getElementById('btn-save-editor-theme');
  if (btnSaveEditor) {
    btnSaveEditor.addEventListener('click', () => {
      saveThemeFromEditor(false);
    });
  }

  // Save as New Clone Button
  const btnSaveAsNew = document.getElementById('btn-editor-save-as-new');
  if (btnSaveAsNew) {
    btnSaveAsNew.addEventListener('click', () => {
      saveThemeFromEditor(true);
    });
  }
}

const closeOnLaunchToggle = document.getElementById('settings-close-on-launch');
if (closeOnLaunchToggle) {
  closeOnLaunchToggle.addEventListener('change', (e) => {
    window.launcher.saveConfig({ closeOnLaunch: e.target.checked });
  });
}

const minimizeOnLaunchToggle = document.getElementById('settings-minimize-on-launch');
if (minimizeOnLaunchToggle) {
  minimizeOnLaunchToggle.addEventListener('change', (e) => {
    window.launcher.saveConfig({ minimizeOnLaunch: e.target.checked });
  });
}

// ============================================================
// YAPAPOUAIYE CLIENT PAGE CONTROLLER & HUD SIMULATOR
// (Les toggles "Modules en Jeu" des paramètres ont été retirés :
// tout se règle depuis la page Client ou le menu en jeu [Shift Droit].)
// ============================================================
const ycToggleFullBright = document.getElementById('yc-toggle-fullbright');
const ycToggleNightVision = document.getElementById('yc-toggle-nightvision');
const ycToggleNoFog = document.getElementById('yc-toggle-nofog');
const ycToggleFpsBoost = document.getElementById('yc-toggle-fpsboost');
const ycToggleZoom = document.getElementById('yc-toggle-zoom');
const ycToggleKeystrokes = document.getElementById('yc-toggle-keystrokes');
const ycToggleArmorHud = document.getElementById('yc-toggle-armorhud');
const ycToggleSpeed = document.getElementById('yc-toggle-speed');
const ycToggleFps = document.getElementById('yc-toggle-fps');
const ycTogglePing = document.getElementById('yc-toggle-ping');

const hudPreviewViewport = document.getElementById('hud-preview-viewport');
const hudElemKeystrokes = document.getElementById('hud-elem-keystrokes');
const hudElemArmor = document.getElementById('hud-elem-armor');
const hudElemSpeed = document.getElementById('hud-elem-speed');
const hudElemCoords = document.getElementById('hud-elem-coords');
const hudElemFps = document.getElementById('hud-elem-fps');
const hudSimFps = document.getElementById('hud-sim-fps');
const hudSimPing = document.getElementById('hud-sim-ping');
const hudFullbrightAmbient = document.getElementById('hud-fullbright-ambient');
const hudBackdrop = document.getElementById('hud-backdrop');
const btnToggleHudAmbient = document.getElementById('btn-toggle-hud-ambient');
const btnResetHudPositions = document.getElementById('btn-reset-hud-positions');

const DEFAULT_HUD_POSITIONS = {
  coordsX: 492,
  coordsY: 8,
  cpsX: 520,
  cpsY: 260,
  armorX: 8,
  armorY: 230,
  speedX: 8,
  speedY: 34,
  fpsX: 8,
  fpsY: 8,
  pingX: 8,
  pingY: 8,
};

let currentHudPositions = { ...DEFAULT_HUD_POSITIONS };

function updateModuleBadge(badgeId, isActive) {
  const el = document.getElementById(badgeId);
  if (!el) return;
  el.textContent = isActive ? 'Actif' : 'Désactivé';
  el.classList.toggle('active', !!isActive);
}

// Colore les jauges de durabilité d'armure (vert / orange / rouge)
// à partir des attributs data-cur / data-max de chaque pièce.
function refreshArmorDurability() {
  document.querySelectorAll('#hud-elem-armor .armor-slot').forEach((slot) => {
    const cur = parseInt(slot.dataset.cur || '0', 10);
    const max = parseInt(slot.dataset.max || '1', 10) || 1;
    const pct = Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
    const fill = slot.querySelector('.dur-fill');
    if (fill) {
      fill.style.width = `${pct}%`;
      fill.classList.remove('high', 'mid', 'low');
      fill.classList.add(pct > 60 ? 'high' : pct > 30 ? 'mid' : 'low');
    }
  });
}

function applyHudElementPosition(element, mcX, mcY) {
  if (!element || !hudPreviewViewport) return;
  const vW = hudPreviewViewport.clientWidth;
  const vH = hudPreviewViewport.clientHeight;
  if (!vW || !vH) return;
  const scaleX = vW / 640;
  const scaleY = vH / 360;
  const maxLeft = Math.max(0, vW - element.offsetWidth);
  const maxTop = Math.max(0, vH - element.offsetHeight);
  const left = Math.min(maxLeft, Math.max(0, Math.round(mcX * scaleX)));
  const top = Math.min(maxTop, Math.max(0, Math.round(mcY * scaleY)));
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.style.right = 'auto';
  element.style.bottom = 'auto';
}

function applyAllHudPositions(positions) {
  if (positions && typeof positions === 'object') {
    currentHudPositions = { ...currentHudPositions, ...positions };
  }
  const p = currentHudPositions;
  applyHudElementPosition(hudElemFps, p.fpsX ?? 8, p.fpsY ?? 8);
  applyHudElementPosition(hudElemSpeed, p.speedX ?? 8, p.speedY ?? 34);
  applyHudElementPosition(hudElemCoords, p.coordsX ?? 492, p.coordsY ?? 8);
  applyHudElementPosition(hudElemArmor, p.armorX ?? 8, p.armorY ?? 230);
  applyHudElementPosition(hudElemKeystrokes, p.cpsX ?? 520, p.cpsY ?? 260);
}

function makeHudElementDraggable(element, getKeys) {
  if (!element || !hudPreviewViewport) return;

  element.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();

    element.classList.add('is-dragging');
    element.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const origLeft = element.offsetLeft;
    const origTop = element.offsetTop;
    let hasMoved = false;

    const onPointerMove = (moveEv) => {
      hasMoved = true;
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;

      const vW = hudPreviewViewport.clientWidth;
      const vH = hudPreviewViewport.clientHeight;
      const maxLeft = Math.max(0, vW - element.offsetWidth);
      const maxTop = Math.max(0, vH - element.offsetHeight);

      const newLeft = Math.min(maxLeft, Math.max(0, origLeft + dx));
      const newTop = Math.min(maxTop, Math.max(0, origTop + dy));

      element.style.left = `${newLeft}px`;
      element.style.top = `${newTop}px`;
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    };

    const onPointerUp = async (upEv) => {
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
      try { element.releasePointerCapture(upEv.pointerId); } catch {}
      element.classList.remove('is-dragging');

      if (!hasMoved) return;

      const vW = hudPreviewViewport.clientWidth || 640;
      const vH = hudPreviewViewport.clientHeight || 220;
      const scaleX = vW / 640;
      const scaleY = vH / 360;

      const curLeft = element.offsetLeft;
      const curTop = element.offsetTop;
      const mcX = Math.round(curLeft / scaleX);
      const mcY = Math.round(curTop / scaleY);

      const keys = getKeys();
      const updatedPatch = {};
      if (keys.x) updatedPatch[keys.x] = mcX;
      if (keys.y) updatedPatch[keys.y] = mcY;
      if (keys.extra) {
        for (const [k, v] of Object.entries(keys.extra(mcX, mcY))) {
          updatedPatch[k] = v;
        }
      }

      currentHudPositions = { ...currentHudPositions, ...updatedPatch };

      try {
        if (window.launcher.saveClientMods) {
          await window.launcher.saveClientMods({ hudPositions: updatedPatch });
        }
      } catch (err) {
        console.error('[HUD] Erreur lors de la sauvegarde de la position HUD:', err);
      }
    };

    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
  });
}

// Initialise le glisser-déposer sur tous les widgets du simulateur HUD
makeHudElementDraggable(hudElemCoords, () => ({ x: 'coordsX', y: 'coordsY' }));
makeHudElementDraggable(hudElemFps, () => ({ x: 'fpsX', y: 'fpsY', extra: (x, y) => ({ pingX: x, pingY: y }) }));
makeHudElementDraggable(hudElemSpeed, () => ({ x: 'speedX', y: 'speedY' }));
makeHudElementDraggable(hudElemArmor, () => ({ x: 'armorX', y: 'armorY' }));
makeHudElementDraggable(hudElemKeystrokes, () => ({ x: 'cpsX', y: 'cpsY' }));

if (btnResetHudPositions) {
  btnResetHudPositions.addEventListener('click', async () => {
    currentHudPositions = { ...DEFAULT_HUD_POSITIONS };
    applyAllHudPositions(currentHudPositions);
    try {
      if (window.launcher.saveClientMods) {
        await window.launcher.saveClientMods({ hudPositions: DEFAULT_HUD_POSITIONS });
      }
      playMinecraftClickSound();
      showToast('✦ Positions par défaut rétablies !', 'info', 2500);
    } catch (err) {
      console.error('[HUD] Erreur reset positions:', err);
    }
  });
}

window.addEventListener('resize', () => {
  const pageClient = document.getElementById('page-client');
  if (pageClient && pageClient.classList.contains('active')) {
    applyAllHudPositions(currentHudPositions);
  }
});

if (window.launcher && window.launcher.onClientModsUpdated) {
  window.launcher.onClientModsUpdated((refreshedMods) => {
    if (!refreshedMods) return;
    if (refreshedMods.hudPositions) {
      currentHudPositions = { ...currentHudPositions, ...refreshedMods.hudPositions };
      applyAllHudPositions(currentHudPositions);
    }
    updateHudSimulator(refreshedMods);
  });
}

function updateHudSimulator(mods) {
  if (!mods) return;
  const isFullBright = mods.fullBright !== undefined ? !!mods.fullBright.enabled : (!!mods.nightVision?.enabled);
  const isNightVision = !!mods.nightVision?.enabled;
  const isKeystrokes = mods.keystrokes ? !!mods.keystrokes.enabled : true;
  const isArmorHud = mods.armorHud ? !!mods.armorHud.enabled : true;
  const isSpeed = mods.speed ? !!mods.speed.enabled : true;
  const isFps = mods.fps ? !!mods.fps.enabled : true;
  const isPing = mods.ping ? !!mods.ping.enabled : true;
  const isCoords = mods.coordinates !== undefined ? !!mods.coordinates.enabled : true;

  if (hudFullbrightAmbient) {
    hudFullbrightAmbient.classList.toggle('off', !isFullBright);
  }
  if (hudBackdrop) {
    hudBackdrop.classList.toggle('fullbright', isFullBright);
  }
  if (hudElemKeystrokes) {
    hudElemKeystrokes.style.display = isKeystrokes ? 'flex' : 'none';
  }
  if (hudElemArmor) {
    hudElemArmor.style.display = isArmorHud ? 'flex' : 'none';
  }
  if (hudElemSpeed) {
    hudElemSpeed.style.display = isSpeed ? 'flex' : 'none';
  }
  if (hudElemCoords) {
    hudElemCoords.style.display = isCoords ? 'flex' : 'none';
  }
  if (hudSimFps) {
    hudSimFps.style.display = isFps ? '' : 'none';
  }
  if (hudSimPing) {
    hudSimPing.style.display = isPing ? '' : 'none';
  }
  if (hudElemFps) {
    hudElemFps.style.display = (isFps || isPing) ? 'flex' : 'none';
  }

  const floatingToast = document.getElementById('hud-floating-toast');
  if (floatingToast) {
    const act = [];
    if (isFullBright) act.push('FullBright');
    if (isNightVision) act.push('Night Vision');
    if (mods.noFog?.enabled) act.push('NoFog');
    if (act.length > 0) {
      const msgEl = floatingToast.querySelector('.toast-msg');
      if (msgEl) msgEl.textContent = act.join(' & ') + ' [ ACTIVÉ ]';
      floatingToast.style.display = 'flex';
    } else {
      const msgEl = floatingToast.querySelector('.toast-msg');
      if (msgEl) msgEl.textContent = 'Modules par défaut [ PRÊT ]';
    }
  }

  refreshArmorDurability();

  if (mods.hudPositions) {
    requestAnimationFrame(() => applyAllHudPositions(mods.hudPositions));
  }
}

async function loadClientPageSettings() {
  try {
    const mods = window.launcher.getClientMods ? await window.launcher.getClientMods() : null;
    if (!mods) return;

    if (ycToggleFullBright) ycToggleFullBright.checked = mods.fullBright !== undefined ? !!mods.fullBright.enabled : true;
    if (ycToggleNightVision) ycToggleNightVision.checked = !!mods.nightVision?.enabled;
    if (ycToggleNoFog) ycToggleNoFog.checked = !!mods.noFog?.enabled;
    if (ycToggleFpsBoost) ycToggleFpsBoost.checked = !!mods.fpsBoost?.enabled;
    if (ycToggleZoom) ycToggleZoom.checked = (mods.zoom !== undefined) ? !!mods.zoom.enabled : true;
    if (ycToggleKeystrokes) ycToggleKeystrokes.checked = mods.keystrokes ? !!mods.keystrokes.enabled : true;
    if (ycToggleArmorHud) ycToggleArmorHud.checked = mods.armorHud ? !!mods.armorHud.enabled : true;
    if (ycToggleSpeed) ycToggleSpeed.checked = mods.speed ? !!mods.speed.enabled : true;
    if (ycToggleFps) ycToggleFps.checked = mods.fps ? !!mods.fps.enabled : true;
    if (ycTogglePing) ycTogglePing.checked = mods.ping ? !!mods.ping.enabled : true;

    updateModuleBadge('badge-status-fullbright', mods.fullBright !== undefined ? mods.fullBright.enabled : true);
    updateModuleBadge('badge-status-nightvision', mods.nightVision?.enabled);
    updateModuleBadge('badge-status-nofog', mods.noFog?.enabled);
    updateModuleBadge('badge-status-fpsboost', mods.fpsBoost?.enabled);
    updateModuleBadge('badge-status-zoom', mods.zoom !== undefined ? mods.zoom.enabled : true);
    updateModuleBadge('badge-status-keystrokes', mods.keystrokes ? mods.keystrokes.enabled : true);
    updateModuleBadge('badge-status-armorhud', mods.armorHud ? mods.armorHud.enabled : true);
    updateModuleBadge('badge-status-speed', mods.speed ? mods.speed.enabled : true);
    updateModuleBadge('badge-status-fps', mods.fps ? mods.fps.enabled : true);
    updateModuleBadge('badge-status-ping', mods.ping ? mods.ping.enabled : true);

    updateHudSimulator(mods);
    if (mods.hudPositions) {
      requestAnimationFrame(() => applyAllHudPositions(mods.hudPositions));
    }
  } catch (err) {
    console.error('[Yapapouaiye Client] Error loading client page settings:', err);
  }
}

async function updateYcModule(key, enabled, badgeId) {
  try {
    const current = window.launcher.getClientMods ? await window.launcher.getClientMods() : {};
    const updated = {
      ...current,
      [key]: {
        ...(current[key] || {}),
        enabled: !!enabled
      }
    };
    if (window.launcher.saveClientMods) await window.launcher.saveClientMods(updated);
    if (window.launcher.applyClientMods) await window.launcher.applyClientMods(updated);

    updateModuleBadge(badgeId, enabled);
    updateHudSimulator(updated);

    playMinecraftClickSound();
    showToast(`✦ Yapapouaiye Client : ${enabled ? 'Activé' : 'Désactivé'} avec succès !`, 'success', 2500);
  } catch (err) {
    console.error('[Yapapouaiye Client] Error updating module:', err);
    showToast('Erreur lors de la sauvegarde du module client', 'error');
  }
}

if (ycToggleFullBright) ycToggleFullBright.addEventListener('change', (e) => updateYcModule('fullBright', e.target.checked, 'badge-status-fullbright'));
if (ycToggleNightVision) ycToggleNightVision.addEventListener('change', (e) => updateYcModule('nightVision', e.target.checked, 'badge-status-nightvision'));
if (ycToggleNoFog) ycToggleNoFog.addEventListener('change', (e) => updateYcModule('noFog', e.target.checked, 'badge-status-nofog'));
if (ycToggleFpsBoost) ycToggleFpsBoost.addEventListener('change', (e) => updateYcModule('fpsBoost', e.target.checked, 'badge-status-fpsboost'));
if (ycToggleZoom) ycToggleZoom.addEventListener('change', (e) => updateYcModule('zoom', e.target.checked, 'badge-status-zoom'));
if (ycToggleKeystrokes) ycToggleKeystrokes.addEventListener('change', (e) => updateYcModule('keystrokes', e.target.checked, 'badge-status-keystrokes'));
if (ycToggleArmorHud) ycToggleArmorHud.addEventListener('change', (e) => updateYcModule('armorHud', e.target.checked, 'badge-status-armorhud'));
if (ycToggleSpeed) ycToggleSpeed.addEventListener('change', (e) => updateYcModule('speed', e.target.checked, 'badge-status-speed'));
if (ycToggleFps) ycToggleFps.addEventListener('change', (e) => updateYcModule('fps', e.target.checked, 'badge-status-fps'));
if (ycTogglePing) ycTogglePing.addEventListener('change', (e) => updateYcModule('ping', e.target.checked, 'badge-status-ping'));

if (btnToggleHudAmbient) {
  btnToggleHudAmbient.addEventListener('click', () => {
    if (ycToggleFullBright) {
      ycToggleFullBright.checked = !ycToggleFullBright.checked;
      ycToggleFullBright.dispatchEvent(new Event('change'));
    }
  });
}

// Première peinture des chiffres/couleurs de durabilité d'armure
try { refreshArmorDurability(); } catch {}

const clientFilterPills = document.querySelectorAll('.filter-pill');
clientFilterPills.forEach(pill => {
  pill.addEventListener('click', () => {
    clientFilterPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const cat = pill.dataset.category;
    const cards = document.querySelectorAll('.client-module-card');
    cards.forEach(card => {
      if (cat === 'all' || card.dataset.category === cat) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
    playMinecraftClickSound();
  });
});

const btnClientEnableAll = document.getElementById('btn-client-enable-all');
if (btnClientEnableAll) {
  btnClientEnableAll.addEventListener('click', async () => {
    const updated = {
      fullBright: { enabled: true, gammaLevel: 100 },
      nightVision: { enabled: true, gammaLevel: 100 },
      noFog: { enabled: true },
      fpsBoost: { enabled: true, fastMath: true },
      zoom: { enabled: true, smoothZoom: true, keybind: 'C' },
      keystrokes: { enabled: true },
      armorHud: { enabled: true },
      speed: { enabled: true },
      fps: { enabled: true },
      ping: { enabled: true },
      coordinates: { enabled: true },
      cps: { enabled: true }
    };
    if (window.launcher.saveClientMods) await window.launcher.saveClientMods(updated);
    if (window.launcher.applyClientMods) await window.launcher.applyClientMods(updated);
    loadClientPageSettings();
    playMinecraftClickSound();
    showToast('✦ Tous les modules Yapapouaiye Client ont été activés !', 'success', 3000);
  });
}

const btnClientResetDefaults = document.getElementById('btn-client-reset-defaults');
if (btnClientResetDefaults) {
  btnClientResetDefaults.addEventListener('click', async () => {
    const updated = {
      fullBright: { enabled: true, gammaLevel: 100 },
      nightVision: { enabled: true, gammaLevel: 100 },
      noFog: { enabled: false },
      fpsBoost: { enabled: true, fastMath: true },
      zoom: { enabled: true, smoothZoom: true, keybind: 'C' },
      keystrokes: { enabled: true },
      armorHud: { enabled: true },
      speed: { enabled: true },
      fps: { enabled: true },
      ping: { enabled: true },
      coordinates: { enabled: true },
      cps: { enabled: true },
      hudPositions: { ...DEFAULT_HUD_POSITIONS }
    };
    if (window.launcher.saveClientMods) await window.launcher.saveClientMods(updated);
    if (window.launcher.applyClientMods) await window.launcher.applyClientMods(updated);
    loadClientPageSettings();
    playMinecraftClickSound();
    showToast('✦ Configuration par défaut rétablie !', 'info', 3000);
  });
}

const btnClientSyncNow = document.getElementById('btn-client-sync-now');
if (btnClientSyncNow) {
  btnClientSyncNow.addEventListener('click', async () => {
    btnClientSyncNow.disabled = true;
    try {
      const current = window.launcher.getClientMods ? await window.launcher.getClientMods() : {};
      if (window.launcher.applyClientMods) await window.launcher.applyClientMods(current);
      playMinecraftClickSound();
      showToast('✦ Options synchronisées avec le moteur Minecraft !', 'success', 3000);
    } catch (err) {
      showToast('Erreur lors de la synchronisation', 'error');
    } finally {
      btnClientSyncNow.disabled = false;
    }
  });
}



// Open Mods Folder Button — ouvre le VRAI dossier d'installation des mods
// du serveur actif (là où la synchro télécharge), pas un dossier vide.
const btnOpenCustomMods = document.getElementById('btn-open-custom-mods');
if (btnOpenCustomMods) {
  btnOpenCustomMods.title = 'Ouvrir le dossier des mods installés du serveur actif';
  btnOpenCustomMods.addEventListener('click', async () => {
    try {
      if (window.launcher.openServerMods) {
        await window.launcher.openServerMods(currentServerId);
      } else {
        window.launcher.openCustomMods();
      }
    } catch {
      window.launcher.openCustomMods();
    }
  });
}

// ============================================================
// Verrouillage lancement : mot de passe + "Retenir ce PC"
// (empreinte carte mère côté main). Le bouton JOUER est bloqué
// tant que le PC n'est ni retenu ni déverrouillé.
// ============================================================
let launchLockStatusCache = null;

async function fetchLaunchLockStatus(force = false) {
  if (launchLockStatusCache && !force) return launchLockStatusCache;
  try {
    if (!window.launcher.getLaunchLockStatus) return { enabled: false };
    const st = await window.launcher.getLaunchLockStatus();
    if (st && st.success !== false) launchLockStatusCache = st;
    return st || { enabled: false };
  } catch {
    return { enabled: false };
  }
}

function openLaunchLockModal(status) {
  const modal = document.getElementById('modal-launch-lock');
  const input = document.getElementById('launch-lock-password');
  const err = document.getElementById('launch-lock-error');
  const subtitle = document.getElementById('launch-lock-subtitle');
  const newpc = document.getElementById('launch-lock-newpc');
  const remember = document.getElementById('launch-lock-remember');
  if (!modal) return;
  const needsReauth = !!(status && status.needsReauth);
  if (subtitle) {
    subtitle.textContent = needsReauth
      ? 'Ce PC (ou sa carte mère) a changé : entrez le mot de passe pour rejouer.'
      : 'Entrez le mot de passe pour lancer le jeu.';
  }
  if (newpc) newpc.classList.toggle('hidden', !needsReauth);
  if (err) { err.textContent = ''; err.classList.add('hidden'); }
  if (input) { input.value = ''; input.disabled = false; }
  if (remember) { remember.checked = true; remember.disabled = false; }
  const submit = document.getElementById('btn-launch-lock-submit');
  if (submit) { submit.disabled = false; submit.textContent = 'Déverrouiller & Jouer'; }
  modal.classList.remove('hidden');
  setTimeout(() => { try { input.focus(); } catch {} }, 60);
}

function closeLaunchLockModal() {
  document.getElementById('modal-launch-lock')?.classList.add('hidden');
}

function setLaunchLockError(msg) {
  const err = document.getElementById('launch-lock-error');
  if (!err) return;
  if (!msg) { err.textContent = ''; err.classList.add('hidden'); return; }
  err.textContent = msg;
  err.classList.remove('hidden');
}

async function handleLaunchLockSubmit() {
  const input = document.getElementById('launch-lock-password');
  const remember = document.getElementById('launch-lock-remember');
  const submit = document.getElementById('btn-launch-lock-submit');
  const password = (input?.value || '');
  if (!password) { setLaunchLockError('Entrez le mot de passe.'); input?.focus(); return; }
  if (submit) { submit.disabled = true; submit.textContent = 'Vérification...'; }
  setLaunchLockError('');
  try {
    const res = await window.launcher.verifyLaunchPassword({ password, rememberPC: !!remember?.checked });
    if (res && res.success) {
      launchLockStatusCache = null;
      closeLaunchLockModal();
      if (res.trusted) showToast('Ce PC est retenu : plus de mot de passe sur cette carte mère.', 'success', 3500);
      else showToast('Jeu déverrouillé, bon jeu !', 'success', 2500);
      refreshLaunchLockSettings();
      doLaunchGame();
    } else {
      setLaunchLockError((res && res.error) || 'Mot de passe incorrect.');
      if (submit) { submit.disabled = false; submit.textContent = 'Déverrouiller & Jouer'; }
      input?.select?.();
    }
  } catch (e) {
    setLaunchLockError('Erreur de vérification.');
    if (submit) { submit.disabled = false; submit.textContent = 'Déverrouiller & Jouer'; }
  }
}

(function initLaunchLockModal() {
  const cancel = document.getElementById('btn-launch-lock-cancel');
  if (cancel) cancel.addEventListener('click', () => { playMinecraftClickSound(); closeLaunchLockModal(); });
  const submit = document.getElementById('btn-launch-lock-submit');
  if (submit) submit.addEventListener('click', () => { playMinecraftClickSound(); handleLaunchLockSubmit(); });
  const input = document.getElementById('launch-lock-password');
  if (input) input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleLaunchLockSubmit(); }
    if (e.key === 'Escape') closeLaunchLockModal();
  });
  const modal = document.getElementById('modal-launch-lock');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeLaunchLockModal(); });
})();

(function initMaintenanceAndCodesModals() {
  const btnCloseMaint = document.getElementById('btn-maintenance-close');
  if (btnCloseMaint) btnCloseMaint.addEventListener('click', () => { playMinecraftClickSound(); closeMaintenanceModal(); });
  const btnSettings = document.getElementById('btn-maintenance-settings');
  if (btnSettings) btnSettings.addEventListener('click', () => {
    playMinecraftClickSound();
    closeMaintenanceModal();
    const settingsTab = document.querySelector('.nav-item[data-page="settings"]');
    if (settingsTab) settingsTab.click();
  });
  const modalMaint = document.getElementById('modal-maintenance');
  if (modalMaint) modalMaint.addEventListener('click', (e) => { if (e.target === modalMaint) closeMaintenanceModal(); });

  const btnCancelCodes = document.getElementById('btn-server-codes-cancel');
  if (btnCancelCodes) btnCancelCodes.addEventListener('click', () => { playMinecraftClickSound(); closeServerCodesModal(); });
  const btnSubmitCodes = document.getElementById('btn-server-codes-submit');
  if (btnSubmitCodes) btnSubmitCodes.addEventListener('click', () => { playMinecraftClickSound(); submitServerCodes(); });
  const modalCodes = document.getElementById('modal-server-codes');
  if (modalCodes) modalCodes.addEventListener('click', (e) => { if (e.target === modalCodes) closeServerCodesModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modalCodes && !modalCodes.classList.contains('hidden')) closeServerCodesModal();
    else if (modalMaint && !modalMaint.classList.contains('hidden')) closeMaintenanceModal();
  });
})();

// Paramètres : carte "Protection par mot de passe"
function formatLockDate(iso) {
  try {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

async function refreshLaunchLockSettings() {
  try {
    const st = await fetchLaunchLockStatus(true);
    const badge = document.getElementById('lock-status-badge');
    const toggle = document.getElementById('settings-lock-enabled');
    const curRow = document.getElementById('lock-current-row');
    const saveLabel = document.getElementById('lock-save-label');
    const btnSave = document.getElementById('btn-lock-save');
    const btnDisable = document.getElementById('btn-lock-disable');
    const trustedDesc = document.getElementById('lock-trusted-desc');
    const enabled = !!(st && st.enabled);
    if (badge) {
      if (!enabled) { badge.textContent = 'Désactivée'; }
      else if (st.isTrusted) { badge.textContent = 'Activée • PC retenu'; }
      else if (st.needsReauth) { badge.textContent = 'Activée • Nouveau PC'; }
      else { badge.textContent = 'Activée'; }
    }
    if (toggle) toggle.checked = enabled;
    if (curRow) curRow.classList.toggle('hidden', !enabled);
    if (saveLabel) saveLabel.textContent = enabled ? 'Changer le mot de passe' : 'Activer la protection';
    if (btnSave) btnSave.textContent = enabled ? 'Changer' : 'Activer';
    if (btnDisable) btnDisable.classList.toggle('hidden', !enabled);
    if (trustedDesc) {
      if (!enabled) trustedDesc.textContent = 'Protection désactivée : aucun mot de passe demandé.';
      else if (st.isTrusted) trustedDesc.textContent = `Ce PC est retenu${st.trustedDeviceName ? ` (${st.trustedDeviceName})` : ''}${st.trustedAt ? ` depuis le ${formatLockDate(st.trustedAt)}` : ''} — le jeu se lance sans mot de passe ici.`;
      else if (st.needsReauth) trustedDesc.textContent = 'Carte mère différente détectée : le mot de passe sera redemandé, puis recochez « Retenir ce PC » pour enregistrer ce PC.';
      else trustedDesc.textContent = 'Aucun PC retenu : le mot de passe sera demandé à chaque lancement.';
    }
  } catch (e) {
    console.warn('[LaunchLock] refresh settings failed:', e);
  }
}

function clearLockInputs() {
  for (const id of ['lock-current-password', 'lock-new-password', 'lock-confirm-password']) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  }
}

(function initLaunchLockSettings() {
  const btnSave = document.getElementById('btn-lock-save');
  if (btnSave) btnSave.addEventListener('click', async () => {
    playMinecraftClickSound();
    const st = await fetchLaunchLockStatus();
    const cur = (document.getElementById('lock-current-password')?.value || '');
    const nw = (document.getElementById('lock-new-password')?.value || '');
    const cf = (document.getElementById('lock-confirm-password')?.value || '');
    if (nw.length < 4) { showToast('Le mot de passe doit contenir au moins 4 caractères.', 'error'); return; }
    if (nw !== cf) { showToast('La confirmation ne correspond pas.', 'error'); return; }
    btnSave.disabled = true;
    try {
      const payload = st && st.enabled ? { password: nw, currentPassword: cur } : { password: nw };
      const res = await window.launcher.setLaunchPassword(payload);
      if (res && res.success) {
        showToast(st && st.enabled ? 'Mot de passe mis à jour.' : 'Protection activée : mot de passe exigé pour jouer.', 'success');
        clearLockInputs();
      } else {
        showToast((res && res.error) || 'Impossible d’enregistrer le mot de passe.', 'error');
      }
    } catch { showToast('Erreur inattendue.', 'error'); }
    finally { btnSave.disabled = false; refreshLaunchLockSettings(); }
  });

  const btnDisable = document.getElementById('btn-lock-disable');
  if (btnDisable) btnDisable.addEventListener('click', async () => {
    playMinecraftClickSound();
    const cur = (document.getElementById('lock-current-password')?.value || '');
    if (!cur) { showToast('Entrez le mot de passe actuel pour désactiver.', 'error'); return; }
    const res = await window.launcher.disableLaunchLock({ password: cur });
    if (res && res.success) { showToast('Protection désactivée.', 'info'); clearLockInputs(); }
    else showToast((res && res.error) || 'Mot de passe incorrect.', 'error');
    refreshLaunchLockSettings();
  });

  const btnForget = document.getElementById('btn-lock-forget');
  if (btnForget) btnForget.addEventListener('click', async () => {
    playMinecraftClickSound();
    const st = await fetchLaunchLockStatus();
    const cur = (document.getElementById('lock-current-password')?.value || '');
    const res = await window.launcher.forgetTrustedPc(st && st.enabled ? { password: cur } : {});
    if (res && res.success) { showToast('Ce PC a été oublié : mot de passe redemandé au prochain lancement.', 'info'); clearLockInputs(); }
    else showToast((res && res.error) || 'Impossible d’oublier ce PC.', 'error');
    refreshLaunchLockSettings();
  });

  const toggle = document.getElementById('settings-lock-enabled');
  if (toggle) toggle.addEventListener('change', async () => {
    const st = await fetchLaunchLockStatus();
    if (toggle.checked && !(st && st.enabled)) {
      // L'activation passe par la définition d'un mot de passe.
      toggle.checked = false;
      document.getElementById('lock-new-password')?.focus();
      showToast('Définissez un mot de passe puis cliquez « Activer ».', 'info');
    } else if (!toggle.checked && st && st.enabled) {
      const cur = (document.getElementById('lock-current-password')?.value || '');
      if (!cur) {
        toggle.checked = true;
        document.getElementById('lock-current-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('lock-current-password')?.focus();
        showToast('Entrez le mot de passe actuel puis redécochez (ou cliquez Désactiver).', 'info');
        return;
      }
      const res = await window.launcher.disableLaunchLock({ password: cur });
      if (res && res.success) { showToast('Protection désactivée.', 'info'); clearLockInputs(); }
      else { showToast((res && res.error) || 'Mot de passe incorrect.', 'error'); toggle.checked = true; }
      refreshLaunchLockSettings();
    }
  });

  refreshLaunchLockSettings();
})();

// ============================================================
// Maintenance distante + Codes d'accès serveur (espace admin du site)
// - Maintenance active : JOUER et Mods bloqués (message admin),
//   Paramètres toujours accessibles.
// - Serveur à codes : saisie des codes DANS L'ORDRE avant lancement.
// ============================================================
let maintenanceState = { maintenance: false, message: '' };
let pendingCodesServer = null;

function applyMaintenanceState(state) {
  maintenanceState = {
    maintenance: Boolean(state?.maintenance),
    message: String(state?.message || ''),
  };
  const banner = document.getElementById('maintenance-banner');
  const bannerMsg = document.getElementById('maintenance-banner-text');
  if (banner) banner.classList.toggle('hidden', !maintenanceState.maintenance);
  if (bannerMsg) bannerMsg.textContent = maintenanceState.message || 'Launcher en maintenance.';
  const modsNav = document.querySelector('.nav-item[data-page="mods"]');
  if (modsNav) {
    modsNav.classList.toggle('nav-disabled', maintenanceState.maintenance);
    modsNav.title = maintenanceState.maintenance ? 'Indisponible pendant la maintenance' : 'Mods du serveur';
  }
}

async function refreshMaintenanceState() {
  try {
    const cfg = await window.launcher.getLauncherConfig();
    if (cfg) applyMaintenanceState(cfg);
  } catch {}
  return maintenanceState;
}

function openMaintenanceModal(customMessage) {
  const modal = document.getElementById('modal-maintenance');
  const msgEl = document.getElementById('maintenance-modal-message');
  if (msgEl) msgEl.textContent = customMessage || maintenanceState.message || 'Launcher en maintenance.';
  if (modal) modal.classList.remove('hidden');
  try { playMinecraftClickSound(); } catch {}
}

function closeMaintenanceModal() {
  document.getElementById('modal-maintenance')?.classList.add('hidden');
}

function openServerCodesModal(access) {
  pendingCodesServer = {
    serverId: access?.serverId || currentServerId,
    serverName: access?.serverName || currentServerId,
    codesCount: Math.max(1, Number(access?.codesCount) || 1),
  };
  const modal = document.getElementById('modal-server-codes');
  const titleEl = document.getElementById('server-codes-title');
  const inputsEl = document.getElementById('server-codes-inputs');
  const errEl = document.getElementById('server-codes-error');
  if (titleEl) titleEl.textContent = `Codes d'accès — ${pendingCodesServer.serverName}`;
  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
  if (inputsEl) {
    inputsEl.innerHTML = '';
    for (let i = 0; i < pendingCodesServer.codesCount; i++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'mc-input-text server-code-input';
      input.placeholder = `Code ${i + 1}`;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.maxLength = 64;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const all = [...inputsEl.querySelectorAll('input')];
          const idx = all.indexOf(input);
          if (idx < all.length - 1) all[idx + 1].focus();
          else submitServerCodes();
        }
      });
      inputsEl.appendChild(input);
    }
    const first = inputsEl.querySelector('input');
    if (first) setTimeout(() => { try { first.focus(); } catch {} }, 60);
  }
  if (modal) modal.classList.remove('hidden');
}

function closeServerCodesModal() {
  document.getElementById('modal-server-codes')?.classList.add('hidden');
  pendingCodesServer = null;
}

async function submitServerCodes() {
  const inputsEl = document.getElementById('server-codes-inputs');
  const errEl = document.getElementById('server-codes-error');
  const btnSubmit = document.getElementById('btn-server-codes-submit');
  const inputs = inputsEl ? [...inputsEl.querySelectorAll('input')] : [];
  const codes = inputs.map((i) => i.value.trim());
  if (!pendingCodesServer) return;
  if (codes.some((c) => !c)) {
    if (errEl) {
      errEl.textContent = 'Tapez tous les codes, dans l\u2019ordre.';
      errEl.classList.remove('hidden');
    }
    return;
  }
  if (btnSubmit) btnSubmit.disabled = true;
  try {
    const res = await window.launcher.verifyServerCodes({ serverId: pendingCodesServer.serverId, codes });
    if (res && res.valid) {
      const goLaunch = pendingCodesServer.serverId;
      closeServerCodesModal();
      showToast('Codes acceptés, lancement du jeu !', 'success');
      try { currentServerId = goLaunch; } catch {}
      doLaunchGame();
    } else {
      if (errEl) {
        errEl.textContent = res?.error || 'Codes incorrects : vérifiez l\u2019ordre et réessayez.';
        errEl.classList.remove('hidden');
      }
      playMinecraftClickSound();
    }
  } catch {
    if (errEl) {
      errEl.textContent = 'Vérification impossible (réseau ?). Réessayez.';
      errEl.classList.remove('hidden');
    }
  } finally {
    if (btnSubmit) btnSubmit.disabled = false;
  }
}

// Launch Game Button (protégé par le verrou si actif)
const btnPlay = document.getElementById('btn-play');
if (btnPlay) {
  btnPlay.addEventListener('click', async () => {
    // Si un verrou est actif et que ce PC n'est pas retenu, on demande
    // le mot de passe AVANT toute synchro / lancement.
    try {
      const st = await fetchLaunchLockStatus();
      if (st && st.enabled && !st.isTrusted) {
        playMinecraftClickSound();
        openLaunchLockModal(st);
        return;
      }
    } catch {}
    // Maintenance admin (état frais) : JOUER bloqué avec le message.
    try { await refreshMaintenanceState(); } catch {}
    if (maintenanceState.maintenance) {
      playMinecraftClickSound();
      openMaintenanceModal();
      return;
    }
    // Codes d'accès serveur (définis dans l'espace admin) : à taper dans l'ordre.
    try {
      const access = await window.launcher.checkServerAccess(currentServerId);
      if (access && access.codesRequired && !access.verified) {
        playMinecraftClickSound();
        openServerCodesModal(access);
        return;
      }
    } catch {}
    doLaunchGame();
  });
}

async function doLaunchGame() {
    playGameLaunchSound();
    const ram = parseInt(ramSlider ? ramSlider.value : 4);
    const progressSection = document.getElementById('progress-section');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    btnPlay.disabled = true;
    btnPlay.classList.add('loading', 'hidden');
    if (progressSection) progressSection.classList.remove('hidden');
    if (progressFill) progressFill.style.width = '10%';
    if (progressText) progressText.textContent = 'Mise à jour des mods...';

    const syncResult = await window.launcher.syncMods(currentServerId);
    if (!syncResult.success) {
      showToast('Synchro mods impossible (' + (syncResult.error || 'hors-ligne') + ') — lancement avec les mods locaux.', 'error');
    } else if ((syncResult.downloaded || 0) > 0 || (syncResult.removed || 0) > 0) {
      showToast(`Mods à jour : +${syncResult.downloaded || 0} / -${syncResult.removed || 0}`, 'success');
    }

    if (progressText) progressText.textContent = 'Lancement de Minecraft...';
    loadMods();

    const result = await window.launcher.launchGame({
      version: currentGameVersion,
      loader: currentLoader,
      ram,
      serverId: currentServerId
    });

    if (!result.success) {
      // Garde-fou : le main refuse sans mot de passe (ex. PC dérétenu
      // entre le clic et le lancement) -> rouvre la saisie.
      if (result.code === 'LAUNCH_LOCKED') {
        resetPlayBtn();
        try {
          const st = await fetchLaunchLockStatus(true);
          openLaunchLockModal(st);
        } catch {}
        return;
      }
      // Maintenance activée par l'admin entre le clic et le lancement.
      if (result.code === 'LAUNCH_MAINTENANCE') {
        resetPlayBtn();
        try { await refreshMaintenanceState(); } catch {}
        openMaintenanceModal(result.error);
        return;
      }
      // Codes d'accès exigés par le serveur (jamais validés cette session).
      if (result.code === 'SERVER_CODES_REQUIRED') {
        resetPlayBtn();
        openServerCodesModal({
          serverId: result.serverId || currentServerId,
          serverName: result.serverName || currentServerId,
          codesCount: result.codesCount || 0,
        });
        return;
      }
      showToast('Erreur de lancement : ' + result.error, 'error');
      resetPlayBtn();
    } else {
      if ((result.modsFailed || 0) > 0) {
        showToast(`${result.modsFailed} mod(s) non installés (fichiers verrouillés ?) — fermez le jeu déjà ouvert puis relancez.`, 'error', 6000);
      } else if ((result.modsStaged || 0) === 0) {
        showToast('Jeu lancé SANS mods — synchronisez depuis l\'onglet Mods.', 'error', 6000);
      }
      if (progressText) progressText.textContent = 'Minecraft est en cours d\'exécution (ouverture dans quelques secondes)...';
      if (btnPlay) {
        btnPlay.disabled = true;
        btnPlay.innerHTML = '<span class="play-text">EN JEU...</span>';
      }
    }
}

function resetPlayBtn() {
  if (!btnPlay) return;
  const progressSection = document.getElementById('progress-section');
  const currentTheme = getThemeObj(document.body.dataset.theme || DEFAULT_THEME);
  const activeIconKey = currentTheme.images?.playButtonIcon || 'play';
  const activePlayText = currentTheme.images?.playButtonText || 'JOUER';

  btnPlay.disabled = false;
  btnPlay.classList.remove('loading', 'hidden');
  btnPlay.innerHTML = `<span class="play-icon-mc">${getButtonIconSvg(activeIconKey)}</span> <span class="play-text">${escapeHtml(activePlayText)}</span>`;
  if (progressSection) {
    progressSection.classList.add('hidden');
    progressSection.classList.remove('indeterminate');
  }
}

// Progress events
window.launcher.onProgress((data) => {
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');

  switch (data.type) {
    case 'download': {
      const progressBarDl = document.getElementById('progress-section');
      if (progressBarDl) progressBarDl.classList.remove('indeterminate');
      let val = parseInt(data.value, 10);
      if (isNaN(val) || val < 0) val = 0;
      if (val > 100) val = 100;
      if (progressFill) progressFill.style.width = `${val}%`;
      if (progressText) progressText.textContent = `Téléchargement : ${val}%`;
      break;
    }
    case 'check': {
      let val = parseInt(data.value, 10);
      if (isNaN(val) || val < 0) val = 0;
      if (val > 100) val = 100;
      if (progressFill) progressFill.style.width = `${val}%`;
      if (progressText) progressText.textContent = `Vérification : ${val}%`;
      break;
    }
    case 'extract':
      if (progressText) progressText.textContent = `Extraction : ${data.value}`;
      break;
    case 'mod-sync': {
      const progressBar = document.getElementById('progress-section');
      // Add indeterminate shimmer for server wait messages (no % info)
      if (progressBar && (data.value.includes('serveur') || data.value.includes('pub') || data.value.includes('Attente'))) {
        progressBar.classList.add('indeterminate');
      } else if (progressBar) {
        progressBar.classList.remove('indeterminate');
      }
      if (progressText) progressText.textContent = data.value;
      break;
    }
  }
});

window.launcher.onGameClosed(() => resetPlayBtn());
window.launcher.onGameError((err) => { showToast('Erreur du jeu : ' + err, 'error'); resetPlayBtn(); });

// Mods loader & Real-time Search
let cachedServerMods = [];

async function loadMods() {
  const modsList = document.getElementById('mods-list');
  const modsCountEl = document.getElementById('mods-count');
  const installedModsCountEl = document.getElementById('installed-mods-count');
  if (!modsList) return;

  try {
    const result = await window.launcher.getMods(currentServerId);

    if (!result || !result.success) {
      modsList.innerHTML = '<div class="empty-state"><p>Erreur de chargement des mods.</p></div>';
      if (modsCountEl) modsCountEl.textContent = '0 mod';
      if (installedModsCountEl) installedModsCountEl.textContent = '0';
      return;
    }

    cachedServerMods = Array.isArray(result.mods) ? result.mods : [];
    renderFilteredMods();
  } catch (err) {
    console.error('[Mods] loadMods failed:', err);
    modsList.innerHTML = '<div class="empty-state"><p>Erreur de chargement des mods.</p></div>';
    if (modsCountEl) modsCountEl.textContent = '0 mod';
    if (installedModsCountEl) installedModsCountEl.textContent = '0';
  }
}

function renderFilteredMods() {
  const modsList = document.getElementById('mods-list');
  const modsCountEl = document.getElementById('mods-count');
  const installedModsCountEl = document.getElementById('installed-mods-count');
  const searchInput = document.getElementById('mods-search');
  if (!modsList) return;

  const query = (searchInput?.value || '').toLowerCase().trim();
  const filtered = query
    ? cachedServerMods.filter(m => m.toLowerCase().includes(query))
    : cachedServerMods;

  const countStr = `${cachedServerMods.length} mod${cachedServerMods.length > 1 ? 's' : ''}`;
  if (modsCountEl) modsCountEl.textContent = query ? `${filtered.length} / ${countStr}` : countStr;
  if (installedModsCountEl) installedModsCountEl.textContent = cachedServerMods.length.toString();

  if (cachedServerMods.length === 0) {
    modsList.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:8px; opacity:0.6;">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        </svg>
        <p>Aucun mod installé pour ce serveur.</p>
        <p class="empty-sub">Cliquez sur Synchroniser pour télécharger le modpack officiel.</p>
      </div>`;
    return;
  }

  if (filtered.length === 0) {
    modsList.innerHTML = `
      <div class="empty-state">
        <p>Aucun mod ne correspond à "<strong>${escapeHtml(query)}</strong>"</p>
        <p class="empty-sub">Essayez un autre mot-clé ou effacez la recherche.</p>
      </div>`;
    return;
  }

  modsList.innerHTML = filtered.map(mod => {
    const nameBase = mod.replace(/\.jar$/i, '');
    return `
      <div class="mod-item" title="${escapeHtml(mod)}">
        <div class="mod-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
        </div>
        <div class="mod-content">
          <span class="mod-name">${escapeHtml(nameBase)}</span>
          <span class="mod-ext">.jar</span>
        </div>
        <span class="mod-badge-active">Actif</span>
      </div>
    `;
  }).join('');
}

// Live Mods Search Input (Debounced at 60fps via requestAnimationFrame)
const modsSearchInput = document.getElementById('mods-search');
let modsSearchDebounceRaf = null;
if (modsSearchInput) {
  modsSearchInput.addEventListener('input', () => {
    if (modsSearchDebounceRaf) cancelAnimationFrame(modsSearchDebounceRaf);
    modsSearchDebounceRaf = requestAnimationFrame(() => {
      renderFilteredMods();
    });
  });
}

// Refresh Mods Button
const btnRefreshMods = document.getElementById('btn-refresh-mods');
if (btnRefreshMods) {
  btnRefreshMods.addEventListener('click', async () => {
    btnRefreshMods.disabled = true;
    const svgIcon = btnRefreshMods.querySelector('svg');
    if (svgIcon) svgIcon.classList.add('spin');
    await loadMods();
    if (svgIcon) svgIcon.classList.remove('spin');
    btnRefreshMods.disabled = false;
    showToast('Liste des mods actualisée !', 'info');
  });
}

const btnSyncMods = document.getElementById('btn-sync-mods');
if (btnSyncMods) {
  btnSyncMods.addEventListener('click', async () => {
    btnSyncMods.disabled = true;
    btnSyncMods.innerHTML = '<svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg> <span>Synchro...</span>';

    const progressSection = document.getElementById('progress-section');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    if (progressSection) progressSection.classList.remove('hidden');
    if (btnPlay) btnPlay.classList.add('hidden');
    if (progressFill) progressFill.style.width = '10%';
    if (progressText) progressText.textContent = 'Synchronisation des mods...';

    const result = await window.launcher.syncMods(currentServerId);
    if (result.success) {
      const dl = result.downloaded || 0;
      const rm = result.removed || 0;
      const detail = (dl > 0 || rm > 0) ? ` (+${dl} / -${rm})` : '';
      showToast(`Mods synchronisés (${result.count} mods)${detail}`, 'success');
    } else {
      showToast('Échec synchro : ' + (result.error || 'serveur de mods injoignable'), 'error');
    }

    resetPlayBtn();
    btnSyncMods.disabled = false;
    btnSyncMods.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg> <span>Synchroniser</span>';
    loadMods();
  });
}

// Accounts page
async function loadAccountsList() {
  const list = document.getElementById('accounts-list');
  const countEl = document.getElementById('accounts-count');
  if (!list) return;

  const data = await window.launcher.getAccounts();
  const count = data.accounts?.length || 0;
  if (countEl) countEl.textContent = `${count} compte${count !== 1 ? 's' : ''}`;

  if (!data.accounts || data.accounts.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>Aucun compte enregistré.</p></div>';
    return;
  }

  list.innerHTML = '';
  data.accounts.forEach((acc, i) => {
    const item = document.createElement('div');
    item.className = 'account-item' + (acc.active ? ' account-active' : '');
    const skinUrl = getPlayerAvatarUrl(acc.name, acc.uuid, 40);
    const typeText = acc.type === 'microsoft' ? 'Microsoft' : 'Hors-ligne';

    item.innerHTML = `
      <img class="account-skin" src="${skinUrl}" onerror="if(!this.dataset.tried){this.dataset.tried='1';this.src='https://minotar.net/helm/${encodeURIComponent(acc.name)}/40';}else if(this.dataset.tried==='1'){this.dataset.tried='2';this.src='https://crafthead.net/helm/${encodeURIComponent(acc.name)}/40';}else{this.src='${defaultSkinSrc}';}" />
      <div class="account-info">
        <span class="account-name">${escapeHtml(acc.name)}</span>
        <span class="account-type-badge ${acc.type}">${typeText}</span>
      </div>
      <div class="account-actions">
        ${!acc.active ? `<button class="btn-mc-action btn-switch" data-index="${i}">Utiliser</button>` : '<span class="active-badge" style="font-size:11px;font-weight:700;color:var(--mc-green-primary);padding:4px 10px;background:rgba(56,204,86,0.12);border-radius:4px;">Actif</span>'}
        <button class="btn-mc-action btn-remove" data-index="${i}">Supprimer</button>
      </div>`;
    list.appendChild(item);
  });

  list.querySelectorAll('.btn-switch').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.index);
      const result = await window.launcher.switchAccount(idx);
      if (result.success) {
        setLoggedIn(result.username, result.uuid);
        loadAccountsList();
      } else {
        showToast(result.error || 'Erreur de changement de compte', 'error');
      }
    });
  });

  list.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.index);
      const result = await window.launcher.removeAccount(idx);
      if (!result.success) return;
      if (result.activeIndex < 0 || !result.activeAccount) {
        setLoggedOut();
      } else {
        setLoggedIn(result.activeAccount.name, result.activeAccount.uuid);
      }
      loadAccountsList();
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Offline account add modal
const offlineInputSection = document.getElementById('offline-input-section');
const btnAddOffline = document.getElementById('btn-add-offline');
const btnCloseOfflineInput = document.getElementById('btn-close-offline-input');
const btnConfirmOffline = document.getElementById('btn-confirm-offline');
const inputNewOffline = document.getElementById('input-new-offline');

if (btnAddOffline && offlineInputSection) {
  btnAddOffline.addEventListener('click', () => {
    offlineInputSection.classList.remove('hidden');
    if (inputNewOffline) setTimeout(() => inputNewOffline.focus(), 50);
  });
}

if (btnCloseOfflineInput && offlineInputSection) {
  btnCloseOfflineInput.addEventListener('click', () => {
    offlineInputSection.classList.add('hidden');
    if (inputNewOffline) inputNewOffline.value = '';
  });
}

if (btnConfirmOffline && inputNewOffline) {
  btnConfirmOffline.addEventListener('click', async () => {
    const username = inputNewOffline.value.trim();
    if (!username) return;
    const result = await window.launcher.authOffline(username);
    if (result.success) {
      setLoggedIn(result.username, result.uuid);
      inputNewOffline.value = '';
      if (offlineInputSection) offlineInputSection.classList.add('hidden');
      loadAccountsList();
    } else {
      showToast('Erreur : ' + result.error, 'error');
    }
  });
}

// Microsoft account add
const btnAddMs = document.getElementById('btn-add-microsoft');
if (btnAddMs) {
  btnAddMs.addEventListener('click', async () => {
    btnAddMs.disabled = true;
    btnAddMs.textContent = 'Connexion...';
    const result = await window.launcher.authMicrosoft();
    btnAddMs.disabled = false;
    btnAddMs.textContent = 'Connecter';

    if (result.success) {
      setLoggedIn(result.username, result.uuid);
      loadAccountsList();
    } else if (!result.error?.includes('annule')) {
      showToast('Erreur : ' + (result.error || 'Erreur inconnue'), 'error');
    }
  });
}

// Format markdown / bullet list descriptions from GitHub releases or news database
function formatNewsDescription(rawText) {
  if (!rawText) return '';
  const text = String(rawText).trim();
  const lines = text.split(/\r?\n/);
  const formattedLines = [];
  let inList = false;

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        formattedLines.push('</ul>');
        inList = false;
      }
      continue;
    }

    const bulletMatch = trimmed.match(/^([-*•]|\d+[\-.)•])\s+(.*)$/);
    if (bulletMatch) {
      if (!inList) {
        formattedLines.push('<ul class="news-desc-list">');
        inList = true;
      }
      let content = bulletMatch[2];
      content = escapeHtml(content)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
      formattedLines.push(`<li>${content}</li>`);
    } else {
      if (inList) {
        formattedLines.push('</ul>');
        inList = false;
      }
      let content = trimmed;
      let isHeader = false;
      if (content.startsWith('### ')) {
        content = `<h4 class="news-desc-h4">${escapeHtml(content.slice(4))}</h4>`;
        isHeader = true;
      } else if (content.startsWith('## ')) {
        content = `<h3 class="news-desc-h3">${escapeHtml(content.slice(3))}</h3>`;
        isHeader = true;
      } else if (content.startsWith('# ')) {
        content = `<h2 class="news-desc-h2">${escapeHtml(content.slice(2))}</h2>`;
        isHeader = true;
      } else {
        content = escapeHtml(content)
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code>$1</code>');
      }
      if (isHeader) {
        formattedLines.push(content);
      } else {
        formattedLines.push(`<p class="news-desc-p">${content}</p>`);
      }
    }
  }

  if (inList) {
    formattedLines.push('</ul>');
  }

  return formattedLines.join('');
}

// Open News Article Modal Reader
function openNewsDetailModal(newsItem) {
  if (!newsItem) return;
  const modal = document.getElementById('modal-news-detail');
  if (!modal) return;

  const badgeEl = document.getElementById('modal-news-badge');
  const versionEl = document.getElementById('modal-news-version');
  const titleEl = document.getElementById('modal-news-title');
  const metaEl = document.getElementById('modal-news-meta');
  const imgContainer = document.getElementById('modal-news-image-container');
  const imgEl = document.getElementById('modal-news-image');
  const contentEl = document.getElementById('modal-news-content');
  const linkContainer = document.getElementById('modal-news-link-container');
  const linkEl = document.getElementById('modal-news-link');
  const linkText = document.getElementById('modal-news-link-text');

  if (badgeEl) {
    const badge = newsItem.badge || 'MISE À JOUR';
    badgeEl.textContent = badge;
    badgeEl.className = `news-badge ${String(badge).toLowerCase().includes('modpack') ? 'gold' : ''}`;
  }

  if (versionEl) {
    if (newsItem.version) {
      versionEl.textContent = newsItem.version;
      versionEl.style.display = '';
    } else {
      versionEl.style.display = 'none';
    }
  }

  if (titleEl) {
    titleEl.textContent = newsItem.title || 'Actualité';
  }

  if (metaEl) {
    const parts = [];
    if (newsItem.date) parts.push(`📅 ${escapeHtml(newsItem.date)}`);
    if (newsItem.author) parts.push(`👤 Par ${escapeHtml(newsItem.author)}`);
    metaEl.innerHTML = parts.join('&nbsp;&nbsp;•&nbsp;&nbsp;');
  }

  if (imgContainer && imgEl) {
    if (newsItem.image && typeof newsItem.image === 'string' && newsItem.image.trim()) {
      imgEl.src = newsItem.image;
      imgContainer.style.display = '';
    } else {
      imgContainer.style.display = 'none';
      imgEl.src = '';
    }
  }

  if (contentEl) {
    const fullContent = newsItem.content || newsItem.summary || '';
    contentEl.innerHTML = formatNewsDescription(fullContent);
  }

  if (linkContainer && linkEl) {
    const targetUrl = newsItem.githubUrl || newsItem.url;
    if (targetUrl) {
      linkContainer.style.display = '';
      if (linkText) {
        linkText.textContent = newsItem.githubUrl ? 'Voir la release GitHub' : 'En savoir plus';
      }
      linkEl.onclick = (e) => {
        e.preventDefault();
        if (window.launcher?.openExternal) {
          window.launcher.openExternal(targetUrl);
        }
      };
    } else {
      linkContainer.style.display = 'none';
    }
  }

  modal.classList.remove('hidden');
}

function closeNewsDetailModal() {
  const modal = document.getElementById('modal-news-detail');
  if (modal) modal.classList.add('hidden');
}

// Global modal close handlers
const btnCloseNewsModal = document.getElementById('btn-close-news-modal');
const btnNewsModalDismiss = document.getElementById('btn-news-modal-dismiss');
const modalNewsDetail = document.getElementById('modal-news-detail');

if (btnCloseNewsModal) btnCloseNewsModal.addEventListener('click', closeNewsDetailModal);
if (btnNewsModalDismiss) btnNewsModalDismiss.addEventListener('click', closeNewsDetailModal);
if (modalNewsDetail) {
  modalNewsDetail.addEventListener('click', (e) => {
    if (e.target === modalNewsDetail) closeNewsDetailModal();
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('modal-news-detail');
    if (modal && !modal.classList.contains('hidden')) {
      closeNewsDetailModal();
    }
  }
});

// Posts and GitHub releases deliberately use separate channels.
function isGithubReleaseNews(item) {
  if (!item) return false;
  return item.isGithubRelease === true
    || String(item.isGithubRelease).toLowerCase() === 'true'
    || String(item.id || '').toLowerCase().startsWith('gh-');
}

function getIndependentNewsPosts(news) {
  return Array.isArray(news)
    ? news.filter((n) => n && !isGithubReleaseNews(n) && (n.title || n.content || n.summary))
    : [];
}

function renderLauncherNewsPosts(news) {
  const postsEl = document.getElementById('launcher-news-list');
  const countEl = document.getElementById('launcher-news-count');
  const sectionEl = document.getElementById('launcher-news-section');
  if (!postsEl) return;

  const posts = getIndependentNewsPosts(news);
  if (countEl) countEl.textContent = `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`;

  if (posts.length === 0) {
    postsEl.innerHTML = '';
    if (sectionEl) sectionEl.style.display = 'none';
    return;
  }

  if (sectionEl) sectionEl.style.display = '';
  postsEl.innerHTML = posts.map((n, idx) => `
    <div class="news-card mc-box launcher-news-card" data-idx="${idx}" style="cursor:pointer;" title="Cliquez pour lire l'actualité complète">
      <div class="news-meta-header">
        <div class="news-badge ${String(n.badge || '').toLowerCase().includes('modpack') ? 'gold' : ''}">${escapeHtml(n.badge || 'ACTUALITÉ')}</div>
        ${n.version ? `<span class="news-version-pill">${escapeHtml(n.version)}</span>` : ''}
      </div>
      <div class="news-card-title">${escapeHtml(n.title || 'Actualité')}</div>
      <div class="news-card-desc">${formatNewsDescription(n.summary || n.content || '')}</div>
      ${n.date ? `<div class="news-card-date">📅 ${escapeHtml(n.date)}</div>` : ''}
    </div>`).join('');

  postsEl.querySelectorAll('.launcher-news-card').forEach((card) => {
    card.addEventListener('click', () => {
      const post = posts[parseInt(card.getAttribute('data-idx'), 10)];
      if (post) openNewsDetailModal(post);
    });
  });
}

function renderHomeNewsPosts(news) {
  const homeNewsEl = document.getElementById('home-news-cards');
  if (!homeNewsEl) return;

  const posts = getIndependentNewsPosts(news);
  const featuredPosts = posts.slice(0, 2);
  if (featuredPosts.length === 0) {
    homeNewsEl.innerHTML = '';
    homeNewsEl.style.display = 'none';
    return;
  }

  homeNewsEl.style.display = '';
  homeNewsEl.innerHTML = featuredPosts.map((n, idx) => `
    <div class="news-card mc-box home-news-clickable" data-idx="${idx}" style="cursor:pointer;" title="Cliquez pour lire l'actualité complète">
      <div class="news-meta-header">
        <div class="news-badge ${String(n.badge || '').toLowerCase().includes('modpack') ? 'gold' : ''}">${escapeHtml(n.badge || 'ACTUALITÉ')}</div>
        ${n.version ? `<span class="news-version-pill">${escapeHtml(n.version)}</span>` : ''}
      </div>
      <div class="news-card-title">${escapeHtml(n.title || 'Actualité')}</div>
      <div class="news-card-desc">${formatNewsDescription(n.summary || n.content || '')}</div>
      ${n.date ? `<div class="news-card-date">📅 ${escapeHtml(n.date)}</div>` : ''}
    </div>`).join('');

  homeNewsEl.querySelectorAll('.home-news-clickable').forEach((card) => {
    card.addEventListener('click', () => {
      const post = featuredPosts[parseInt(card.getAttribute('data-idx'), 10)];
      if (post) openNewsDetailModal(post);
    });
  });
}

function renderPatchReleases(releases, fallbackNotes, fallbackVersion) {
  const notesEl = document.getElementById('patch-notes-content');
  if (!notesEl) return;

  const githubReleases = Array.isArray(releases)
    ? releases.filter((release) => release && !release.draft && (release.tag_name || release.name || release.body))
    : [];

  const latestBody = githubReleases.length > 0
    ? String(githubReleases[0].body || '').trim()
    : '';
  const notes = latestBody || String(fallbackNotes || '').trim() || 'Aucune note de version disponible.';

  notesEl.innerHTML = formatNewsDescription(notes);
  notesEl.style.display = '';
}

// Load GitHub patch notes and administration posts independently.
async function loadLatestReleaseInfo() {
  const versionEl = document.getElementById('latest-release-version');
  const notesEl = document.getElementById('patch-notes-content');
  if (!versionEl || !notesEl) return;

  try {
    const result = await window.launcher.getLatestReleaseInfo();
    versionEl.textContent = result?.version ? `v${result.version}` : 'v...';

    // Patch Notes: render the actual GitHub release descriptions, not administration posts.
    const rawNotes = result?.notes?.trim() || 'Aucune note de version disponible.';
    renderPatchReleases(result?.releases, rawNotes, result?.version);

    // Actualités: only independent posts from the administration database.
    const posts = getIndependentNewsPosts(result?.news);
    renderLauncherNewsPosts(posts);
    renderHomeNewsPosts(posts);
  } catch (error) {
    versionEl.textContent = 'v?';
    notesEl.style.display = '';
    notesEl.textContent = 'Impossible de charger les patch notes.';
    renderLauncherNewsPosts([]);
    renderHomeNewsPosts([]);
  }
}

// Auto-refresh news when launcher gains focus, visibility changes or periodically (live sync)
window.addEventListener('focus', () => {
  loadLatestReleaseInfo();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadLatestReleaseInfo();
  }
});
setInterval(() => {
  if (document.visibilityState === 'visible') {
    loadLatestReleaseInfo();
  }
}, 10000);

// Load settings
async function loadSettings() {
  try {
    const dirs = await window.launcher.getLauncherDir();
    const launcherDirEl = document.getElementById('launcher-dir-path');
    const modsDirEl = document.getElementById('mods-dir-path');
    if (launcherDirEl) launcherDirEl.textContent = dirs.launcherDir;
    if (modsDirEl) modsDirEl.textContent = dirs.modsDir;

    const config = await window.launcher.getConfig();
    if (config) {
      if (config.customThemes && Array.isArray(config.customThemes)) {
        customThemes = config.customThemes;
      }
      if (config.themeOverrides && typeof config.themeOverrides === 'object' && !Array.isArray(config.themeOverrides)) {
        themeOverrides = config.themeOverrides;
      }
      if (config.customThemes || config.themeOverrides) {
        updateDynamicThemeStyles();
      }
      if (config.ram && settingsRam) {
        settingsRam.value = config.ram;
        if (settingsRamValue) settingsRamValue.textContent = `${config.ram} Go`;
        if (ramSlider) ramSlider.value = config.ram;
        if (ramValue) ramValue.textContent = `${config.ram} Go`;
      }
      if (config.resolution && resSelect) {
        resSelect.value = config.resolution;
      }
      if (config.fullscreen !== undefined && fullscreenSetting) {
        fullscreenSetting.checked = config.fullscreen;
      }
      if (config.javaPath && javaPathInput) {
        javaPathInput.value = config.javaPath;
      }
      if (config.jvmArgs && jvmArgsInput) {
        jvmArgsInput.value = config.jvmArgs;
      }
      if (config.closeOnLaunch !== undefined && closeOnLaunchToggle) {
        closeOnLaunchToggle.checked = config.closeOnLaunch;
      }
      if (config.minimizeOnLaunch !== undefined && minimizeOnLaunchToggle) {
        minimizeOnLaunchToggle.checked = config.minimizeOnLaunch;
      }
      if (typeof initBetaTesterFromConfig === 'function') {
        try { initBetaTesterFromConfig(config); } catch {}
      }
      if (config.theme && themeSelect) {
        themeSelect.value = config.theme;
        applyTheme(config.theme);
      }
      const keyboardLayoutEl = document.getElementById('settings-keyboard-layout');
      if (keyboardLayoutEl && config.keyboardLayout) {
        keyboardLayoutEl.value = config.keyboardLayout;
      }
      renderThemeGrid();
    }
    try { if (typeof refreshLaunchLockSettings === 'function') refreshLaunchLockSettings(); } catch {}
  } catch (e) {
    console.error('[Settings] Error loading settings:', e);
  }
}

function setUpdateStatus(state, message) {
  const banner = document.getElementById('update-status');
  const icon = document.getElementById('update-status-icon');
  const text = document.getElementById('update-status-text');
  if (!banner || !icon || !text) return;

  banner.classList.remove('is-checking', 'is-available', 'is-progress', 'is-downloaded', 'is-error');
  if (state) banner.classList.add(state);

  const icons = {
    'is-checking': '…',
    'is-available': '↑',
    'is-progress': '↓',
    'is-downloaded': '✓',
    'is-error': '!',
  };
  icon.textContent = icons[state] || '✓';
  text.textContent = message;
}

function setUpdateProgressVisible(visible) {
  const section = document.getElementById('update-progress-section');
  if (!section) return;
  section.classList.toggle('hidden', !visible);
}

function setUpdateProgress(percent, label) {
  const fill = document.getElementById('update-progress-fill');
  const text = document.getElementById('update-progress-text');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, percent || 0))}%`;
  if (text && label) text.textContent = label;
}

function resetUpdateCheckButton() {
  const btnCheckUpdate = document.getElementById('btn-check-update');
  if (btnCheckUpdate) {
    btnCheckUpdate.disabled = false;
    btnCheckUpdate.textContent = 'Vérifier les MAJ';
  }
  isCheckingForUpdates = false;
}

if (window.launcher.onUpdateChecking) {
  window.launcher.onUpdateChecking(() => {
    setUpdateStatus('is-checking', 'Vérification des mises à jour...');
    setUpdateProgressVisible(false);
  });
}

if (window.launcher.onUpdateAvailable) {
  window.launcher.onUpdateAvailable((data) => {
    const version = data?.version ? `v${data.version}` : 'une nouvelle version';
    setUpdateStatus('is-available', `Mise à jour ${version} disponible. Téléchargement en cours...`);
    setUpdateProgressVisible(true);
    setUpdateProgress(0, 'Téléchargement de la mise à jour...');
    showToast(`Mise à jour ${version} disponible`, 'success');
  });
}

if (window.launcher.onUpdateNotAvailable) {
  window.launcher.onUpdateNotAvailable((data) => {
    const vText = data?.version ? ` (v${data.version})` : '';
    setUpdateStatus('', `Vous utilisez déjà la dernière version du launcher${vText}.`);
    setUpdateProgressVisible(false);
    resetUpdateCheckButton();
  });
}

if (window.launcher.onUpdateProgress) {
  window.launcher.onUpdateProgress((data) => {
    const percent = Number(data?.value) || 0;
    setUpdateStatus('is-progress', `Téléchargement de la mise à jour : ${percent}%`);
    setUpdateProgressVisible(true);
    setUpdateProgress(percent, `Téléchargement : ${percent}%`);
  });
}

if (window.launcher.onUpdateDownloaded) {
  window.launcher.onUpdateDownloaded((data) => {
    setUpdateStatus('is-downloaded', data?.message || 'Mise à jour téléchargée. Redémarrage...');
    setUpdateProgressVisible(true);
    setUpdateProgress(100, 'Installation...');
    resetUpdateCheckButton();
    showToast('Mise à jour prête. Redémarrage...', 'success');
  });
}

if (window.launcher.onUpdateError) {
  window.launcher.onUpdateError((data) => {
    setUpdateStatus('is-error', data?.message || 'Erreur de mise à jour.');
    setUpdateProgressVisible(false);
    resetUpdateCheckButton();
    showToast('Erreur de mise à jour : ' + (data?.message || 'inconnue'), 'error');
  });
}

const btnCheckUpdate = document.getElementById('btn-check-update');
if (btnCheckUpdate) {
  btnCheckUpdate.addEventListener('click', async () => {
    if (isCheckingForUpdates) return;
    isCheckingForUpdates = true;
    btnCheckUpdate.disabled = true;
    btnCheckUpdate.textContent = 'Vérification...';
    setUpdateStatus('is-checking', 'Vérification des mises à jour...');

    try {
      const result = await window.launcher.checkForUpdates();
      if (!result.success) {
        setUpdateStatus('is-error', result.error || 'Erreur de vérification.');
        showToast('Erreur de vérification : ' + result.error, 'error');
        resetUpdateCheckButton();
        return;
      }

      if (result.updateAvailable) {
        const version = result.version ? `v${result.version}` : 'une nouvelle version';
        setUpdateStatus('is-available', `Mise à jour ${version} disponible. Téléchargement en cours...`);
        setUpdateProgressVisible(true);
        setUpdateProgress(0, 'Téléchargement de la mise à jour...');
      } else {
        const vText = result.version ? ` (v${result.version})` : '';
        setUpdateStatus('', `Vous utilisez déjà la dernière version du launcher${vText}.`);
        setUpdateProgressVisible(false);
        resetUpdateCheckButton();
      }
      // Synchronise le panneau Beta Tester avec le meme resultat (canal, cibles).
      try { paintBetaChannelState(result); } catch {}
    } catch (err) {
      setUpdateStatus('is-error', 'Erreur de vérification.');
      showToast('Erreur de vérification', 'error');
      resetUpdateCheckButton();
    }
  });
}

// ============================================================
// Canal Beta Tester — option "-beta" / "-alpha" + retour stable
// - Toggle settings-beta-tester (persiste via setBetaTester)
// - "Vérifier les bêtas" lit les releases GitHub SANS télécharger
// - Si une beta/alpha plus récente existe -> modale de proposition,
//   installation UNIQUEMENT si l'utilisateur accepte
// - "Retour version stable" visible quand on est sur une beta/alpha :
//   réinstalle la derniere stable officielle (downgrade autorisé)
// ============================================================
let betaChannelState = null;
let pendingBetaVersion = null;
let pendingStableVersion = null;
let isCheckingBeta = false;

function getBetaChannelOf(version) {
  const s = String(version || '').toLowerCase();
  if (s.includes('alpha')) return 'alpha';
  if (s.includes('beta')) return 'beta';
  return 'stable';
}

function setBetaStatus(message, icon) {
  const text = document.getElementById('beta-status-text');
  const ico = document.getElementById('beta-status-icon');
  const banner = document.getElementById('beta-status');
  if (text) text.textContent = message;
  if (ico && icon) ico.textContent = icon;
  if (banner) {
    banner.classList.remove('is-checking', 'is-available', 'is-progress', 'is-downloaded', 'is-error');
  }
}

function paintBetaChannelState(state) {
  if (!state) return;
  betaChannelState = state;
  const badge = document.getElementById('beta-channel-badge');
  const desc = document.getElementById('beta-versions-desc');
  const toggle = document.getElementById('settings-beta-tester');
  const btnInstall = document.getElementById('btn-install-beta');
  const btnStable = document.getElementById('btn-return-stable');

  const channel = state.currentChannel || getBetaChannelOf(state.current);
  if (toggle && typeof state.betaEnabled === 'boolean') toggle.checked = state.betaEnabled;
  if (badge) {
    badge.textContent = channel === 'stable' ? 'Stable' : (channel === 'alpha' ? 'Alpha' : 'Bêta');
  }
  const cur = state.current ? `v${state.current}` : '?';
  const stable = state.latestStable?.version ? `v${state.latestStable.version}` : '—';
  const beta = state.latestBeta?.version ? `v${state.latestBeta.version}` : '—';
  if (desc) desc.textContent = `Version actuelle : ${cur} (${channel}) • Stable : ${stable} • Bêta/Alpha : ${beta}`;

  pendingBetaVersion = (state.betaEnabled && state.betaAvailable && state.latestBeta)
    ? state.latestBeta.version : null;
  pendingStableVersion = state.canReturnToStable && state.latestStable
    ? state.latestStable.version : null;

  if (btnInstall) btnInstall.classList.toggle('hidden', !pendingBetaVersion);
  if (btnStable) btnStable.classList.toggle('hidden', !pendingStableVersion);

  if (!state.betaEnabled) {
    if (pendingStableVersion) {
      setBetaStatus(`Vous êtes sur ${cur} (pré-release). La stable ${stable} est disponible — utilisez "Retour version stable".`, '↑');
    } else {
      setBetaStatus('Canal stable : vous recevez uniquement les versions officielles.', '✓');
    }
  } else if (pendingBetaVersion) {
    setBetaStatus(`Bêta disponible : v${pendingBetaVersion} (vous avez ${cur}). Cliquez "Installer la bêta" ou acceptez la proposition.`, '↑');
  } else if (state.latestBeta) {
    setBetaStatus(`Canal bêta activé : vous êtes à jour (${cur}). Dernière bêta : v${state.latestBeta.version}.`, '✓');
  } else {
    setBetaStatus(`Canal bêta activé : aucune bêta publiée pour le moment (${cur}).`, '✓');
  }
}

function openBetaModal({ title, message, notes, confirmLabel, onConfirm }) {
  const modal = document.getElementById('modal-beta-update');
  const titleEl = document.getElementById('beta-modal-title');
  const msgEl = document.getElementById('beta-modal-message');
  const notesEl = document.getElementById('beta-modal-notes');
  const btnLater = document.getElementById('btn-beta-modal-later');
  const btnInstall = document.getElementById('btn-beta-modal-install');
  if (!modal || !btnInstall || !btnLater) {
    if (confirm(String(message || '').replace(/<[^>]*>/g, ''))) onConfirm();
    return;
  }
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (notesEl) {
    if (notes) {
      notesEl.style.display = '';
      notesEl.innerHTML = formatNewsDescription(String(notes).slice(0, 2000));
    } else {
      notesEl.style.display = 'none';
      notesEl.innerHTML = '';
    }
  }
  if (confirmLabel) btnInstall.textContent = confirmLabel;
  modal.classList.remove('hidden');
  const cleanup = () => {
    modal.classList.add('hidden');
    btnInstall.removeEventListener('click', onGo);
    btnLater.removeEventListener('click', onLater);
    modal.removeEventListener('click', onBackdrop);
  };
  const onGo = () => { cleanup(); onConfirm(); };
  const onLater = () => { cleanup(); };
  const onBackdrop = (e) => { if (e.target === modal) cleanup(); };
  btnInstall.addEventListener('click', onGo);
  btnLater.addEventListener('click', onLater);
  modal.addEventListener('click', onBackdrop);
}

async function refreshBetaChannel(silent) {
  if (isCheckingBeta) return;
  const api = window.launcher.getUpdateChannel || window.launcher.checkBetaUpdate;
  if (!api) return;
  isCheckingBeta = true;
  if (!silent) setBetaStatus('Vérification des versions beta / alpha...', '…');
  try {
    const state = await (window.launcher.getUpdateChannel
      ? window.launcher.getUpdateChannel()
      : window.launcher.checkBetaUpdate());
    if (state?.success === false && state?.error) {
      setBetaStatus('Impossible de contacter GitHub pour les bêtas.', '!');
      showToast('Canal bêta : ' + state.error, 'error');
      return state;
    }
    paintBetaChannelState(state);
    return state;
  } catch {
    if (!silent) setBetaStatus('Erreur de vérification du canal bêta.', '!');
    return null;
  } finally {
    isCheckingBeta = false;
  }
}

async function installTargetVersion(version, label) {
  if (!version) return;
  try {
    setBetaStatus(`Téléchargement de ${label} v${version}...`, '↓');
    showToast(`Installation de ${label} v${version}...`, 'info');
    if (window.launcher.installUpdateVersion) {
      const result = await window.launcher.installUpdateVersion(version);
      if (!result?.success) throw new Error(result?.error || 'Le téléchargement n’a pas démarré. Réessayez.');
    } else {
      throw new Error('Cette version du launcher ne permet pas l’installation ciblée. Installez la dernière version du launcher.');
    }
    // La suite (progression + redémarrage auto) passe par les events
    // onUpdateAvailable / onUpdateProgress / onUpdateDownloaded existants.
  } catch (err) {
    setBetaStatus('Échec du téléchargement : ' + (err?.message || err), '!');
    showToast('Échec installation : ' + (err?.message || err), 'error');
  }
}

function proposeBetaInstall(state) {
  const beta = state?.latestBeta;
  if (!beta) {
    showToast('Aucune version bêta / alpha disponible.', 'info');
    return;
  }
  openBetaModal({
    title: `Installer la version ${getBetaChannelOf(beta.version) === 'alpha' ? 'alpha' : 'bêta'} v${beta.version} ?`,
    message: `Une version "${beta.version}" (canal ${getBetaChannelOf(beta.version)}) est disponible. Version actuelle : v${state.current}. Les bêtas peuvent être instables. L'installer maintenant ?`,
    notes: beta.body || '',
    confirmLabel: 'Installer la bêta',
    onConfirm: () => installTargetVersion(beta.version, 'bêta'),
  });
}

function proposeStableReturn(state) {
  const stable = state?.latestStable;
  if (!stable) {
    showToast('Aucune version stable trouvée.', 'error');
    return;
  }
  openBetaModal({
    title: `Revenir à la version stable v${stable.version} ?`,
    message: `Vous êtes sur v${state.current} (${state.currentChannel}). Le launcher va réinstaller la version officielle stable v${stable.version} puis redémarrer. Continuer ?`,
    notes: stable.body || '',
    confirmLabel: 'Retour stable',
    onConfirm: async () => {
      // Desactive le canal beta pour que les prochains checks restent stables,
      // puis installe explicitement la stable (downgrade autorisé côté main).
      try {
        if (window.launcher.setBetaTester) await window.launcher.setBetaTester(false);
      } catch {}
      installTargetVersion(stable.version, 'stable');
    },
  });
}

function initBetaTesterFromConfig(config) {
  const toggle = document.getElementById('settings-beta-tester');
  if (toggle && config && typeof config.betaTester === 'boolean') {
    toggle.checked = config.betaTester;
  }
}

(function initBetaTesterUI() {
  const toggle = document.getElementById('settings-beta-tester');
  const btnCheck = document.getElementById('btn-check-beta');
  const btnInstall = document.getElementById('btn-install-beta');
  const btnStable = document.getElementById('btn-return-stable');
  if (!toggle && !btnCheck) return;

  if (toggle) {
    toggle.addEventListener('change', async () => {
      const enabled = toggle.checked;
      try {
        const res = window.launcher.setBetaTester
          ? await window.launcher.setBetaTester(enabled)
          : await window.launcher.saveConfig({ betaTester: enabled });
        const state = res && (res.current || res.betaEnabled !== undefined) ? res : await refreshBetaChannel(true);
        paintBetaChannelState(state);
        showToast(enabled ? 'Canal Beta / Alpha activé — vérification des bêtas...' : 'Canal stable activé — retour aux versions officielles.', 'info');
        if (enabled) {
          const fresh = state?.latestBeta ? state : await refreshBetaChannel(true);
          if (fresh?.betaAvailable) proposeBetaInstall(fresh);
          else if (fresh) showToast('Aucune bêta plus récente pour le moment.', 'info');
        } else if (state?.canReturnToStable) {
          proposeStableReturn(state);
        }
      } catch (err) {
        showToast('Erreur canal bêta : ' + (err?.message || err), 'error');
      }
      try { playMinecraftClickSound(); } catch {}
    });
  }

  if (btnCheck) {
    btnCheck.addEventListener('click', async () => {
      const state = await refreshBetaChannel(false);
      if (!state) return;
      if (state.betaAvailable && state.betaEnabled) proposeBetaInstall(state);
      else if (!state.betaEnabled && state.canReturnToStable) proposeStableReturn(state);
      else if (!state.betaEnabled) showToast('Aucune mise à jour stable. Activez le canal bêta pour voir les pré-releases.', 'info');
      else showToast('Aucune bêta plus récente pour le moment.', 'info');
      try { playMinecraftClickSound(); } catch {}
    });
  }

  if (btnInstall) {
    btnInstall.addEventListener('click', () => {
      if (betaChannelState) proposeBetaInstall(betaChannelState);
      else refreshBetaChannel(false).then((s) => { if (s?.betaAvailable) proposeBetaInstall(s); });
    });
  }

  if (btnStable) {
    btnStable.addEventListener('click', () => {
      const state = betaChannelState;
      if (state?.latestStable) proposeStableReturn(state);
      else refreshBetaChannel(false).then((s) => { if (s?.canReturnToStable) proposeStableReturn(s); });
    });
  }

  // Etat initial silencieux (peint des que le renderer demarre).
  setTimeout(() => { refreshBetaChannel(true).catch(() => {}); }, 4000);
})();

function initOnboardingWizard() {
  const modal = document.getElementById('modal-onboarding');
  if (!modal) return null;

  const btnPrev = document.getElementById('btn-onboarding-prev');
  const btnNext = document.getElementById('btn-onboarding-next');
  const btnFinish = document.getElementById('btn-onboarding-finish');
  const btnRelaunch = document.getElementById('btn-relaunch-onboarding');
  const dots = document.querySelectorAll('#onboarding-dots .dot');
  const indicators = document.querySelectorAll('.onboarding-step-indicator');
  const panes = document.querySelectorAll('.onboarding-step-pane');
  const invitationInput = document.getElementById('onboarding-invitation-code');
  const invitationStatus = document.getElementById('onboarding-invitation-status');
  let invitationAccepted = false;
  let invitationPending = false;
  let invitationRetryAt = 0;
  let invitationTimer = null;
  let invitationError = '';

  function refreshInvitationControls() {
    const seconds = Math.max(0, Math.ceil((invitationRetryAt - Date.now()) / 1000));
    if (currentStep === 0) {
      btnNext.disabled = invitationPending || seconds > 0;
      btnNext.textContent = invitationPending ? 'Validation...' : seconds > 0 ? `Réessayer dans ${seconds} s` : 'Valider le code →';
      invitationInput.disabled = invitationPending || seconds > 0;
      if (seconds > 0) {
        const message = `${invitationError ? invitationError + ' ' : ''}Veuillez patienter ${seconds} secondes avant de réessayer.`;
        if (invitationStatus.textContent !== message) invitationStatus.textContent = message;
      }
    }
    if (seconds === 0 && invitationTimer) {
      clearInterval(invitationTimer);
      invitationTimer = null;
      if (currentStep === 0) {
        invitationStatus.textContent = 'Vous pouvez réessayer votre code d’invitation.';
        invitationInput.focus();
      }
    }
  }

  function startInvitationCooldown(seconds) {
    invitationRetryAt = Date.now() + seconds * 1000;
    if (invitationTimer) clearInterval(invitationTimer);
    invitationTimer = setInterval(refreshInvitationControls, 250);
    refreshInvitationControls();
    modal.querySelector('.onboarding-dialog')?.focus();
  }

  async function openWizard() {
    refreshAccountTypeBlocks();
    modal.classList.remove('hidden');
    goToStep(invitationAccepted ? 1 : 0);
    try {
      const status = await window.launcher.getInvitationStatus();
      invitationAccepted = status?.accepted === true;
      goToStep(invitationAccepted ? 1 : 0);
      if (!invitationAccepted && status?.retryAfter > 0) startInvitationCooldown(status.retryAfter);
      else if (status?.error) invitationStatus.textContent = status.error;
    } catch {
      invitationStatus.textContent = 'Validation des invitations indisponible. Réessayez.';
    }
    if (!invitationAccepted) invitationInput.focus();
  }

  // Step 1 Elements — type de compte (Crack / Microsoft)
  const inputUsername = document.getElementById('onboarding-username-input');
  const avatarImg = document.getElementById('onboarding-avatar-img');
  const accountTypeCards = document.querySelectorAll('#onboarding-account-types .onboarding-server-card');
  const offlineBlock = document.getElementById('onboarding-offline-block');
  const microsoftBlock = document.getElementById('onboarding-microsoft-block');
  const btnOnboardingMicrosoft = document.getElementById('btn-onboarding-microsoft');
  const msStatus = document.getElementById('onboarding-ms-status');

  function getOnboardingAccountType() {
    return document.querySelector('#onboarding-account-types .onboarding-server-card.active')?.dataset.accountType || 'offline';
  }

  // Step 2 Elements
  const ramCards = document.querySelectorAll('.onboarding-ram-card');
  const ramSliderEl = document.getElementById('onboarding-ram-slider');
  const ramDisplay = document.getElementById('onboarding-ram-val-display');
  const systemRamTag = document.getElementById('onboarding-system-ram-tag');

  // Step 3 Elements (choix du serveur)
  const serverCards = document.querySelectorAll('#onboarding-server-grid .onboarding-server-card');

  let currentStep = 0;
  const TOTAL_STEPS = 3;

  // Set detected system RAM on step 2
  if (systemRamTag && window.launcher.getSystemRam) {
    window.launcher.getSystemRam().then(totalGB => {
      if (totalGB && totalGB > 0) {
        systemRamTag.textContent = `RAM système détectée : ${totalGB} Go`;
        if (ramSliderEl) {
          ramSliderEl.max = Math.min(32, Math.max(8, totalGB));
        }
      }
    }).catch(() => {});
  }

  // Pre-fill username if already logged in
  const currentLoggedIn = document.getElementById('account-name')?.textContent;
  if (currentLoggedIn && currentLoggedIn !== 'Non connecté' && inputUsername) {
    inputUsername.value = currentLoggedIn;
    if (avatarImg) avatarImg.src = `https://mc-heads.net/avatar/${encodeURIComponent(currentLoggedIn)}/96`;
  }

  // Sélection du type de compte (Crack / Microsoft)
  function refreshAccountTypeBlocks() {
    const type = getOnboardingAccountType();
    if (offlineBlock) offlineBlock.classList.toggle('hidden', type !== 'offline');
    if (microsoftBlock) microsoftBlock.classList.toggle('hidden', type !== 'microsoft');
  }
  accountTypeCards.forEach(card => {
    card.addEventListener('click', () => {
      accountTypeCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      refreshAccountTypeBlocks();
      playMinecraftClickSound();
    });
  });
  refreshAccountTypeBlocks();

  // Connexion Microsoft depuis l'onboarding
  if (btnOnboardingMicrosoft) {
    btnOnboardingMicrosoft.addEventListener('click', async () => {
      btnOnboardingMicrosoft.disabled = true;
      const label = btnOnboardingMicrosoft.querySelector('span');
      if (label) label.textContent = 'Connexion en cours...';
      try {
        const res = await window.launcher.authMicrosoft();
        if (res?.success) {
          setLoggedIn(res.username, res.uuid);
          if (msStatus) msStatus.textContent = `Connecté : ${res.username}`;
          showToast(`Compte Microsoft connecté : ${res.username}`, 'success');
        } else if (res?.error && !/annul/i.test(res.error)) {
          showToast('Erreur Microsoft : ' + res.error, 'error');
        }
      } catch {
        showToast('Erreur de connexion Microsoft.', 'error');
      } finally {
        btnOnboardingMicrosoft.disabled = false;
        if (label) label.textContent = 'Se connecter avec Microsoft';
      }
    });
  }

  // Real-time avatar update
  let avatarTimeout = null;
  if (inputUsername && avatarImg) {
    inputUsername.addEventListener('input', () => {
      clearTimeout(avatarTimeout);
      const name = inputUsername.value.trim() || 'Steve';
      avatarTimeout = setTimeout(() => {
        avatarImg.src = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/96`;
      }, 300);
    });
  }

  // RAM cards & slider sync
  ramCards.forEach(card => {
    card.addEventListener('click', () => {
      const ramVal = parseInt(card.dataset.ram, 10);
      if (ramSliderEl) ramSliderEl.value = ramVal;
      if (ramDisplay) ramDisplay.textContent = `${ramVal} Go`;
      ramCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    });
  });

  if (ramSliderEl) {
    ramSliderEl.addEventListener('input', () => {
      const val = parseInt(ramSliderEl.value, 10);
      if (ramDisplay) ramDisplay.textContent = `${val} Go`;
      ramCards.forEach(card => {
        card.classList.toggle('active', parseInt(card.dataset.ram, 10) === val);
      });
    });
  }

  // Server cards selection
  serverCards.forEach(card => {
    card.addEventListener('click', () => {
      serverCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    });
  });

  function goToStep(step) {
    currentStep = invitationAccepted ? Math.max(1, Math.min(TOTAL_STEPS, step)) : 0;

    // Update panes
    panes.forEach(pane => {
      const paneId = `onboarding-pane-${currentStep}`;
      pane.classList.toggle('active', pane.id === paneId);
    });

    // Update stepper
    indicators.forEach(ind => {
      const s = parseInt(ind.dataset.step, 10);
      ind.classList.toggle('active', s === currentStep);
      ind.classList.toggle('completed', s < currentStep);
    });

    // Update dots
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === currentStep);
    });

    // Update buttons
    if (btnPrev) {
      btnPrev.style.visibility = currentStep > 1 ? 'visible' : 'hidden';
    }
    if (btnNext && btnFinish) {
      btnNext.disabled = false;
      btnNext.textContent = 'Continuer →';
      if (currentStep === TOTAL_STEPS) {
        btnNext.classList.add('hidden');
        btnFinish.classList.remove('hidden');
      } else {
        btnNext.classList.remove('hidden');
        btnFinish.classList.add('hidden');
      }
    }
    refreshInvitationControls();
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      goToStep(currentStep - 1);
      playMinecraftClickSound();
    });
  }

  if (btnNext) {
    invitationInput?.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); btnNext.click(); }
    });
    btnNext.addEventListener('click', async () => {
      if (currentStep === 0) {
        if (invitationPending || Date.now() < invitationRetryAt) return;
        const code = invitationInput.value.trim();
        if (!code) {
          invitationStatus.textContent = 'Le code d’invitation est obligatoire.';
          invitationInput.focus();
          return;
        }
        invitationPending = true;
        refreshInvitationControls();
        modal.querySelector('.onboarding-dialog')?.focus();
        try {
          const result = await window.launcher.verifyInvitation(code);
          if (result?.success === true) {
            invitationAccepted = true;
            invitationInput.value = '';
            goToStep(1);
            inputUsername?.focus();
          } else {
            invitationError = result?.error || 'Code d’invitation refusé.';
            invitationStatus.textContent = invitationError;
            if (result?.retryAfter > 0) startInvitationCooldown(result.retryAfter);
          }
        } catch {
          invitationStatus.textContent = 'Impossible de vérifier le code. Réessayez.';
        } finally {
          invitationPending = false;
          refreshInvitationControls();
        }
        return;
      }
      if (currentStep === 1 && getOnboardingAccountType() === 'offline') {
        const username = inputUsername?.value.trim();
        if (username && typeof window.launcher.authOffline === 'function') {
          const curr = document.getElementById('account-name')?.textContent;
          if (!curr || curr === 'Non connecté') {
            window.launcher.authOffline(username).then(res => {
              if (res?.success) setLoggedIn(res.username, res.uuid);
            }).catch(() => {});
          }
        }
      }
      goToStep(currentStep + 1);
      playMinecraftClickSound();
    });
  }

  if (btnFinish) {
    btnFinish.addEventListener('click', async () => {
      if (!invitationAccepted) { goToStep(0); return; }
      btnFinish.disabled = true;
      btnFinish.innerHTML = '<span>Enregistrement...</span>';

      try {
        const accountType = getOnboardingAccountType();
        const curr = document.getElementById('account-name')?.textContent;
        const isLoggedOut = !curr || curr === 'Non connecté';

        // 1. Compte : Crack (pseudo) ou Microsoft selon le choix
        if (accountType === 'microsoft') {
          if (isLoggedOut) {
            if (msStatus) msStatus.textContent = 'Connexion Microsoft en cours...';
            const msRes = await window.launcher.authMicrosoft();
            if (msRes?.success) {
              setLoggedIn(msRes.username, msRes.uuid);
              if (msStatus) msStatus.textContent = `Connecté : ${msRes.username}`;
            } else {
              showToast('Connexion Microsoft requise pour terminer (ou choisissez Compte Crack).', 'error', 4000);
              btnFinish.disabled = false;
              btnFinish.innerHTML = '<span>Terminer & Jouer 🎮</span>';
              return;
            }
          }
        } else {
          const username = inputUsername?.value.trim();
          if (!username) {
            showToast('Entrez un pseudo pour le compte Crack.', 'error');
            goToStep(1);
            btnFinish.disabled = false;
            btnFinish.innerHTML = '<span>Terminer & Jouer 🎮</span>';
            return;
          }
          if (isLoggedOut && window.launcher.authOffline) {
            const authRes = await window.launcher.authOffline(username);
            if (authRes?.success) setLoggedIn(authRes.username, authRes.uuid);
          }
        }

        // 2. RAM
        const chosenRam = parseInt(ramSliderEl?.value || '6', 10);
        if (ramSlider) ramSlider.value = chosenRam;
        if (ramValue) ramValue.textContent = `${chosenRam} Go`;
        if (settingsRam) settingsRam.value = chosenRam;
        if (settingsRamValue) settingsRamValue.textContent = `${chosenRam} Go`;

        // 3. Serveur
        const chosenServerId = document.querySelector('#onboarding-server-grid .onboarding-server-card.active')?.dataset.server || 'adoserv2';
        if (window.launcher.setActiveServer) {
          const sRes = await window.launcher.setActiveServer(chosenServerId);
          if (sRes?.activeServer) {
            currentServerId = sRes.activeServer.id;
            applyServerUI(sRes.activeServer);
            updateLiveServerBadge();
            loadMods();
          }
        }

        // 4. Mark onboarding completed in config
        if (window.launcher.saveConfig) {
          const saved = await window.launcher.saveConfig({
            ram: chosenRam,
            activeServerId: chosenServerId,
            onboardingCompleted: true
          });
          if (!saved?.success) throw new Error(saved?.error || 'Échec de l’enregistrement.');
        }

        modal.classList.add('hidden');
        showToast('Configuration initiale enregistrée ! Bon jeu sur Yapapouaiye.', 'success', 4000);
        playMinecraftClickSound();

        const playTab = document.querySelector('.nav-item[data-page="home"]');
        if (playTab) playTab.click();
      } catch (err) {
        console.error('[Onboarding] Error finishing setup:', err);
        showToast(err?.message || 'Impossible de terminer la configuration. Réessayez.', 'error');
      } finally {
        btnFinish.disabled = false;
        btnFinish.innerHTML = '<span>Terminer & Jouer 🎮</span>';
      }
    });
  }

  if (btnRelaunch) {
    btnRelaunch.addEventListener('click', () => {
      openWizard();
      playMinecraftClickSound();
    });
  }

  modal.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll('button, input, select, [tabindex="0"]')]
      .filter(element => !element.disabled && getComputedStyle(element).visibility !== 'hidden' && element.getClientRects().length > 0);
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });

  return {
    open: openWizard,
    close: () => {
      modal.classList.add('hidden');
    }
  };
}

// Peint le badge serveur à partir de l'état pré-chargé (sans réseau).
function paintServerBadgeFromBoot(online, serverName) {
  const topbarBadge = document.getElementById('topbar-server-badge');
  const homeBadge = document.getElementById('home-server-badge');
  const label = `${serverName || 'SERVEUR'} ${online ? 'EN LIGNE' : 'HORS LIGNE'}`;
  if (topbarBadge) {
    const dot = topbarBadge.querySelector('.status-dot');
    const text = topbarBadge.querySelector('.server-text');
    if (dot) dot.className = online ? 'status-dot online' : 'status-dot offline';
    if (text) text.textContent = label;
  }
  if (homeBadge) {
    homeBadge.className = online ? 'mc-tag tag-status online' : 'mc-tag tag-status offline';
    homeBadge.innerHTML = online
      ? '<span class="status-dot online"></span> EN LIGNE'
      : '<span class="status-dot offline"></span> HORS LIGNE';
  }
}

// Initializer — peint l'état pré-chargé pendant le splash dès la 1ère frame
// (auth + serveur + mods, sans flash "Non connecté"), puis rafraîchit
// en tâche de fond les appels réseau lents (release notes, badge live).
(async () => {
  const finishBoot = () => {
    try { document.body.classList.remove('is-booting'); } catch {}
    const b = document.getElementById('boot-overlay');
    if (b) b.classList.add('hidden');
  };
  try {
    await initRamLimits();
    initCustomThemeModal();
    const onboarding = initOnboardingWizard();

    // 1. État pré-chargé par le main pendant le logo (instantané)
    let boot = null;
    try {
      if (window.launcher.getInitialState) boot = await window.launcher.getInitialState();
    } catch { boot = null; }

    let config = (boot && boot.config) || null;
    if (!config) {
      try { config = await window.launcher.getConfig(); } catch { config = null; }
    }
    if (config && config.customThemes && Array.isArray(config.customThemes)) {
      customThemes = config.customThemes;
    }
    if (config && config.themeOverrides && typeof config.themeOverrides === 'object' && !Array.isArray(config.themeOverrides)) {
      themeOverrides = config.themeOverrides;
    }
    if (config && (config.customThemes || config.themeOverrides)) {
      updateDynamicThemeStyles();
    }
    if (config && config.theme) applyTheme(config.theme);
    if (config && config.ram) {
      const clampedRam = Math.min(Math.max(config.ram, ramMin), ramMax);
      if (ramSlider) ramSlider.value = clampedRam;
      if (ramValue) ramValue.textContent = `${clampedRam} Go`;
      if (settingsRam) settingsRam.value = clampedRam;
      if (settingsRamValue) settingsRamValue.textContent = `${clampedRam} Go`;
    }
    // 1b. Modules client des la 1ere frame : le main les inclut desormais
    // dans get-initial-state (boot.clientMods). Peinture immediate du
    // simulateur HUD, avec repli getClientMods si le boot n'en a pas.
    try {
      const bootMods = (boot && boot.clientMods) || (config && config.clientMods) || null;
      if (bootMods && typeof updateHudSimulator === 'function') {
        updateHudSimulator(bootMods);
      }
      if (typeof loadClientPageSettings === 'function') {
        if (bootMods) {
          // Aligne les toggles sans attendre le reseau.
          loadClientPageSettings();
        } else {
          loadClientPageSettings();
        }
      }
    } catch {}

    // 2. Auth instantanée (le refresh Microsoft a déjà eu lieu pendant le splash)
    let loggedIn = false;
    if (boot && boot.login && boot.login.success) {
      setLoggedIn(boot.login.username, boot.login.uuid);
      loggedIn = true;
    } else {
      try {
        const login = await window.launcher.autoLogin();
        if (login && login.success) {
          setLoggedIn(login.username, login.uuid);
          loggedIn = true;
        }
      } catch {}
    }

    // 3. Serveur + mods instantanés (disque local, aucun réseau)
    if (boot && boot.servers && boot.servers.activeServer) {
      currentServerId = boot.servers.activeServerId || 'adoserv2';
      try { applyServerUI(boot.servers.activeServer); } catch {}
    }
    // Maintenance distante (espace admin) connue dès le boot : peint le bandeau
    // avant même l'affichage (l'état frais est re-vérifié au clic JOUER).
    try {
      if (boot && boot.servers && boot.servers.launcherConfig) {
        applyMaintenanceState(boot.servers.launcherConfig);
      }
    } catch {}
    if (boot && Array.isArray(boot.mods)) {
      cachedServerMods = boot.mods;
      try { renderFilteredMods(); } catch {}
    }
    if (boot && boot.appVersion) {
      const el = document.getElementById('app-version');
      if (el) el.textContent = `v${boot.appVersion}`;
    }
    if (boot && typeof boot.serverOnline === 'boolean') {
      try { paintServerBadgeFromBoot(boot.serverOnline, boot.servers?.activeServer?.name); } catch {}
    }

    await initServerSelector();
    // 4. Révèle l'UI avec le bon état AVANT les appels réseau lents
    finishBoot();

    // 5. Fond : rafraîchit mods, settings, thèmes, release notes, badge live
    loadMods();
    loadSettings();
    renderThemeGrid();
    loadLatestReleaseInfo();
    updateLiveServerBadge();

    if (window.launcher.getAppVersion) {
      window.launcher.getAppVersion().then((v) => {
        const el = document.getElementById('app-version');
        if (el && v) el.textContent = `v${v}`;
      }).catch(() => {});
    }

    // Check first launch ever (Onboarding personalisé)
    const invitation = await window.launcher.getInvitationStatus().catch(() => ({ accepted: false }));
    if (!invitation.accepted || !config || config.onboardingCompleted !== true) {
      if (onboarding) onboarding.open();
    } else if (window.launcher.checkFirstLaunchAfterUpdate) {
      // First launch after an update: open the Actualités tab with posts and the separate patch section
      try {
        const res = await window.launcher.checkFirstLaunchAfterUpdate();
        if (res?.isFirstLaunchAfterUpdate) {
          const newsTab = document.querySelector('.nav-item[data-page="news"]');
          if (newsTab) newsTab.click();
          if (window.launcher.markVersionSeen) await window.launcher.markVersionSeen();
        }
      } catch (err) {
        console.error('[Update] Check first launch after update failed:', err);
      }
    }
  } catch (err) {
    console.error('[Renderer] Initialization error:', err);
    try { finishBoot(); } catch {}
  }
})();

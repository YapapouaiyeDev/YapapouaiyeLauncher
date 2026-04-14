const overlayContainer = document.getElementById('overlay-container');
const optNightVision = document.getElementById('opt-night-vision');
const optNoFog = document.getElementById('opt-no-fog');
const optShaders = document.getElementById('opt-shaders');

let isVisible = false;

function showOverlay() {
  if (isVisible) return;
  isVisible = true;
  overlayContainer.classList.remove('hidden');
}

function hideOverlay() {
  if (!isVisible) return;
  isVisible = false;
  overlayContainer.classList.add('hidden');
}

function toggleOverlay() {
  if (isVisible) hideOverlay();
  else showOverlay();
}

// Send option states to main process
function broadcastOptions() {
  window.api.sendOptions({
    nightVision: optNightVision.checked,
    noFog: optNoFog.checked,
    shaders: optShaders.checked,
  });
}

[optNightVision, optNoFog, optShaders].forEach(toggle => {
  toggle.addEventListener('change', broadcastOptions);
});

// Listen for main process commands
window.api.onToggleOverlay(() => toggleOverlay());
window.api.onShowOverlay(() => showOverlay());
window.api.onHideOverlay(() => hideOverlay());
window.api.onSetOptions((opts) => {
  if (opts.nightVision !== undefined) optNightVision.checked = opts.nightVision;
  if (opts.noFog !== undefined) optNoFog.checked = opts.noFog;
  if (opts.shaders !== undefined) optShaders.checked = opts.shaders;
});

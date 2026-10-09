import { createBlackHoleRenderer } from './black-hole-renderer.js';

const $ = id => document.getElementById(id);
const host = $('scene');
const controls = { approach: $('approach'), brightness: $('brightness'), inclination: $('inclination') };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let renderer, observer, raf = 0, previous = 0, time = 0;
let paused = reducedMotion.matches, auto = false, direction = 1, progress = 0;
let frames = 0, sampleStart = 0, slowSamples = 0, autoQuality = 'balanced';
let failed = false;

function syncControls() {
  progress = Number(controls.approach.value);
  $('approachValue').textContent = `${Math.round(progress)}%`;
  $('brightnessValue').textContent = `${(Number(controls.brightness.value) / 100).toFixed(2)}×`;
  $('inclinationValue').textContent = `${controls.inclination.value}°`;
  $('distanceReadout').textContent = progress < 35 ? '01 / DISTANT OBSERVER' : progress < 75 ? '02 / GRAVITATIONAL CAPTURE' : '03 / HORIZON APPROACH';
}
function render() {
  if (!renderer || document.hidden) return;
  renderer.render({ time, approach: progress / 100,
    brightness: Math.max(0, (Number(controls.brightness.value) - 60) / 200),
    inclination: Number(controls.inclination.value) });
}
function resize() {
  if (!renderer) return;
  renderer.resize(host.clientWidth, host.clientHeight, {
    pixelRatio: window.devicePixelRatio || 1,
    quality: $('quality').value === 'auto' ? autoQuality : $('quality').value
  });
  render();
}
function schedule() {
  cancelAnimationFrame(raf); raf = 0; previous = 0; frames = 0; sampleStart = 0;
  if (!paused && !document.hidden && renderer && !renderer.info.lost) raf = requestAnimationFrame(tick);
}
function tick(now) {
  raf = 0;
  const dt = previous ? Math.min(0.05, (now - previous) / 1000) : 0;
  previous = now; time += dt;
  if (auto) {
    progress += direction * dt * 5.5;
    if (progress >= 100) { progress = 100; direction = -1; }
    if (progress <= 0) { progress = 0; direction = 1; }
    controls.approach.value = String(progress);
    // Keep sub-step accumulator separate from the input's rounded display value.
    const exact = progress; syncControls(); progress = exact;
  }
  render();
  if (!sampleStart) sampleStart = now;
  frames++;
  if (now - sampleStart >= 1200) {
    const fps = Math.round((frames - 1) * 1000 / (now - sampleStart));
    const info = renderer.info;
    $('fpsReadout').textContent = `${fps} FPS / ${info.width} × ${info.height}`;
    slowSamples = fps < 32 ? slowSamples + 1 : 0;
    if ($('quality').value === 'auto' && slowSamples >= 2 && autoQuality !== 'low') {
      autoQuality = 'low'; resize(); $('statusBox').textContent = 'Auto quality / reduced resolution for smoother motion';
    }
    sampleStart = now; frames = 0;
  }
  if (!paused && !document.hidden && !renderer.info.lost) raf = requestAnimationFrame(tick);
}
function syncTransport() {
  $('autoButton').setAttribute('aria-pressed', String(auto));
  $('autoButton').textContent = auto ? 'Auto approach / on' : 'Auto approach ↗';
  $('pauseButton').setAttribute('aria-pressed', String(paused));
  $('pauseButton').textContent = paused ? 'Resume' : 'Pause';
  $('motionReadout').textContent = paused ? 'HELD' : 'LIVE';
  if (paused) $('fpsReadout').textContent = 'Frame held / GPU idle';
}
function showError(message) {
  $('sceneError').hidden = false; $('sceneError').textContent = message;
  $('statusBox').textContent = message;
}
function initialize() {
  try {
    renderer = createBlackHoleRenderer({ onStatus(status) {
      if (status === 'lost') { showError('Graphics context lost. Waiting for the browser to restore it.'); schedule(); }
      else { $('sceneError').hidden = true; $('statusBox').textContent = 'Graphics context restored'; resize(); schedule(); }
    } });
    host.appendChild(renderer.canvas);
    observer = new ResizeObserver(resize); observer.observe(host);
    resize(); schedule();
  } catch (error) {
    failed = true;
    showError('WebGL is unavailable. Enable hardware acceleration or try a WebGL-capable browser.');
    $('fpsReadout').textContent = 'WEBGL UNAVAILABLE';
    document.querySelectorAll('.console input, .console button, .console select').forEach(el => { el.disabled = true; });
  }
}
Object.values(controls).forEach(control => control.addEventListener('input', () => { syncControls(); render(); }));
$('quality').addEventListener('change', () => { slowSamples = 0; autoQuality = 'balanced'; resize(); });
$('autoButton').addEventListener('click', () => { auto = !auto; if (auto) paused = false; syncTransport(); schedule(); });
$('pauseButton').addEventListener('click', () => { paused = !paused; syncTransport(); schedule(); });
$('resetButton').addEventListener('click', () => {
  controls.approach.value = '0'; controls.brightness.value = '135'; controls.inclination.value = '76';
  auto = false; direction = 1; time = 0; paused = reducedMotion.matches;
  syncControls(); syncTransport(); render(); schedule();
  $('statusBox').textContent = 'Reference view restored';
});
document.addEventListener('visibilitychange', schedule);
window.addEventListener('resize', resize);
reducedMotion.addEventListener('change', event => { if (event.matches) { paused = true; syncTransport(); schedule(); } });
window.addEventListener('pagehide', event => {
  cancelAnimationFrame(raf);
  if (!event.persisted) { observer?.disconnect(); renderer?.dispose(); }
});
window.addEventListener('pageshow', event => { if (event.persisted && !failed) { resize(); schedule(); } });
syncControls(); syncTransport(); initialize();

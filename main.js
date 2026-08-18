import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js';

const host = document.getElementById('scene');
const fpsReadout = document.getElementById('fpsReadout');
const statusBox = document.getElementById('statusBox');

const controls = {
  approach: document.getElementById('approach'),
  brightness: document.getElementById('brightness'),
  inclination: document.getElementById('inclination'),
  lensing: document.getElementById('lensing')
};

const outputs = {
  approach: document.getElementById('approachValue'),
  brightness: document.getElementById('brightnessValue'),
  inclination: document.getElementById('inclinationValue'),
  lensing: document.getElementById('lensingValue')
};

const autoButton = document.getElementById('autoButton');
const resetButton = document.getElementById('resetButton');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
} catch (error) {
  statusBox.textContent = 'WebGL failed to initialize. The black hole has consumed the renderer before launch.';
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.35 : 1.8));
renderer.setClearColor(0x000000, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uTime: { value: 0 },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uApproach: { value: 0.42 },
  uBrightness: { value: 1.35 },
  uInclination: { value: 76.0 },
  uLens: { value: 1.0 }
};

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uApproach;
  uniform float uBrightness;
  uniform float uInclination;
  uniform float uLens;

  #define PI 3.14159265359

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.82, -0.57, 0.57, 0.82);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot * p * 2.03 + 17.1;
      a *= 0.5;
    }
    return v;
  }

  float gaussian(float x, float width) {
    return exp(-(x * x) / max(0.00001, width * width));
  }

  float starLayer(vec2 p, float scale, float threshold) {
    vec2 g = p * scale;
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash21(cell);
    vec2 offset = vec2(hash21(cell + 4.7), hash21(cell + 9.2)) - 0.5;
    float d = length(f - offset * 0.62);
    float point = 1.0 - smoothstep(0.012, 0.068, d);
    point *= smoothstep(threshold, 1.0, h);
    float twinkle = 0.74 + 0.26 * sin(uTime * (1.0 + h * 2.4) + h * 44.0);
    return point * twinkle;
  }

  vec3 starField(vec2 p) {
    float s = 0.0;
    s += starLayer(p + vec2(0.17, 0.03), 42.0, 0.975) * 0.72;
    s += starLayer(p * 1.31 - vec2(0.23, 0.14), 73.0, 0.986) * 0.94;
    s += starLayer(p * 1.73 + vec2(0.05, 0.31), 115.0, 0.993) * 1.18;
    vec3 col = vec3(0.74, 0.82, 0.96) * s;
    float dust = fbm(p * 1.5 + 30.0);
    col += vec3(0.035, 0.045, 0.068) * smoothstep(0.55, 0.91, dust) * 0.58;
    return col;
  }

  vec3 diskPalette(float heat, float doppler) {
    vec3 ember = vec3(0.50, 0.105, 0.018);
    vec3 amber = vec3(1.00, 0.39, 0.07);
    vec3 cream = vec3(1.00, 0.80, 0.55);
    vec3 whiteHot = vec3(1.0, 0.985, 0.94);
    vec3 c = mix(ember, amber, smoothstep(0.02, 0.44, heat));
    c = mix(c, cream, smoothstep(0.34, 0.74, heat));
    c = mix(c, whiteHot, smoothstep(0.70, 1.0, heat));
    c *= mix(vec3(1.12, 0.73, 0.53), vec3(0.74, 0.90, 1.13), doppler);
    return c;
  }

  vec4 diskMaterial(vec2 p, float thickness) {
    vec2 q = vec2(p.x, p.y / thickness);
    float r = length(q);
    float ang = atan(q.y, q.x);

    float inner = smoothstep(0.34, 0.40, r);
    float outer = 1.0 - smoothstep(1.02, 1.34, r);
    float band = inner * outer;

    float spin = uTime * 0.42;
    float flow = fbm(vec2(ang * 3.2 + spin, r * 9.2 - spin * 1.7));
    float streak = fbm(vec2(ang * 11.0 - spin * 2.8, r * 26.0 + flow * 2.7));
    float fine = noise(vec2(ang * 39.0 + spin * 4.7, r * 78.0));
    float turbulence = clamp(flow * 0.58 + streak * 0.31 + fine * 0.15, 0.0, 1.0);

    float innerHeat = 1.0 - smoothstep(0.36, 1.11, r);
    float filament = smoothstep(0.22, 0.82, turbulence);
    float gaps = 0.48 + 0.52 * smoothstep(0.16, 0.78, streak);
    float alpha = band * (0.30 + 1.08 * filament) * gaps;

    float doppler = smoothstep(-1.0, 1.0, q.x / max(r, 0.001));
    float hot = clamp(innerHeat * 0.90 + turbulence * 0.38, 0.0, 1.0);
    vec3 col = diskPalette(hot, doppler);
    col *= (0.48 + 1.85 * innerHeat + 0.74 * turbulence) * uBrightness;

    return vec4(col, clamp(alpha, 0.0, 1.0));
  }

  vec3 lensedDiskShell(vec2 p, float horizon, float thickness) {
    float r = length(p);
    float theta = atan(p.y, p.x);
    float lens = clamp(uLens, 0.0, 1.8);
    vec3 col = vec3(0.0);

    // Behind the black hole, the accretion disk is gravitationally imaged upward and downward.
    // These are not full circular rings: they are compressed copies of the disk that hug the shadow.
    float xNorm = clamp(abs(p.x) / (horizon * 2.35), 0.0, 1.0);
    float arch = sqrt(max(0.0, 1.0 - xNorm * xNorm));
    float upperY = horizon * (1.04 + 0.78 * arch * lens);
    float lowerY = -horizon * (1.03 + 0.54 * arch * lens);

    float upperBand = gaussian(p.y - upperY, 0.020 + 0.018 * (1.0 - xNorm));
    float lowerBand = gaussian(p.y - lowerY, 0.017 + 0.015 * (1.0 - xNorm));
    float sideMask = 1.0 - smoothstep(horizon * 2.15, horizon * 2.75, abs(p.x));

    float streamU = p.x * 4.8 + uTime * 0.38;
    float streamUpper = fbm(vec2(streamU, p.y * 18.0 + 4.0));
    float streamLower = fbm(vec2(streamU * 1.08 - 5.0, p.y * 20.0 - 2.0));

    float doppler = smoothstep(-horizon * 2.2, horizon * 2.2, p.x);
    vec3 hot = diskPalette(0.90 + 0.10 * streamUpper, doppler);
    vec3 warm = diskPalette(0.82 + 0.14 * streamLower, doppler);

    col += hot * upperBand * sideMask * (0.80 + 0.65 * streamUpper) * (1.15 + lens * 0.52) * uBrightness;
    col += warm * lowerBand * sideMask * (0.58 + 0.50 * streamLower) * (0.78 + lens * 0.34) * uBrightness;

    // Photon-orbit glow is intentionally broken into arcs instead of a clean Saturn-like ring.
    float photonR = horizon * (1.075 + 0.035 * lens);
    float photon = gaussian(r - photonR, 0.0065);
    float verticalBias = 0.28 + 0.72 * pow(abs(sin(theta)), 1.45);
    float breakup = 0.52 + 0.48 * fbm(vec2(theta * 6.0 + uTime * 0.18, r * 41.0));
    col += vec3(1.0, 0.94, 0.83) * photon * verticalBias * breakup * (1.7 + uApproach * 2.0) * uBrightness;

    return col;
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    uv.x *= aspect;

    // More breathing room at the beginning; approach zooms the object toward the player later.
    float zoom = mix(0.64, 1.19, uApproach);
    vec2 p = uv / zoom;
    p.y += 0.015;

    float horizon = 0.205;
    float r = length(p);
    vec2 dir = normalize(p + vec2(0.0001));

    // Stronger gravitational warping of the background. Near the photon sphere stars get
    // stretched tangentially, creating a visible "gravity field" without drawing fake force lines.
    float lens = clamp(uLens, 0.0, 1.8);
    float gravity = lens * horizon * horizon / (r * r + horizon * horizon * 0.30);
    float bend = (0.072 * lens) / (r * r + 0.040);
    vec2 tangent = vec2(-dir.y, dir.x);
    vec2 bent = p + dir * bend;
    bent += tangent * sin(atan(p.y, p.x) * 2.0 + uTime * 0.025) * gravity * 0.050;

    vec3 col = vec3(0.0010, 0.0014, 0.0023);
    col += starField(bent * 1.08);

    // Star smear around the lens: displaced samples give a tiny gravitational arc effect.
    float smearMask = smoothstep(horizon * 3.5, horizon * 1.10, r) * (1.0 - smoothstep(horizon * 0.98, horizon * 1.05, r));
    vec3 smearA = starField((bent + tangent * gravity * 0.055) * 1.08);
    vec3 smearB = starField((bent - tangent * gravity * 0.055) * 1.08);
    col += (smearA + smearB) * 0.22 * smearMask;

    float nebula = fbm(bent * 0.76 + vec2(-4.2, 8.7));
    col += vec3(0.026, 0.032, 0.050) * smoothstep(0.56, 0.91, nebula) * (1.0 - smoothstep(0.75, 1.75, r));

    float inclNorm = clamp((uInclination - 55.0) / 31.0, 0.0, 1.0);
    float thickness = mix(0.31, 0.090, inclNorm);

    // Main accretion plane: wide, turbulent and visually massive.
    vec4 disk = diskMaterial(p, thickness);
    col += disk.rgb * disk.a * 0.90;

    // The disk seen behind the black hole is bent over and under the shadow by gravity.
    col += lensedDiskShell(p, horizon, thickness);

    // Broad warm halo sells scale while keeping the center absolutely black.
    float hotHalo = gaussian(r - horizon * 1.27, 0.043);
    float wideHalo = gaussian(r - horizon * 1.56, 0.18);
    col += vec3(1.0, 0.78, 0.54) * hotHalo * (0.12 + 0.42 * uApproach) * uBrightness;
    col += vec3(0.46, 0.52, 0.72) * wideHalo * (0.024 + 0.09 * uApproach) * uBrightness;

    // Absolute event horizon. It occludes the rear disk and the distorted star field.
    float horizonMask = 1.0 - smoothstep(horizon * 0.985, horizon * 1.018, r);
    col *= 1.0 - horizonMask;

    // Foreground half of the accretion disk crosses in front of the shadow.
    vec4 frontDisk = diskMaterial(p, thickness);
    float foreground = 1.0 - smoothstep(-0.030, 0.075, p.y);
    float horizonFrontCut = 1.0 - horizonMask * smoothstep(-0.045, 0.028, p.y);
    frontDisk.a *= foreground * horizonFrontCut;
    col += frontDisk.rgb * frontDisk.a * 1.02;

    // A narrow rim remains visible mostly where the lensed disk rises above/below the shadow.
    float rim = gaussian(r - horizon * 1.018, 0.0048);
    float rimMask = 0.14 + 0.86 * pow(abs(p.y) / max(r, 0.001), 1.9);
    col += vec3(1.0, 0.94, 0.84) * rim * rimMask * (1.2 + uApproach * 1.9) * uBrightness;

    // Late approach becomes increasingly hostile: space itself blooms around the lens.
    float approachGlare = pow(uApproach, 3.10);
    float planeGlow = gaussian(p.y, 0.14 + 0.065 * uApproach) * (1.0 - smoothstep(0.18, 1.65, abs(p.x)));
    float lensGlow = gaussian(r - horizon * 1.45, 0.28);
    col += vec3(1.0, 0.88, 0.70) * planeGlow * approachGlare * 0.31 * uBrightness;
    col += vec3(0.78, 0.84, 1.0) * lensGlow * approachGlare * 0.075;

    // Filmic compression and deep-space falloff.
    col = 1.0 - exp(-col * 1.24);
    float vignette = 1.0 - smoothstep(0.58, 1.62, length(uv * vec2(0.72, 1.0)));
    col *= 0.67 + 0.33 * vignette;
    col = pow(max(col, 0.0), vec3(0.87));

    gl_FragColor = vec4(col, 1.0);
  }
`;

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader,
  depthWrite: false,
  depthTest: false
});

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene.add(quad);

function resize() {
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  renderer.setSize(width, height, false);
  uniforms.uResolution.value.set(renderer.domElement.width, renderer.domElement.height);
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(host);
resize();

function syncControls() {
  uniforms.uApproach.value = Number(controls.approach.value) / 100;
  uniforms.uBrightness.value = Number(controls.brightness.value) / 100;
  uniforms.uInclination.value = Number(controls.inclination.value);
  uniforms.uLens.value = Number(controls.lensing.value) / 100;

  outputs.approach.textContent = `${controls.approach.value}%`;
  outputs.brightness.textContent = `${uniforms.uBrightness.value.toFixed(2)}×`;
  outputs.inclination.textContent = `${controls.inclination.value}°`;
  outputs.lensing.textContent = `${uniforms.uLens.value.toFixed(2)}×`;
}

Object.values(controls).forEach(control => control.addEventListener('input', syncControls));
syncControls();

let autoApproach = false;
let autoDirection = 1;
autoButton.addEventListener('click', () => {
  autoApproach = !autoApproach;
  autoButton.setAttribute('aria-pressed', String(autoApproach));
  autoButton.textContent = autoApproach ? 'AUTO: RUNNING' : 'AUTO APPROACH';
  statusBox.textContent = autoApproach
    ? 'Auto approach active. Space-time has started making increasingly questionable geometry decisions.'
    : 'Auto approach stopped. Reality has been paused for parameter tuning.';
});

resetButton.addEventListener('click', () => {
  controls.approach.value = '42';
  controls.brightness.value = '135';
  controls.inclination.value = '76';
  controls.lensing.value = '100';
  autoApproach = false;
  autoDirection = 1;
  autoButton.setAttribute('aria-pressed', 'false');
  autoButton.textContent = 'AUTO APPROACH';
  syncControls();
  statusBox.textContent = 'Reference view restored. The accretion disk is once again abusing geometry professionally.';
});

let frameCounter = 0;
let fpsTimer = performance.now();
let previous = performance.now();

renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  uniforms.uTime.value = now * 0.001;

  if (autoApproach) {
    let value = Number(controls.approach.value) + autoDirection * dt * 8.5;
    if (value >= 100) { value = 100; autoDirection = -1; }
    if (value <= 8) { value = 8; autoDirection = 1; }
    controls.approach.value = String(value);
    syncControls();
  }

  renderer.render(scene, camera);

  frameCounter++;
  if (now - fpsTimer >= 700) {
    const fps = Math.round(frameCounter * 1000 / (now - fpsTimer));
    fpsReadout.textContent = `GPU: ${fps} FPS // ${renderer.domElement.width}×${renderer.domElement.height}`;
    frameCounter = 0;
    fpsTimer = now;
  }
});

window.addEventListener('pagehide', () => {
  renderer.setAnimationLoop(null);
  resizeObserver.disconnect();
  material.dispose();
  quad.geometry.dispose();
  renderer.dispose();
});

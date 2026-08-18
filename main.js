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

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
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

  float starLayer(vec2 p, float scale, float threshold) {
    vec2 g = p * scale;
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash21(cell);
    vec2 offset = vec2(hash21(cell + 4.7), hash21(cell + 9.2)) - 0.5;
    float d = length(f - offset * 0.62);
    float point = 1.0 - smoothstep(0.015, 0.075, d);
    point *= smoothstep(threshold, 1.0, h);
    float twinkle = 0.72 + 0.28 * sin(uTime * (1.1 + h * 2.7) + h * 40.0);
    return point * twinkle;
  }

  vec3 starField(vec2 p) {
    float s = 0.0;
    s += starLayer(p + vec2(0.17, 0.03), 42.0, 0.975) * 0.75;
    s += starLayer(p * 1.31 - vec2(0.23, 0.14), 73.0, 0.986) * 0.95;
    s += starLayer(p * 1.73 + vec2(0.05, 0.31), 115.0, 0.993) * 1.2;
    vec3 col = vec3(0.76, 0.82, 0.94) * s;
    float dust = fbm(p * 1.7 + 30.0);
    col += vec3(0.045, 0.055, 0.075) * smoothstep(0.55, 0.90, dust) * 0.7;
    return col;
  }

  float gaussian(float x, float width) {
    return exp(-(x * x) / max(0.00001, width * width));
  }

  vec3 diskPalette(float heat, float doppler) {
    vec3 ember = vec3(0.62, 0.14, 0.035);
    vec3 amber = vec3(1.00, 0.47, 0.12);
    vec3 cream = vec3(1.00, 0.88, 0.69);
    vec3 whiteHot = vec3(1.0, 0.985, 0.96);
    vec3 c = mix(ember, amber, smoothstep(0.05, 0.48, heat));
    c = mix(c, cream, smoothstep(0.38, 0.78, heat));
    c = mix(c, whiteHot, smoothstep(0.72, 1.0, heat));
    c *= mix(vec3(1.04, 0.78, 0.64), vec3(0.78, 0.91, 1.08), doppler);
    return c;
  }

  vec4 accretionDisk(vec2 p, float thickness, float frontOnly) {
    vec2 q = vec2(p.x, p.y / thickness);
    float r = length(q);
    float ang = atan(q.y, q.x);

    float inner = smoothstep(0.34, 0.41, r);
    float outer = 1.0 - smoothstep(1.02, 1.30, r);
    float band = inner * outer;

    float spin = uTime * 0.48;
    float flow = fbm(vec2(ang * 2.9 + spin, r * 8.5 - spin * 1.8));
    float streak = fbm(vec2(ang * 8.0 - spin * 2.4, r * 20.0 + flow * 2.3));
    float fine = noise(vec2(ang * 31.0 + spin * 4.1, r * 63.0));
    float turbulence = clamp(flow * 0.62 + streak * 0.30 + fine * 0.18, 0.0, 1.0);

    float innerHeat = 1.0 - smoothstep(0.37, 1.12, r);
    float filament = smoothstep(0.24, 0.82, turbulence);
    float gaps = 0.56 + 0.44 * smoothstep(0.18, 0.78, streak);
    float alpha = band * (0.38 + 0.95 * filament) * gaps;

    if (frontOnly > 0.5) {
      float front = 1.0 - smoothstep(-0.015, 0.075, p.y);
      alpha *= front;
    }

    float doppler = smoothstep(-0.95, 0.95, q.x / max(r, 0.001));
    float hot = clamp(innerHeat * 0.86 + turbulence * 0.40, 0.0, 1.0);
    vec3 col = diskPalette(hot, doppler);
    col *= (0.55 + 1.65 * innerHeat + 0.72 * turbulence) * uBrightness;

    return vec4(col, clamp(alpha, 0.0, 1.0));
  }

  vec3 lensedAccretion(vec2 p, float horizon) {
    float r = length(p);
    float theta = atan(p.y, p.x);
    float photonR = horizon * (1.42 + 0.07 * uLens);

    float ring = gaussian(r - photonR, 0.014 + 0.006 * uApproach);
    float vertical = pow(abs(sin(theta)), 1.65);
    float sideFade = 0.24 + 0.76 * vertical;

    float swirl = fbm(vec2(theta * 5.0 + uTime * 0.28, r * 34.0));
    float knots = 0.58 + 0.75 * smoothstep(0.35, 0.78, swirl);
    float doppler = smoothstep(-1.0, 1.0, cos(theta));
    vec3 ringCol = diskPalette(0.86 + 0.14 * swirl, doppler);

    vec3 col = ringCol * ring * sideFade * knots * (1.7 + uApproach * 2.6) * uBrightness;

    float upperArc = gaussian(r - photonR * 1.30, 0.025) * pow(max(sin(theta), 0.0), 1.8);
    float lowerArc = gaussian(r - photonR * 1.23, 0.021) * pow(max(-sin(theta), 0.0), 2.0);
    col += diskPalette(0.94, doppler) * (upperArc * 1.45 + lowerArc * 0.78) * uBrightness;

    return col;
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    uv.x *= aspect;

    float zoom = mix(0.78, 1.24, uApproach);
    vec2 p = uv / zoom;
    p.y += 0.01;

    float horizon = 0.205;
    float r = length(p);

    // Bend the background around the event horizon. This is deliberately stylized,
    // not a numerical geodesic solver, but the radial warp sells the lensing at browser speed.
    float bend = (0.050 * uLens) / (r * r + 0.055);
    vec2 bent = p + normalize(p + 0.0001) * bend;
    bent += vec2(0.0, 0.012 * sin(atan(p.y, p.x) * 2.0) * uLens / (r + 0.18));

    vec3 col = vec3(0.0014, 0.0018, 0.0027);
    col += starField(bent * 1.15);

    // Very subtle interstellar dust so pure black regions still have depth.
    float nebula = fbm(bent * 0.82 + vec2(-4.2, 8.7));
    col += vec3(0.024, 0.029, 0.043) * smoothstep(0.58, 0.90, nebula) * (1.0 - smoothstep(0.65, 1.5, r));

    float inclNorm = clamp((uInclination - 55.0) / 31.0, 0.0, 1.0);
    float thickness = mix(0.32, 0.095, inclNorm);

    // Back side / broad accretion flow.
    vec4 disk = accretionDisk(p, thickness, 0.0);
    col = mix(col, col + disk.rgb, disk.a * 0.86);

    // Material gravitationally imaged around the photon sphere.
    col += lensedAccretion(p, horizon);

    // Multi-scale hot halo. This does most of the "photographic" bloom without post-processing passes.
    float hotHalo = gaussian(r - horizon * 1.32, 0.050);
    float wideHalo = gaussian(r - horizon * 1.55, 0.19);
    col += vec3(1.0, 0.82, 0.62) * hotHalo * (0.18 + 0.55 * uApproach) * uBrightness;
    col += vec3(0.58, 0.64, 0.78) * wideHalo * (0.035 + 0.12 * uApproach) * uBrightness;

    // Event horizon: absolute absence of information, customer support and refunds.
    float horizonMask = 1.0 - smoothstep(horizon * 0.985, horizon * 1.018, r);
    col *= 1.0 - horizonMask;

    // Thin photon ring survives at the edge of the shadow.
    float photon = gaussian(r - horizon * 1.035, 0.0075);
    col += vec3(1.0, 0.93, 0.82) * photon * (1.8 + uApproach * 2.4) * uBrightness;

    // Front half of the disk must pass in front of the shadow, otherwise it looks like Saturn.
    vec4 frontDisk = accretionDisk(p, thickness, 1.0);
    float frontCut = smoothstep(-0.02, -0.12, p.y) * (1.0 - smoothstep(0.0, horizon * 1.18, abs(p.x)) * 0.10);
    frontDisk.a *= mix(0.70, 1.0, frontCut);
    col += frontDisk.rgb * frontDisk.a * 0.92;

    // Reassert the upper part of the event horizon so the foreground disk appears to skim its lower face.
    float upperShadow = horizonMask * smoothstep(-0.055, 0.035, p.y);
    col *= 1.0 - upperShadow;

    // Brightness rises nonlinearly during approach. Late No Hope should become visually hostile.
    float approachGlare = pow(uApproach, 3.15);
    float diskPlaneGlow = gaussian(p.y, 0.15 + 0.07 * uApproach) * (1.0 - smoothstep(0.15, 1.5, abs(p.x)));
    col += vec3(1.0, 0.91, 0.80) * diskPlaneGlow * approachGlare * 0.34 * uBrightness;
    col += vec3(0.91, 0.94, 1.0) * approachGlare * 0.045;

    // Filmic-ish compression and a tiny vignette.
    col = 1.0 - exp(-col * 1.18);
    float vignette = 1.0 - smoothstep(0.62, 1.55, length(uv * vec2(0.72, 1.0)));
    col *= 0.72 + 0.28 * vignette;
    col = pow(max(col, 0.0), vec3(0.88));

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
    ? 'Auto approach active. The event horizon is now a scheduling problem.'
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
  statusBox.textContent = 'Reference view restored. Gargantua remains legally distinct and extremely unemployed.';
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

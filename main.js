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
  statusBox.textContent = 'WebGL failed to initialize. The black hole ate the renderer before launch.';
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

  mat2 rotation(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
  }

  float starLayer(vec2 p, float scale, float threshold, float size) {
    vec2 g = p * scale;
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash21(cell);
    vec2 offset = vec2(hash21(cell + 4.7), hash21(cell + 9.2)) - 0.5;
    float d = length(f - offset * 0.62);
    float point = 1.0 - smoothstep(size * 0.35, size, d);
    point *= smoothstep(threshold, 1.0, h);
    return point * (0.72 + 0.28 * sin(uTime * (0.8 + h * 2.5) + h * 39.0));
  }

  vec3 starField(vec2 p) {
    float s = 0.0;
    s += starLayer(p + vec2(0.11, 0.03), 27.0, 0.935, 0.080) * 0.42;
    s += starLayer(p * 1.17 - vec2(0.23, 0.14), 48.0, 0.955, 0.072) * 0.62;
    s += starLayer(p * 1.41 + vec2(0.05, 0.31), 81.0, 0.972, 0.064) * 0.86;
    s += starLayer(p * 1.79 - vec2(0.41, 0.18), 124.0, 0.985, 0.056) * 1.08;
    vec3 col = vec3(0.75, 0.84, 1.0) * s;
    float dust = fbm(p * 1.23 + 30.0);
    col += vec3(0.025, 0.032, 0.052) * smoothstep(0.54, 0.90, dust) * 0.52;
    return col;
  }

  vec3 diskPalette(float heat, float doppler) {
    vec3 rust = vec3(0.40, 0.065, 0.012);
    vec3 ember = vec3(0.88, 0.24, 0.035);
    vec3 amber = vec3(1.00, 0.55, 0.16);
    vec3 cream = vec3(1.00, 0.87, 0.67);
    vec3 whiteHot = vec3(1.0, 0.99, 0.96);
    vec3 c = mix(rust, ember, smoothstep(0.03, 0.30, heat));
    c = mix(c, amber, smoothstep(0.25, 0.55, heat));
    c = mix(c, cream, smoothstep(0.48, 0.80, heat));
    c = mix(c, whiteHot, smoothstep(0.76, 1.0, heat));
    c *= mix(vec3(1.10, 0.76, 0.60), vec3(0.79, 0.91, 1.10), doppler);
    return c;
  }

  vec4 diskMaterial(vec2 p, float thickness) {
    vec2 q = vec2(p.x, p.y / thickness);
    float r = length(q);
    float ang = atan(q.y, q.x);
    float inner = smoothstep(0.33, 0.40, r);
    float outer = 1.0 - smoothstep(1.04, 1.36, r);
    float band = inner * outer;

    float spin = uTime * 0.44;
    float flow = fbm(vec2(ang * 3.3 + spin, r * 9.0 - spin * 1.7));
    float streak = fbm(vec2(ang * 12.0 - spin * 2.9, r * 27.0 + flow * 2.6));
    float fine = noise(vec2(ang * 44.0 + spin * 4.8, r * 84.0));
    float turbulence = clamp(flow * 0.58 + streak * 0.30 + fine * 0.16, 0.0, 1.0);
    float innerHeat = 1.0 - smoothstep(0.36, 1.10, r);
    float alpha = band * (0.28 + 1.04 * smoothstep(0.20, 0.82, turbulence));
    alpha *= 0.50 + 0.50 * smoothstep(0.14, 0.80, streak);

    float doppler = smoothstep(-1.0, 1.0, q.x / max(r, 0.001));
    float hot = clamp(innerHeat * 0.92 + turbulence * 0.36, 0.0, 1.0);
    vec3 col = diskPalette(hot, doppler);
    col *= (0.42 + 1.92 * innerHeat + 0.70 * turbulence) * uBrightness;
    return vec4(col, clamp(alpha, 0.0, 1.0));
  }

  vec3 wrappedDisk(vec2 p, float horizon, float tilt) {
    vec2 q = rotation(-tilt) * p;
    float xExtent = horizon * 2.95;
    float xn = clamp(abs(q.x) / xExtent, 0.0, 1.0);
    float dome = sqrt(max(0.0, 1.0 - xn * xn));

    // The rear half of the SAME disk is gravitationally folded over the shadow.
    // Both images hug the horizon and merge back into the main disk at the sides.
    float upperY = horizon * (0.88 + 1.18 * dome);
    float lowerY = -horizon * (0.86 + 0.93 * dome);
    float upperW = mix(0.020, 0.062, dome);
    float lowerW = mix(0.018, 0.050, dome);

    float upper = gaussian(q.y - upperY, upperW);
    float lower = gaussian(q.y - lowerY, lowerW);
    float sideJoin = smoothstep(1.0, 0.72, xn);

    // Pull the ends toward the disk plane so the arcs do not float independently.
    float connectorW = mix(0.070, 0.018, dome);
    float connector = gaussian(q.y, connectorW) * (1.0 - sideJoin);

    float stream = q.x * 5.7 + uTime * 0.42;
    float nu = fbm(vec2(stream, q.y * 19.0 + 2.5));
    float nl = fbm(vec2(stream * 1.07 - 3.4, q.y * 21.0 - 2.8));
    float nc = fbm(vec2(stream * 0.84 + 7.0, q.y * 26.0));
    float doppler = smoothstep(-xExtent, xExtent, q.x);

    vec3 upperCol = diskPalette(0.84 + 0.16 * nu, doppler);
    vec3 lowerCol = diskPalette(0.78 + 0.18 * nl, doppler);
    vec3 connectorCol = diskPalette(0.66 + 0.20 * nc, doppler);

    vec3 col = vec3(0.0);
    col += upperCol * upper * (0.70 + 0.80 * nu) * uBrightness * 1.12;
    col += lowerCol * lower * (0.54 + 0.64 * nl) * uBrightness * 0.92;
    col += connectorCol * connector * (0.30 + 0.45 * nc) * uBrightness;

    // Broad dim material behind the bright ridges makes the wrap read as volume, not neon arcs.
    float upperFog = gaussian(q.y - upperY, upperW * 2.6);
    float lowerFog = gaussian(q.y - lowerY, lowerW * 2.8);
    col += vec3(0.32, 0.16, 0.07) * (upperFog * 0.20 + lowerFog * 0.14) * (0.6 + uBrightness * 0.4);

    return col;
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    uv.x *= aspect;

    float zoom = mix(0.61, 1.16, uApproach);
    vec2 p = uv / zoom;
    p.y += 0.018;

    float horizon = 0.205;
    float r = length(p);

    float inclNorm = clamp((uInclination - 55.0) / 31.0, 0.0, 1.0);
    float thickness = mix(0.32, 0.095, inclNorm);
    float tilt = mix(-0.085, 0.045, inclNorm);
    vec2 dp = rotation(-tilt) * p;

    vec3 col = vec3(0.0007, 0.0010, 0.0018);
    col += starField(p * 0.98) * 1.28;

    float nebula = fbm(p * 0.70 + vec2(-4.2, 8.7));
    col += vec3(0.022, 0.027, 0.045) * smoothstep(0.56, 0.92, nebula) * 0.48;

    vec4 backDisk = diskMaterial(dp, thickness);
    col += backDisk.rgb * backDisk.a * 0.68;

    // Rear disk wraps continuously over and under the event horizon.
    col += wrappedDisk(p, horizon, tilt);

    float halo = gaussian(r - horizon * 1.34, 0.070);
    col += vec3(1.0, 0.80, 0.58) * halo * (0.10 + 0.24 * uApproach) * uBrightness;

    float horizonMask = 1.0 - smoothstep(horizon * 0.985, horizon * 1.018, r);
    col *= 1.0 - horizonMask;

    // Front half crosses the lower face, exactly like the reference view.
    vec4 frontDisk = diskMaterial(dp, thickness);
    float foreground = 1.0 - smoothstep(-0.018, 0.070, dp.y);
    frontDisk.a *= foreground;
    col += frontDisk.rgb * frontDisk.a * 1.08;

    // Reassert the central shadow so the viewer always sees the black hole itself.
    float topShadow = horizonMask * smoothstep(-0.030, 0.050, dp.y);
    col *= 1.0 - topShadow;

    // Keep only a subtle broken photon rim; the disk should dominate the silhouette.
    float theta = atan(p.y, p.x);
    float rim = gaussian(r - horizon * 1.012, 0.0038);
    float rimMask = 0.06 + 0.94 * pow(abs(sin(theta)), 2.6);
    float breakup = 0.42 + 0.58 * fbm(vec2(theta * 5.6 + uTime * 0.11, r * 45.0));
    col += vec3(1.0, 0.94, 0.84) * rim * rimMask * breakup * (0.42 + uApproach * 0.9) * uBrightness;

    float approachGlare = pow(uApproach, 3.2);
    float planeGlow = gaussian(dp.y, 0.13 + 0.055 * uApproach) * (1.0 - smoothstep(0.20, 1.70, abs(dp.x)));
    col += vec3(1.0, 0.88, 0.70) * planeGlow * approachGlare * 0.24 * uBrightness;

    col = 1.0 - exp(-col * 1.22);
    float vignette = 1.0 - smoothstep(0.62, 1.72, length(uv * vec2(0.68, 1.0)));
    col *= 0.72 + 0.28 * vignette;
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
    ? 'Auto approach active. The disk is now wrapping around the shadow like physics intended.'
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
  statusBox.textContent = 'Reference view restored. The black hole is back to professionally bullying photons.';
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
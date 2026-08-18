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
  statusBox.textContent = 'WebGL failed to initialize. Space-time has filed for bankruptcy.';
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
    vec2 i = floor(p), f = fract(p);
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
    mat2 m = mat2(0.84, -0.54, 0.54, 0.84);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = m * p * 2.03 + 13.7;
      a *= 0.5;
    }
    return v;
  }

  float gauss(float x, float w) {
    return exp(-(x * x) / max(0.00001, w * w));
  }

  float starLayer(vec2 p, float scale, float threshold, float size) {
    vec2 g = p * scale;
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash21(cell);
    vec2 off = vec2(hash21(cell + 2.7), hash21(cell + 8.1)) - 0.5;
    float d = length(f - off * 0.62);
    float s = 1.0 - smoothstep(size * 0.25, size, d);
    s *= smoothstep(threshold, 1.0, h);
    return s * (0.84 + 0.16 * sin(uTime * (0.65 + h * 1.8) + h * 37.0));
  }

  vec3 starField(vec2 p) {
    float s = 0.0;
    s += starLayer(p + vec2(0.13, 0.07), 18.0, 0.875, 0.090) * 0.36;
    s += starLayer(p * 1.19 - vec2(0.21, 0.18), 31.0, 0.905, 0.080) * 0.54;
    s += starLayer(p * 1.47 + vec2(0.09, 0.32), 52.0, 0.932, 0.071) * 0.76;
    s += starLayer(p * 1.81 - vec2(0.39, 0.11), 83.0, 0.958, 0.062) * 0.98;
    s += starLayer(p * 2.16 + vec2(0.44, 0.26), 126.0, 0.978, 0.054) * 1.16;
    s += starLayer(p * 2.41 - vec2(0.17, 0.43), 174.0, 0.988, 0.047) * 1.28;
    vec3 col = vec3(0.78, 0.86, 1.0) * s * 1.42;
    float dust = fbm(p * 0.82 + 27.0);
    col += vec3(0.050, 0.061, 0.108) * smoothstep(0.47, 0.86, dust) * 0.96;
    return col;
  }

  vec3 diskColor(float heat, float xSide) {
    vec3 voidBlack = vec3(0.006, 0.007, 0.009);
    vec3 graphite = vec3(0.032, 0.034, 0.038);
    vec3 ash = vec3(0.090, 0.086, 0.082);
    vec3 darkBrown = vec3(0.105, 0.042, 0.020);
    vec3 umber = vec3(0.22, 0.070, 0.024);
    vec3 blood = vec3(0.34, 0.030, 0.012);
    vec3 ember = vec3(0.62, 0.090, 0.018);
    vec3 copper = vec3(0.92, 0.32, 0.060);
    vec3 amber = vec3(1.00, 0.64, 0.22);
    vec3 whiteHot = vec3(1.0, 0.94, 0.80);

    vec3 c = mix(voidBlack, graphite, smoothstep(0.00, 0.08, heat));
    c = mix(c, ash, smoothstep(0.05, 0.15, heat));
    c = mix(c, darkBrown, smoothstep(0.10, 0.24, heat));
    c = mix(c, umber, smoothstep(0.18, 0.34, heat));
    c = mix(c, blood, smoothstep(0.29, 0.45, heat));
    c = mix(c, ember, smoothstep(0.40, 0.59, heat));
    c = mix(c, copper, smoothstep(0.54, 0.75, heat));
    c = mix(c, amber, smoothstep(0.72, 0.91, heat));
    c = mix(c, whiteHot, smoothstep(0.94, 1.0, heat));

    vec3 redSide = vec3(1.13, 0.74, 0.56);
    vec3 blueSide = vec3(0.72, 0.82, 1.05);
    return c * mix(redSide, blueSide, xSide);
  }

  vec4 diskSample(float radius, float stream, float xSide, float mask) {
    float spin = uTime * 0.54;
    float flow = fbm(vec2(stream * 3.55 + spin, radius * 8.8 - spin * 1.62));
    float streak = fbm(vec2(stream * 12.8 - spin * 2.85, radius * 30.0 + flow * 3.1));
    float fine = noise(vec2(stream * 44.0 + spin * 4.8, radius * 92.0));
    float cloudA = fbm(vec2(stream * 1.55 - spin * 0.72, radius * 5.3 + flow * 1.8));
    float cloudB = fbm(vec2(stream * 0.78 + spin * 0.31 + 8.0, radius * 3.4 - spin * 0.46));
    float ashVeil = fbm(vec2(stream * 2.15 + spin * 0.18 + 19.0, radius * 6.2 - spin * 0.22));
    float charBands = fbm(vec2(stream * 6.7 - spin * 0.95, radius * 14.0 + cloudA * 3.0));
    float macro = fbm(vec2(stream * 0.52 + spin * 0.16 + 41.0, radius * 2.45 - spin * 0.18));
    float turb = clamp(flow * 0.46 + streak * 0.27 + fine * 0.12 + cloudA * 0.13 + ashVeil * 0.09 + macro * 0.11, 0.0, 1.0);

    float radialHeat = 1.0 - smoothstep(0.30, 1.18, radius);
    float heat = clamp(radialHeat * 0.66 + turb * 0.24, 0.0, 1.0);

    // Near-solid opacity: this should look like matter, not transparent smoke.
    float density = 1.22 + 1.05 * smoothstep(0.05, 0.74, turb);
    density *= 1.05 + 0.46 * smoothstep(0.04, 0.70, streak);
    density *= 1.02 + 0.34 * cloudA + 0.22 * macro;

    vec3 col = diskColor(heat, xSide);

    float sootCloud = smoothstep(0.43, 0.80, cloudB) * (0.52 + 0.48 * smoothstep(0.20, 0.80, cloudA));
    float brownCloud = smoothstep(0.35, 0.72, cloudA) * (1.0 - smoothstep(0.72, 0.97, heat));
    float graphiteLane = smoothstep(0.46, 0.82, charBands) * (1.0 - smoothstep(0.74, 0.98, heat));
    float ashPatch = smoothstep(0.52, 0.82, ashVeil) * (1.0 - smoothstep(0.80, 0.99, heat));
    float denseBank = smoothstep(0.42, 0.74, macro) * (0.65 + 0.35 * cloudA);

    vec3 soot = vec3(0.012, 0.014, 0.017);
    vec3 graphite = vec3(0.050, 0.052, 0.056);
    vec3 ash = vec3(0.14, 0.13, 0.12);
    vec3 brown = vec3(0.16, 0.055, 0.020);

    col = mix(col, soot + col * 0.20, sootCloud * 0.56);
    col = mix(col, graphite + col * 0.34, graphiteLane * 0.52);
    col = mix(col, ash + col * 0.42, ashPatch * 0.27);
    col = mix(col, brown + col * 0.40, brownCloud * 0.31);
    col = mix(col, col * 0.68 + vec3(0.10, 0.048, 0.024), denseBank * 0.28);

    float darkFilaments = 0.44 + 0.56 * smoothstep(0.20, 0.76, streak);
    col *= darkFilaments;
    col *= (0.58 + 1.45 * heat + 0.60 * turb) * uBrightness;

    float hotThread = smoothstep(0.86, 0.988, turb) * smoothstep(0.60, 0.98, heat);
    float thinSpark = smoothstep(0.90, 0.997, fine) * smoothstep(0.54, 0.97, heat);
    col += vec3(1.0, 0.69, 0.30) * hotThread * 0.28 * uBrightness;
    col += vec3(1.0, 0.86, 0.58) * thinSpark * 0.10 * uBrightness;

    return vec4(col, clamp(mask * density, 0.0, 1.0));
  }

  vec4 accretionPlane(vec2 p, float thickness) {
    vec2 q = vec2(p.x, p.y / thickness);
    float r = length(q);
    float a = atan(q.y, q.x);
    float inner = smoothstep(0.24, 0.34, r);
    float outer = 1.0 - smoothstep(1.16, 1.54, r);
    float band = inner * outer;
    float xSide = smoothstep(-1.0, 1.0, q.x / max(r, 0.001));
    return diskSample(r, a, xSide, band);
  }

  vec4 pulledRearDisk(vec2 p, float horizon, float inclination, float upper) {
    float xSpan = horizon * 3.72;
    float xn = clamp(abs(p.x) / xSpan, 0.0, 1.0);
    float pull = smoothstep(0.002, 0.998, pow(1.0 - xn, 0.54));
    float signY = upper > 0.5 ? 1.0 : -1.0;
    float maxLift = upper > 0.5 ? horizon * mix(1.30, 1.76, inclination) : horizon * mix(1.06, 1.44, inclination);
    float targetY = signY * maxLift * pull;
    float width = mix(0.190, 0.135, pull);
    float d = p.y - targetY;

    float core = gauss(d, width);
    float inner = gauss(p.y - targetY * mix(0.16, 0.44, pull), mix(0.225, 0.175, pull)) * smoothstep(0.01, 0.92, pull);
    float second = gauss(p.y - targetY * 0.70, width * 1.55) * smoothstep(0.08, 0.96, pull);
    float third = gauss(p.y - targetY * 0.36, width * 1.88) * smoothstep(0.12, 0.94, pull);
    float connector = gauss(p.y, 0.195) * smoothstep(0.50, 1.0, xn);
    float radialFade = 1.0 - smoothstep(0.94, 1.05, xn);
    float dense = smoothstep(0.015, 0.86, pull);
    float mask = max(core * radialFade, connector);
    mask = max(mask, inner * dense);
    mask = max(mask, second * dense * 0.92);
    mask = max(mask, third * dense * 0.72);

    float sourceRadius = clamp(mix(1.28, 0.31, pull) + abs(d) / max(width, 0.001) * 0.010, 0.28, 1.44);
    float direction = p.x < 0.0 ? -1.0 : 1.0;
    float sourceAngle = direction * mix(0.08, 1.70, pull) + p.x * 0.52 + signY * d * 1.24;
    float xSide = smoothstep(-xSpan, xSpan, p.x);
    vec4 c = diskSample(sourceRadius, sourceAngle, xSide, mask);
    c.rgb *= upper > 0.5 ? 0.93 : 0.84;
    c.a *= upper > 0.5 ? 1.0 : 0.98;
    return c;
  }

  vec3 gradeCinematic(vec3 col, vec2 uv, vec2 p, float horizon) {
    col = 1.0 - exp(-col * 1.08);
    col = pow(max(col, 0.0), vec3(0.94));
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = vec3(luma) + (col - vec3(luma)) * 1.20;
    float r = length(p);
    col *= 1.0 - gauss(r - horizon * 1.34, 0.18) * 0.18;
    float threat = 1.0 - smoothstep(horizon * 1.65, horizon * 3.0, r);
    col *= mix(vec3(1.0), vec3(0.77, 0.81, 0.91), threat * 0.24);
    float warm = smoothstep(0.60, 0.97, max(col.r, max(col.g, col.b)));
    col *= mix(vec3(0.86, 0.90, 1.04), vec3(1.04, 0.95, 0.84), warm * 0.34);
    float vignette = smoothstep(1.46, 0.50, length(uv * vec2(0.70, 1.0)));
    col *= 0.74 + 0.26 * vignette;
    col += (hash21(gl_FragCoord.xy + fract(uTime * 19.0)) - 0.5) * 0.008;
    return max(col, 0.0);
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    uv.x *= aspect;
    float zoom = mix(0.62, 1.17, uApproach);
    vec2 p = uv / zoom;
    p.y += 0.01;

    float horizon = 0.205;
    float r = length(p);
    float incl = clamp((uInclination - 55.0) / 31.0, 0.0, 1.0);
    float thickness = mix(0.46, 0.185, incl);

    vec3 col = vec3(0.0022, 0.0029, 0.0058);
    col += starField(p * 0.90) * 1.52;

    // Stellar cloud beyond the disk: broad, distant, irregular matter in the same scene.
    float nebula = fbm(p * 0.58 + vec2(-5.3, 7.9));
    col += vec3(0.030, 0.037, 0.070) * smoothstep(0.49, 0.88, nebula) * 0.78;
    float cloudWide = gauss(p.y, 0.42) * smoothstep(0.38, 0.78, fbm(vec2(p.x * 0.85 + 31.0, p.y * 1.9 - uTime * 0.018)));
    float cloudCut = 1.0 - smoothstep(0.48, 1.55, abs(p.x));
    col += vec3(0.070, 0.055, 0.060) * cloudWide * cloudCut * 0.28;
    col += vec3(0.055, 0.070, 0.120) * cloudWide * (1.0 - cloudCut) * 0.16;

    vec4 upper = pulledRearDisk(p, horizon, incl, 1.0);
    vec4 lower = pulledRearDisk(p, horizon, incl, 0.0);
    col += upper.rgb * upper.a;
    col += lower.rgb * lower.a;

    vec4 plane = accretionPlane(p, thickness);
    col += plane.rgb * plane.a * 1.08;

    float hotHalo = gauss(r - horizon * 1.20, 0.052);
    float wideHalo = gauss(r - horizon * 1.36, 0.17);
    col += vec3(1.0, 0.58, 0.24) * hotHalo * (0.040 + 0.12 * uApproach) * uBrightness;
    col += vec3(0.19, 0.24, 0.42) * wideHalo * (0.022 + 0.040 * uApproach);

    float shadow = 1.0 - smoothstep(horizon * 0.985, horizon * 1.020, r);
    col *= 1.0 - shadow;

    vec4 front = accretionPlane(p, thickness);
    front.a *= 1.0 - smoothstep(-0.082, 0.082, p.y);
    col += front.rgb * front.a * 1.18;

    float upperShadow = shadow * smoothstep(-0.040, 0.056, p.y);
    col *= 1.0 - upperShadow;

    // One continuous, very thin line of trapped light hugging the horizon.
    float theta = atan(p.y, p.x);
    float orbitNoise = fbm(vec2(theta * 8.0 - uTime * 0.16, r * 72.0));
    float photonRadius = horizon * (1.018 + (orbitNoise - 0.5) * 0.004);
    float photonLine = gauss(r - photonRadius, 0.00155);
    float photonShimmer = 0.78 + 0.22 * sin(theta * 7.0 - uTime * 0.42 + orbitNoise * 5.0);
    col += vec3(1.0, 0.79, 0.48) * photonLine * photonShimmer * (0.38 + 0.18 * uLens) * uBrightness;

    float late = pow(uApproach, 3.0);
    float planeGlow = gauss(p.y, 0.22) * (1.0 - smoothstep(0.16, 1.78, abs(p.x)));
    col += vec3(0.88, 0.46, 0.19) * planeGlow * late * 0.095 * uBrightness;

    col = gradeCinematic(col, uv, p, horizon);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthWrite: false, depthTest: false });
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
    ? 'Auto approach active. The disk has achieved suspiciously grab-able density.'
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
  statusBox.textContent = 'Reference view restored. Please do not attempt to touch the accretion disk.';
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
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
    for (int i = 0; i < 6; i++) {
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
    vec3 col = vec3(0.80, 0.87, 1.0) * s * 1.48;
    float dust = fbm(p * 0.82 + 27.0);
    col += vec3(0.046, 0.056, 0.100) * smoothstep(0.46, 0.86, dust) * 0.92;
    return col;
  }

  vec3 diskColor(float heat, float xSide) {
    vec3 voidBlack = vec3(0.006, 0.007, 0.009);
    vec3 graphite = vec3(0.030, 0.031, 0.034);
    vec3 ash = vec3(0.088, 0.081, 0.074);
    vec3 darkBrown = vec3(0.110, 0.043, 0.018);
    vec3 umber = vec3(0.225, 0.070, 0.022);
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
    c = mix(c, whiteHot, smoothstep(0.95, 1.0, heat));
    return c * mix(vec3(1.12, 0.75, 0.57), vec3(0.73, 0.82, 1.04), xSide);
  }

  vec4 diskSample(float radius, float stream, float xSide, float mask) {
    float spin = uTime * 0.50;
    float flow = fbm(vec2(stream * 4.1 + spin, radius * 10.2 - spin * 1.55));
    float ribbon = fbm(vec2(stream * 18.0 - spin * 3.15, radius * 42.0 + flow * 4.4));
    float filament = fbm(vec2(stream * 39.0 + spin * 5.2, radius * 104.0 - ribbon * 2.0));
    float fine = noise(vec2(stream * 72.0 - spin * 7.0, radius * 176.0));
    float cloudA = fbm(vec2(stream * 1.35 - spin * 0.60, radius * 5.0 + flow * 1.7));
    float cloudB = fbm(vec2(stream * 0.68 + spin * 0.23 + 8.0, radius * 3.15 - spin * 0.40));
    float macro = fbm(vec2(stream * 0.40 + spin * 0.10 + 41.0, radius * 2.0 - spin * 0.14));
    float slate = fbm(vec2(stream * 2.9 - spin * 0.42 + 61.0, radius * 8.5 + cloudB * 2.2));

    float turb = clamp(flow * 0.33 + ribbon * 0.26 + filament * 0.19 + cloudA * 0.10 + macro * 0.07 + slate * 0.09, 0.0, 1.0);
    float radialHeat = 1.0 - smoothstep(0.27, 1.10, radius);
    float heat = clamp(radialHeat * 0.64 + turb * 0.22, 0.0, 1.0);

    float density = 1.52 + 1.24 * smoothstep(0.04, 0.70, turb);
    density *= 1.12 + 0.58 * smoothstep(0.05, 0.72, ribbon);
    density *= 1.08 + 0.34 * cloudA + 0.28 * macro;

    vec3 col = diskColor(heat, xSide);

    float sootBank = smoothstep(0.39, 0.77, cloudB) * (0.48 + 0.52 * cloudA);
    float graphiteLane = smoothstep(0.43, 0.78, ribbon) * (1.0 - smoothstep(0.82, 0.99, heat));
    float ashVein = smoothstep(0.46, 0.80, filament) * (1.0 - smoothstep(0.88, 0.99, heat));
    float slateBank = smoothstep(0.45, 0.76, slate) * (1.0 - smoothstep(0.76, 0.98, heat));
    float deepStrand = smoothstep(0.59, 0.89, filament) * smoothstep(0.25, 0.73, cloudA);
    float brownBank = smoothstep(0.38, 0.70, macro) * (1.0 - smoothstep(0.78, 0.98, heat));

    col = mix(col, vec3(0.008, 0.009, 0.011) + col * 0.15, sootBank * 0.62);
    col = mix(col, vec3(0.034, 0.036, 0.040) + col * 0.28, graphiteLane * 0.50);
    col = mix(col, vec3(0.095, 0.095, 0.102) + col * 0.36, slateBank * 0.38);
    col = mix(col, vec3(0.125, 0.116, 0.106) + col * 0.40, ashVein * 0.25);
    col = mix(col, vec3(0.126, 0.045, 0.018) + col * 0.36, brownBank * 0.30);
    col *= 1.0 - deepStrand * 0.42;

    float layered = 0.56 + 0.44 * smoothstep(0.15, 0.82, ribbon);
    layered *= 0.72 + 0.28 * smoothstep(0.18, 0.84, filament);
    col *= layered;
    col *= (0.72 + 1.36 * heat + 0.54 * turb) * uBrightness;

    float hotThread = smoothstep(0.90, 0.995, filament) * smoothstep(0.58, 0.98, heat);
    float spark = smoothstep(0.94, 0.999, fine) * smoothstep(0.55, 0.98, heat);
    col += vec3(1.0, 0.70, 0.32) * hotThread * 0.22 * uBrightness;
    col += vec3(1.0, 0.88, 0.62) * spark * 0.07 * uBrightness;

    return vec4(col, clamp(mask * density, 0.0, 1.0));
  }

  vec4 accretionPlane(vec2 p, float thickness) {
    vec2 q = vec2(p.x, p.y / thickness);
    float r = length(q);
    float a = atan(q.y, q.x);
    float inner = smoothstep(0.235, 0.325, r);
    // v1.10 was too wide. Pull the horizontal disk back to ~70% of that visual radius.
    float outer = 1.0 - smoothstep(0.86, 1.12, r);
    float band = inner * outer;
    float rimNoise = fbm(vec2(a * 4.0 + uTime * 0.08, r * 12.0));
    band *= 0.91 + 0.09 * rimNoise;
    float xSide = smoothstep(-1.0, 1.0, q.x / max(r, 0.001));
    return diskSample(r, a, xSide, band);
  }

  vec4 pulledRearDisk(vec2 p, float horizon, float inclination, float upper) {
    float xSpan = horizon * 3.45;
    float xn = clamp(abs(p.x) / xSpan, 0.0, 1.0);
    float pull = smoothstep(0.002, 0.998, pow(1.0 - xn, 0.56));
    float signY = upper > 0.5 ? 1.0 : -1.0;
    float maxLift = upper > 0.5 ? horizon * mix(1.30, 1.72, inclination) : horizon * mix(1.04, 1.40, inclination);
    float targetY = signY * maxLift * pull;

    // About half the visual mass around the hole, but keep it opaque so it remains the same material as the horizontal disk.
    float width = mix(0.145, 0.102, pull);
    float d = p.y - targetY;
    float core = gauss(d, width);
    float inner = gauss(p.y - targetY * mix(0.18, 0.46, pull), mix(0.168, 0.126, pull)) * smoothstep(0.02, 0.91, pull);
    float second = gauss(p.y - targetY * 0.70, width * 1.35) * smoothstep(0.10, 0.94, pull);
    float connector = gauss(p.y, 0.145) * smoothstep(0.58, 1.0, xn);
    float radialFade = 1.0 - smoothstep(0.92, 1.045, xn);
    float dense = smoothstep(0.03, 0.88, pull);
    float mask = max(core * radialFade, connector * 0.88);
    mask = max(mask, inner * dense * 0.88);
    mask = max(mask, second * dense * 0.58);

    float sourceRadius = clamp(mix(1.08, 0.31, pull) + abs(d) / max(width, 0.001) * 0.010, 0.28, 1.10);
    float direction = p.x < 0.0 ? -1.0 : 1.0;
    float sourceAngle = direction * mix(0.08, 1.68, pull) + p.x * 0.50 + signY * d * 1.24;
    float xSide = smoothstep(-xSpan, xSpan, p.x);
    // Same shader sample and same color/opacity treatment as the horizontal disk.
    return diskSample(sourceRadius, sourceAngle, xSide, mask);
  }

  vec3 gradeCinematic(vec3 col, vec2 uv, vec2 p, float horizon) {
    col = 1.0 - exp(-col * 1.08);
    col = pow(max(col, 0.0), vec3(0.94));
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = vec3(luma) + (col - vec3(luma)) * 1.18;
    float r = length(p);
    col *= 1.0 - gauss(r - horizon * 1.34, 0.18) * 0.16;
    float threat = 1.0 - smoothstep(horizon * 1.65, horizon * 3.0, r);
    col *= mix(vec3(1.0), vec3(0.79, 0.82, 0.91), threat * 0.22);
    float vignette = smoothstep(1.46, 0.50, length(uv * vec2(0.70, 1.0)));
    col *= 0.75 + 0.25 * vignette;
    col += (hash21(gl_FragCoord.xy + fract(uTime * 19.0)) - 0.5) * 0.006;
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
    float thickness = mix(0.40, 0.155, incl);

    vec3 col = vec3(0.0021, 0.0028, 0.0055);
    col += starField(p * 0.90) * 1.56;

    float nebula = fbm(p * 0.58 + vec2(-5.3, 7.9));
    col += vec3(0.029, 0.036, 0.068) * smoothstep(0.49, 0.88, nebula) * 0.76;
    float stellarCloud = smoothstep(0.46, 0.78, fbm(vec2(p.x * 0.72 + 31.0, p.y * 1.55 - uTime * 0.012)));
    stellarCloud *= 1.0 - smoothstep(0.58, 1.60, length(p * vec2(0.75, 1.0)));
    col += vec3(0.055, 0.052, 0.068) * stellarCloud * 0.24;

    vec4 upper = pulledRearDisk(p, horizon, incl, 1.0);
    vec4 lower = pulledRearDisk(p, horizon, incl, 0.0);
    col += upper.rgb * upper.a;
    col += lower.rgb * lower.a;

    vec4 plane = accretionPlane(p, thickness);
    col += plane.rgb * plane.a * 1.12;

    float shadow = 1.0 - smoothstep(horizon * 0.988, horizon * 1.014, r);
    col *= 1.0 - shadow;

    vec4 front = accretionPlane(p, thickness);
    front.a *= 1.0 - smoothstep(-0.075, 0.075, p.y);
    col += front.rgb * front.a * 1.20;

    float upperShadow = shadow * smoothstep(-0.038, 0.052, p.y);
    col *= 1.0 - upperShadow;

    // Thick trapped-light rim with a smooth directional reflection. Bottom-right quadrant (270-360 deg) carries the strongest bend.
    float theta = atan(p.y, p.x);
    float orbitNoise = fbm(vec2(theta * 8.0 - uTime * 0.16, r * 72.0));
    float photonRadius = horizon * (1.017 + (orbitNoise - 0.5) * 0.0035);
    float qStart = smoothstep(-1.72, -1.42, theta);
    float qEnd = 1.0 - smoothstep(-0.10, 0.12, theta);
    float brightQuarter = qStart * qEnd;
    float angularWave = 0.5 + 0.5 * sin(theta * 2.0 - 0.35);
    float thicknessVar = mix(0.0028, 0.0040, angularWave);
    thicknessVar = mix(thicknessVar, 0.0068, brightQuarter);
    float photonLine = gauss(r - photonRadius, thicknessVar);
    float photonShimmer = 0.62 + 0.38 * (0.5 + 0.5 * sin(theta * 3.0 - uTime * 0.30 + orbitNoise * 4.0));
    float reflection = mix(0.62 + 0.38 * angularWave, 1.35, brightQuarter);
    col += vec3(1.0, 0.91, 0.72) * photonLine * photonShimmer * reflection * (0.48 + 0.24 * uLens) * uBrightness;

    // Slight warm fringe outside the white core to make the light feel bent into the horizon instead of pasted on top.
    float photonFringe = gauss(r - photonRadius * 1.012, thicknessVar * 1.85);
    col += vec3(1.0, 0.50, 0.18) * photonFringe * 0.10 * reflection * uBrightness;

    float innerGlow = gauss(r - horizon * 1.22, 0.060);
    col += vec3(0.78, 0.36, 0.14) * innerGlow * (0.028 + 0.080 * uApproach) * uBrightness;

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
    ? 'Auto approach active. Horizontal disk corrected; photon rim now has anger issues.'
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
  statusBox.textContent = 'Reference view restored. Light is losing the argument with gravity again.';
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
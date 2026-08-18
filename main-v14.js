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

    vec3 col = vec3(0.92, 0.96, 1.0) * s * 1.40;
    float dust = fbm(p * 0.82 + 27.0);
    float milky = smoothstep(0.47, 0.86, dust);
    col += vec3(0.085, 0.100, 0.155) * milky * 1.16;
    return col;
  }

  vec3 diskColor(float heat, float xSide) {
    vec3 ember = vec3(0.34, 0.055, 0.010);
    vec3 rust = vec3(0.88, 0.22, 0.035);
    vec3 gold = vec3(1.00, 0.57, 0.19);
    vec3 cream = vec3(1.00, 0.87, 0.66);
    vec3 whiteHot = vec3(1.0, 0.99, 0.965);

    vec3 c = mix(ember, rust, smoothstep(0.04, 0.32, heat));
    c = mix(c, gold, smoothstep(0.24, 0.56, heat));
    c = mix(c, cream, smoothstep(0.48, 0.79, heat));
    c = mix(c, whiteHot, smoothstep(0.75, 1.0, heat));
    c *= mix(vec3(1.10, 0.80, 0.66), vec3(0.84, 0.94, 1.08), xSide);
    return c;
  }

  vec4 diskSample(float radius, float stream, float xSide, float mask) {
    float spin = uTime * 0.47;
    float flow = fbm(vec2(stream * 3.35 + spin, radius * 8.3 - spin * 1.45));
    float streak = fbm(vec2(stream * 11.7 - spin * 2.55, radius * 27.5 + flow * 2.55));
    float fine = noise(vec2(stream * 40.0 + spin * 4.25, radius * 84.0));
    float turb = clamp(flow * 0.56 + streak * 0.34 + fine * 0.15, 0.0, 1.0);

    float heat = clamp((1.0 - smoothstep(0.34, 1.14, radius)) * 0.88 + turb * 0.34, 0.0, 1.0);
    float density = 0.68 + 0.78 * smoothstep(0.12, 0.82, turb);
    density *= 0.78 + 0.44 * smoothstep(0.10, 0.78, streak);

    vec3 col = diskColor(heat, xSide);
    col *= (0.62 + 1.78 * heat + 0.78 * turb) * uBrightness;
    return vec4(col, clamp(mask * density, 0.0, 1.0));
  }

  vec4 accretionPlane(vec2 p, float thickness) {
    vec2 q = vec2(p.x, p.y / thickness);
    float r = length(q);
    float a = atan(q.y, q.x);
    float inner = smoothstep(0.32, 0.41, r);
    float outer = 1.0 - smoothstep(1.08, 1.40, r);
    float band = inner * outer;
    float xSide = smoothstep(-1.0, 1.0, q.x / max(r, 0.001));
    return diskSample(r, a, xSide, band);
  }

  // Dense continuous stream: the same disk is dragged upward/downward around the shadow.
  // A broad inward sheath fills the space between the physical plane and the bright curved ridge.
  vec4 pulledRearDisk(vec2 p, float horizon, float inclination, float upper) {
    float xSpan = horizon * 3.42;
    float xn = clamp(abs(p.x) / xSpan, 0.0, 1.0);
    float centerWeight = pow(1.0 - xn, 0.68);
    float pull = smoothstep(0.01, 0.99, centerWeight);
    float signY = upper > 0.5 ? 1.0 : -1.0;

    float maxLift = upper > 0.5
      ? horizon * mix(1.38, 1.88, inclination)
      : horizon * mix(1.10, 1.52, inclination);

    float targetY = signY * maxLift * pull;
    float width = mix(0.118, 0.070, pull);
    float distanceToFlow = p.y - targetY;

    float core = gauss(distanceToFlow, width);
    float innerCenter = targetY * mix(0.34, 0.58, pull);
    float innerWidth = mix(0.135, 0.100, pull);
    float inwardSheath = gauss(p.y - innerCenter, innerWidth) * smoothstep(0.12, 0.90, pull);

    // Keep the source glued to the physical disk at both sides, then make it increasingly juicy near center.
    float radialFade = 1.0 - smoothstep(0.88, 1.035, xn);
    float connector = gauss(p.y, 0.125) * smoothstep(0.66, 1.0, xn);
    float denseCenter = smoothstep(0.18, 0.92, pull);
    float mask = max(core * radialFade, connector * 0.90);
    mask = max(mask, inwardSheath * denseCenter * 0.74);

    float sourceRadius = mix(1.20, 0.36, pull);
    sourceRadius += abs(distanceToFlow) / max(width, 0.001) * 0.018;
    sourceRadius = clamp(sourceRadius, 0.33, 1.35);

    float direction = p.x < 0.0 ? -1.0 : 1.0;
    float sourceAngle = direction * mix(0.12, 1.54, pull);
    sourceAngle += p.x * 0.44;
    sourceAngle += signY * distanceToFlow * 1.55;

    float xSide = smoothstep(-xSpan, xSpan, p.x);
    vec4 c = diskSample(sourceRadius, sourceAngle, xSide, mask);

    // Rear image is slightly softer than the front plane, but it is no longer thin or detached.
    float depth = upper > 0.5 ? 0.98 : 0.90;
    c.rgb *= depth;
    c.a *= upper > 0.5 ? 1.0 : 0.94;
    return c;
  }

  vec3 gradeCinematic(vec3 col, vec2 uv, vec2 p, float horizon) {
    // Gentle local contrast: preserve white-hot material, deepen the void, keep star midtones alive.
    col = 1.0 - exp(-col * 1.16);
    col = pow(max(col, 0.0), vec3(0.86));

    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    vec3 chroma = col - vec3(luma);
    col = vec3(luma) + chroma * 1.08;

    // Cool deep space versus warm accretion highlights.
    float warm = smoothstep(0.48, 0.95, max(col.r, max(col.g, col.b)));
    col *= mix(vec3(0.94, 0.98, 1.06), vec3(1.035, 0.995, 0.94), warm * 0.42);

    // Subtle gravitational shadow around the event horizon gives the object more mass.
    float r = length(p);
    float gravityShade = gauss(r - horizon * 1.42, 0.22);
    col *= 1.0 - gravityShade * 0.10;

    // Final vignette only frames the scene; it should not murder the star field.
    float vignette = smoothstep(1.52, 0.55, length(uv * vec2(0.70, 1.0)));
    col *= 0.86 + 0.14 * vignette;

    // Very subtle procedural grain breaks the perfectly-digital look without becoming visible noise.
    float grain = hash21(gl_FragCoord.xy + fract(uTime * 17.0)) - 0.5;
    col += grain * 0.010;
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
    float thickness = mix(0.30, 0.105, incl);

    vec3 col = vec3(0.0048, 0.0068, 0.0120);
    col += starField(p * 0.90) * 1.80;
    float nebula = fbm(p * 0.58 + vec2(-5.3, 7.9));
    col += vec3(0.070, 0.086, 0.150) * smoothstep(0.48, 0.87, nebula) * 1.06;

    vec4 upper = pulledRearDisk(p, horizon, incl, 1.0);
    vec4 lower = pulledRearDisk(p, horizon, incl, 0.0);
    col += upper.rgb * upper.a;
    col += lower.rgb * lower.a;

    vec4 plane = accretionPlane(p, thickness);
    col += plane.rgb * plane.a * 1.00;

    // Layered glow: small hot bloom + wide restrained photographic halo.
    float hotHalo = gauss(r - horizon * 1.24, 0.070);
    float wideHalo = gauss(r - horizon * 1.42, 0.20);
    col += vec3(1.0, 0.84, 0.64) * hotHalo * (0.10 + 0.26 * uApproach) * uBrightness;
    col += vec3(0.46, 0.54, 0.74) * wideHalo * (0.025 + 0.045 * uApproach);

    float shadow = 1.0 - smoothstep(horizon * 0.985, horizon * 1.020, r);
    col *= 1.0 - shadow;

    vec4 front = accretionPlane(p, thickness);
    float frontMask = 1.0 - smoothstep(-0.050, 0.060, p.y);
    front.a *= frontMask;
    col += front.rgb * front.a * 1.10;

    float upperShadow = shadow * smoothstep(-0.032, 0.046, p.y);
    col *= 1.0 - upperShadow;

    float theta = atan(p.y, p.x);
    float rim = gauss(r - horizon * 1.012, 0.0030);
    float visibleRim = smoothstep(-0.16, 0.82, sin(theta));
    float breakup = 0.44 + 0.56 * fbm(vec2(theta * 6.1 + uTime * 0.10, r * 46.0));
    col += vec3(1.0, 0.92, 0.82) * rim * visibleRim * breakup * 0.28 * uBrightness;

    float late = pow(uApproach, 3.0);
    float planeGlow = gauss(p.y, 0.18) * (1.0 - smoothstep(0.18, 1.72, abs(p.x)));
    col += vec3(1.0, 0.91, 0.76) * planeGlow * late * 0.15 * uBrightness;

    col = gradeCinematic(col, uv, p, horizon);
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
    ? 'Auto approach active. The accretion flow is now sufficiently juicy to violate several workplace regulations.'
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
  statusBox.textContent = 'Reference view restored. Photons have resumed their mandatory unpaid overtime.';
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

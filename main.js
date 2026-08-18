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
  statusBox.textContent = 'WebGL failed to initialize. Space-time won before the first frame.';
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
    return s * (0.82 + 0.18 * sin(uTime * (0.7 + h * 2.0) + h * 37.0));
  }

  vec3 starField(vec2 p) {
    float s = 0.0;
    s += starLayer(p + vec2(0.13, 0.07), 22.0, 0.900, 0.086) * 0.45;
    s += starLayer(p * 1.19 - vec2(0.21, 0.18), 39.0, 0.930, 0.076) * 0.70;
    s += starLayer(p * 1.47 + vec2(0.09, 0.32), 67.0, 0.956, 0.066) * 0.95;
    s += starLayer(p * 1.81 - vec2(0.39, 0.11), 105.0, 0.976, 0.057) * 1.16;
    s += starLayer(p * 2.16 + vec2(0.44, 0.26), 154.0, 0.988, 0.050) * 1.32;

    vec3 col = vec3(0.82, 0.89, 1.0) * s;
    float dust = fbm(p * 0.95 + 27.0);
    float milky = smoothstep(0.54, 0.88, dust);
    col += vec3(0.045, 0.055, 0.090) * milky * 0.90;
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

    vec3 redSide = vec3(1.11, 0.79, 0.65);
    vec3 blueSide = vec3(0.82, 0.93, 1.10);
    c *= mix(redSide, blueSide, xSide);
    return c;
  }

  vec4 accretionPlane(vec2 p, float thickness) {
    vec2 q = vec2(p.x, p.y / thickness);
    float r = length(q);
    float a = atan(q.y, q.x);

    float inner = smoothstep(0.32, 0.41, r);
    float outer = 1.0 - smoothstep(1.08, 1.40, r);
    float band = inner * outer;

    float spin = uTime * 0.42;
    float flow = fbm(vec2(a * 3.5 + spin, r * 8.5 - spin * 1.6));
    float streak = fbm(vec2(a * 13.0 - spin * 2.7, r * 29.0 + flow * 2.9));
    float fine = noise(vec2(a * 49.0 + spin * 4.8, r * 92.0));
    float turb = clamp(flow * 0.55 + streak * 0.34 + fine * 0.15, 0.0, 1.0);

    float heat = clamp((1.0 - smoothstep(0.35, 1.12, r)) * 0.88 + turb * 0.34, 0.0, 1.0);
    float density = 0.58 + 0.72 * smoothstep(0.16, 0.82, turb);
    density *= 0.70 + 0.45 * smoothstep(0.12, 0.78, streak);

    float xSide = smoothstep(-1.0, 1.0, q.x / max(r, 0.001));
    vec3 col = diskColor(heat, xSide);
    col *= (0.58 + 1.75 * heat + 0.72 * turb) * uBrightness;

    return vec4(col, clamp(band * density, 0.0, 1.0));
  }

  vec4 lensedBand(vec2 p, float horizon, float inclination, float upper) {
    float xSpan = horizon * 3.20;
    float xn = clamp(abs(p.x) / xSpan, 0.0, 1.0);
    float dome = sqrt(max(0.0, 1.0 - xn * xn));

    float high = mix(0.80, 1.32, inclination);
    float low = mix(0.62, 1.06, inclination);
    float centerY = upper > 0.5
      ? horizon * (0.78 + high * dome)
      : -horizon * (0.76 + low * dome);

    float width = mix(0.070, 0.033, xn) + dome * (upper > 0.5 ? 0.030 : 0.023);
    float profile = gauss(p.y - centerY, width);
    float join = 1.0 - smoothstep(0.84, 1.0, xn);

    float a = atan(p.y - centerY, p.x);
    float radial = abs(p.x) / max(xSpan, 0.001);
    float flow = fbm(vec2(a * 4.6 + uTime * 0.34, radial * 12.0 - uTime * 0.16));
    float streak = fbm(vec2(p.x * 8.0 - uTime * 0.38, (p.y - centerY) * 31.0 + flow * 2.0));
    float heat = clamp(0.72 + 0.18 * flow + (1.0 - xn) * 0.18, 0.0, 1.0);
    float xSide = smoothstep(-xSpan, xSpan, p.x);

    vec3 col = diskColor(heat, xSide);
    col *= (0.72 + 1.10 * flow + 0.48 * streak) * uBrightness;

    float alpha = profile * (0.72 + 0.52 * flow);
    alpha *= mix(0.64, 1.0, join);
    if (upper < 0.5) alpha *= 0.82;

    return vec4(col, clamp(alpha, 0.0, 1.0));
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

    // Dense, visible deep space. This will become the lensing reference layer later.
    vec3 col = vec3(0.0012, 0.0018, 0.0032);
    col += starField(p * 0.94) * 1.75;
    float nebula = fbm(p * 0.66 + vec2(-5.3, 7.9));
    col += vec3(0.030, 0.038, 0.070) * smoothstep(0.56, 0.90, nebula) * 0.76;

    // Rear accretion material: the same disk appears above AND below the shadow.
    vec4 upper = lensedBand(p, horizon, incl, 1.0);
    vec4 lower = lensedBand(p, horizon, incl, 0.0);
    col += upper.rgb * upper.a * 1.08;
    col += lower.rgb * lower.a * 0.96;

    // Warm volume connecting the bent rear disk to the main plane.
    float xSpan = horizon * 3.15;
    float side = smoothstep(xSpan * 0.62, xSpan, abs(p.x));
    float bridge = gauss(p.y, 0.090 + 0.025 * (1.0 - incl)) * side;
    float bridgeNoise = fbm(vec2(p.x * 8.0 + uTime * 0.23, p.y * 24.0));
    col += diskColor(0.50 + bridgeNoise * 0.24, smoothstep(-xSpan, xSpan, p.x))
      * bridge * (0.16 + bridgeNoise * 0.24) * uBrightness;

    // Main dense plane. It extends across the whole image like the reference.
    vec4 plane = accretionPlane(p, thickness);
    col += plane.rgb * plane.a * 0.95;

    // Broad light around the photon region, without drawing a white Saturn ring.
    float halo = gauss(r - horizon * 1.28, 0.085);
    col += vec3(1.0, 0.82, 0.61) * halo * (0.12 + 0.28 * uApproach) * uBrightness;

    // Event horizon. The rear disk and stars disappear behind it.
    float shadow = 1.0 - smoothstep(horizon * 0.985, horizon * 1.020, r);
    col *= 1.0 - shadow;

    // Front half of the disk crosses directly in front of the lower half of the black hole.
    vec4 front = accretionPlane(p, thickness);
    float frontMask = 1.0 - smoothstep(-0.055, 0.055, p.y);
    front.a *= frontMask;
    col += front.rgb * front.a * 1.10;

    // Reassert only the upper black hemisphere. This produces the reference silhouette:
    // black center above the disk, dense disk crossing its lower face.
    float upperShadow = shadow * smoothstep(-0.030, 0.045, p.y);
    col *= 1.0 - upperShadow;

    // Tiny broken photon edge, deliberately subordinate to the accretion disk.
    float theta = atan(p.y, p.x);
    float rim = gauss(r - horizon * 1.012, 0.0034);
    float visibleRim = smoothstep(-0.18, 0.82, sin(theta));
    float breakup = 0.40 + 0.60 * fbm(vec2(theta * 6.2 + uTime * 0.10, r * 47.0));
    col += vec3(1.0, 0.91, 0.80) * rim * visibleRim * breakup * 0.42 * uBrightness;

    // Approach glare remains restrained here; gravity/distortion comes in the next pass.
    float late = pow(uApproach, 3.0);
    float planeGlow = gauss(p.y, 0.17) * (1.0 - smoothstep(0.18, 1.72, abs(p.x)));
    col += vec3(1.0, 0.90, 0.74) * planeGlow * late * 0.17 * uBrightness;

    col = 1.0 - exp(-col * 1.22);
    float vignette = 1.0 - smoothstep(0.66, 1.78, length(uv * vec2(0.68, 1.0)));
    col *= 0.78 + 0.22 * vignette;
    col = pow(max(col, 0.0), vec3(0.86));

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
    ? 'Auto approach active. The accretion disk has surrounded the shadow and HR has been informed.'
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
  statusBox.textContent = 'Reference view restored. Dense disk, black shadow, unreasonable amounts of light.';
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
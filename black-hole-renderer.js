import * as THREE from './vendor/three.module.js';

// Shared V1 renderer, revision 1. Source of truth: wzzzodiac/black-hole.
// No DOM queries, observers or animation loop. The caller owns scheduling and time.
export const RENDERER_REVISION = 'v1-cinematic-1';
const vertexShader = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const fragmentShader = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uApproach, uBrightness, uInclination, uDive, uExposure;
  uniform vec2 uResolution;
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


  // Pixel-filtered layers stay stable when resolution or approach changes.
  vec3 stars(vec2 p, float scale, float seed) {
    vec2 g = p * scale, cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + seed);
    vec2 offset = vec2(hash21(cell + seed + 2.7), hash21(cell + seed + 8.1)) - 0.5;
    float d = length(f - offset * 0.64);
    float aa = max(length(fwidth(g)) * 0.5, 0.012);
    float size = mix(0.024, 0.072, pow(h, 12.0));
    float star = (1.0 - smoothstep(size, size + aa, d)) * size / (size + aa);
    star *= smoothstep(0.94, 1.0, h);
    vec3 color = mix(vec3(0.45, 0.65, 1.0), vec3(1.0, 0.83, 0.63), hash21(cell + 17.0));
    return color * star * (0.82 + 0.18 * sin(h * 62.0 + uTime * 0.25));
  }

  vec3 starField(vec2 p) {
    vec3 col = stars(p, 22.0, 4.0) * 0.8;
    col += stars(p + 7.3, 51.0, 18.0) * 0.65;
    col += stars(p - 3.6, 103.0, 31.0) * 0.4;
    float cloud = fbm(p * 1.4 + 12.0);
    float lane = gauss(p.y - p.x * 0.42 + 0.40, 0.38);
    col += vec3(0.027, 0.042, 0.068) * lane * smoothstep(0.30, 0.77, cloud);
    return col;
  }

  // V1's common accretion material, now advected in periodic orbital coordinates.
  // Every projection samples the same field. No angular seam, frame noise or pole.
  vec4 diskSample(float radius, float angle, float side, float mask) {
    if (mask < 0.001) return vec4(0.0);
    // Bounded differential shear avoids winding subpixel threads indefinitely over long sessions.
    float orbital = angle - uTime * 0.13 - 0.55 * sin(radius * 6.0 - uTime * 0.17);
    vec2 orbit = vec2(cos(orbital), sin(orbital));
    float eddies = fbm(orbit * 3.1 + radius * 8.0);
    float thread = noise(vec2(radius * 96.0 + eddies * 4.5, 0.0) + orbit * 1.8);
    float knots = fbm(orbit * 7.0 + vec2(radius * 17.0, radius * 9.0));
    float wisps = fbm(orbit * 24.0 + vec2(radius * 72.0 + eddies * 6.0, radius * 38.0));
    float bands = 0.5 + 0.5 * sin(radius * 235.0 + eddies * 10.0 + sin(orbital * 3.0) * 1.4);
    float detail = mix(bands, 0.5, smoothstep(0.5, 2.0, fwidth(radius) * 235.0));
    float density = 0.16 + thread * 0.43 + detail * 0.20 + knots * knots * 0.60;
    density *= 0.48 + 1.35 * smoothstep(0.22, 0.79, wisps);
    float heat = 1.0 - smoothstep(0.34, 1.02, radius);
    vec3 ember = vec3(0.60, 0.12, 0.025);
    vec3 gold = vec3(1.0, 0.49, 0.14);
    vec3 ivory = vec3(1.0, 0.87, 0.64);
    vec3 color = mix(ember, gold, smoothstep(0.0, 0.55, heat));
    color = mix(color, ivory, pow(heat, 2.3));
    // Artistic Doppler-like asymmetry; this is not relativistic radiative transfer.
    float boost = mix(0.60, 1.55, side);
    color *= mix(vec3(1.0, 0.73, 0.48), vec3(0.90, 0.96, 1.05), side);
    float radiance = (0.38 + heat * 1.8) * density * boost;
    return vec4(color * radiance * uBrightness * 2.1, clamp(mask, 0.0, 1.0));
  }

  vec4 accretionPlane(vec2 p, float thickness) {
    // Slight flaring at large radii gives the disk a shallow bowl silhouette.
    vec2 q = vec2(p.x, p.y / (thickness * (1.0 + abs(p.x) * 0.12)));
    float radius = length(q), angle = atan(q.y, q.x);
    float band = smoothstep(0.31, 0.38, radius) * (1.0 - smoothstep(0.83, 1.05, radius));
    return diskSample(radius, angle, smoothstep(-0.8, 0.85, cos(angle)), band);
  }

  vec4 bentDisk(vec2 p, float horizon, float incl, float upper) {
    // Analytic lensed annulus: V1's artistic secondary image, no geodesic claim.
    float flatten = upper > 0.5 ? mix(0.92, 1.06, incl) : 0.74;
    vec2 q = vec2(p.x, p.y / flatten);
    float radius = length(q), angle = atan(q.y, q.x);
    float inner = horizon * 1.13;
    float outer = upper > 0.5 ? 0.55 : 0.40;
    float t = (radius - inner) / (outer - inner);
    float mask = smoothstep(0.0, 0.09, t) * (1.0 - smoothstep(0.65, 1.0, t));
    mask *= upper > 0.5 ? smoothstep(-0.015, 0.07, p.y) : 1.0 - smoothstep(-0.07, 0.015, p.y);
    vec4 disk = diskSample(mix(0.34, 1.05, clamp(t, 0.0, 1.0)), angle,
      smoothstep(-0.8, 0.85, cos(angle)), mask);
    disk.rgb *= upper > 0.5 ? 0.90 : 0.43;
    return disk;
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    uv.x *= aspect;
    float approach = clamp(uApproach, 0.0, 1.0);
    // Fit the entire disk at 0% in portrait; converge to a full dive in both aspects.
    float fit = min(1.0, aspect / 1.28);
    float zoom = mix(1.22 * fit, 5.6, pow(approach, 1.65)) + uDive * pow(approach, 8.0);
    vec2 p = uv / zoom;
    p = mat2(0.9945, -0.1045, 0.1045, 0.9945) * p;
    p.y += 0.014;
    float horizon = 0.235, r = length(p);
    float incl = clamp((uInclination - 55.0) / 31.0, 0.0, 1.0);
    float thickness = mix(0.33, 0.105, incl);

    // Smooth radial background deflection with a small azimuthal shear.
    float gravity = exp(-max(r - horizon, 0.0) * 4.8);
    vec2 lightP = p * (1.0 + 0.18 / max(r * r, 0.075));
    lightP += vec2(-p.y, p.x) * gravity * 0.09;
    vec3 col = vec3(0.0015, 0.0025, 0.005) + starField(lightP);
    col *= mix(0.20, 1.0, smoothstep(horizon, horizon * 2.7, r));

    vec4 upper = bentDisk(p, horizon, incl, 1.0);
    vec4 lower = bentDisk(p, horizon, incl, 0.0);
    col = col * (1.0 - upper.a * 0.85) + upper.rgb * upper.a;
    col = col * (1.0 - lower.a * 0.80) + lower.rgb * lower.a;
    vec4 underside = accretionPlane(p + vec2(0.0, 0.016), thickness * 1.04);
    col = col * (1.0 - underside.a * 0.70) + underside.rgb * underside.a * vec3(0.27, 0.15, 0.09);
    vec4 plane = accretionPlane(p, thickness);
    col = col * (1.0 - plane.a * 0.90) + plane.rgb * plane.a;

    // Restrained analytic scatter, not a fullscreen bloom pass.
    float halo = gauss(r - horizon * 1.13, 0.050);
    col += vec3(1.0, 0.43, 0.12) * halo * 0.12 * uBrightness;
    float aa = max(fwidth(r), 0.0006);
    float shadow = 1.0 - smoothstep(horizon - aa, horizon + aa, r);
    col *= 1.0 - shadow;
    float ring = gauss(r - horizon * 1.025, max(0.0018, aa));
    float secondary = gauss(r - horizon * 1.067, max(0.0010, aa));
    float angle = atan(p.y, p.x);
    col += vec3(1.0, 0.76, 0.42) * (ring * 0.78 + secondary * 0.18)
      * (0.65 + 0.35 * cos(angle)) * uBrightness;

    // The near disk crosses the lower shadow; reuse the existing sample, no duplicate FBM.
    float front = 1.0 - smoothstep(-0.045, 0.01, p.y);
    col = mix(col, plane.rgb, plane.a * front);
    // Warm filmic shoulder keeps the inner disk luminous without erasing its bands.
    col = 1.0 - exp(-col * 1.28);
    col = pow(max(col, 0.0), vec3(0.90));
    float vignette = smoothstep(0.35, 1.5, length(vUv * 2.0 - 1.0));
    col *= 1.0 - vignette * 0.24;
    gl_FragColor = vec4(col * uExposure, 1.0);
  }

`;

const finite = (value, fallback, min, max) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const budgets = { low: [0.75, 650000], balanced: [1.25, 1400000], high: [2, 3000000] };

export function createBlackHoleRenderer({ canvas, onStatus = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const uniforms = {
    uTime: { value: 0 }, uApproach: { value: 0 }, uBrightness: { value: 0.375 },
    uInclination: { value: 76 }, uDive: { value: 0 }, uExposure: { value: 1 },
    uResolution: { value: new THREE.Vector2(1, 1) }
  };
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false });
  scene.add(new THREE.Mesh(geometry, material));
  let disposed = false, lost = false, frames = 0;
  const element = renderer.domElement;
  function contextLost(event) { event.preventDefault(); lost = true; onStatus('lost'); }
  function contextRestored() { lost = false; onStatus('restored'); }
  element.addEventListener('webglcontextlost', contextLost);
  element.addEventListener('webglcontextrestored', contextRestored);
  return {
    canvas: element,
    resize(width, height, { quality = 'balanced', pixelRatio = 1 } = {}) {
      if (disposed) return;
      width = finite(width, 1, 1, 16384); height = finite(height, 1, 1, 16384);
      const [cap, pixels] = budgets[quality] || budgets.balanced;
      const scale = Math.min(finite(pixelRatio, 1, 0.25, 4), cap, Math.sqrt(pixels / (width * height)));
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      if (element.width !== w || element.height !== h) renderer.setSize(w, h, false);
      uniforms.uResolution.value.set(w, h);
    },
    render({ time = 0, approach = 0, brightness = 0.375, inclination = 76, dive = 0, exposure = 1 } = {}) {
      if (disposed || lost) return false;
      uniforms.uTime.value = finite(time, 0, 0, 1e8);
      uniforms.uApproach.value = finite(approach, 0, 0, 1);
      uniforms.uBrightness.value = finite(brightness, 0.375, 0, 2);
      uniforms.uInclination.value = finite(inclination, 76, 55, 86);
      uniforms.uDive.value = finite(dive, 0, 0, 6);
      uniforms.uExposure.value = finite(exposure, 1, 0, 1.5);
      renderer.render(scene, camera); frames++;
      return true;
    },
    get info() { return { revision: RENDERER_REVISION, width: element.width, height: element.height, frames, lost, disposed }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      element.removeEventListener('webglcontextlost', contextLost);
      element.removeEventListener('webglcontextrestored', contextRestored);
      geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss();
    }
  };
}

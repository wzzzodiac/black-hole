const host = document.getElementById('scene');
const warning = document.getElementById('compatWarning');
const gpuReadout = document.getElementById('gpuReadout');
const statusBox = document.getElementById('statusBox');

const controls = {
  approach: document.getElementById('approach'),
  inclination: document.getElementById('inclination'),
  brightness: document.getElementById('brightness'),
  steps: document.getElementById('steps')
};

const outputs = {
  approach: document.getElementById('approachValue'),
  inclination: document.getElementById('inclinationValue'),
  brightness: document.getElementById('brightnessValue'),
  steps: document.getElementById('stepsValue')
};

const resetButton = document.getElementById('resetButton');
const renderButton = document.getElementById('renderButton');
const autoButton = document.getElementById('autoButton');

const canvas = document.createElement('canvas');
canvas.setAttribute('aria-hidden', 'true');
host.prepend(canvas);

if (!navigator.gpu) {
  warning.classList.add('show');
  gpuReadout.textContent = 'GPU: WebGPU unavailable';
  statusBox.textContent = 'WebGPU is not available in this browser/device. V1 still works with WebGL.';
  throw new Error('WebGPU unavailable');
}

const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
if (!adapter) {
  warning.classList.add('show');
  gpuReadout.textContent = 'GPU: no compatible adapter';
  statusBox.textContent = 'No compatible WebGPU adapter was returned.';
  throw new Error('No WebGPU adapter');
}

const device = await adapter.requestDevice();
const context = canvas.getContext('webgpu');
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format: canvasFormat, alphaMode: 'opaque' });

device.lost.then(info => {
  gpuReadout.textContent = 'GPU: device lost';
  statusBox.textContent = `WebGPU device lost: ${info.message || 'unknown reason'}`;
});

const computeShader = /* wgsl */`
struct Params {
  resolution : vec4f,
  camPos : vec4f,
  camRight : vec4f,
  camUp : vec4f,
  camForward : vec4f,
  sim : vec4f,
  disk : vec4f,
};

@group(0) @binding(0) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> params : Params;

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn hash31(p: vec3f) -> f32 {
  return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453);
}

fn stars(dir: vec3f) -> vec3f {
  let d = normalize(dir);
  let lon = atan2(d.z, d.x) / 6.2831853 + 0.5;
  let lat = asin(clamp(d.y, -1.0, 1.0)) / 3.1415926 + 0.5;
  let uv = vec2f(lon, lat);

  let g1 = floor(uv * vec2f(520.0, 260.0));
  let h1 = hash21(g1);
  let s1 = select(0.0, pow((h1 - 0.988) / 0.012, 2.2), h1 > 0.988);

  let g2 = floor((uv + vec2f(0.173, 0.319)) * vec2f(910.0, 455.0));
  let h2 = hash21(g2);
  let s2 = select(0.0, pow((h2 - 0.994) / 0.006, 2.0), h2 > 0.994);

  let milky = pow(max(0.0, 1.0 - abs(d.y + 0.18 * sin(d.x * 4.0))) , 7.0);
  var c = vec3f(0.0025, 0.0035, 0.0060);
  c += vec3f(0.84, 0.91, 1.0) * s1 * 1.6;
  c += vec3f(1.0, 0.88, 0.72) * s2 * 2.2;
  c += vec3f(0.026, 0.035, 0.070) * milky;
  return c;
}

fn accel(p: vec3f, v: vec3f) -> vec3f {
  let rs = params.sim.z;
  let r2 = max(dot(p, p), 0.0001);
  let r = sqrt(r2);
  let h = cross(p, v);
  let h2 = dot(h, h);
  let r5 = max(r2 * r2 * r, 0.0001);
  return p * (-1.5 * rs * h2 / r5);
}

fn rk4(p0: vec3f, v0: vec3f, ds: f32) -> vec4f {
  let k1p = v0;
  let k1v = accel(p0, v0);

  let p2 = p0 + k1p * (0.5 * ds);
  let v2 = v0 + k1v * (0.5 * ds);
  let k2p = v2;
  let k2v = accel(p2, v2);

  let p3 = p0 + k2p * (0.5 * ds);
  let v3 = v0 + k2v * (0.5 * ds);
  let k3p = v3;
  let k3v = accel(p3, v3);

  let p4 = p0 + k3p * ds;
  let v4 = v0 + k3v * ds;
  let k4p = v4;
  let k4v = accel(p4, v4);

  let p = p0 + (k1p + 2.0 * k2p + 2.0 * k3p + k4p) * (ds / 6.0);
  let v = normalize(v0 + (k1v + 2.0 * k2v + 2.0 * k3v + k4v) * (ds / 6.0));
  return vec4f(p, 0.0) + vec4f(v * 0.0, 0.0);
}

fn rk4Velocity(p0: vec3f, v0: vec3f, ds: f32) -> vec3f {
  let k1p = v0;
  let k1v = accel(p0, v0);

  let p2 = p0 + k1p * (0.5 * ds);
  let v2 = v0 + k1v * (0.5 * ds);
  let k2p = v2;
  let k2v = accel(p2, v2);

  let p3 = p0 + k2p * (0.5 * ds);
  let v3 = v0 + k2v * (0.5 * ds);
  let k3p = v3;
  let k3v = accel(p3, v3);

  let p4 = p0 + k3p * ds;
  let v4 = v0 + k3v * ds;
  let k4v = accel(p4, v4);

  return normalize(v0 + (k1v + 2.0 * k2v + 2.0 * k3v + k4v) * (ds / 6.0));
}

fn diskColor(hit: vec3f, rayDir: vec3f) -> vec3f {
  let inner = params.disk.x;
  let outer = params.disk.y;
  let emission = params.disk.z;
  let rr = length(hit.xz);
  let t = clamp((rr - inner) / max(outer - inner, 0.001), 0.0, 1.0);
  let heat = pow(1.0 - t, 0.62);
  let phi = atan2(hit.z, hit.x);

  let rings = 0.76 + 0.24 * sin(rr * 15.0 + sin(phi * 7.0) * 1.8);
  let turbulence = 0.78 + 0.22 * sin(phi * 19.0 + rr * 8.0);
  let tangent = normalize(vec3f(-hit.z, 0.0, hit.x));
  let doppler = clamp(1.0 + dot(tangent, -rayDir) * 0.38, 0.62, 1.42);

  let ember = vec3f(0.30, 0.030, 0.004);
  let orange = vec3f(1.00, 0.20, 0.018);
  let gold = vec3f(1.00, 0.61, 0.19);
  let whiteHot = vec3f(1.00, 0.96, 0.86);

  var c = mix(ember, orange, smoothstep(0.04, 0.34, heat));
  c = mix(c, gold, smoothstep(0.28, 0.66, heat));
  c = mix(c, whiteHot, smoothstep(0.66, 1.0, heat));
  let innerGlow = 1.0 + 2.0 * exp(-pow((rr - inner) / 0.34, 2.0));
  return c * rings * turbulence * doppler * innerGlow * emission;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let width = u32(params.resolution.x);
  let height = u32(params.resolution.y);
  if (gid.x >= width || gid.y >= height) { return; }

  let px = (2.0 * (f32(gid.x) + 0.5) / f32(width) - 1.0) * params.sim.y * params.sim.x;
  let py = (1.0 - 2.0 * (f32(gid.y) + 0.5) / f32(height)) * params.sim.x;

  var p = params.camPos.xyz;
  var v = normalize(params.camForward.xyz + px * params.camRight.xyz + py * params.camUp.xyz);
  var previous = p;
  var color = vec3f(0.0);
  var resolved = false;

  let rs = params.sim.z;
  let ds = params.sim.w;
  let maxSteps = u32(params.resolution.z);
  let inner = params.disk.x;
  let outer = params.disk.y;

  for (var i: u32 = 0u; i < 720u; i = i + 1u) {
    if (i >= maxSteps) { break; }

    let r = length(p);
    if (r <= rs * 1.015) {
      color = vec3f(0.0);
      resolved = true;
      break;
    }

    let nextP4 = rk4(p, v, ds);
    let nextV = rk4Velocity(p, v, ds);
    let nextP = nextP4.xyz;

    if ((previous.y > 0.0 && nextP.y <= 0.0) || (previous.y < 0.0 && nextP.y >= 0.0)) {
      let denom = previous.y - nextP.y;
      if (abs(denom) > 0.00001) {
        let hitT = clamp(previous.y / denom, 0.0, 1.0);
        let hit = mix(previous, nextP, hitT);
        let diskR = length(hit.xz);
        if (diskR >= inner && diskR <= outer) {
          color = diskColor(hit, nextV);
          resolved = true;
          break;
        }
      }
    }

    previous = nextP;
    p = nextP;
    v = nextV;

    if (length(p) > 22.0 && i > 24u) {
      color = stars(v);
      resolved = true;
      break;
    }
  }

  if (!resolved) {
    let r = length(p);
    color = select(stars(v) * 0.72, vec3f(0.0), r <= rs * 1.08);
  }

  let exposure = 1.0 - exp(-color * 1.15);
  let gamma = pow(max(exposure, vec3f(0.0)), vec3f(0.84));
  textureStore(outputTex, vec2i(gid.xy), vec4f(gamma, 1.0));
}
`;

const displayShader = /* wgsl */`
@group(0) @binding(0) var image : texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  return vec4f(pos[vertexIndex], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) position : vec4f) -> @location(0) vec4f {
  let dims = textureDimensions(image);
  let maxCoord = vec2i(i32(dims.x) - 1, i32(dims.y) - 1);
  let coord = clamp(vec2i(position.xy), vec2i(0), maxCoord);
  return textureLoad(image, coord, 0);
}
`;

const computeModule = device.createShaderModule({ label: 'V2 geodesic compute', code: computeShader });
const displayModule = device.createShaderModule({ label: 'V2 display shader', code: displayShader });

const computePipeline = device.createComputePipeline({
  label: 'V2 geodesic pipeline',
  layout: 'auto',
  compute: { module: computeModule, entryPoint: 'main' }
});

const renderPipeline = device.createRenderPipeline({
  label: 'V2 display pipeline',
  layout: 'auto',
  vertex: { module: displayModule, entryPoint: 'vs' },
  fragment: { module: displayModule, entryPoint: 'fs', targets: [{ format: canvasFormat }] },
  primitive: { topology: 'triangle-list' }
});

const uniformBuffer = device.createBuffer({
  label: 'V2 params',
  size: 112,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

let outputTexture = null;
let computeBindGroup = null;
let renderBindGroup = null;
let width = 0;
let height = 0;
let azimuth = 0.0;
let elevation = Number(controls.inclination.value) * Math.PI / 180;
let dragging = false;
let pointerX = 0;
let pointerY = 0;
let renderQueued = false;
let renderSerial = 0;
let autoApproach = false;
let autoDirection = 1;
let lastAutoTime = 0;

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function getCamera() {
  const t = Number(controls.approach.value) / 100;
  const far = 17.25;
  const near = 1.32;
  const shaped = Math.pow(t, 1.18);
  const radius = Math.exp(Math.log(far) + (Math.log(near) - Math.log(far)) * shaped);

  elevation = Math.max(0.12, Math.min(1.535, elevation));
  const ce = Math.cos(elevation);
  const se = Math.sin(elevation);
  const pos = [radius * ce * Math.cos(azimuth), radius * se, radius * ce * Math.sin(azimuth)];
  const forward = normalize([-pos[0], -pos[1], -pos[2]]);
  let right = normalize(cross(forward, [0, 1, 0]));
  if (Math.hypot(...right) < 0.1) right = [1, 0, 0];
  const up = normalize(cross(right, forward));
  return { pos, forward, right, up, radius };
}

function syncOutputs() {
  outputs.approach.textContent = `${controls.approach.value}%`;
  outputs.inclination.textContent = `${Math.round(elevation * 180 / Math.PI)}°`;
  outputs.brightness.textContent = `${(Number(controls.brightness.value) / 100).toFixed(2)}×`;
  outputs.steps.textContent = controls.steps.value;
}

function isMoving() {
  return dragging || autoApproach;
}

function ensureTargets() {
  const cssW = Math.max(1, host.clientWidth);
  const cssH = Math.max(1, host.clientHeight);
  const pixelBudget = isMoving() ? 52000 : 90000;
  const scale = Math.min(1, Math.sqrt(pixelBudget / (cssW * cssH)));
  const nextW = Math.max(160, Math.floor(cssW * scale / 8) * 8);
  const nextH = Math.max(120, Math.floor(cssH * scale / 8) * 8);

  if (nextW === width && nextH === height && outputTexture) return;
  width = nextW;
  height = nextH;
  canvas.width = width;
  canvas.height = height;

  if (outputTexture) outputTexture.destroy();
  outputTexture = device.createTexture({
    label: 'V2 geodesic output',
    size: [width, height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
  });

  computeBindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: outputTexture.createView() },
      { binding: 1, resource: { buffer: uniformBuffer } }
    ]
  });

  renderBindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: outputTexture.createView() }]
  });
}

function makeParams() {
  const camera = getCamera();
  const requestedSteps = Number(controls.steps.value);
  const steps = isMoving() ? Math.min(requestedSteps, 180) : requestedSteps;
  const tanHalfFov = Math.tan(48 * Math.PI / 360);
  const aspect = width / Math.max(height, 1);
  const rs = 1.0;
  const stepSize = camera.radius < 2.2 ? 0.012 : camera.radius < 4.5 ? 0.024 : 0.045;
  const brightness = Number(controls.brightness.value) / 100;

  return new Float32Array([
    width, height, steps, performance.now() * 0.001,
    ...camera.pos, 0,
    ...camera.right, 0,
    ...camera.up, 0,
    ...camera.forward, 0,
    tanHalfFov, aspect, rs, stepSize,
    1.55, 7.0, brightness, 0
  ]);
}

async function renderFrame(forceRefine = false) {
  const serial = ++renderSerial;
  ensureTargets();
  const params = makeParams();
  if (forceRefine) params[2] = Math.max(params[2], 520);
  device.queue.writeBuffer(uniformBuffer, 0, params);

  const encoder = device.createCommandEncoder({ label: 'V2 frame' });
  const computePass = encoder.beginComputePass({ label: 'Geodesic integration' });
  computePass.setPipeline(computePipeline);
  computePass.setBindGroup(0, computeBindGroup);
  computePass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
  computePass.end();

  const view = context.getCurrentTexture().createView();
  const renderPass = encoder.beginRenderPass({
    label: 'Display geodesic frame',
    colorAttachments: [{ view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
  });
  renderPass.setPipeline(renderPipeline);
  renderPass.setBindGroup(0, renderBindGroup);
  renderPass.draw(3);
  renderPass.end();

  const started = performance.now();
  device.queue.submit([encoder.finish()]);
  gpuReadout.textContent = `GPU: tracing ${width}×${height} // ${Math.round(params[2])} steps`;
  statusBox.textContent = isMoving()
    ? 'Motion preview: reduced resolution and step budget while the camera is moving.'
    : 'Tracing curved light paths. The disk shape comes from ray intersections, not a manually bent mesh.';

  try {
    await device.queue.onSubmittedWorkDone();
    if (serial === renderSerial) {
      const ms = Math.round(performance.now() - started);
      gpuReadout.textContent = `GPU: ${width}×${height} // ${Math.round(params[2])} steps // ${ms} ms`;
      statusBox.textContent = forceRefine
        ? `Refined frame complete in ~${ms} ms.`
        : autoApproach
          ? `Auto approach running at interactive quality // ~${ms} ms per frame.`
          : `Frame complete in ~${ms} ms. Drag the viewport to orbit or increase the geodesic budget for cleaner bending.`;
    }
  } catch (error) {
    statusBox.textContent = `GPU submission failed: ${error.message}`;
  }
}

function queueRender(forceRefine = false) {
  if (renderQueued && !forceRefine) return;
  renderQueued = true;
  requestAnimationFrame(async () => {
    renderQueued = false;
    await renderFrame(forceRefine);
  });
}

async function autoTick(now) {
  if (!autoApproach) return;
  const dt = lastAutoTime ? Math.min(0.08, (now - lastAutoTime) / 1000) : 0;
  lastAutoTime = now;
  let value = Number(controls.approach.value) + autoDirection * dt * 7.5;
  if (value >= 100) { value = 100; autoDirection = -1; }
  if (value <= 0) { value = 0; autoDirection = 1; }
  controls.approach.value = String(value);
  syncOutputs();
  await renderFrame(false);
  if (autoApproach) requestAnimationFrame(autoTick);
}

Object.values(controls).forEach(control => {
  control.addEventListener('input', () => {
    if (control === controls.inclination) elevation = Number(controls.inclination.value) * Math.PI / 180;
    syncOutputs();
    if (!autoApproach) queueRender(false);
  });
});

host.addEventListener('pointerdown', event => {
  dragging = true;
  host.classList.add('dragging');
  pointerX = event.clientX;
  pointerY = event.clientY;
  host.setPointerCapture(event.pointerId);
});

host.addEventListener('pointermove', event => {
  if (!dragging) return;
  const dx = event.clientX - pointerX;
  const dy = event.clientY - pointerY;
  pointerX = event.clientX;
  pointerY = event.clientY;
  azimuth += dx * 0.0065;
  elevation = Math.max(0.12, Math.min(1.535, elevation - dy * 0.0065));
  controls.inclination.value = String(Math.round(elevation * 180 / Math.PI));
  syncOutputs();
  if (!autoApproach) queueRender(false);
});

function endDrag(event) {
  if (!dragging) return;
  dragging = false;
  host.classList.remove('dragging');
  try { host.releasePointerCapture(event.pointerId); } catch {}
  if (!autoApproach) queueRender(true);
}

host.addEventListener('pointerup', endDrag);
host.addEventListener('pointercancel', endDrag);

host.addEventListener('wheel', event => {
  event.preventDefault();
  const delta = Math.sign(event.deltaY) * 3;
  controls.approach.value = String(Math.max(0, Math.min(100, Number(controls.approach.value) + delta)));
  syncOutputs();
  if (!autoApproach) queueRender(false);
}, { passive: false });

autoButton.addEventListener('click', () => {
  autoApproach = !autoApproach;
  autoButton.setAttribute('aria-pressed', String(autoApproach));
  autoButton.textContent = autoApproach ? 'AUTO: RUNNING' : 'AUTO APPROACH';
  if (autoApproach) {
    lastAutoTime = 0;
    requestAnimationFrame(autoTick);
  } else {
    queueRender(true);
  }
});

resetButton.addEventListener('click', () => {
  autoApproach = false;
  autoDirection = 1;
  lastAutoTime = 0;
  autoButton.setAttribute('aria-pressed', 'false');
  autoButton.textContent = 'AUTO APPROACH';
  controls.approach.value = '22';
  controls.inclination.value = '68';
  controls.brightness.value = '110';
  controls.steps.value = '360';
  azimuth = 0;
  elevation = 68 * Math.PI / 180;
  syncOutputs();
  queueRender(true);
});

renderButton.addEventListener('click', () => queueRender(true));

const resizeObserver = new ResizeObserver(() => {
  if (!autoApproach) queueRender(false);
});
resizeObserver.observe(host);

syncOutputs();
statusBox.textContent = 'WebGPU online. Compiling the first geodesic frame...';
queueRender(true);

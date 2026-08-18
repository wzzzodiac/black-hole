# Black Hole // Gravitational Lensing Lab

A browser black-hole lab with two independent renderers.

## Version 1 — Cinematic / final

V1 is the finished **Three.js + GLSL / WebGL** renderer. It deliberately favors cinematic readability over exact relativity.

- Procedural star field and accretion material
- Stylized upper/lower gravitationally lensed disk images
- Event horizon, photon-rim treatment and background distortion
- Disk brightness and inclination controls
- Deep approach sequence
- No image textures
- Broad WebGL browser compatibility

Open `v1.html`, or choose V1 from `index.html`.

## Version 2 — WebGPU geodesic alpha

V2 is a separate clean-room **WebGPU + WGSL compute** experiment. Its architecture is inspired by the public [`kavan010/black_hole`](https://github.com/kavan010/black_hole) project: launch one light ray per output pixel, integrate the trajectory on the GPU, test event-horizon capture, test equatorial accretion-disk crossings, and shade escaped rays as background light.

The upstream project is a native C++17 / OpenGL 4.3 application using GLFW/GLEW and a GLSL compute shader. That code cannot run directly on GitHub Pages/WebGPU. The V2 implementation therefore rewrites the approach independently for the browser in JavaScript + WGSL. No upstream source code is copied into this repository.

### V2 alpha pipeline

```text
browser camera
    ↓
WebGPU compute dispatch
    ↓
one invocation per output pixel
    ↓
RK4 curved-light-path integration
    ├─ event horizon → black
    ├─ equatorial disk crossing → emitted disk color
    └─ escape → procedural star background
    ↓
storage texture
    ↓
fullscreen WebGPU presentation pass
```

The alpha uses dimensionless units with `r_s = 1` and a Schwarzschild-inspired null-ray bending equation. It is intentionally lower resolution and lower step count than an offline scientific renderer so it can remain interactive in a browser. It is not yet a research-grade GR solver.

### V2 controls

- **Approach** — exponentially moves the camera toward the event-horizon neighborhood.
- **Camera elevation** — changes the actual camera geometry; the disk itself is not manually deformed.
- **Disk emission** — scales disk radiance.
- **Geodesic budget** — increases/decreases integration steps per ray.
- **Drag viewport** — orbit camera around the black hole.
- **Mouse wheel** — adjust approach.
- **Refine frame** — forces a higher-step render after interactive movement.

V2 requires a browser/device with WebGPU support. If WebGPU is unavailable, V1 remains usable.

## Files

```text
index.html     version selector
v1.html        frozen V1 renderer page
main-v12.js    V1 renderer
v2.html        V2 alpha page
v2.js          WebGPU/WGSL geodesic renderer
style.css      shared UI styling
```

## Status

- **V1:** final/frozen.
- **V2:** alpha 0.1 — architecture and light-path pipeline first; visual refinement comes later.

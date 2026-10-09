# V1 cinematic evolution — visual review

Review date: 2026-10-09. Branch: `codex/v1-cinematic-renderer`. Original V1 remains recoverable at `62994b8`. This change is review-only: no merge or deployment.

## Try it

From the repository root:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/v1.html` for the interactive lab or `http://127.0.0.1:8000/docs/review.html` for the comparison gallery and video. Static files and same-origin ES modules work under the GitHub Pages repository prefix. No install, build, external fonts, images or paid API are needed.

## Direction and implementation

The scene is an observation surface with a compact instrument console, rather than a small framed demo below a large heading. Amber emission, cold background stars and a clean black shadow carry the hierarchy. All original controls and ranges remain. Pause, explicit quality and reduced-motion handling are added.

V1's own hash/noise/FBM, shared procedural material, plane and bent-disk structure are evolved into `black-hole-renderer.js`. The secondary disk images use annular coordinates instead of the previous pole-shaped fans; a restrained lower image, underside layer and near disk establish depth. Filaments move in periodic orbital coordinates with bounded shear, so texture does not wind into indefinitely finer stripes. Highlight compression preserves bright structure without a postprocessing bloom pass. Filtered star layers and analytic radial/shear distortion provide background depth. Portrait fitting keeps the complete disk visible at Approach 0%; the late zoom converges to an intense close-up.

These are artistic approximations. The renderer does not solve relativistic geodesics or perform physically exact volumetric radiative transfer. V2 remains the separate WebGPU/WGSL experiment. Its source and the vendored Three.js r185 are unchanged.

## Visual evidence

Use [the gallery](review.html) or the files in [captures](captures/):

- `before/after-desktop-{0,50,100}.png`: identical 960×600 rendering surface, time 12 seconds, emission 0.375 and inclination 76°. Approach and camera-fit mapping have intentionally evolved; these compare equivalent control values, not an unchanged optical camera.
- `before/after-mobile-{0,50,100}.png`: identical 390×650 surface and parameters.
- `lab-before-desktop.png`, `lab-desktop.png`, `lab-before-mobile.png`, `lab-mobile.png`: full interface at 1440×1000 and 390×844 viewports.
- `approach.mp4`: 8 seconds, 960×600, 24 FPS, encoded by local FFmpeg from 192 actual browser WebGL frames. Simulation time advances in fixed steps; this is a motion illustration, **not** a performance capture.
- `v2-smoke.png`: actual independent V2 frame after the changes.

The visual pass corrected the original projections' central spokes, excessive uniformity in the first new material, and unbounded temporal stretching. The final images were inspected after those corrections.

## Validation

[verification.json](verification.json) records 43 passing checks with no unexpected console/page errors and no missing resources. The routes were served under `/black-hole/` and `/space-ship/`, exercising repository-prefix paths with their real CSPs.

Desktop and mobile emulation covered Approach 0/25/50/75/100%, both brightness endpoints (60/220), both inclination endpoints (55/86), reset, auto-approach, pause/resume, touchscreen slider input and resize at 360×800, 768×1024, 844×390 and 1920×1080. No horizontal overflow was found. Reduced motion starts with a held frame. Actual WebGL context loss/restoration and idempotent disposal were exercised. WebGL initialization failure was injected to verify clear fallback text and disabled lab controls.

The delivered [renderer smoke test](../tests/renderer-smoke.cjs) additionally checks zero GPU submissions while paused or logically hidden, input sanitation and the quality pixel cap. Visibility events in that test are simulated; this is not OS background throttling or battery testing. It uses an existing Playwright installation and a browser selected via `PLAYWRIGHT_MODULE`, `BROWSER_PATH` and `BASE_URL`; neither is a new runtime dependency.

V2 actually rendered through WebGPU in Edge; its own status reported a frame in approximately 124 ms. This was a smoke check of the independent experiment, not a V2 optimization claim.

## Performance and limits

Windows / Edge 154.0.4258.62, headless, NVIDIA RTX 4070 SUPER through ANGLE/D3D11. Each sample collected requestAnimationFrame intervals over approximately 3.2 seconds with the scene running. These are observed browser frame intervals, not GPU timer-query timings. All samples were near the 120 Hz scheduling ceiling; they do not establish unused GPU capacity.

| Scene / quality | CSS viewport / DPR | Drawing buffer | Observed FPS | P95 interval |
| --- | --- | --- | ---: | ---: |
| Lab desktop / balanced | 1440×1000 / 1 | 1440×689 | 120.0 | 8.5 ms |
| Lab desktop / high | 1440×1000 / 1 | 1440×689 | 120.0 | 8.5 ms |
| Lab desktop / low | 1440×1000 / 1 | 1080×517 | 120.0 | 8.5 ms |
| Lab mobile emulation / balanced | 390×844 / 3 | 488×685 | 120.0 | 8.5 ms |
| Lab mobile emulation / high | 390×844 / 3 | 780×1096 | 120.0 | 8.5 ms |
| Lab mobile emulation / low | 390×844 / 3 | 293×411 | 120.0 | 8.5 ms |
| No Hope desktop | 1440×1000 / 1 | 994×684 | 120.0 | 8.5 ms |
| No Hope mobile emulation | 390×844 / 3 | 445×306 | 120.0 | 8.5 ms |

The initial V1 telemetry reported about 103 FPS at 1032×644 and 120 FPS at 354×443. Those baseline samples used different UI surface sizes and a shorter readout window, so they are not a controlled speedup comparison.

No physical phone, Safari, Firefox, integrated GPU, sustained thermal/battery test or screen reader was tested. Automatic downshift thresholds are implemented; this fast GPU did not naturally trigger them. Filament detail and the narrow photon rim can still vary with low resolution. Use Low on constrained hardware. No hardware-specific performance is promised.

## Tooling and scope

Used local Three.js/GLSL, Python for static serving and preparation, Edge/Playwright for execution and captures, and FFmpeg for the video. Blender 5.2 was discovered and the `blender-threejs-pipeline` skill was read for the requested workflow/contract review, but Blender was not executed: a procedural shader was the appropriate tool. `frontend-patterns` was not present in the installed skill catalog or searched skill locations. No external generation or paid services were used.

Space Ship receives a byte-identical static renderer copy and a narrow adapter in a separate branch. See [the contract](renderer-contract.md). Drone Simulator, Path Planning Visualizer and Carabayllo were not modified.

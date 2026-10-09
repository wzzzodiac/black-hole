# V1 renderer contract

`black-hole-renderer.js` is the source of truth. It evolves the original `main-v12.js` V1 noise/material/projection pipeline. V2, its WGSL kernel and vendor files are independent and unchanged.

```js
import { createBlackHoleRenderer } from './black-hole-renderer.js';
const view = createBlackHoleRenderer({ canvas, onStatus });
view.resize(widthCSS, heightCSS, { pixelRatio: devicePixelRatio, quality: 'balanced' });
view.render({ time: 12, approach: 0.5, brightness: 0.375, inclination: 76,
              dive: 0, exposure: 1 });
view.dispose();
```

The optional canvas is caller-owned. `onStatus` receives `lost` / `restored`; restore requires a new render. Creation throws if WebGL cannot initialize. The lab displays an explanatory fallback; No Hope keeps its original Canvas 2D renderer.

| Parameter | Units / range | Default |
| --- | --- | --- |
| `time` | Absolute simulation seconds, finite, nonnegative | 0 |
| `approach` | Normalized approach, 0–1 | 0 |
| `brightness` | Linear emission, 0–2 | 0.375 |
| `inclination` | Artistic disk inclination, 55–86 degrees | 76 |
| `dive` | Additional late approach zoom, 0–6 | 0 |
| `exposure` | Final output multiplier, 0–1.5 | 1 |

The lab preserves its old brightness mapping: `(sliderValue - 60) / 200`, so the visible 0.60× endpoint means zero disk emission. This legacy relative scale is not a photometric measurement. Invalid numeric inputs use defaults; out-of-range finite inputs are clamped.

`resize` accepts CSS dimensions. Quality bounds the requested device pixel ratio **and** total drawing-buffer area:

| Quality | Maximum DPR | Maximum pixels |
| --- | ---: | ---: |
| Low | 0.75 | 650,000 |
| Balanced | 1.25 | 1,400,000 |
| High | 2 | 3,000,000 |

The GPU module does not query controls, attach to a host, observe layout, schedule frames, read the clock or change visibility. The caller owns all of those. `render` returns false after disposal or during context loss. `info` exposes revision, buffer dimensions, submitted frame count, context-loss and disposal state. `dispose` is idempotent and releases geometry, material, renderer and context.

The lab keeps a simulation clock, stops on pause/hidden tabs, honors reduced motion initially, and resumes safely after a persisted page restore. Auto quality steps down after two slow sampling windows. Manual quality is fixed. No Hope renders on the game's existing draw call and derives time from `state.elapsed`; it does not start a second animation loop. Its adapter reduces quality after sustained slow frame intervals, caps exposure at 0.76 and uses `dive: 3`.

## Static integration into No Hope

Copy this **whole file unchanged** into the Space Ship repository root, alongside the same local `vendor/three.module.js` and `vendor/three.core.js` (both repositories currently use Three.js r185). The adapter `nohope-blackhole-v141.js` imports it using a relative URL. There is no cross-repository fetch, CDN, bundler, package server or new CSP exception.

Compare the files' SHA-256 after copying; this review uses byte-identical copies. Future changes require an explicit copy and a separate Space Ship review. Updating Black Hole alone never updates the game. Keep both PRs linked; merging either one is not a deployment instruction for the other.

These are cinematic analytic projections, bounded orbital advection, Doppler-like brightness asymmetry and radial background deflection. They are not a GR ray tracer, exact photon orbits, relativistic transport or a physical model of disk thickness.

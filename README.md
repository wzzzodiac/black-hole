# Black Hole // Gravitational Lensing Lab

Real-time procedural black-hole renderer built with **Three.js + GLSL**.

The goal is not a physically exact Kerr metric solver. The goal is to reproduce the visual language of a cinematic black hole — dark event horizon, hot turbulent accretion disk, photon ring, gravitationally lensed light and increasing glare — while remaining lightweight enough to run inside a browser and later become the background renderer for **Space Ship // No Hope**.

## Current renderer

- Full-screen Three.js `ShaderMaterial`
- Procedural GLSL star field and dust
- Turbulent accretion disk with no image textures
- Warm-to-white temperature gradient
- Stylized Doppler color asymmetry
- Photon ring and lensed upper/lower accretion arcs
- Radial background distortion around the event horizon
- Nonlinear brightness increase during approach
- Mobile-aware render resolution
- Live controls for approach, disk brightness, inclination and lensing strength
- Auto-approach mode for testing the full visual progression

## Run

This project is static and intended for GitHub Pages. No build step is required.

Files:

```text
index.html
style.css
main.js
```

`main.js` imports a pinned Three.js ES module from jsDelivr and renders everything procedurally in WebGL.

## Integration target

The `Approach` control is intentionally normalized from `0` to `1` internally. When the renderer is integrated into `space-ship`, that uniform can be driven directly by No Hope's existing event-horizon progress.

The intended architecture is:

```text
WebGL / GLSL layer  -> black hole + lensing + accretion light
Canvas 2D layer     -> ship + asteroids + collisions + gameplay
HTML / CSS           -> HUD + controls + collapse interface
```

That keeps the current game mechanics independent from the expensive visual layer.

## Technical note

This is a stylized renderer, not a scientific simulation of null geodesics around a rotating black hole. Several effects are deliberately approximated because the final target is an interactive browser game, not an astrophysics paper or a render farm having a nervous breakdown.

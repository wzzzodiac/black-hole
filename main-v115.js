// v1.15 visual patcher.
// Keep the v1.14 background AND the exact v1.14 accretion texture.
// Only add the two features requested after that baseline:
// 1) continuous upper/lower lensed "hats" pulled from the same disk
// 2) a clearly visible trapped-light photon ring around the event horizon.

const sourceResponse = await fetch('./main-v114.js?v=1.14.0', { cache: 'no-store' });
if (!sourceResponse.ok) throw new Error(`Could not load v1.14 renderer: ${sourceResponse.status}`);
let source = await sourceResponse.text();

function patch(name, pattern, replacement) {
  if (!pattern.test(source)) throw new Error(`v1.15 patch failed: ${name}`);
  source = source.replace(pattern, replacement);
}

// IMPORTANT: diskColor() and diskSample() are intentionally NOT patched.
// This means the horizontal disk and every lensed copy keep the exact texture
// the preferred v1.14 screenshot used.

patch(
  'continuous sucked disk hats',
  /  vec4 bentDisk\(vec2 p, float horizon, float inclination, float upper\) \{[\s\S]*?\n  }\n\n  void main/,
`  // Rear image of the SAME v1.14 disk being pulled continuously over/under the event horizon.
  // At the sides it is glued to the horizontal plane; toward the center gravity lifts it
  // into the characteristic Gargantua "hat" above and below the shadow.
  vec4 bentDisk(vec2 p, float horizon, float inclination, float upper) {
    float xSpan = horizon * 3.35;
    float xn = clamp(abs(p.x) / xSpan, 0.0, 1.0);
    float pull = smoothstep(0.01, 0.99, pow(1.0 - xn, 0.66));
    float signY = upper > 0.5 ? 1.0 : -1.0;

    float lift = upper > 0.5
      ? horizon * mix(1.42, 1.95, inclination)
      : horizon * mix(1.12, 1.54, inclination);
    float targetY = signY * lift * pull;

    float width = mix(0.104, 0.064, pull);
    float d = p.y - targetY;
    float core = gauss(d, width);

    // Smooth bridge so the lensed image visually grows out of the horizontal disk.
    float bridge = gauss(p.y - targetY * 0.46, width * 1.18) * smoothstep(0.16, 0.92, pull);
    float sideJoin = gauss(p.y, 0.100) * smoothstep(0.62, 1.0, xn);
    float radialFade = 1.0 - smoothstep(0.92, 1.04, xn);
    float mask = max(core * radialFade, bridge * 0.74);
    mask = max(mask, sideJoin * 0.88);

    // Sample the exact same v1.14 disk texture. No alternate palette, no extra whitening.
    float sourceRadius = clamp(mix(1.20, 0.36, pull) + abs(d) * 0.11, 0.34, 1.34);
    float direction = p.x < 0.0 ? -1.0 : 1.0;
    float streamCoord = direction * mix(0.14, 1.52, pull) + p.x * 0.46 + signY * d * 1.45;
    float xSide = smoothstep(-xSpan, xSpan, p.x);

    return diskSample(sourceRadius, streamCoord, xSide, mask);
  }

  void main`
);

patch(
  'full photon ring',
  /    float theta = atan\(p\.y, p\.x\);[\s\S]*?    col \+= vec3\(1\.0, 0\.91, 0\.80\) \* rim \* visibleRim \* breakup \* 0\.34 \* uBrightness;\n/,
`    // Trapped-light ring hugging the event horizon. Thick enough to read from far away,
    // with smooth directional variation so it looks gravitational rather than like a UI outline.
    float theta = atan(p.y, p.x);
    float orbitNoise = fbm(vec2(theta * 7.2 - uTime * 0.12, r * 52.0));
    float photonRadius = horizon * (1.020 + (orbitNoise - 0.5) * 0.004);
    float directional = 0.72 + 0.28 * (0.5 + 0.5 * sin(theta - 0.48));
    float hotSector = smoothstep(0.20, 0.96, 0.5 + 0.5 * sin(theta + 0.72));
    float rimWidth = mix(0.0065, 0.0105, hotSector);
    float rim = gauss(r - photonRadius, rimWidth);
    float rimCore = gauss(r - photonRadius, rimWidth * 0.44);
    col += vec3(1.00, 0.88, 0.70) * rim * directional * (0.20 + 0.13 * uLens) * uBrightness;
    col += vec3(1.00, 0.985, 0.94) * rimCore * (0.32 + 0.18 * hotSector) * uBrightness;
`
);

const blob = new Blob([source], { type: 'text/javascript' });
const url = URL.createObjectURL(blob);
try {
  await import(url);
} finally {
  URL.revokeObjectURL(url);
}

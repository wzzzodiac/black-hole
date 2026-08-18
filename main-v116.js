// v1.16 visual lock.
// Keep the current bright-space background and current v1.15 geometry/photon-ring idea,
// but force the accretion material to the EXACT procedural texture used by main-v14.js,
// which matches the user's reference screenshot.

const sourceResponse = await fetch('./main-v114.js?v=1.14.0', { cache: 'no-store' });
if (!sourceResponse.ok) throw new Error(`Could not load v1.14 renderer: ${sourceResponse.status}`);
let source = await sourceResponse.text();

function patch(name, pattern, replacement) {
  if (!pattern.test(source)) throw new Error(`v1.16 patch failed: ${name}`);
  source = source.replace(pattern, replacement);
}

// EXACT texture recipe from archived main-v14.js.
// This is deliberately copied without reinterpretation: same spin, flow, streak,
// fine noise, heat, density and brightness response as the screenshot version.
patch(
  'exact main-v14 disk texture',
  /  vec4 diskSample\(float planeRadius, float streamCoord, float xSide, float mask\) \{[\s\S]*?\n  }\n\n  vec4 accretionPlane/,
`  vec4 diskSample(float radius, float stream, float xSide, float mask) {
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

  vec4 accretionPlane`
);

// Keep the current "same disk being sucked over/under the hole" geometry.
patch(
  'continuous sucked disk hats',
  /  vec4 bentDisk\(vec2 p, float horizon, float inclination, float upper\) \{[\s\S]*?\n  }\n\n  void main/,
`  vec4 bentDisk(vec2 p, float horizon, float inclination, float upper) {
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
    float bridge = gauss(p.y - targetY * 0.46, width * 1.18) * smoothstep(0.16, 0.92, pull);
    float sideJoin = gauss(p.y, 0.100) * smoothstep(0.62, 1.0, xn);
    float radialFade = 1.0 - smoothstep(0.92, 1.04, xn);
    float mask = max(core * radialFade, bridge * 0.74);
    mask = max(mask, sideJoin * 0.88);

    // These coordinates feed the SAME exact v1.4 texture function above.
    float sourceRadius = clamp(mix(1.20, 0.36, pull) + abs(d) * 0.11, 0.34, 1.34);
    float direction = p.x < 0.0 ? -1.0 : 1.0;
    float streamCoord = direction * mix(0.14, 1.52, pull) + p.x * 0.46 + signY * d * 1.45;
    float xSide = smoothstep(-xSpan, xSpan, p.x);

    return diskSample(sourceRadius, streamCoord, xSide, mask);
  }

  void main`
);

// Keep the current clearly visible trapped-light ring.
patch(
  'full photon ring',
  /    float theta = atan\(p\.y, p\.x\);[\s\S]*?    col \+= vec3\(1\.0, 0\.91, 0\.80\) \* rim \* visibleRim \* breakup \* 0\.34 \* uBrightness;\n/,
`    float theta = atan(p.y, p.x);
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

// v1.15 visual patcher.
// Keeps the v1.14 deep-space background byte-for-byte and only changes
// the accretion material, bent-disk geometry and photon-ring treatment.

const sourceResponse = await fetch('./main-v114.js?v=1.14.0', { cache: 'no-store' });
if (!sourceResponse.ok) throw new Error(`Could not load v1.14 renderer: ${sourceResponse.status}`);
let source = await sourceResponse.text();

const replacements = [];
function patch(name, pattern, replacement) {
  if (!pattern.test(source)) throw new Error(`v1.15 patch failed: ${name}`);
  source = source.replace(pattern, replacement);
  replacements.push(name);
}

patch(
  'dark accretion palette',
  /  \/\/ Preferred v1\.2 black-hole\/accretion rendering restored from the version the screenshot used\.\n  vec3 diskColor\([\s\S]*?\n  }\n\n  vec4 diskSample/,
`  // Darker Gargantua-inspired palette. The bright space background above is intentionally untouched.
  vec3 diskColor(float heat, float xSide) {
    vec3 soot = vec3(0.010, 0.008, 0.008);
    vec3 graphite = vec3(0.045, 0.040, 0.040);
    vec3 darkBrown = vec3(0.105, 0.040, 0.020);
    vec3 umber = vec3(0.235, 0.075, 0.028);
    vec3 rust = vec3(0.54, 0.115, 0.025);
    vec3 copper = vec3(0.88, 0.31, 0.075);
    vec3 amber = vec3(1.00, 0.63, 0.24);
    vec3 cream = vec3(1.00, 0.88, 0.69);

    vec3 c = mix(soot, graphite, smoothstep(0.02, 0.16, heat));
    c = mix(c, darkBrown, smoothstep(0.10, 0.28, heat));
    c = mix(c, umber, smoothstep(0.22, 0.40, heat));
    c = mix(c, rust, smoothstep(0.34, 0.56, heat));
    c = mix(c, copper, smoothstep(0.50, 0.73, heat));
    c = mix(c, amber, smoothstep(0.68, 0.88, heat));
    c = mix(c, cream, smoothstep(0.88, 1.00, heat));

    // Preserve the Doppler-like warm/cool asymmetry without washing the material white.
    return c * mix(vec3(1.08, 0.78, 0.64), vec3(0.78, 0.88, 1.02), xSide);
  }

  vec4 diskSample`
);

patch(
  'dense shared disk texture',
  /  vec4 diskSample\(float planeRadius, float streamCoord, float xSide, float mask\) \{[\s\S]*?\n  }\n\n  vec4 accretionPlane/,
`  vec4 diskSample(float planeRadius, float streamCoord, float xSide, float mask) {
    float spin = uTime * 0.40;
    float flow = fbm(vec2(streamCoord * 3.4 + spin, planeRadius * 8.4 - spin * 1.5));
    float streak = fbm(vec2(streamCoord * 11.8 - spin * 2.5, planeRadius * 27.0 + flow * 2.6));
    float fine = noise(vec2(streamCoord * 39.0 + spin * 4.2, planeRadius * 82.0));
    float cloud = fbm(vec2(streamCoord * 1.55 - spin * 0.36 + 17.0, planeRadius * 5.4 + flow * 1.7));
    float darkLane = fbm(vec2(streamCoord * 6.4 + spin * 0.22 + 39.0, planeRadius * 18.0 - streak * 2.1));
    float turb = clamp(flow * 0.48 + streak * 0.30 + fine * 0.10 + cloud * 0.18, 0.0, 1.0);

    float heat = clamp((1.0 - smoothstep(0.34, 1.14, planeRadius)) * 0.75 + turb * 0.28, 0.0, 1.0);
    float density = 0.82 + 0.74 * smoothstep(0.10, 0.78, turb);
    density *= 0.88 + 0.40 * smoothstep(0.10, 0.76, streak);

    vec3 col = diskColor(heat, xSide);

    // Dark, cloudy lanes live inside the SAME procedural material used by both
    // the horizontal disk and its lensed upper/lower images.
    float sootCloud = smoothstep(0.48, 0.80, cloud) * (1.0 - smoothstep(0.82, 0.99, heat));
    float graphiteVein = smoothstep(0.52, 0.82, darkLane) * (1.0 - smoothstep(0.86, 0.99, heat));
    col = mix(col, vec3(0.012, 0.011, 0.012) + col * 0.18, sootCloud * 0.52);
    col = mix(col, vec3(0.055, 0.052, 0.052) + col * 0.30, graphiteVein * 0.38);

    // Keep luminous filaments as accents rather than turning the whole disk white.
    float hotThread = smoothstep(0.86, 0.995, streak) * smoothstep(0.62, 0.98, heat);
    col *= (0.72 + 1.32 * heat + 0.56 * turb) * uBrightness;
    col += vec3(1.0, 0.76, 0.42) * hotThread * 0.14 * uBrightness;

    return vec4(col, clamp(mask * density, 0.0, 1.0));
  }

  vec4 accretionPlane`
);

patch(
  'continuous sucked disk hats',
  /  vec4 bentDisk\(vec2 p, float horizon, float inclination, float upper\) \{[\s\S]*?\n  }\n\n  void main/,
`  // Rear image of the SAME disk being pulled continuously over/under the event horizon.
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

    // Broad enough to look like a real lensed sheet of matter, not a detached neon arch.
    float width = mix(0.104, 0.064, pull);
    float d = p.y - targetY;
    float core = gauss(d, width);

    // Continuous bridge from y=0 prevents any visual separation from the physical disk.
    float bridge = gauss(p.y - targetY * 0.46, width * 1.18) * smoothstep(0.16, 0.92, pull);
    float sideJoin = gauss(p.y, 0.100) * smoothstep(0.62, 1.0, xn);
    float radialFade = 1.0 - smoothstep(0.92, 1.04, xn);
    float mask = max(core * radialFade, bridge * 0.74);
    mask = max(mask, sideJoin * 0.88);

    // Both projections sample exactly the same moving procedural texture coordinates.
    float sourceRadius = clamp(mix(1.20, 0.36, pull) + abs(d) * 0.11, 0.34, 1.34);
    float direction = p.x < 0.0 ? -1.0 : 1.0;
    float streamCoord = direction * mix(0.14, 1.52, pull) + p.x * 0.46 + signY * d * 1.45;
    float xSide = smoothstep(-xSpan, xSpan, p.x);

    // No extra transparency or alternate colour treatment: this IS the disk.
    return diskSample(sourceRadius, streamCoord, xSide, mask);
  }

  void main`
);

patch(
  'full photon ring',
  /    float theta = atan\(p\.y, p\.x\);[\s\S]*?    col \+= vec3\(1\.0, 0\.91, 0\.80\) \* rim \* visibleRim \* breakup \* 0\.34 \* uBrightness;\n/,
`    // Full trapped-light ring: visible from distance and hugging the event horizon.
    // Uneven intensity keeps it photographic instead of looking like a UI stroke.
    float theta = atan(p.y, p.x);
    float orbitNoise = fbm(vec2(theta * 7.2 - uTime * 0.12, r * 52.0));
    float photonRadius = horizon * (1.020 + (orbitNoise - 0.5) * 0.004);
    float directional = 0.70 + 0.30 * (0.5 + 0.5 * sin(theta - 0.48));
    float hotSector = smoothstep(0.20, 0.96, 0.5 + 0.5 * sin(theta + 0.72));
    float rimWidth = mix(0.0065, 0.0105, hotSector);
    float rim = gauss(r - photonRadius, rimWidth);
    float rimCore = gauss(r - photonRadius, rimWidth * 0.44);
    col += vec3(1.00, 0.88, 0.70) * rim * directional * (0.20 + 0.13 * uLens) * uBrightness;
    col += vec3(1.00, 0.985, 0.94) * rimCore * (0.32 + 0.18 * hotSector) * uBrightness;
`
);

// Keep the original background code untouched; only the named blocks above are altered.
const blob = new Blob([source], { type: 'text/javascript' });
const url = URL.createObjectURL(blob);
try {
  await import(url);
} finally {
  URL.revokeObjectURL(url);
}

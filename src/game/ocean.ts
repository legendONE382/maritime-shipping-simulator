import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { makeFoamTexture, makeWaterNormalTexture } from './textures';

const NW = 8;
/** Objects on this layer draw in the main view but are skipped by the reflection camera. */
export const SURFACE_LAYER = 1;
const WIND = 2.58; // direction the swell travels (radians)
const TIME_SCALE = 1.15; // More dynamic waves

/** Wave train: angle off the wind, wavelength (m) and relative amplitude. */
const WAVE_DEFS = [
  { a: 0.0, L: 280, A: 1.4 },
  { a: 0.38, L: 188, A: 1.0 },
  { a: -0.55, L: 128, A: 0.78 },
  { a: 0.95, L: 84, A: 0.52 },
  { a: -1.05, L: 56, A: 0.34 },
  { a: 0.18, L: 36, A: 0.22 },
  { a: -0.25, L: 24, A: 0.14 },
  { a: 1.35, L: 16, A: 0.09 },
];

interface Wave {
  dx: number;
  dz: number;
  L: number;
  k: number;
  om: number;
  ph: number;
  base: number;
  A: number;
}

const GERSTNER = /* glsl */ `
#define NW 8
uniform vec4 uWaves[NW];
uniform float uTime;
uniform float uQ;
uniform float uStep;
uniform float uTimeScale;

// Sum of Gerstner (trochoidal) waves. Finer waves fade out where the mesh is too coarse to carry them.
vec3 gerstner(vec2 p, float r, out vec3 nrm, out float comp) {
  vec3 pos = vec3(p.x, 0.0, p.y);
  vec3 n = vec3(0.0, 1.0, 0.0);
  float c = 0.0;
  float spacing = r * uStep;
  for (int i = 0; i < NW; i++) {
    vec4 w = uWaves[i];
    float L = w.z;
    float fade = 1.0 - smoothstep(L * 0.12, L * 0.3, spacing);
    if (fade < 0.002) continue;
    float k = 6.28318530718 / L;
    float A = max(w.w, 0.0001);
    float Af = A * fade;
    float om = sqrt(9.81 * k) * uTimeScale;
    float th = k * dot(w.xy, p) - om * uTime + float(i) * 1.7;
    float s = sin(th);
    float co = cos(th);
    float Q = min(uQ, 0.9 / (float(NW) * k * A));
    pos.x += Q * Af * w.x * co;
    pos.z += Q * Af * w.y * co;
    pos.y += Af * s;
    n.x -= w.x * k * Af * co;
    n.z -= w.y * k * Af * co;
    n.y -= Q * k * Af * s;
    c += Q * k * Af * s;
  }
  nrm = normalize(n);
  comp = c;
  return pos;
}
`;

const WATER_VERT = /* glsl */ `
${GERSTNER}
uniform mat4 uTextureMatrix;
varying vec3 vWorld;
varying vec3 vN;
varying float vH;
varying float vComp;
varying float vViewZ;
varying vec4 vMirror;
void main() {
  vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
  float r = length(position.xz);
  vec3 n;
  float comp;
  vec3 wp = gerstner(wp0.xz, r, n, comp);
  vWorld = wp;
  vN = n;
  vH = wp.y;
  vComp = comp;
  vMirror = uTextureMatrix * vec4(wp, 1.0);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uNormalMap;
uniform sampler2D uFoamMap;
uniform samplerCube uSky;
uniform sampler2D uMirror;
uniform float uUsePlanar;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uDeep;
uniform vec3 uScatter;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogMix;
uniform float uFoamLo;
uniform float uFoamHi;
uniform float uFlash;
uniform float uSunVis;
uniform float uDistort;
uniform float uHeightScale;
uniform float uDetail;
varying vec3 vWorld;
varying vec3 vN;
varying float vH;
varying float vComp;
varying float vViewZ;
varying vec4 vMirror;

vec3 horizonColor(vec3 dir) {
  vec3 d = normalize(vec3(dir.x, 0.0, dir.z) + vec3(0.0001, 0.0, 0.0));
  d.y = 0.04;
  d = normalize(d);
  vec3 sky = textureLod(uSky, d, 3.0).rgb;
  return mix(sky, uFogColor, uFogMix);
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec3 N = normalize(vN);
  vec2 p = vWorld.xz;

  // three scrolling octaves of ripple detail, faded gently with distance so the
  // far sea stays crisp instead of dissolving into mush
  float detailFade = 1.0 - smoothstep(400.0, 6000.0, dist) * 0.7;
  vec3 n1 = texture2D(uNormalMap, p * 0.055 + vec2(0.021, 0.013) * uTime).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormalMap, vec2(p.y, -p.x) * 0.17 + vec2(-0.034, 0.021) * uTime).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(uNormalMap, p * 0.0105 + vec2(0.004, -0.003) * uTime).xyz * 2.0 - 1.0;
  vec2 slope = n1.xy * 0.75 + n2.xy * 0.45 + n3.xy * 0.9;
  N = normalize(vec3(N.x + slope.x * uDetail * detailFade, N.y, N.z + slope.y * uDetail * detailFade));

  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // reflection: planar (ships, sky) when available, otherwise the live sky cube
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = textureLod(uSky, R, 0.5 + (1.0 - detailFade) * 2.0).rgb;
  if (uUsePlanar > 0.5) {
    vec2 uv = vMirror.xy / vMirror.w;
    uv += N.xz * uDistort * (0.04 + 30.0 / (dist + 60.0));
    refl = texture2D(uMirror, uv).rgb;
  }

  // body colour with sub-surface glow through wave crests
  vec3 L = normalize(uSunDir);
  float h = clamp(vH / uHeightScale * 0.5 + 0.5, 0.0, 1.0);
  float ndl = max(dot(N, L), 0.0);
  float sss = pow(clamp(dot(V, -L) * 0.5 + 0.5, 0.0, 1.0), 4.0) * smoothstep(0.35, 1.0, h);
  vec3 light = uAmbient + uSunColor * (0.25 + 0.75 * ndl) * uSunVis;
  vec3 body = mix(uDeep, uScatter, clamp(0.12 + 0.5 * h + 0.9 * sss, 0.0, 1.0)) * light;
  body += uScatter * uSunColor * sss * 0.5 * uSunVis;
  vec3 col = mix(body, refl, fres);

  // sun glitter
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float spec = pow(nh, 1400.0) * 20.0 + pow(nh, 160.0) * 0.9;
  spec *= uSunVis * (1.0 - smoothstep(2000.0, 9000.0, dist) * 0.6) * step(0.0, L.y);
  col += uSunColor * spec * (0.2 + 0.8 * fres);

  // crest foam: compression of the wave surface, broken up by a lacy mask
  float ft1 = texture2D(uFoamMap, p * 0.042 + vec2(0.008, 0.005) * uTime).r;
  float ft2 = texture2D(uFoamMap, p * 0.13 + vec2(-0.012, 0.009) * uTime).r;
  float ft = ft1 * 0.62 + ft2 * 0.5;
  float crest = smoothstep(uFoamLo, uFoamHi, vComp);
  float foam = crest * smoothstep(0.22, 0.65, ft + crest * 0.4);
  foam += smoothstep(uFoamLo * 0.55, uFoamLo, vComp) * smoothstep(0.78, 1.05, ft) * 0.35;
  foam *= 1.0 - smoothstep(1500.0, 7000.0, dist) * 0.7;
  vec3 foamCol = vec3(0.94, 0.97, 1.0) * (uAmbient * 0.95 + uSunColor * 0.5 * uSunVis * max(N.y, 0.3));
  col = mix(col, foamCol, clamp(foam, 0.0, 0.92));

  col += uFlash * 0.18 * vec3(0.7, 0.8, 1.0) * (0.3 + fres);

  // aerial perspective toward the real horizon colour
  float f = 1.0 - exp(-uFogDensity * uFogDensity * vViewZ * vViewZ);
  col = mix(col, horizonColor(-V), clamp(f, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const HAZE_VERT = /* glsl */ `
varying vec3 vDir;
varying float vY;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  vY = wp.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const HAZE_FRAG = /* glsl */ `
uniform samplerCube uSky;
uniform vec3 uFogColor;
uniform float uFogMix;
uniform float uHeight;
uniform float uStrength;
varying vec3 vDir;
varying float vY;
void main() {
  vec3 d = normalize(vec3(vDir.x, 0.0, vDir.z) + vec3(0.0001, 0.0, 0.0));
  d.y = 0.04;
  d = normalize(d);
  vec3 sky = textureLod(uSky, d, 3.0).rgb;
  vec3 col = mix(sky, uFogColor, uFogMix);
  float a = (1.0 - smoothstep(0.0, uHeight, vY)) * uStrength;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const WAKE_VERT = /* glsl */ `
${GERSTNER}
attribute vec4 aInfo;
varying vec4 vInfo;
varying float vViewZ;
void main() {
  vec2 p = position.xz;
  float r = length(p - cameraPosition.xz);
  vec3 n;
  float c;
  vec3 g = gerstner(p, r, n, c);
  // sample the surface height at this world point (undo the horizontal wave drift once)
  vec3 g2 = gerstner(p - (g.xz - p), r, n, c);
  vec3 wp = vec3(p.x, g2.y + 0.4, p.y);
  vInfo = aInfo;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const WAKE_FRAG = /* glsl */ `
uniform sampler2D uFoamMap;
uniform float uTime;
uniform vec3 uLight;
uniform float uKind;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec4 vInfo;
varying float vViewZ;
void main() {
  float across = vInfo.x;
  float along = vInfo.y;
  float a = vInfo.z;
  float hw = vInfo.w;
  float edge = 1.0 - smoothstep(0.3, 1.0, abs(across));
  vec2 uv = vec2(across * hw * 0.05, along * 0.05) + vec2(0.0, -uTime * 0.02);
  float f = texture2D(uFoamMap, uv).r * 0.62 + texture2D(uFoamMap, uv * 2.7 + 0.37).r * 0.5;
  float thr = 1.0 - a;
  float m = smoothstep(thr - 0.2, thr + 0.12, f * (0.5 + 0.75 * edge));
  float alpha = m * edge * min(1.0, a * 1.6);
  vec3 col = vec3(0.94, 0.97, 1.0) * uLight;
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vViewZ * vViewZ);
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha * 0.92);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Flat meshes laid on the live wave surface (reef shallows, ice skirts, waypoint rings). */
const DECAL_VERT = /* glsl */ `
${GERSTNER}
uniform float uLift;
varying vec2 vUv;
varying float vViewZ;
varying vec3 vWorld;
void main() {
  vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
  vec2 p = wp0.xz;
  float r = length(p - cameraPosition.xz);
  vec3 n;
  float c;
  vec3 g = gerstner(p, r, n, c);
  vec3 g2 = gerstner(p - (g.xz - p), r, n, c);
  vec3 wp = vec3(p.x, g2.y + uLift, p.y);
  vUv = uv;
  vWorld = wp;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

type Uniforms = Record<string, THREE.IUniform>;

function makeDisc(rings: number, segs: number, r0: number, rMax: number) {
  const ratio = Math.pow(rMax / r0, 1 / rings);
  const pos = new Float32Array((rings + 1) * (segs + 1) * 3);
  let k = 0;
  for (let i = 0; i <= rings; i++) {
    const r = r0 * Math.pow(ratio, i);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos[k++] = Math.cos(a) * r;
      pos[k++] = 0;
      pos[k++] = Math.sin(a) * r;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const b = a + 1;
      const c = a + (segs + 1);
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return { geometry: g, step: ratio - 1 };
}

/* ------------------------------------------------------------------ wake -- */

const WAKE_MAXP = 130;
const WAKE_LIFE = 42;
const WAKE_SPACING = 9;

export class WakeTrail {
  readonly meshes: THREE.Mesh[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private pos: Float32Array[] = [];
  private info: Float32Array[] = [];
  private pts: { x: number; z: number; age: number; power: number }[] = [];
  private head = { x: 0, z: 0, power: 0 };

  constructor(shared: Uniforms, foam: THREE.Texture, light: THREE.IUniform) {
    const idx: number[] = [];
    for (let i = 0; i < WAKE_MAXP + 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    for (let r = 0; r < 3; r++) {
      const n = (WAKE_MAXP + 2) * 2;
      const g = new THREE.BufferGeometry();
      const p = new Float32Array(n * 3);
      const inf = new Float32Array(n * 4);
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('aInfo', new THREE.BufferAttribute(inf, 4));
      g.setIndex(idx);
      g.setDrawRange(0, 0);
      const m = new THREE.ShaderMaterial({
        uniforms: {
          uWaves: shared.uWaves,
          uTime: shared.uTime,
          uQ: shared.uQ,
          uStep: shared.uStep,
          uTimeScale: shared.uTimeScale,
          uFogColor: shared.uFogColor,
          uFogDensity: shared.uFogDensity,
          uFoamMap: { value: foam },
          uLight: light,
          uKind: { value: r === 0 ? 0 : 1 },
        },
        vertexShader: WAKE_VERT,
        fragmentShader: WAKE_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      mesh.layers.set(SURFACE_LAYER);
      this.meshes.push(mesh);
      this.geos.push(g);
      this.pos.push(p);
      this.info.push(inf);
    }
  }

  reset() {
    this.pts = [];
    this.head.power = 0;
    for (const g of this.geos) g.setDrawRange(0, 0);
  }

  update(dt: number, bowX: number, bowZ: number, speed: number, L: number, beam: number) {
    for (const p of this.pts) p.age += dt;
    while (this.pts.length && this.pts[this.pts.length - 1].age > WAKE_LIFE) this.pts.pop();
    const power = THREE.MathUtils.clamp(speed / 20, 0, 1.15);
    this.head = { x: bowX, z: bowZ, power };
    const last = this.pts[0];
    if (speed > 1.5 && (!last || Math.hypot(bowX - last.x, bowZ - last.z) > WAKE_SPACING)) {
      this.pts.unshift({ x: bowX, z: bowZ, age: 0, power });
      if (this.pts.length > WAKE_MAXP) this.pts.pop();
    }
    this.rebuild(L, beam);
  }

  private rebuild(L: number, beam: number) {
    const list = [{ x: this.head.x, z: this.head.z, age: 0, power: this.head.power }, ...this.pts];
    const n = list.length;
    if (n < 3) {
      for (const g of this.geos) g.setDrawRange(0, 0);
      return;
    }
    const d = new Float32Array(n);
    for (let i = 1; i < n; i++) d[i] = d[i - 1] + Math.hypot(list[i].x - list[i - 1].x, list[i].z - list[i - 1].z);
    const nx = new Float32Array(n);
    const nz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = list[Math.max(0, i - 1)];
      const b = list[Math.min(n - 1, i + 1)];
      let tx = a.x - b.x;
      let tz = a.z - b.z;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      nx[i] = -tz;
      nz[i] = tx;
    }

    const write = (ribbon: number, start: number, laterals: (i: number) => number, halfW: (i: number) => number, alpha: (i: number) => number) => {
      const P = this.pos[ribbon];
      const I = this.info[ribbon];
      let m = 0;
      for (let i = start; i < n; i++) {
        const lat = laterals(i);
        const hw = halfW(i);
        const al = alpha(i);
        for (let s = -1; s <= 1; s += 2) {
          const off = lat + s * hw;
          const k = m * 3;
          P[k] = list[i].x + nx[i] * off;
          P[k + 1] = 0;
          P[k + 2] = list[i].z + nz[i] * off;
          const q = m * 4;
          I[q] = s;
          I[q + 1] = d[i];
          I[q + 2] = al;
          I[q + 3] = hw;
          m++;
        }
      }
      const g = this.geos[ribbon];
      (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (g.getAttribute('aInfo') as THREE.BufferAttribute).needsUpdate = true;
      const verts = m;
      g.setDrawRange(0, verts >= 4 ? (verts / 2 - 1) * 6 : 0);
    };

    // turbulent propeller wash starting at the stern
    let cs = 0;
    while (cs < n - 1 && d[cs] < L * 0.92) cs++;
    write(
      0,
      cs,
      () => 0,
      (i) => beam * 0.46 + 48 * Math.pow(THREE.MathUtils.clamp((d[i] - L) / 520, 0, 1), 0.7),
      (i) =>
        list[i].power * Math.pow(Math.max(0, 1 - list[i].age / WAKE_LIFE), 1.6) * (1 - 0.3 * THREE.MathUtils.clamp((d[i] - L) / 520, 0, 1))
    );
    // diverging Kelvin arms from the bow
    for (const side of [1, -1]) {
      write(
        side > 0 ? 1 : 2,
        1,
        (i) => side * (2.5 + 0.34 * d[i]),
        (i) => 1.6 + 0.045 * d[i],
        (i) => {
          const pw = THREE.MathUtils.clamp((list[i].power - 0.25) / 0.75, 0, 1);
          const sm = (a: number, b: number, x: number) => {
            const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
            return t * t * (3 - 2 * t);
          };
          return pw * Math.pow(Math.max(0, 1 - list[i].age / WAKE_LIFE), 1.2) * (1 - sm(60, 720, d[i])) * sm(0, 18, d[i]) * 0.9;
        }
      );
    }
  }
}

/* ----------------------------------------------------------------- ocean -- */

export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly sky: Sky;
  readonly wake: WakeTrail;
  readonly sunColor = new THREE.Color(1, 0.95, 0.88);
  sunIntensity = 1;

  private renderer: THREE.WebGLRenderer;
  private haze: THREE.Mesh;
  private u: Uniforms;
  private hazeU: Uniforms;
  private waves: Wave[] = [];
  private seaAmp = 0.5;
  private steep = 0.85;
  private time = 0;
  private lowSpec: boolean;
  private usePlanar: boolean;
  private mirrorRT: THREE.WebGLRenderTarget | null = null;
  private mirrorCam = new THREE.PerspectiveCamera();
  private textureMatrix = new THREE.Matrix4();
  private cubeRT: THREE.WebGLCubeRenderTarget;
  private cubeCam: THREE.CubeCamera;
  private skyScene = new THREE.Scene();
  private skyProxy: Sky;
  private cubeTimer = 0;
  private sunDir = new THREE.Vector3(0.5, 0.5, -0.5).normalize();
  private env = 0;
  private storm = 0;
  private ambient = new THREE.Color();
  private lightU: THREE.IUniform;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, fogColor: THREE.Color, lowSpec: boolean) {
    this.renderer = renderer;
    this.lowSpec = lowSpec;
    this.usePlanar = !lowSpec;

    // wave train
    this.waves = WAVE_DEFS.map((w, i) => {
      const L = w.L;
      const k = (Math.PI * 2) / L;
      return {
        dx: Math.cos(WIND + w.a),
        dz: Math.sin(WIND + w.a),
        L,
        k,
        om: Math.sqrt(9.81 * k) * TIME_SCALE,
        ph: i * 1.7,
        base: w.A,
        A: w.A * this.seaAmp,
      };
    });

    const disc = lowSpec ? makeDisc(120, 160, 6, 36000) : makeDisc(210, 240, 6, 36000);
    const normalMap = makeWaterNormalTexture(lowSpec ? 256 : 512, 11);
    const foamMap = makeFoamTexture(lowSpec ? 256 : 512, 31);

    // LDR targets: cheaper, and avoids needing float render-target support on any device
    this.cubeRT = new THREE.WebGLCubeRenderTarget(lowSpec ? 128 : 256, {
      type: THREE.UnsignedByteType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.cubeCam = new THREE.CubeCamera(1, 60000, this.cubeRT);

    if (this.usePlanar) {
      const ms = lowSpec ? 512 : 768;
      this.mirrorRT = new THREE.WebGLRenderTarget(ms, ms, { depthBuffer: true });
    }

    this.u = {
      uTime: { value: 0 },
      uWaves: { value: this.waves.map((w) => new THREE.Vector4(w.dx, w.dz, w.L, w.A)) },
      uQ: { value: this.steep },
      uStep: { value: disc.step },
      uTimeScale: { value: TIME_SCALE },
      uTextureMatrix: { value: this.textureMatrix },
      uNormalMap: { value: normalMap },
      uFoamMap: { value: foamMap },
      uSky: { value: this.cubeRT.texture },
      uMirror: { value: this.mirrorRT ? this.mirrorRT.texture : null },
      uUsePlanar: { value: this.usePlanar ? 1 : 0 },
      uSunDir: { value: this.sunDir.clone() },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uAmbient: { value: new THREE.Color(0.5, 0.6, 0.7) },
      uDeep: { value: new THREE.Color(0.003, 0.04, 0.075) },
      uScatter: { value: new THREE.Color(0.03, 0.3, 0.33) },
      uFogColor: { value: fogColor },
      uFogDensity: { value: 0.00016 },
      uFogMix: { value: 0.2 },
      uFoamLo: { value: 0.16 },
      uFoamHi: { value: 0.28 },
      uFlash: { value: 0 },
      uSunVis: { value: 1 },
      uDistort: { value: 0.55 },
      uHeightScale: { value: 1 },
      uDetail: { value: 0.3 },
    };

    const material = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG });
    this.mesh = new THREE.Mesh(disc.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -5;
    this.mesh.onBeforeRender = (renderer, sc, camera) => this.renderMirror(renderer, sc, camera);
    scene.add(this.mesh);

    // visible sky (follows the camera) and a twin that feeds the cube map
    this.sky = new Sky();
    this.sky.scale.setScalar(40000);
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.skyProxy = new Sky();
    this.skyProxy.scale.setScalar(40000);
    this.skyProxy.material.uniforms = this.sky.material.uniforms;
    this.skyScene.add(this.skyProxy);

    // horizon haze band
    this.hazeU = {
      uSky: { value: this.cubeRT.texture },
      uFogColor: { value: fogColor },
      uFogMix: this.u.uFogMix,
      uHeight: { value: 1200 },
      uStrength: { value: 0.7 },
    };
    const hazeGeo = new THREE.CylinderGeometry(18500, 18500, 5200, 72, 1, true);
    hazeGeo.translate(0, 5200 / 2 - 60, 0);
    this.haze = new THREE.Mesh(
      hazeGeo,
      new THREE.ShaderMaterial({
        uniforms: this.hazeU,
        vertexShader: HAZE_VERT,
        fragmentShader: HAZE_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
      })
    );
    this.haze.frustumCulled = false;
    this.haze.renderOrder = 1;
    scene.add(this.haze);

    this.lightU = { value: new THREE.Color(1, 1, 1) };
    this.wake = new WakeTrail(this.u, foamMap, this.lightU);
    for (const m of this.wake.meshes) scene.add(m);

    scene.environment = this.cubeRT.texture;
    scene.environmentIntensity = 0.9;
    this.refreshSky();
  }

  /* ------------------------------------------------------------ control -- */

  /** Aim sun and sky. `dir` points toward the sun. */
  setSun(dir: THREE.Vector3, elevationDeg: number) {
    this.sunDir.copy(dir).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    // tighter, dimmer sun halo so the sky doesn't wash out the horizon
    this.sky.material.uniforms.mieCoefficient.value = 0.0025;
    this.sky.material.uniforms.mieDirectionalG.value = 0.92;
    this.sky.material.uniforms.turbidity.value = 1.6;
    this.sky.material.uniforms.rayleigh.value = 1.2;
    (this.u.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    const t = THREE.MathUtils.smoothstep(elevationDeg, 2, 30);
    this.sunColor.setRGB(1, 0.6, 0.32).lerp(new THREE.Color(1, 0.95, 0.87), t);
    this.sunIntensity = 0.45 + 0.55 * Math.sqrt(Math.max(0, Math.sin(THREE.MathUtils.degToRad(elevationDeg))));
    this.refreshSky();
  }

  /** env: 0 calm → 1 full gale; storm: inside a cell; fogExtra: fog-bank factor; flash: lightning. */
  setWeather(env: number, storm: number, fogExtra: number, flash: number) {
    this.env = env;
    this.storm = storm;
    const e = THREE.MathUtils.clamp(env, 0, 1);
    this.seaAmp = 0.45 + e * 1.9;
    this.steep = 0.82 + e * 0.14;
    this.u.uQ.value = this.steep;
    this.u.uHeightScale.value = this.seaAmp * 2.2;
    const lo = 0.16 - 0.095 * THREE.MathUtils.clamp(e / 0.9, 0, 1);
    this.u.uFoamLo.value = lo;
    this.u.uFoamHi.value = lo + 0.12;
    this.u.uFlash.value = flash;
    this.u.uDistort.value = 0.55 + e * 0.6;
    this.u.uDetail.value = 0.26 + e * 0.42; // ripples build with the wind

    const deep = this.u.uDeep.value as THREE.Color;
    deep.setRGB(0.003, 0.04, 0.075).lerp(new THREE.Color(0.008, 0.022, 0.032), e);
    const sc = this.u.uScatter.value as THREE.Color;
    sc.setRGB(0.03, 0.3, 0.33).lerp(new THREE.Color(0.045, 0.11, 0.12), e);

    const lightFactor = (1 - e * 0.85) * (1 - fogExtra * 0.45);
    (this.u.uSunColor.value as THREE.Color).copy(this.sunColor).multiplyScalar(this.sunIntensity * 2.6 * lightFactor);
    this.u.uSunVis.value = THREE.MathUtils.clamp(lightFactor, 0, 1);
    this.ambient.setRGB(0.44, 0.55, 0.66).lerp(new THREE.Color(0.2, 0.23, 0.27), e).lerp(new THREE.Color(0.32, 0.34, 0.36), fogExtra * 0.7);
    this.ambient.multiplyScalar(0.8 + flash * 1.4);
    (this.u.uAmbient.value as THREE.Color).copy(this.ambient);
    (this.lightU.value as THREE.Color)
      .copy(this.ambient)
      .multiplyScalar(0.95)
      .add(new THREE.Color().copy(this.u.uSunColor.value as THREE.Color).multiplyScalar(0.45 * this.u.uSunVis.value));

    this.u.uFogMix.value = THREE.MathUtils.clamp(0.05 + e * 0.7 + fogExtra * 0.9, 0, 0.97);
    this.hazeU.uStrength.value = THREE.MathUtils.clamp(0.22 + e * 0.5 + fogExtra * 0.5, 0, 1);
    this.hazeU.uHeight.value = 350 + e * 1400 + fogExtra * 3200;
    for (let i = 0; i < this.waves.length; i++) {
      this.waves[i].A = this.waves[i].base * this.seaAmp;
      (this.u.uWaves.value as THREE.Vector4[])[i].w = this.waves[i].A;
    }
  }

  /** Re-render the sky into the cube map used for reflections and ambient light. */
  refreshSky() {
    this.cubeCam.update(this.renderer, this.skyScene);
  }

  update(dt: number, camera: THREE.Camera, fogDensity: number) {
    this.time += dt;
    this.u.uTime.value = this.time;
    this.u.uFogDensity.value = fogDensity;
    const cp = camera.position;
    this.mesh.position.set(cp.x, 0, cp.z);
    this.haze.position.set(cp.x, 0, cp.z);
    this.sky.position.copy(cp);

    // clouds thicken and race with the weather
    const su = this.sky.material.uniforms;
    su.time.value += dt * (6 + this.storm * 18);
    const wantCov = 0.28 + this.env * 0.68;
    const wantDen = 0.22 + this.env * 0.7;
    su.cloudCoverage.value += (wantCov - su.cloudCoverage.value) * Math.min(1, dt * 0.35);
    su.cloudDensity.value += (wantDen - su.cloudDensity.value) * Math.min(1, dt * 0.35);
    su.cloudSpeed.value = 0.00004 + this.env * 0.00016;
    su.cloudScale.value = 0.00024 - this.env * 0.00008;

    this.cubeTimer -= dt;
    if (this.cubeTimer <= 0) {
      this.cubeTimer = this.lowSpec ? 2.5 : 1.2;
      this.refreshSky();
    }
  }

  /** Surface height at a world point — the same waves the shader displaces. */
  height(x: number, z: number, minL = 0): number {
    let px = x;
    let pz = z;
    const t = this.time;
    for (let it = 0; it < 2; it++) {
      let ox = 0;
      let oz = 0;
      for (const w of this.waves) {
        if (w.L < minL) continue;
        const th = w.k * (w.dx * px + w.dz * pz) - w.om * t + w.ph;
        const Q = Math.min(this.steep, 0.9 / (NW * w.k * w.A));
        const c = Math.cos(th) * Q * w.A;
        ox += c * w.dx;
        oz += c * w.dz;
      }
      px = x - ox;
      pz = z - oz;
    }
    let y = 0;
    for (const w of this.waves) {
      if (w.L < minL) continue;
      y += w.A * Math.sin(w.k * (w.dx * px + w.dz * pz) - w.om * t + w.ph);
    }
    return y;
  }

  /** Toggle the ship-in-water planar reflection (the most expensive pass) at runtime. */
  setReflections(on: boolean) {
    const want = on && !!this.mirrorRT;
    if (this.u.uUsePlanar.value === (want ? 1 : 0)) return;
    this.u.uUsePlanar.value = want ? 1 : 0;
    this.refreshSky();
  }

  /* -------------------------------------------------- wakes & decals -- */

  private extraWakes: WakeTrail[] = [];

  /** A foam wake for another vessel (traffic). */
  createWake(): WakeTrail {
    const w = new WakeTrail(this.u, this.u.uFoamMap.value as THREE.Texture, this.lightU);
    const scene = this.mesh.parent;
    if (scene) for (const m of w.meshes) scene.add(m);
    this.extraWakes.push(w);
    return w;
  }

  removeWake(w: WakeTrail) {
    for (const m of w.meshes) {
      m.parent?.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.extraWakes = this.extraWakes.filter((x) => x !== w);
  }

  /** Material for a flat mesh that rides the displaced wave surface. */
  makeDecal(fragmentShader: string, uniforms: Uniforms, lift = 0.3): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uWaves: this.u.uWaves,
        uTime: this.u.uTime,
        uQ: this.u.uQ,
        uStep: this.u.uStep,
        uTimeScale: this.u.uTimeScale,
        uFogColor: this.u.uFogColor,
        uFogDensity: this.u.uFogDensity,
        uFoamMap: this.u.uFoamMap,
        uLight: this.lightU,
        uLift: { value: lift },
        ...uniforms,
      },
      vertexShader: DECAL_VERT,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }

  /* ------------------------------------------------------------- mirror -- */

  private mirrorNormal = new THREE.Vector3(0, 1, 0);
  private mirrorPlane = new THREE.Plane();
  private clipPlane = new THREE.Vector4();
  private qv = new THREE.Vector4();
  private camPos = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private rot = new THREE.Matrix4();

  private renderMirror(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    if (!this.mirrorRT) return;
    this.camPos.setFromMatrixPosition(camera.matrixWorld);
    if (this.camPos.y < 1) return;
    const mc = this.mirrorCam;

    this.rot.extractRotation(camera.matrixWorld);
    this.lookAt.set(0, 0, -1).applyMatrix4(this.rot).add(this.camPos);
    this.lookAt.y = -this.lookAt.y;

    mc.position.set(this.camPos.x, -this.camPos.y, this.camPos.z);
    mc.up.set(0, 1, 0).applyMatrix4(this.rot);
    mc.up.y = -mc.up.y;
    mc.lookAt(this.lookAt);
    mc.far = (camera as THREE.PerspectiveCamera).far;
    mc.updateMatrixWorld();
    mc.projectionMatrix.copy((camera as THREE.PerspectiveCamera).projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(mc.projectionMatrix);
    this.textureMatrix.multiply(mc.matrixWorldInverse);

    // oblique near-plane so nothing below the water surface leaks into the reflection
    this.mirrorPlane.setFromNormalAndCoplanarPoint(this.mirrorNormal, new THREE.Vector3(0, 0, 0));
    this.mirrorPlane.applyMatrix4(mc.matrixWorldInverse);
    const cl = this.clipPlane.set(this.mirrorPlane.normal.x, this.mirrorPlane.normal.y, this.mirrorPlane.normal.z, this.mirrorPlane.constant);
    const pm = mc.projectionMatrix;
    const q = this.qv;
    q.x = (Math.sign(cl.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(cl.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1;
    q.w = (1 + pm.elements[10]) / pm.elements[14];
    cl.multiplyScalar(2 / cl.dot(q));
    pm.elements[2] = cl.x;
    pm.elements[6] = cl.y;
    pm.elements[10] = cl.z + 1;
    pm.elements[14] = cl.w;

    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    const prevShadow = renderer.shadowMap.autoUpdate;
    this.mesh.visible = false;
    for (const m of this.wake.meshes) m.visible = false;
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.mirrorRT);
    renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, mc);
    this.mesh.visible = true;
    for (const m of this.wake.meshes) m.visible = true;
    renderer.xr.enabled = prevXr;
    renderer.shadowMap.autoUpdate = prevShadow;
    renderer.setRenderTarget(prevTarget);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mirrorRT?.dispose();
    this.cubeRT.dispose();
    (this.u.uNormalMap.value as THREE.Texture).dispose();
    (this.u.uFoamMap.value as THREE.Texture).dispose();
    this.haze.geometry.dispose();
    (this.haze.material as THREE.Material).dispose();
    for (const m of this.wake.meshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}

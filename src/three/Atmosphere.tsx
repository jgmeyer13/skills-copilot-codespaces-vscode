/**
 * Sky, lighting and weather.
 *
 * The sun is not decorative: `src/sim/systems/environment.ts` computes a real
 * solar elevation for the site's latitude in late October, which at 60–64 °N
 * means roughly eight hours of daylight and a very long blue dusk. The lighting
 * rig reads that directly, so the scene's colour tells you the time of day and
 * the thermal model's ambient temperature at the same moment.
 *
 * The sky is a single shader on an inverted sphere — one draw call, no texture,
 * and the whole gradient animates from four uniforms.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { liveBus, liveSite } from '../state/store.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Sky dome
// ─────────────────────────────────────────────────────────────────────────────

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunTint;
  uniform float uNight;
  uniform float uStarFade;
  varying vec3 vWorld;

  // three.js hands us linear-light colours (ColorManagement converts on set).
  // A raw ShaderMaterial gets no automatic output encoding, so apply the sRGB
  // transfer function here or the whole sky renders a couple of stops too dark.
  vec3 toSRGB(vec3 c) {
    c = max(c, vec3(0.0));
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }

  // Cheap hash for the star field; no texture, no geometry.
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 dir = normalize(vWorld);
    float h = dir.y;

    // Sky gradient: ground haze below the horizon, horizon band, zenith above.
    vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.62, h));
    sky = mix(uGround, sky, smoothstep(-0.12, 0.03, h));

    // Warm scatter around the sun, strongest near the horizon at dawn and dusk.
    float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
    float glow = pow(sunDot, 7.0) * 0.55 + pow(sunDot, 2.0) * 0.14;
    sky += uSunTint * glow;

    // Stars, faded in at night and only above the horizon.
    if (uStarFade > 0.001 && h > 0.0) {
      vec3 cell = floor(dir * 190.0);
      float star = hash(cell);
      float twinkle = step(0.9965, star);
      float brightness = twinkle * (0.55 + 0.45 * hash(cell + 3.1));
      sky += vec3(brightness) * uStarFade * smoothstep(0.0, 0.25, h);
    }

    gl_FragColor = vec4(toSRGB(sky), 1.0);
  }
`

interface SkyKey {
  /** Solar elevation in radians at which this palette applies. */
  e: number
  zenith: string
  horizon: string
  ground: string
  tint: string
}

/** Palette keyframes across the day. Interpolated by solar elevation. */
const SKY_KEYS: SkyKey[] = [
  // elevation (radians), zenith, horizon, ground haze, sun tint
  { e: -0.5, zenith: '#03060c', horizon: '#071320', ground: '#05080e', tint: '#102030' },
  { e: -0.14, zenith: '#071423', horizon: '#1b3a55', ground: '#0a1520', tint: '#4a6d8c' },
  { e: -0.03, zenith: '#133250', horizon: '#9a5f54', ground: '#2a2c33', tint: '#ff9a62' },
  { e: 0.06, zenith: '#2b5c87', horizon: '#d99a73', ground: '#55606c', tint: '#ffb882' },
  { e: 0.22, zenith: '#4b86b8', horizon: '#bcd3e2', ground: '#8ba0b2', tint: '#ffe0bb' },
  { e: 0.6, zenith: '#5e9ccb', horizon: '#cfe2ee', ground: '#9fb3c4', tint: '#fff4e2' },
]

const _a = new THREE.Color()
const _b = new THREE.Color()

function sampleSky(elevation: number): {
  zenith: THREE.Color
  horizon: THREE.Color
  ground: THREE.Color
  tint: THREE.Color
} {
  let lo = SKY_KEYS[0] as SkyKey
  let hi = SKY_KEYS[SKY_KEYS.length - 1] as SkyKey
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const current = SKY_KEYS[i]
    const next = SKY_KEYS[i + 1]
    if (!current || !next) continue
    if (elevation >= current.e && elevation <= next.e) {
      lo = current
      hi = next
      break
    }
  }
  const span = hi.e - lo.e
  const t = span <= 0 ? 0 : THREE.MathUtils.clamp((elevation - lo.e) / span, 0, 1)
  const mix = (x: string, y: string): THREE.Color => _a.set(x).lerp(_b.set(y), t).clone()
  return {
    zenith: mix(lo.zenith, hi.zenith),
    horizon: mix(lo.horizon, hi.horizon),
    ground: mix(lo.ground, hi.ground),
    tint: mix(lo.tint, hi.tint),
  }
}

export function Sky(): React.ReactElement {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const { scene } = useThree()

  const uniforms = useMemo(
    () => ({
      uZenith: { value: new THREE.Color('#2b5c87') },
      uHorizon: { value: new THREE.Color('#d99a73') },
      uGround: { value: new THREE.Color('#55606c') },
      uSunDir: { value: new THREE.Vector3(0.4, 0.3, 0.6) },
      uSunTint: { value: new THREE.Color('#ffb882') },
      uNight: { value: 0 },
      uStarFade: { value: 0 },
    }),
    [],
  )

  const fog = useMemo(() => new THREE.Fog('#9fb3c4', 160, 620), [])
  useEffect(() => {
    scene.fog = fog
    return () => {
      scene.fog = null
    }
  }, [scene, fog])

  useFrame(() => {
    const snapshot = liveBus.next
    if (!snapshot) return
    const elevation = snapshot.clock.sunElevation
    const azimuth = snapshot.clock.sunAzimuth
    const { zenith, horizon, ground, tint } = sampleSky(elevation)

    uniforms.uZenith.value.copy(zenith)
    uniforms.uHorizon.value.copy(horizon)
    uniforms.uGround.value.copy(ground)
    uniforms.uSunTint.value.copy(tint)
    uniforms.uSunDir.value.set(
      Math.cos(elevation) * Math.sin(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.cos(azimuth),
    )
    const night = 1 - snapshot.clock.daylight
    uniforms.uNight.value = night
    uniforms.uStarFade.value = THREE.MathUtils.smoothstep(elevation, -0.02, -0.22)

    // Fog follows the horizon so distant geometry dissolves into the sky rather
    // than ending on a hard line, and tightens in fog and snow.
    const site = liveSite(snapshot)
    const visibility = site?.weather.visibility ?? 1
    fog.color.copy(horizon).lerp(ground, 0.35)
    fog.near = 150 + visibility * 170
    fog.far = 620 + visibility * 700

    if (materialRef.current) materialRef.current.uniformsNeedUpdate = true
  })

  return (
    <mesh scale={[-1, 1, 1]} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[900, 24, 16]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={SKY_VERT}
        fragmentShader={SKY_FRAG}
        depthWrite={false}
        side={THREE.BackSide}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Aurora — the reward for running a site at 64 °N
// ─────────────────────────────────────────────────────────────────────────────

const AURORA_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;
  void main() {
    vUv = uv;
    // Ripple the curtain horizontally; the vertical falloff is in the fragment.
    float wave = sin(position.x * 0.012 + uTime * 0.21) * 11.0
               + sin(position.x * 0.031 - uTime * 0.13) * 5.0;
    vWave = wave;
    vec3 p = position;
    p.y += wave;
    p.z += sin(position.x * 0.018 + uTime * 0.17) * 18.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const AURORA_FRAG = /* glsl */ `
  uniform vec3 uLow;
  uniform vec3 uHigh;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;

  // three.js hands us linear-light colours (ColorManagement converts on set).
  // A raw ShaderMaterial gets no automatic output encoding, so apply the sRGB
  // transfer function here or the whole sky renders a couple of stops too dark.
  vec3 toSRGB(vec3 c) {
    c = max(c, vec3(0.0));
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }

  void main() {
    // Soft top and bottom edges so the curtain has no visible geometry.
    float vertical = smoothstep(0.0, 0.42, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    // Vertical striations drifting sideways, which is what sells it as aurora.
    float strands = 0.55 + 0.45 * sin(vUv.x * 54.0 + uTime * 0.6 + vWave * 0.12);
    strands *= 0.6 + 0.4 * sin(vUv.x * 17.0 - uTime * 0.31);
    float edges = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
    vec3 colour = mix(uLow, uHigh, vUv.y);
    float alpha = vertical * strands * edges * uOpacity;
    gl_FragColor = vec4(toSRGB(colour * (0.7 + strands * 0.5)), alpha);
  }
`

interface AuroraCurtain {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  low: string
  high: string
  speed: number
}

const CURTAINS: AuroraCurtain[] = [
  { position: [40, 150, 330], rotation: [0, 0, 0], scale: [1, 1, 1], low: '#3df5a0', high: '#6aa8ff', speed: 1 },
  { position: [-80, 190, 280], rotation: [0, 0.35, 0.1], scale: [0.8, 1.25, 1], low: '#2fe59a', high: '#a98cff', speed: 0.72 },
  { position: [160, 170, 380], rotation: [0, -0.28, -0.08], scale: [0.95, 0.9, 1], low: '#54f0bb', high: '#5e9cff', speed: 1.35 },
]

export function Aurora({ reducedMotion }: { reducedMotion: boolean }): React.ReactElement | null {
  const groupRef = useRef<THREE.Group>(null)
  const materials = useRef<THREE.ShaderMaterial[]>([])

  const built = useMemo(
    () =>
      CURTAINS.map((curtain) => {
        const uniforms = {
          uTime: { value: 0 },
          uLow: { value: new THREE.Color(curtain.low) },
          uHigh: { value: new THREE.Color(curtain.high) },
          uOpacity: { value: 0 },
        }
        return { curtain, uniforms }
      }),
    [],
  )

  useFrame((state) => {
    const snapshot = liveBus.next
    if (!snapshot || !groupRef.current) return
    // Fade in below the horizon, fully present in proper darkness.
    const night = THREE.MathUtils.smoothstep(snapshot.clock.sunElevation, -0.03, -0.26)
    const site = liveSite(snapshot)
    // Cloud cover hides it; this is the one weather effect people notice missing.
    const clear = site ? (site.weather.kind === 'clear' ? 1 : site.weather.kind === 'overcast' ? 0.08 : 0.3) : 1
    const target = night * clear

    groupRef.current.visible = target > 0.004
    for (let i = 0; i < built.length; i++) {
      const entry = built[i]
      if (!entry) continue
      entry.uniforms.uOpacity.value = target * 0.68
      entry.uniforms.uTime.value = reducedMotion ? 0 : state.clock.elapsedTime * entry.curtain.speed
    }
  })

  return (
    <group ref={groupRef} frustumCulled={false}>
      {built.map(({ curtain, uniforms }, index) => (
        <mesh
          key={index}
          position={curtain.position}
          rotation={curtain.rotation}
          scale={curtain.scale}
          frustumCulled={false}
          renderOrder={-900}
        >
          <planeGeometry args={[760, 260, 64, 2]} />
          <shaderMaterial
            ref={(instance) => {
              if (instance) materials.current[index] = instance
            }}
            uniforms={uniforms}
            vertexShader={AURORA_VERT}
            fragmentShader={AURORA_FRAG}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            toneMapped={false}
            fog={false}
          />
        </mesh>
      ))}
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Lighting rig
// ─────────────────────────────────────────────────────────────────────────────

export function Lighting({ siteWidth, siteDepth }: { siteWidth: number; siteDepth: number }): React.ReactElement {
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const ambientRef = useRef<THREE.AmbientLight>(null)
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const fillRef = useRef<THREE.DirectionalLight>(null)

  const sunColor = useMemo(() => new THREE.Color(), [])
  const skyColor = useMemo(() => new THREE.Color(), [])
  const groundColor = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    const snapshot = liveBus.next
    if (!snapshot) return
    const { sunElevation, sunAzimuth, daylight } = snapshot.clock
    const site = liveSite(snapshot)
    const overcast = site
      ? site.weather.kind === 'clear'
        ? 0
        : site.weather.kind === 'overcast' || site.weather.kind === 'snow'
          ? 1
          : 0.55
      : 0

    // Keep the sun above the horizon for shading purposes even at night, so the
    // shadow camera stays stable; brightness is what actually goes to zero.
    const elevation = Math.max(sunElevation, 0.04)
    const distance = Math.max(siteWidth, siteDepth) * 1.35
    if (sunRef.current) {
      sunRef.current.position.set(
        siteWidth / 2 + Math.cos(elevation) * Math.sin(sunAzimuth) * distance,
        Math.sin(elevation) * distance + 40,
        siteDepth / 2 + Math.cos(elevation) * Math.cos(sunAzimuth) * distance,
      )
      // Warm and dim at low sun, neutral and bright at noon.
      const warmth = THREE.MathUtils.clamp(1 - sunElevation * 3.2, 0, 1)
      sunColor.setRGB(1, 0.93 - warmth * 0.18, 0.84 - warmth * 0.3)
      sunRef.current.color.copy(sunColor)
      sunRef.current.intensity = (0.3 + daylight * 2.5) * (1 - overcast * 0.4)
    }

    if (ambientRef.current) {
      ambientRef.current.intensity = 0.62 + daylight * 0.78 + overcast * 0.25
    }
    if (hemiRef.current) {
      // Sky light goes deep blue at night, which is what makes the yard lamps read.
      skyColor.setHSL(0.58, 0.45 - daylight * 0.2, 0.16 + daylight * 0.62)
      groundColor.setHSL(0.6, 0.12, 0.1 + daylight * 0.3)
      hemiRef.current.color.copy(skyColor)
      hemiRef.current.groundColor.copy(groundColor)
      hemiRef.current.intensity = 0.7 + daylight * 0.75
    }
    if (fillRef.current) {
      // A cold fill from the opposite side keeps shadowed faces from going black.
      fillRef.current.intensity = 0.18 + (1 - daylight) * 0.22
    }
  })

  const shadowSpan = Math.max(siteWidth, siteDepth) * 0.78

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.6} />
      <hemisphereLight ref={hemiRef} intensity={0.8} />
      <directionalLight
        ref={sunRef}
        castShadow
        intensity={1.6}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.035}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-shadowSpan, shadowSpan, shadowSpan, -shadowSpan, 20, 900]}
        />
      </directionalLight>
      <directionalLight ref={fillRef} position={[-120, 90, -140]} intensity={0.2} color="#9fc4e8" />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Precipitation
// ─────────────────────────────────────────────────────────────────────────────

const FLAKES = 1400

/**
 * Snow and sleet as one additive point cloud that falls and wraps. Points rather
 * than instanced quads: 1,400 flakes is a single draw call and costs nothing,
 * and at this scale the difference is invisible.
 */
export function Precipitation({
  centre,
  reducedMotion,
}: {
  centre: [number, number]
  reducedMotion: boolean
}): React.ReactElement {
  const pointsRef = useRef<THREE.Points>(null)
  const materialRef = useRef<THREE.PointsMaterial>(null)

  const { geometry, velocities } = useMemo(() => {
    const positions = new Float32Array(FLAKES * 3)
    const vel = new Float32Array(FLAKES)
    for (let i = 0; i < FLAKES; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 300
      positions[i * 3 + 1] = Math.random() * 70
      positions[i * 3 + 2] = (Math.random() - 0.5) * 300
      vel[i] = 1.6 + Math.random() * 3.4
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return { geometry: g, velocities: vel }
  }, [])

  useFrame((_, delta) => {
    const snapshot = liveBus.next
    const site = liveSite(snapshot)
    const points = pointsRef.current
    if (!site || !points || !materialRef.current) return

    const kind = site.weather.kind
    const active = kind === 'snow' || kind === 'sleet'
    const intensity = active ? (kind === 'snow' ? 0.85 : 0.55) * site.weather.intensity : 0
    materialRef.current.opacity = intensity * (snapshot ? 0.35 + snapshot.clock.daylight * 0.5 : 0.6)
    points.visible = intensity > 0.01
    if (!points.visible || reducedMotion) return

    points.position.set(centre[0], 0, centre[1])

    const attribute = geometry.attributes.position as THREE.BufferAttribute
    const array = attribute.array as Float32Array
    const drift = (site.weather.windKph / 60) * delta * 8
    const step = Math.min(delta, 0.05)
    for (let i = 0; i < FLAKES; i++) {
      const y = i * 3 + 1
      array[y] = (array[y] as number) - (velocities[i] as number) * step * (kind === 'sleet' ? 2.4 : 1)
      array[i * 3] = (array[i * 3] as number) + drift * step * 6
      if ((array[y] as number) < 0) {
        array[y] = 70
        array[i * 3] = (Math.random() - 0.5) * 300
        array[i * 3 + 2] = (Math.random() - 0.5) * 300
      }
      if ((array[i * 3] as number) > 150) array[i * 3] = -150
    }
    attribute.needsUpdate = true
  })

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        ref={materialRef}
        size={0.46}
        color="#ffffff"
        transparent
        opacity={0}
        depthWrite={false}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  )
}

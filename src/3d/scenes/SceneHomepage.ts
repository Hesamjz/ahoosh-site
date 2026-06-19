/**
 * SceneHomepage.ts — AHoosh.ai Homepage 3D Scene
 * Part II → PAGE 1: HOMEPAGE of AHoosh_3D_Interaction_Spec.docx v1.0.
 *
 * A SceneFactory for SceneManager.loadScene('home', createHomepageScene).
 * Builds every named object from the spec (§Scene Setup):
 *   - ParticleField   4,000 Points (1,600 on coarse pointers), simplex-noise float shader
 *   - HeroOrb         IcosahedronGeometry(2,8), iridescent standard material, at (3,0,0)
 *   - ServiceGeo[4]   TorusKnotGeometry, one per service (strategy/digital/ai/web)
 *   - DNAHelix        two intertwined strands of small spheres (Segment C)
 *   - Constellation   80 points + LineSegments, morph scattered→connected (uConnect)
 *   - GlowRing        TorusGeometry that orbits the CTA (Segment F)
 *
 * The factory exposes a controller on `scene.userData.home` so homepage-scroll.ts
 * can drive objects from ScrollTrigger. Idle animation runs on gsap.ticker (the
 * SceneManager render loop only calls composer.render(), it does not tick scenes).
 */

import * as THREE from 'three';
import { gsap } from 'gsap';

// Compact Ashima 3D simplex noise — used by the particle float vertex shader.
const SIMPLEX_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

const GOLD = new THREE.Color('#d7a13d');
const WHITE = new THREE.Color('#f7f4ec');

export interface HomeController {
  particleMat: THREE.ShaderMaterial;
  heroOrb: THREE.Mesh;
  serviceGeos: Record<'strategy' | 'digital' | 'ai' | 'web', THREE.Mesh>;
  dnaHelix: THREE.Group;
  constellation: { lines: THREE.LineSegments; mat: THREE.LineBasicMaterial };
  glowRing: THREE.Mesh;
  camera: THREE.PerspectiveCamera;
  /** continuous idle-rotation speed multiplier (hover boosts) */
  helixSpeed: number;
}

export function createHomepageScene(scene: THREE.Scene, camera: THREE.PerspectiveCamera): () => void {
  const isCoarse =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const PARTICLE_COUNT = isCoarse ? 1600 : 4000; // §perf: 60% reduction on touch

  // ── Lights ────────────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0x88aaff, 0.6);
  const key = new THREE.PointLight(0xffffff, 60, 100);
  key.position.set(5, 5, 8);
  const goldFill = new THREE.PointLight(0xd7a13d, 30, 100);
  goldFill.position.set(-5, -2, 4);
  scene.add(ambient, key, goldFill);

  // ── ParticleField — 4,000 Points, simplex float shader ─────────────────────
  const pPos = new Float32Array(PARTICLE_COUNT * 3);
  const pSeed = new Float32Array(PARTICLE_COUNT);
  const pColor = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 16; // ±8 units
    pPos[i * 3 + 1] = (Math.random() - 0.5) * 16;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    pSeed[i] = Math.random() * 100;
    const c = Math.random() > 0.5 ? GOLD : WHITE;
    pColor[i * 3] = c.r;
    pColor[i * 3 + 1] = c.g;
    pColor[i * 3 + 2] = c.b;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('aSeed', new THREE.BufferAttribute(pSeed, 1));
  pGeo.setAttribute('aColor', new THREE.BufferAttribute(pColor, 3));

  const particleMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 0.02 },
      uOpacity: { value: 0 }, // animated 0→1 on entry (§Segment A)
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      ${SIMPLEX_GLSL}
      attribute float aSeed;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uSize;
      uniform float uPixelRatio;
      varying vec3 vColor;
      void main(){
        vColor = aColor;
        vec3 p = position;
        float t = uTime * 0.15 + aSeed;
        p.x += snoise(vec3(p.yz * 0.2, t)) * 0.6;
        p.y += snoise(vec3(p.xz * 0.2, t + 10.0)) * 0.6;
        p.z += snoise(vec3(p.xy * 0.2, t + 20.0)) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPixelRatio * 900.0 / -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec3 vColor;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d) * uOpacity;
        gl_FragColor = vec4(vColor, a);
      }
    `,
  });
  const particles = new THREE.Points(pGeo, particleMat);
  scene.add(particles);

  // ── HeroOrb — Icosahedron(2,8), iridescent standard material at (3,0,0) ────
  const orbGeo = new THREE.IcosahedronGeometry(2, 8);
  const orbMat = new THREE.MeshStandardMaterial({
    color: 0x0a1830,
    metalness: 1.0,
    roughness: 0.18,
    emissive: GOLD,
    emissiveIntensity: 0.25,
    flatShading: true,
  });
  const heroOrb = new THREE.Mesh(orbGeo, orbMat);
  heroOrb.position.set(3, 0, 0);
  heroOrb.scale.setScalar(0); // pops in on entry
  scene.add(heroOrb);

  // ── ServiceGeo[4] — TorusKnot per service, hidden until Segment B ──────────
  const knotGeo = new THREE.TorusKnotGeometry(0.55, 0.18, 120, 16);
  const svcPositions: Record<string, [number, number, number]> = {
    strategy: [-3.5, 1.6, -1],
    digital: [-1.2, 1.6, -1],
    ai: [1.2, 1.6, -1],
    web: [3.5, 1.6, -1],
  };
  const svcColors: Record<string, number> = {
    strategy: 0xd7a13d,
    digital: 0x4ea3ff,
    ai: 0x9b7bff,
    web: 0x46d6c0,
  };
  const serviceGeos = {} as HomeController['serviceGeos'];
  (['strategy', 'digital', 'ai', 'web'] as const).forEach((k) => {
    const mat = new THREE.MeshStandardMaterial({
      color: svcColors[k],
      metalness: 0.7,
      roughness: 0.25,
      emissive: new THREE.Color(svcColors[k]),
      emissiveIntensity: 0.2,
    });
    const m = new THREE.Mesh(knotGeo, mat);
    m.position.set(...svcPositions[k]);
    m.scale.setScalar(0);
    scene.add(m);
    serviceGeos[k] = m;
  });

  // ── DNAHelix — two intertwined strands (Segment C) ─────────────────────────
  const dnaHelix = new THREE.Group();
  const beadGeo = new THREE.SphereGeometry(0.08, 12, 12);
  const beadMatA = new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 });
  const beadMatB = new THREE.MeshStandardMaterial({ color: WHITE, emissive: 0x4ea3ff, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3 });
  const TURNS = 18;
  for (let i = 0; i < TURNS; i++) {
    const t = (i / TURNS) * Math.PI * 4;
    const y = (i / TURNS) * 4 - 2;
    const a = new THREE.Mesh(beadGeo, beadMatA);
    a.position.set(Math.cos(t) * 0.8, y, Math.sin(t) * 0.8);
    const b = new THREE.Mesh(beadGeo, beadMatB);
    b.position.set(Math.cos(t + Math.PI) * 0.8, y, Math.sin(t + Math.PI) * 0.8);
    dnaHelix.add(a, b);
  }
  dnaHelix.scale.setScalar(0);
  dnaHelix.position.set(-2.5, 0, -1);
  scene.add(dnaHelix);

  // ── Constellation — 80 points + LineSegments, morph scattered→connected ────
  const CN = 80;
  const cPts: THREE.Vector3[] = [];
  for (let i = 0; i < CN; i++) {
    cPts.push(new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4));
  }
  const linePos: number[] = [];
  for (let i = 0; i < CN; i++) {
    for (let j = i + 1; j < CN; j++) {
      if (cPts[i]!.distanceTo(cPts[j]!) < 2.2) {
        linePos.push(cPts[i]!.x, cPts[i]!.y, cPts[i]!.z, cPts[j]!.x, cPts[j]!.y, cPts[j]!.z);
      }
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0 });
  const constellationLines = new THREE.LineSegments(lineGeo, lineMat);
  constellationLines.scale.setScalar(0.001); // "scattered" = collapsed; uConnect grows it
  scene.add(constellationLines);

  // ── GlowRing — orbits the CTA (Segment F) ──────────────────────────────────
  const ringGeo = new THREE.TorusGeometry(1.6, 0.04, 16, 100);
  const ringMat = new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 2.0, metalness: 0.5, roughness: 0.2, transparent: true, opacity: 0 });
  const glowRing = new THREE.Mesh(ringGeo, ringMat);
  glowRing.scale.setScalar(0);
  scene.add(glowRing);

  // ── Controller exposed to the scroll script ────────────────────────────────
  const controller: HomeController = {
    particleMat,
    heroOrb,
    serviceGeos,
    dnaHelix,
    constellation: { lines: constellationLines, mat: lineMat },
    glowRing,
    camera,
    helixSpeed: 1,
  };
  scene.userData.home = controller;

  // ── Entry tweens (§Segment A) — particles + orb materialize on load ─────────
  gsap.to(particleMat.uniforms.uOpacity, { value: 1, duration: 1.2, ease: 'power2.out' });
  gsap.to(heroOrb.scale, { x: 1, y: 1, z: 1, duration: 1.4, ease: 'elastic.out(1,0.5)' });

  // ── Idle animation loop on gsap.ticker ─────────────────────────────────────
  const onTick = (time: number) => {
    particleMat.uniforms.uTime.value = time;
    heroOrb.rotation.y += 0.0025;
    heroOrb.rotation.x += 0.0008;
    (['strategy', 'digital', 'ai', 'web'] as const).forEach((k) => {
      serviceGeos[k].rotation.y += 0.01;
    });
    dnaHelix.rotation.y += 0.004 * controller.helixSpeed;
    glowRing.rotation.z += 0.01;
  };
  gsap.ticker.add(onTick);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  return () => {
    gsap.ticker.remove(onTick);
    delete scene.userData.home;
  };
}

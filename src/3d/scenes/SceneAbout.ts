/**
 * SceneAbout.ts — AHoosh.ai About 3D Scene
 * Part II → PAGE 2: ABOUT of AHoosh_3D_Interaction_Spec.docx v1.0.
 *
 * SceneFactory for SceneManager.loadScene('about', createAboutScene):
 *   - AuroraField   2,000 Points, blue→gold gradient, simplex-noise drift (0.3×),
 *                   responds to mouse (slight orbit). uHue warms blue→gold (Segment C).
 *   - FloatingShards 12 thin PlaneGeometry shards, iridescent, parallax + hover speed.
 *
 * Exposes a controller on scene.userData.about for about-scroll.ts. Idle animation
 * (drift, orbit, shard spin) runs on gsap.ticker.
 */

import * as THREE from 'three';
import { gsap } from 'gsap';

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

export interface AboutController {
  auroraMat: THREE.ShaderMaterial;
  shards: THREE.Group;
  shardSpeed: number;
  camera: THREE.PerspectiveCamera;
}

export function createAboutScene(scene: THREE.Scene, camera: THREE.PerspectiveCamera): () => void {
  const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const COUNT = isCoarse ? 900 : 2000;

  scene.add(new THREE.AmbientLight(0x99bbff, 0.7));
  const fill = new THREE.PointLight(0xd7a13d, 25, 100);
  fill.position.set(-4, 2, 5);
  scene.add(fill);

  // ── Aurora field ────────────────────────────────────────────────────────────
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const mix = new Float32Array(COUNT); // 0=blue, 1=gold base
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    seed[i] = Math.random() * 100;
    mix[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aMix', new THREE.BufferAttribute(mix, 1));

  const auroraMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uHue: { value: 0 }, // 0=cool blue, 1=warm gold (Segment C tween)
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      ${SIMPLEX_GLSL}
      attribute float aSeed;
      attribute float aMix;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vMix;
      void main(){
        vMix = aMix;
        vec3 p = position;
        float t = uTime * 0.3 + aSeed;           // 0.3× slow drift (§spec)
        p.x += snoise(vec3(p.yz * 0.15, t)) * 0.9;
        p.y += snoise(vec3(p.xz * 0.15, t + 5.0)) * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 0.06 * uPixelRatio * 900.0 / -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform float uHue;
      varying float vMix;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        vec3 blue = vec3(0.30, 0.64, 1.0);
        vec3 gold = vec3(0.84, 0.63, 0.24);
        // base gradient by aMix, then warm toward gold as uHue rises
        vec3 col = mix(blue, gold, clamp(vMix + uHue, 0.0, 1.0));
        float a = smoothstep(0.5, 0.0, d) * uOpacity * 0.8;
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const aurora = new THREE.Points(geo, auroraMat);
  scene.add(aurora);

  // ── Floating shards — 12 thin iridescent planes ─────────────────────────────
  const shards = new THREE.Group();
  const shardGeo = new THREE.PlaneGeometry(0.5, 1.6);
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.55 + Math.random() * 0.12, 0.6, 0.55),
      metalness: 0.9,
      roughness: 0.15,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      emissive: new THREE.Color().setHSL(0.58, 0.5, 0.3),
      emissiveIntensity: 0.4,
    });
    const m = new THREE.Mesh(shardGeo, mat);
    m.position.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4 - 1);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    m.scale.setScalar(0);
    m.userData.spin = (Math.random() - 0.5) * 0.01;
    shards.add(m);
  }
  scene.add(shards);

  const controller: AboutController = { auroraMat, shards, shardSpeed: 1, camera };
  scene.userData.about = controller;

  // Entry tweens (§Segment A)
  gsap.to(auroraMat.uniforms.uOpacity, { value: 1, duration: 1.5, ease: 'power2.out' });
  shards.children.forEach((m, i) => {
    gsap.to((m as THREE.Mesh).scale, { x: 1, y: 1, z: 1, duration: 1.2, ease: 'power4.out', delay: i * 0.05 });
    gsap.to(((m as THREE.Mesh).material as THREE.Material), { opacity: 0.7, duration: 1.2, delay: i * 0.05 });
  });

  // Mouse orbit
  const target = { x: 0, y: 0 };
  const onMouse = (e: MouseEvent) => {
    target.x = (e.clientX / window.innerWidth - 0.5) * 0.3;
    target.y = (e.clientY / window.innerHeight - 0.5) * 0.3;
  };
  window.addEventListener('mousemove', onMouse, { passive: true });

  // Idle loop
  const onTick = (time: number) => {
    auroraMat.uniforms.uTime.value = time;
    aurora.rotation.y += (target.x - aurora.rotation.y) * 0.02;
    aurora.rotation.x += (target.y - aurora.rotation.x) * 0.02;
    shards.children.forEach((m) => {
      m.rotation.z += (m.userData.spin as number) * controller.shardSpeed;
      m.rotation.y += 0.002 * controller.shardSpeed;
    });
  };
  gsap.ticker.add(onTick);

  return () => {
    gsap.ticker.remove(onTick);
    window.removeEventListener('mousemove', onMouse);
    delete scene.userData.about;
  };
}

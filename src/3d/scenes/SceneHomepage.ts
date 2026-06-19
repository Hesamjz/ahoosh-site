/**
 * SceneHomepage.ts — AHoosh.ai living background (custom WebGL shader)
 *
 * Hesam's choice (2026-06-19): a Lusion-class, code-only background. A full-screen
 * flowing aurora/fog shader (domain-warped fbm, navy+gold+blue) that:
 *   - reacts to the pointer (soft gold bloom follows the cursor),
 *   - EVOLVES as you scroll (warms + the flow drifts) → one continuous "living"
 *     background behind the whole page (mont-fort/capital feel),
 * plus a light particle layer on top for sparkle. No assets, themed in brand
 * colours, degrades on low-end / coarse-pointer devices.
 *
 * SceneFactory for SceneManager.loadScene('home', createHomepageScene).
 * Self-animates on gsap.ticker; reads window scroll for the evolve uniform.
 */

import * as THREE from 'three';
import { gsap } from 'gsap';
import { SceneManager } from '../core/SceneManager';

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

export function createHomepageScene(scene: THREE.Scene, camera: THREE.PerspectiveCamera): () => void {
  const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const lowEnd = SceneManager.isLowEnd() || isCoarse;
  const OCT = lowEnd ? 3 : 5;            // fbm octaves — cheaper on weak GPUs
  const PARTS = lowEnd ? 700 : 1600;

  camera.position.set(0, 0, 8);

  // ── Full-screen flowing aurora/fog shader (fullscreen quad) ─────────────────
  const bgGeo = new THREE.PlaneGeometry(2, 2);
  const bgMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uScroll: { value: 0 },     // 0..1 page progress — warms + drifts the flow
      uMouse: { value: new THREE.Vector2(0, 0) },
      uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      ${SIMPLEX_GLSL}
      varying vec2 vUv;
      uniform float uTime; uniform float uScroll; uniform float uOpacity;
      uniform vec2 uMouse; uniform vec2 uRes;
      float fbm(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<${OCT};i++){ v+=a*snoise(p); p*=2.0; a*=0.5; } return v; }
      void main(){
        vec2 p = vUv - 0.5; p.x *= uRes.x / uRes.y;
        float t = uTime * 0.045;
        // domain-warped fbm for a fluid look
        vec3 q = vec3(p * 1.4, t);
        float w = fbm(q + vec3(fbm(q), fbm(q + 5.2), 0.0));
        // a second flow that drifts upward as you scroll the page
        float flow = fbm(vec3(p * 2.1 + vec2(0.0, -uScroll * 1.6), t * 1.25));
        float n = smoothstep(-0.5, 1.0, w + flow * 0.55);
        vec3 navy = vec3(0.010, 0.038, 0.095);
        vec3 blue = vec3(0.16, 0.42, 0.95);
        vec3 gold = vec3(0.88, 0.66, 0.24);
        vec3 col = navy;
        col = mix(col, blue * 0.55, smoothstep(0.30, 0.85, n) * 0.45);
        col = mix(col, gold, pow(max(n, 0.0), 2.0) * (0.30 + uScroll * 0.45)); // warmer downward
        // soft gold bloom around the pointer
        float md = distance(p, uMouse);
        col += gold * 0.14 * smoothstep(0.45, 0.0, md);
        // vignette
        col *= 1.0 - 0.45 * dot(p, p);
        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
  const bg = new THREE.Mesh(bgGeo, bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  scene.add(bg);

  // ── Light particle sparkle on top ───────────────────────────────────────────
  const pos = new Float32Array(PARTS * 3);
  const seed = new Float32Array(PARTS);
  for (let i = 0; i < PARTS; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 18;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    seed[i] = Math.random() * 100;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: /* glsl */ `
      ${SIMPLEX_GLSL}
      attribute float aSeed; uniform float uTime; uniform float uPixelRatio;
      void main(){
        vec3 p = position; float t = uTime * 0.1 + aSeed;
        p.x += snoise(vec3(p.yz*0.18, t))*0.6; p.y += snoise(vec3(p.xz*0.18, t+9.0))*0.6;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 0.03 * uPixelRatio * 900.0 / -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(0.88,0.69,0.30, smoothstep(0.5,0.0,d)*uOpacity); }
    `,
  });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  gsap.to(bgMat.uniforms.uOpacity, { value: 1, duration: 1.6, ease: 'power2.out' });
  gsap.to(pMat.uniforms.uOpacity, { value: 0.6, duration: 1.6, ease: 'power2.out' });

  // ── Pointer + scroll reactivity ─────────────────────────────────────────────
  const aspect = () => window.innerWidth / window.innerHeight;
  const mouseTarget = new THREE.Vector2(0, 0);
  const onMouse = (e: MouseEvent) => {
    mouseTarget.set((e.clientX / window.innerWidth - 0.5) * aspect(), -(e.clientY / window.innerHeight - 0.5));
  };
  const onResize = () => bgMat.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
  window.addEventListener('mousemove', onMouse, { passive: true });
  window.addEventListener('resize', onResize);

  let scrollTarget = 0;
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollTarget = max > 0 ? Math.min(1, window.scrollY / max) : 0;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const onTick = (time: number) => {
    bgMat.uniforms.uTime.value = time;
    pMat.uniforms.uTime.value = time;
    const m = bgMat.uniforms.uMouse.value as THREE.Vector2;
    m.x += (mouseTarget.x - m.x) * 0.04;
    m.y += (mouseTarget.y - m.y) * 0.04;
    bgMat.uniforms.uScroll.value += (scrollTarget - bgMat.uniforms.uScroll.value) * 0.06;
    points.rotation.y += 0.0004;
  };
  gsap.ticker.add(onTick);

  return () => {
    gsap.ticker.remove(onTick);
    window.removeEventListener('mousemove', onMouse);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll);
  };
}

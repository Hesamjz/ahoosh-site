/**
 * SceneHomepage.ts — AHoosh.ai living background (3 selectable WebGL looks)
 *
 * Three interactive background styles to choose from (pick via ?bg=1|2|3, default 1;
 * an on-page switcher sets it). All are mouse-reactive + evolve on scroll:
 *   1 — Molten gold ink: liquid gold veins/smoke in near-black navy (premium).
 *   2 — Data nebula: soft gold+blue clouds + particles (cosmic / research).
 *   3 — Fintech grid/waves: moving grid + flowing line-waves (markets / precise).
 * Light particle sparkle on top (1 & 2). Degrades on low-end / coarse pointers.
 *
 * SceneFactory for SceneManager.loadScene('home', createHomepageScene).
 */

import * as THREE from 'three';
import { gsap } from 'gsap';
import { SceneManager } from '../core/SceneManager';
import { Parallax } from '../core/Parallax';

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

const HEAD = (oct: number) => /* glsl */ `
  ${SIMPLEX_GLSL}
  varying vec2 vUv;
  uniform float uTime; uniform float uScroll; uniform float uOpacity;
  uniform vec2 uMouse; uniform vec2 uRes; uniform vec2 uParallax;
  float fbm(vec3 p){ float v=0.0,a=0.5; for(int i=0;i<${oct};i++){ v+=a*snoise(p); p*=2.0; a*=0.5; } return v; }
`;

// 1 — Molten gold ink
const FRAG_GOLD = (oct: number) => HEAD(oct) + /* glsl */ `
  void main(){
    vec2 p = vUv - 0.5; p.x *= uRes.x/uRes.y;
    p += uParallax; // field drifts up + left on scroll (pointer-nudged)
    float t = uTime*0.04;
    vec3 q = vec3(p*1.5, t);
    float w = fbm(q + vec3(fbm(q*1.3), fbm(q+7.0), t*0.5));
    float veins = pow(smoothstep(0.0, 0.9, abs(w)), 1.6);
    float glow = smoothstep(0.55, 1.0, w + fbm(vec3(p*3.0, t)) * 0.4);
    vec3 navy = vec3(0.006, 0.022, 0.06);
    vec3 gold = vec3(0.92, 0.69, 0.26);
    vec3 deepgold = vec3(0.5, 0.32, 0.08);
    vec3 col = navy;
    col = mix(col, deepgold, veins * (0.5 + uScroll*0.3));
    col = mix(col, gold, glow * (0.6 + uScroll*0.4));
    float md = distance(p, uMouse);
    col += gold * 0.22 * smoothstep(0.4, 0.0, md);
    col *= 1.0 - 0.5*dot(p,p);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

// 2 — Data nebula
const FRAG_NEBULA = (oct: number) => HEAD(oct) + /* glsl */ `
  void main(){
    vec2 p = vUv - 0.5; p.x *= uRes.x/uRes.y;
    p += uParallax; // field drifts up + left on scroll (pointer-nudged)
    float t = uTime*0.035;
    vec3 q = vec3(p*1.2 + vec2(0.0, -uScroll*1.2), t);
    float n = fbm(q + vec3(fbm(q), fbm(q+4.0), 0.0));
    float clouds = smoothstep(-0.4, 1.0, n);
    vec3 navy = vec3(0.010, 0.035, 0.085);
    vec3 blue = vec3(0.18, 0.45, 0.98);
    vec3 gold = vec3(0.90, 0.68, 0.28);
    vec3 col = navy;
    col = mix(col, blue*0.7, clouds*0.5);
    col = mix(col, gold, pow(clouds,2.5)*(0.35 + uScroll*0.4));
    float md = distance(p, uMouse);
    col += blue * 0.12 * smoothstep(0.5, 0.0, md);
    col *= 1.0 - 0.45*dot(p,p);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

// 3 — Fintech grid / waves
const FRAG_GRID = (oct: number) => HEAD(oct) + /* glsl */ `
  void main(){
    vec2 p = vUv - 0.5; p.x *= uRes.x/uRes.y;
    p += uParallax; // field drifts up + left on scroll (pointer-nudged)
    float t = uTime*0.15*(1.0+uScroll);
    vec3 navy = vec3(0.010, 0.032, 0.08);
    vec3 col = navy;
    // perspective-ish grid
    vec2 g = p; g.y += 0.5;
    float gd = 0.0;
    float gx = abs(fract(g.x*14.0 + sin(g.y*4.0+t)*0.1) - 0.5);
    float gy = abs(fract(g.y*10.0 - t*0.1) - 0.5);
    gd += smoothstep(0.49, 0.5, 1.0-gx) + smoothstep(0.49, 0.5, 1.0-gy);
    col += vec3(0.16,0.36,0.7) * gd * 0.10;
    // flowing line-waves (chart breathing)
    float wave = 0.0;
    for(int i=0;i<4;i++){
      float fi = float(i);
      float y = 0.15*sin(p.x*3.0 + t + fi*1.7 + uMouse.x*2.0) * (0.6+0.2*fi) - 0.1 + fi*0.06 - 0.1;
      wave += smoothstep(0.012, 0.0, abs(p.y - y));
    }
    vec3 gold = vec3(0.95, 0.72, 0.30);
    col += gold * wave * (0.8 + uScroll*0.5);
    float md = distance(p, uMouse);
    col += gold * 0.12 * smoothstep(0.35, 0.0, md);
    col *= 1.0 - 0.4*dot(p,p);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

export function createHomepageScene(scene: THREE.Scene, camera: THREE.PerspectiveCamera): () => void {
  const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const lowEnd = SceneManager.isLowEnd() || isCoarse;
  const OCT = lowEnd ? 3 : 5;
  const PARTS = lowEnd ? 600 : 1500;
  const variant = new URLSearchParams(location.search).get('bg') || '3';
  const frag = variant === '3' ? FRAG_GRID(OCT) : variant === '2' ? FRAG_NEBULA(OCT) : FRAG_GOLD(OCT);

  camera.position.set(0, 0, 8);

  const bgMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uScroll: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uParallax: { value: new THREE.Vector2(0, 0) },
      uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uOpacity: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy,0.0,1.0); }',
    fragmentShader: frag,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false; bg.renderOrder = -10;
  scene.add(bg);

  // Particle sparkle (skip on grid look for cleanliness)
  let pMat: THREE.ShaderMaterial | null = null;
  if (variant !== '3') {
    const pos = new Float32Array(PARTS * 3); const seed = new Float32Array(PARTS);
    for (let i = 0; i < PARTS; i++) {
      pos[i*3] = (Math.random()-0.5)*18; pos[i*3+1] = (Math.random()-0.5)*12; pos[i*3+2] = (Math.random()-0.5)*8;
      seed[i] = Math.random()*100;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    pMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
      vertexShader: `${SIMPLEX_GLSL}
        attribute float aSeed; uniform float uTime; uniform float uPixelRatio;
        void main(){ vec3 p=position; float t=uTime*0.1+aSeed; p.x+=snoise(vec3(p.yz*0.18,t))*0.6; p.y+=snoise(vec3(p.xz*0.18,t+9.0))*0.6;
          vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=0.03*uPixelRatio*900.0/-mv.z; }`,
      fragmentShader: `uniform float uOpacity; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(0.9,0.7,0.32, smoothstep(0.5,0.0,d)*uOpacity); }`,
    });
    scene.add(new THREE.Points(pGeo, pMat));
  }

  gsap.to(bgMat.uniforms.uOpacity, { value: 1, duration: 1.6, ease: 'power2.out' });
  if (pMat) gsap.to(pMat.uniforms.uOpacity, { value: 0.6, duration: 1.6, ease: 'power2.out' });

  const onResize = () => bgMat.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', onResize);

  // Centralized scroll + pointer parallax (field drifts up/left on scroll)
  const para = Parallax.getInstance();
  para.start();

  const onTick = (time: number) => {
    bgMat.uniforms.uTime.value = time;
    if (pMat) pMat.uniforms.uTime.value = time;
    (bgMat.uniforms.uMouse.value as THREE.Vector2).set(para.mouse.x, para.mouse.y);
    (bgMat.uniforms.uParallax.value as THREE.Vector2).set(para.offset.x, para.offset.y);
    bgMat.uniforms.uScroll.value = para.scroll;
  };
  gsap.ticker.add(onTick);

  return () => {
    gsap.ticker.remove(onTick);
    window.removeEventListener('resize', onResize);
  };
}

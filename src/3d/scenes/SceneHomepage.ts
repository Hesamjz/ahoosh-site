/**
 * SceneHomepage.ts — AHoosh.ai Homepage ambient background
 *
 * REDESIGN (2026-06-19, per Hesam): the landing page is a smooth, high-contrast
 * PORTAL to the product (News / Markets / Articles / tools) — no personal info,
 * no scroll-pinned narrative (that caused the scroll "jumpers"). This scene is a
 * calm, always-on particle field that lives BEHIND the content for a "live" feel.
 * It does NOT couple to scroll, so scrolling stays buttery.
 *
 * SceneFactory for SceneManager.loadScene('home', createHomepageScene).
 * Self-animates on gsap.ticker; gentle parallax toward the pointer.
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

const GOLD = new THREE.Color('#e0a93f');
const BLUE = new THREE.Color('#4ea3ff');

export function createHomepageScene(scene: THREE.Scene, camera: THREE.PerspectiveCamera): () => void {
  const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const COUNT = isCoarse ? 1500 : 3200;

  camera.position.set(0, 0, 8);

  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const col = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 18;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    seed[i] = Math.random() * 100;
    const c = Math.random() > 0.35 ? GOLD : BLUE; // gold-dominant, blue accents
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 0.03 },
      uOpacity: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      ${SIMPLEX_GLSL}
      attribute float aSeed;
      attribute vec3 aColor;
      uniform float uTime; uniform float uSize; uniform float uPixelRatio;
      varying vec3 vColor;
      void main(){
        vColor = aColor;
        vec3 p = position;
        float t = uTime * 0.12 + aSeed;
        p.x += snoise(vec3(p.yz * 0.18, t)) * 0.7;
        p.y += snoise(vec3(p.xz * 0.18, t + 10.0)) * 0.7;
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
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  // Fade in once, then leave it running — no scroll coupling = no jank.
  gsap.to(mat.uniforms.uOpacity, { value: 0.7, duration: 1.6, ease: 'power2.out' });

  // Gentle pointer parallax (live feel, cheap).
  const target = { x: 0, y: 0 };
  const onMouse = (e: MouseEvent) => {
    target.x = (e.clientX / window.innerWidth - 0.5) * 0.25;
    target.y = (e.clientY / window.innerHeight - 0.5) * 0.25;
  };
  window.addEventListener('mousemove', onMouse, { passive: true });

  const onTick = (time: number) => {
    mat.uniforms.uTime.value = time;
    points.rotation.y += (target.x - points.rotation.y) * 0.02 + 0.0004;
    points.rotation.x += (-target.y - points.rotation.x) * 0.02;
  };
  gsap.ticker.add(onTick);

  return () => {
    gsap.ticker.remove(onTick);
    window.removeEventListener('mousemove', onMouse);
  };
}

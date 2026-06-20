/**
 * createImageScene.ts — AHoosh.ai Mont-Fort-style photographic background.
 *
 * Loads an image as a WebGL texture on a full-screen plane and displaces its UVs
 * by scroll + pointer: the picture drifts up/left and slowly zooms as you scroll,
 * leans toward the cursor, with a subtle wave, a brand colour grade, and a vignette
 * so text stays legible. This is the Mont-Fort technique (real photos through WebGL),
 * and it's *lighter* than the procedural fbm shaders — good for the mobile budget.
 *
 * No real art yet: if `src` is omitted it generates an on-brand navy/gold placeholder
 * texture so the effect works immediately. Swap in real imagery (Cloudinary URL) later.
 *
 * Usage:  sm.loadScene('home', createImageScene({ src: 'https://…/bg.avif' }));
 */

import * as THREE from 'three';
import { gsap } from 'gsap';
import { Parallax } from '../core/Parallax';

export interface ImageSceneConfig {
  /** Image URL (Cloudinary/remote). If omitted, a brand placeholder is generated. */
  src?: string;
}

function makePlaceholderTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 720;
  const ctx = c.getContext('2d')!;
  // navy radial base
  const g = ctx.createRadialGradient(c.width * 0.7, c.height * 0.28, 80, c.width * 0.5, c.height * 0.5, c.width * 0.95);
  g.addColorStop(0, '#163a7a');
  g.addColorStop(0.5, '#0a1836');
  g.addColorStop(1, '#04081a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  // diagonal gold light streak
  const g2 = ctx.createLinearGradient(0, 0, c.width, c.height);
  g2.addColorStop(0, 'rgba(224,169,63,0)');
  g2.addColorStop(0.5, 'rgba(224,169,63,0.20)');
  g2.addColorStop(1, 'rgba(224,169,63,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, c.width, c.height);
  // fine grain so the displacement is visible
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = `rgba(255,220,150,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTex;
  uniform vec2 uParallax; uniform vec2 uMouse;
  uniform float uScroll; uniform float uOpacity;
  uniform vec2 uRes; uniform vec2 uImgRes;

  // cover-fit (like CSS background-size: cover)
  vec2 cover(vec2 uv, vec2 res, vec2 img){
    float ra = res.x/res.y; float ia = img.x/img.y;
    vec2 s = ra > ia ? vec2(1.0, ia/ra) : vec2(ra/ia, 1.0);
    return (uv - 0.5)/s + 0.5;
  }

  void main(){
    vec2 uv = cover(vUv, uRes, uImgRes);
    float zoom = 1.0 + uScroll*0.08;        // slow push-in on scroll
    uv = (uv - 0.5)/zoom + 0.5;
    uv += uParallax*0.6;                      // drift up/left on scroll (+ pointer)
    uv += uMouse*0.012;                       // lean to cursor
    uv.x += sin(uv.y*8.0 + uScroll*6.0)*0.0015; // subtle wave
    vec3 col = texture2D(uTex, uv).rgb;
    col = mix(col, col*vec3(0.85,0.92,1.15), 0.25); // navy shadows / cool grade
    vec2 d = vUv - 0.5; col *= 1.0 - 0.55*dot(d,d);  // vignette for text legibility
    gl_FragColor = vec4(col, uOpacity);
  }
`;

export function createImageScene(
  cfg: ImageSceneConfig = {}
): (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => () => void {
  return (scene) => {
    let mat: THREE.ShaderMaterial;
    const setImgRes = (w?: number, h?: number) => mat?.uniforms.uImgRes.value.set(w || 16, h || 9);

    const tex = cfg.src
      ? new THREE.TextureLoader().load(cfg.src, (t) => setImgRes(t.image?.width, t.image?.height))
      : makePlaceholderTexture();
    tex.colorSpace = THREE.SRGBColorSpace;

    mat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms: {
        uTex: { value: tex },
        uParallax: { value: new THREE.Vector2(0, 0) },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uScroll: { value: 0 },
        uOpacity: { value: 0 },
        uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uImgRes: { value: new THREE.Vector2(16, 9) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    // placeholder (canvas) texture has its size available immediately
    const img = (tex as THREE.Texture).image as { width?: number; height?: number } | undefined;
    if (!cfg.src && img) setImgRes(img.width, img.height);

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    scene.add(mesh);

    gsap.to(mat.uniforms.uOpacity, { value: 1, duration: 1.4, ease: 'power2.out' });

    const para = Parallax.getInstance();
    para.start();

    const onResize = () => mat.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', onResize);

    const onTick = () => {
      (mat.uniforms.uParallax.value as THREE.Vector2).set(para.offset.x, para.offset.y);
      (mat.uniforms.uMouse.value as THREE.Vector2).set(para.mouse.x, para.mouse.y);
      mat.uniforms.uScroll.value = para.scroll;
    };
    gsap.ticker.add(onTick);

    return () => {
      gsap.ticker.remove(onTick);
      window.removeEventListener('resize', onResize);
      tex.dispose();
      mat.dispose();
    };
  };
}

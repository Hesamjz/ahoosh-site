/**
 * SceneManager.ts — AHoosh.ai 3D Singleton
 * Part I §1.3 of AHoosh_3D_Interaction_Spec.docx v1.0 (2026-06-18)
 *
 * One WebGLRenderer, one camera, multiple scenes swapped per page slug.
 * Dispose geometry / materials / textures on route change (§6.3).
 *
 * Usage:
 *   import { SceneManager } from '../3d/core/SceneManager';
 *   const sm = SceneManager.getInstance();
 *   sm.mount(canvasEl);
 *   sm.loadScene('home', SceneHomepage);
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export type SceneSlug = string;
export type SceneFactory = (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => () => void;

export class SceneManager {
  private static _instance: SceneManager | null = null;

  private _renderer!: THREE.WebGLRenderer;
  private _camera!: THREE.PerspectiveCamera;
  private _composer!: EffectComposer;
  private _scene: THREE.Scene = new THREE.Scene();
  private _currentSlug: SceneSlug = '';
  private _cleanupFn: (() => void) | null = null;
  private _animFrameId = 0;
  private _raycaster = new THREE.Raycaster();
  private _mouse = new THREE.Vector2();
  private _scrollAnimDisabled = false;
  private _canvas: HTMLCanvasElement | null = null;
  private _resizeObserver: ResizeObserver | null = null;

  /** Singleton accessor — safe to call before mount() */
  static getInstance(): SceneManager {
    if (!SceneManager._instance) {
      SceneManager._instance = new SceneManager();
    }
    return SceneManager._instance;
  }

  private constructor() {}

  // ── WebGL capability check ────────────────────────────────────────────────

  static isWebGLAvailable(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
    } catch {
      return false;
    }
  }

  // ── Low-end device check (§4 — mobile degradation) ───────────────────────

  static isLowEnd(): boolean {
    return (navigator.hardwareConcurrency ?? 8) <= 4;
  }

  // ── Mount onto a canvas element ───────────────────────────────────────────

  mount(canvas: HTMLCanvasElement): void {
    if (this._canvas === canvas) return; // already mounted
    this._canvas = canvas;

    // Renderer — §1.3
    this._renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.0;

    // Camera — §1.3: FOV 45, near 0.1, far 1000, default z=8
    this._camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this._camera.position.set(0, 0, 8);

    // Post-processing — §1.3: UnrealBloomPass
    this._composer = new EffectComposer(this._renderer);
    this._composer.addPass(new RenderPass(this._scene, this._camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.8,  // strength
      0.4,  // radius
      0.2   // threshold
    );
    this._composer.addPass(bloomPass);

    // Scene background: null — CSS handles gradient (§1.3)
    this._scene.background = null;

    // Raycaster on mousemove (§1.3)
    window.addEventListener('mousemove', this._onMouseMove, { passive: true });

    // Resize
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(document.documentElement);

    // Render loop
    this._startLoop();
  }

  // ── Scene loading & swapping ──────────────────────────────────────────────

  /**
   * loadScene — swap to a new page-level scene.
   * @param slug  Page identifier (e.g. 'home', 'about', 'services')
   * @param factory  Receives scene + camera, sets them up, returns cleanup fn
   */
  loadScene(slug: SceneSlug, factory: SceneFactory): void {
    if (this._currentSlug === slug) return;

    // Dispose previous scene contents (§6.3)
    this._disposeScene();

    // Run new factory
    this._cleanupFn = factory(this._scene, this._camera);
    this._currentSlug = slug;
  }

  /** Dispose current scene — call on route change */
  disposeCurrentScene(): void {
    this._disposeScene();
    this._currentSlug = '';
  }

  private _disposeScene(): void {
    // Run scene-specific cleanup (event listeners, timers, etc.)
    if (this._cleanupFn) {
      this._cleanupFn();
      this._cleanupFn = null;
    }

    // Traverse and dispose all Three.js objects (§6.3)
    this._scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          // Dispose any texture maps attached to the material
          for (const value of Object.values(mat as Record<string, unknown>)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          mat.dispose();
        }
      }
    });

    // Clear the scene
    while (this._scene.children.length > 0) {
      this._scene.remove(this._scene.children[0]!);
    }
  }

  // ── Reduced-motion (§1.6) ─────────────────────────────────────────────────

  disableScrollAnimation(): void {
    this._scrollAnimDisabled = true;
  }

  get scrollAnimDisabled(): boolean {
    return this._scrollAnimDisabled;
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  get renderer(): THREE.WebGLRenderer {
    return this._renderer;
  }

  get camera(): THREE.PerspectiveCamera {
    return this._camera;
  }

  get scene(): THREE.Scene {
    return this._scene;
  }

  get currentSlug(): SceneSlug {
    return this._currentSlug;
  }

  // ── Render loop ───────────────────────────────────────────────────────────

  private _startLoop(): void {
    const tick = () => {
      this._animFrameId = requestAnimationFrame(tick);
      this._composer.render();
    };
    this._animFrameId = requestAnimationFrame(tick);
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  private _onMouseMove = (e: MouseEvent): void => {
    this._mouse.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    this._raycaster.setFromCamera(this._mouse, this._camera);
  };

  private _onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
    this._composer.setSize(w, h);
  }

  // ── Full teardown (page unload) ───────────────────────────────────────────

  destroy(): void {
    cancelAnimationFrame(this._animFrameId);
    this._disposeScene();
    this._renderer.dispose();
    this._renderer.forceContextLoss();
    this._resizeObserver?.disconnect();
    window.removeEventListener('mousemove', this._onMouseMove);
    SceneManager._instance = null;
  }
}

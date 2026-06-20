/**
 * FocalMark.ts — AHoosh.ai procedural focal object (no Spline runtime).
 *
 * Our lightweight, no-extra-dependency answer to the Spline hero-object pattern:
 * a molten-gold sphere with a faint wireframe shell that rotates to the pointer
 * and lifts on scroll. Bloom (already in SceneManager) gives it the glow.
 * Add into any scene that wants a hero centerpiece; drive via update() each frame.
 *
 * Usage inside a SceneFactory:
 *   import { addFocalMark } from '../objects/FocalMark';
 *   const mark = addFocalMark(scene);
 *   // per frame: mark.update(para.mouse.x, para.mouse.y, para.scroll);
 *   // on cleanup: mark.dispose();
 */

import * as THREE from 'three';

export interface FocalMark {
  update: (mouseX: number, mouseY: number, scroll: number) => void;
  dispose: () => void;
}

export function addFocalMark(scene: THREE.Scene, opts: { radius?: number } = {}): FocalMark {
  const r = opts.radius ?? 1.6;
  const group = new THREE.Group();

  const geo = new THREE.SphereGeometry(r, 48, 48);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xe0a93f,
    metalness: 0.9,
    roughness: 0.25,
    emissive: 0x3a2607,
    emissiveIntensity: 0.4,
  });
  const sphere = new THREE.Mesh(geo, mat);
  group.add(sphere);

  const wireGeo = new THREE.SphereGeometry(r * 1.004, 16, 12);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x0a1430,
    wireframe: true,
    transparent: true,
    opacity: 0.25,
  });
  const wire = new THREE.Mesh(wireGeo, wireMat);
  group.add(wire);

  // MeshStandardMaterial needs light
  const key = new THREE.PointLight(0xfff0d0, 2.2, 50);
  key.position.set(4, 5, 6);
  const rim = new THREE.PointLight(0x3a6cff, 1.2, 50);
  rim.position.set(-5, -2, 3);
  group.add(key, rim);

  scene.add(group);

  return {
    update(mouseX, mouseY, scroll) {
      group.rotation.y += 0.003 + mouseX * 0.02;
      group.rotation.x += (mouseY * 0.25 - group.rotation.x) * 0.05;
      group.position.y = scroll * -0.8;
    },
    dispose() {
      scene.remove(group);
      geo.dispose();
      wireGeo.dispose();
      mat.dispose();
      wireMat.dispose();
    },
  };
}

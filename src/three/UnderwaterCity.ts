/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { createCityFacadeTexture, createParticleTexture } from './proceduralTextures';

export class UnderwaterCity {
  public group: THREE.Group;
  private buildings: THREE.Mesh[] = [];
  private godRays: THREE.Mesh[] = [];
  private marineSnowParticles: THREE.Points;
  private cityFacadeTexture: THREE.CanvasTexture;
  private visibility = 0; // 0 (hidden or faint in Moment 1) -> 1 (full glory in Moment 2+)
  private marineSnowPositions: Float32Array;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'UnderwaterMetropolis';

    this.cityFacadeTexture = createCityFacadeTexture();

    // 1. Vast Deep Trench Seabed
    const seabedGeo = new THREE.PlaneGeometry(160, 160, 32, 32);
    // Displace vertices slightly for ocean floor ridges
    const pos = seabedGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.08) * 3 + Math.cos(y * 0.06) * 2.5);
    }
    seabedGeo.computeVertexNormals();

    const seabedMat = new THREE.MeshStandardMaterial({
      color: 0x051324,
      roughness: 0.9,
      metalness: 0.1,
    });
    const seabed = new THREE.Mesh(seabedGeo, seabedMat);
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.set(0, -6, -45);
    this.group.add(seabed);

    // 2. Futuristic Underwater Towers & Spires
    this.createMetropolisBuildings();

    // 3. Volumetric Sunlight Rays / Underwater Light Shafts
    this.createGodRays();

    // 4. Marine Snow / Deep Ocean Floating Plankton Particles
    const snowCount = 1800;
    const snowGeo = new THREE.BufferGeometry();
    this.marineSnowPositions = new Float32Array(snowCount * 3);
    for (let i = 0; i < snowCount; i++) {
      this.marineSnowPositions[i * 3] = (Math.random() - 0.5) * 80;
      this.marineSnowPositions[i * 3 + 1] = Math.random() * 32 - 4;
      this.marineSnowPositions[i * 3 + 2] = -Math.random() * 70 - 4;
    }
    snowGeo.setAttribute('position', new THREE.BufferAttribute(this.marineSnowPositions, 3));

    const snowMat = new THREE.PointsMaterial({
      size: 0.28,
      map: createParticleTexture(),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.marineSnowParticles = new THREE.Points(snowGeo, snowMat);
    this.group.add(this.marineSnowParticles);

    // Ocean Surface Light Shimmer Far Above
    const surfaceGeo = new THREE.PlaneGeometry(120, 120);
    const surfaceMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const surfacePlane = new THREE.Mesh(surfaceGeo, surfaceMat);
    surfacePlane.rotation.x = Math.PI / 2;
    surfacePlane.position.set(0, 26, -45);
    this.group.add(surfacePlane);

    this.setVisibility(0.0);
  }

  private createMetropolisBuildings() {
    const bldgMat = new THREE.MeshStandardMaterial({
      color: 0x071b30,
      map: this.cityFacadeTexture,
      roughness: 0.35,
      metalness: 0.7,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.6,
    });

    const domeMat = new THREE.MeshPhysicalMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.6,
      roughness: 0.15,
      metalness: 0.4,
    });

    // 16 major architectural towers placed across depth layers
    const buildingSpecs = [
      // Foreground / Midground Left
      { x: -14, z: -16, w: 5, h: 22, d: 5, spire: true },
      { x: -22, z: -25, w: 7, h: 28, d: 7, dome: true },
      { x: -8, z: -22, w: 4, h: 18, d: 4 },
      { x: -32, z: -40, w: 10, h: 36, d: 9, spire: true },

      // Central Vista (Framed through the window)
      { x: 0, z: -35, w: 7, h: 32, d: 7, spire: true },
      { x: -4, z: -50, w: 9, h: 42, d: 9, dome: true },
      { x: 6, z: -45, w: 8, h: 38, d: 8, spire: true },
      { x: -2, z: -24, w: 3.5, h: 14, d: 3.5 },

      // Foreground / Midground Right
      { x: 12, z: -18, w: 5, h: 24, d: 5, spire: true },
      { x: 20, z: -28, w: 8, h: 30, d: 8, dome: true },
      { x: 28, z: -38, w: 11, h: 35, d: 11, spire: true },
      { x: 8, z: -26, w: 4.5, h: 19, d: 4.5 },

      // Far Background Megastructures
      { x: -18, z: -65, w: 14, h: 52, d: 14, spire: true },
      { x: 16, z: -70, w: 15, h: 56, d: 15, dome: true },
      { x: 35, z: -55, w: 12, h: 44, d: 12 },
      { x: -38, z: -60, w: 12, h: 46, d: 12 },
    ];

    buildingSpecs.forEach((spec) => {
      const bldgGroup = new THREE.Group();
      bldgGroup.position.set(spec.x, -6, spec.z);

      // Main tower body
      const tower = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), bldgMat);
      tower.position.y = spec.h / 2;
      bldgGroup.add(tower);
      this.buildings.push(tower);

      // Top spire or biodome
      if (spec.spire) {
        const spire = new THREE.Mesh(new THREE.ConeGeometry(spec.w * 0.45, spec.h * 0.35, 8), bldgMat);
        spire.position.y = spec.h + (spec.h * 0.35) / 2;
        bldgGroup.add(spire);
        this.buildings.push(spire);

        // Bioluminescent pinnacle beacon
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(spec.w * 0.12, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0x67e8f9 })
        );
        beacon.position.y = spec.h + spec.h * 0.35;
        bldgGroup.add(beacon);
      } else if (spec.dome) {
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(spec.w * 0.48, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          domeMat
        );
        dome.position.y = spec.h;
        bldgGroup.add(dome);
        this.buildings.push(dome);
      }

      this.group.add(bldgGroup);
    });

    // Elevated Illuminated Skybridges connecting towers
    const bridgeMat = new THREE.MeshStandardMaterial({
      color: 0x082f49,
      emissive: 0x0284c7,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    });

    const bridgeSpecs = [
      { start: [-14, 8, -16], end: [-8, 8, -22] },
      { start: [12, 10, -18], end: [8, 10, -26] },
      { start: [-4, 14, -50], end: [6, 14, -45] },
    ];

    bridgeSpecs.forEach(({ start, end }) => {
      const vStart = new THREE.Vector3(...start);
      const vEnd = new THREE.Vector3(...end);
      const distance = vStart.distanceTo(vEnd);
      const mid = new THREE.Vector3().addVectors(vStart, vEnd).multiplyScalar(0.5);

      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, distance), bridgeMat);
      bridge.position.copy(mid);
      bridge.lookAt(vEnd);
      this.group.add(bridge);
      this.buildings.push(bridge);
    });
  }

  private createGodRays() {
    // Volumetric cones representing light shafts through ocean surface
    const rayMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const rayCoords = [
      { x: -10, y: 16, z: -25, angleX: 0.2, angleZ: -0.15, scale: 1.2 },
      { x: 4, y: 18, z: -30, angleX: 0.15, angleZ: 0.1, scale: 1.4 },
      { x: 16, y: 17, z: -35, angleX: 0.25, angleZ: 0.2, scale: 1.1 },
      { x: -2, y: 20, z: -45, angleX: 0.1, angleZ: -0.05, scale: 1.6 },
    ];

    rayCoords.forEach((coord) => {
      const rayGeo = new THREE.ConeGeometry(5 * coord.scale, 34 * coord.scale, 16, 1, true);
      const rayMesh = new THREE.Mesh(rayGeo, rayMat);
      rayMesh.position.set(coord.x, coord.y, coord.z);
      rayMesh.rotation.set(Math.PI + coord.angleX, 0, coord.angleZ);
      this.group.add(rayMesh);
      this.godRays.push(rayMesh);
    });
  }

  public setVisibility(v: number) {
    this.visibility = Math.max(0, Math.min(1, v));
    this.group.visible = this.visibility > 0.01;

    // Fade god rays
    this.godRays.forEach((ray) => {
      (ray.material as THREE.MeshBasicMaterial).opacity = 0.14 * this.visibility;
    });

    // Fade particles
    (this.marineSnowParticles.material as THREE.PointsMaterial).opacity = 0.55 * this.visibility;
  }

  public getVisibility(): number {
    return this.visibility;
  }

  public update(delta: number, elapsed: number) {
    if (!this.group.visible) return;

    // Animate marine snow gently drifting downwards and waving
    const pos = this.marineSnowParticles.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const count = arr.length / 3;

    for (let i = 0; i < count; i++) {
      // Drift downwards
      arr[i * 3 + 1] -= delta * 0.45;
      // Gentle horizontal drift
      arr[i * 3] += Math.sin(elapsed * 0.6 + i) * 0.012;

      // Wrap around
      if (arr[i * 3 + 1] < -4) {
        arr[i * 3 + 1] = 26;
      }
    }
    pos.needsUpdate = true;

    // Subtle breathing shimmer on god rays
    this.godRays.forEach((ray, idx) => {
      const shimmer = Math.sin(elapsed * 0.8 + idx * 1.5) * 0.03;
      (ray.material as THREE.MeshBasicMaterial).opacity = (0.12 + shimmer) * this.visibility;
    });
  }
}

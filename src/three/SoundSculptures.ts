/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { soundEngine } from '../audio/SoundEngine';

export interface SculptureMeshInfo {
  type: 'raindrop' | 'harmonic_sphere' | 'string_sculpture' | 'ribbon';
  object: THREE.Object3D;
  rootGroup: THREE.Group;
  initialPos: THREE.Vector3;
}

export class SoundSculptures {
  public group: THREE.Group;
  public interactiveMeshes: THREE.Object3D[] = [];
  public sculptureMap = new Map<THREE.Object3D, SculptureMeshInfo>();

  // Object A: Raindrop
  public raindropGroup: THREE.Group;
  private raindropMesh!: THREE.Mesh;
  private raindropRipples: THREE.Mesh[] = [];
  private raindropRipplePhase = 0;
  private raindropActive = false;

  // Object B: Harmonic Sphere
  public harmonicSphereGroup: THREE.Group;
  private harmonicMesh!: THREE.Mesh;
  private harmonicCore!: THREE.Mesh;
  private harmonicRings!: THREE.Group;
  private harmonicColorHue = 0.55; // Cyan
  private harmonicActiveTimer = 0;

  // Object C: String Sculpture
  public stringSculptureGroup: THREE.Group;
  private stringLines: THREE.Line[] = [];
  private stringVibrationTime = 0;

  // Floating Musical Ribbons
  public ribbonsGroup: THREE.Group;
  private ribbonBands: { mesh: THREE.Mesh; note: number; lastTriggered: number }[] = [];

  private visibility = 0; // 0 in Moments 1-3, blends in at Moment 4
  private noteCounter = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'SoundSculptures';

    // 1. Create Object A — Raindrop
    this.raindropGroup = this.createRaindrop();
    this.group.add(this.raindropGroup);

    // 2. Create Object B — Harmonic Sphere
    this.harmonicSphereGroup = this.createHarmonicSphere();
    this.group.add(this.harmonicSphereGroup);

    // 3. Create Object C — String Sculpture
    this.stringSculptureGroup = this.createStringSculpture();
    this.group.add(this.stringSculptureGroup);

    // 4. Create Floating Musical Ribbons
    this.ribbonsGroup = this.createFloatingRibbons();
    this.group.add(this.ribbonsGroup);

    this.setVisibility(0);
  }

  private createRaindrop(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Sculpture_Raindrop';
    group.position.set(-1.6, 1.8, -0.6);

    // Teardrop / Crystal droplet geometry
    const dropGeo = new THREE.SphereGeometry(0.24, 32, 24);
    // Taper top into droplet apex
    const pos = dropGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) {
        const factor = 1.0 - (y / 0.24) * 0.45;
        pos.setX(i, pos.getX(i) * factor);
        pos.setZ(i, pos.getZ(i) * factor);
        pos.setY(i, y * 1.3);
      }
    }
    dropGeo.computeVertexNormals();

    const dropMat = new THREE.MeshPhysicalMaterial({
      color: 0x67e8f9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.75,
      roughness: 0.05,
      metalness: 0.15,
      clearcoat: 1.0,
      transmission: 0.4,
      ior: 1.45,
      depthWrite: false,
    });
    this.raindropMesh = new THREE.Mesh(dropGeo, dropMat);
    group.add(this.raindropMesh);

    // Floating ripple rings that expand when activated
    const rippleGeo = new THREE.RingGeometry(0.26, 0.29, 32);
    for (let r = 0; r < 3; r++) {
      const rippleMat = new THREE.MeshBasicMaterial({
        color: 0xa5f3fc,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(rippleGeo, rippleMat);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      this.raindropRipples.push(ring);
    }

    this.interactiveMeshes.push(this.raindropMesh);
    this.sculptureMap.set(this.raindropMesh, {
      type: 'raindrop',
      object: this.raindropMesh,
      rootGroup: group,
      initialPos: new THREE.Vector3(-1.6, 1.8, -0.6),
    });

    return group;
  }

  private createHarmonicSphere(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Sculpture_HarmonicSphere';
    group.position.set(0.0, 2.1, -1.2);

    // Outer Faceted Glass Sphere
    const sphereGeo = new THREE.IcosahedronGeometry(0.38, 3);
    const sphereMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0369a1,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.6,
      roughness: 0.1,
      metalness: 0.2,
      clearcoat: 1.0,
      depthWrite: false,
    });
    this.harmonicMesh = new THREE.Mesh(sphereGeo, sphereMat);
    group.add(this.harmonicMesh);

    // Inner glowing core
    const coreGeo = new THREE.SphereGeometry(0.18, 24, 24);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
    });
    this.harmonicCore = new THREE.Mesh(coreGeo, coreMat);
    group.add(this.harmonicCore);

    // Concentric Gyroscope Rings
    this.harmonicRings = new THREE.Group();
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      metalness: 0.8,
      roughness: 0.2,
    });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.012, 16, 48), ringMat);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.012, 16, 48), ringMat);
    ring2.rotation.x = Math.PI / 3;
    this.harmonicRings.add(ring1);
    this.harmonicRings.add(ring2);
    group.add(this.harmonicRings);

    this.interactiveMeshes.push(this.harmonicMesh);
    this.sculptureMap.set(this.harmonicMesh, {
      type: 'harmonic_sphere',
      object: this.harmonicMesh,
      rootGroup: group,
      initialPos: new THREE.Vector3(0.0, 2.1, -1.2),
    });

    return group;
  }

  private createStringSculpture(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Sculpture_StringSculpture';
    group.position.set(1.8, 1.9, -0.7);

    // Architectural curved harp frame
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      emissive: 0x0284c7,
      emissiveIntensity: 0.3,
      metalness: 0.7,
      roughness: 0.3,
    });

    // Elegant arch spine
    const spineCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.35, -0.4, 0),
      new THREE.Vector3(-0.45, 0.1, 0),
      new THREE.Vector3(0.0, 0.5, 0),
      new THREE.Vector3(0.45, 0.2, 0),
      new THREE.Vector3(0.35, -0.4, 0),
    ]);
    const spineGeo = new THREE.TubeGeometry(spineCurve, 32, 0.025, 12, false);
    const spineMesh = new THREE.Mesh(spineGeo, frameMat);
    group.add(spineMesh);

    // 6 vibrating luminescent string lines
    const stringMat = new THREE.LineBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.85,
    });

    for (let s = 0; s < 6; s++) {
      const x = -0.28 + s * 0.11;
      const points = [];
      for (let p = 0; p <= 10; p++) {
        const y = -0.38 + (p / 10) * 0.75;
        points.push(new THREE.Vector3(x, y, 0));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geo, stringMat);
      group.add(line);
      this.stringLines.push(line);
    }

    // Hit collider box
    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.9, 0.3),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    group.add(hitBox);

    this.interactiveMeshes.push(hitBox);
    this.sculptureMap.set(hitBox, {
      type: 'string_sculpture',
      object: hitBox,
      rootGroup: group,
      initialPos: new THREE.Vector3(1.8, 1.9, -0.7),
    });

    return group;
  }

  private createFloatingRibbons(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'FloatingRibbons';

    // 3 curved ribbon arcs in the mid-air
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const ribbonPaths = [
      { start: [-3.2, 1.6, -1.5], mid: [-1.2, 2.5, -2.0], end: [0.8, 1.7, -1.8], note: 4 },
      { start: [-1.5, 2.2, -1.0], mid: [0.5, 2.7, -1.2], end: [2.5, 2.0, -1.5], note: 6 },
      { start: [0.0, 1.5, 0.2], mid: [1.8, 2.3, -0.5], end: [3.2, 1.6, -1.0], note: 8 },
    ];

    ribbonPaths.forEach((r, idx) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(...r.start),
        new THREE.Vector3(...r.mid),
        new THREE.Vector3(...r.end),
      ]);
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.045, 8, false);
      const mesh = new THREE.Mesh(tubeGeo, ribbonMat);
      group.add(mesh);

      this.interactiveMeshes.push(mesh);
      this.ribbonBands.push({
        mesh,
        note: r.note,
        lastTriggered: 0,
      });

      this.sculptureMap.set(mesh, {
        type: 'ribbon',
        object: mesh,
        rootGroup: group,
        initialPos: new THREE.Vector3(...r.mid),
      });
    });

    return group;
  }

  public triggerSculpture(mesh: THREE.Object3D): 'raindrop' | 'harmonic_sphere' | 'string_sculpture' | 'ribbon' | null {
    const info = this.sculptureMap.get(mesh);
    if (!info) return null;

    this.noteCounter++;

    if (info.type === 'raindrop') {
      soundEngine.playRaindrop(this.noteCounter);
      this.raindropActive = true;
      this.raindropRipplePhase = 0;
      (this.raindropMesh.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 1.6;
      return 'raindrop';
    }

    if (info.type === 'harmonic_sphere') {
      soundEngine.playHarmonicSphere(this.noteCounter);
      this.harmonicActiveTimer = 1.0;
      this.harmonicColorHue = (this.harmonicColorHue + 0.18) % 1.0;
      const newColor = new THREE.Color().setHSL(this.harmonicColorHue, 0.9, 0.65);
      (this.harmonicCore.material as THREE.MeshBasicMaterial).color.copy(newColor);
      (this.harmonicMesh.material as THREE.MeshPhysicalMaterial).emissive.copy(newColor);
      (this.harmonicMesh.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 1.4;
      return 'harmonic_sphere';
    }

    if (info.type === 'string_sculpture') {
      soundEngine.playStringSculpture(this.noteCounter);
      this.stringVibrationTime = 1.2;
      return 'string_sculpture';
    }

    if (info.type === 'ribbon') {
      soundEngine.playRibbonGleam(this.noteCounter);
      return 'ribbon';
    }

    return null;
  }

  public checkRibbonProximity(rayPos: THREE.Vector3, nowMs: number) {
    for (const ribbon of this.ribbonBands) {
      if (nowMs - ribbon.lastTriggered < 350) continue;
      const dist = ribbon.mesh.position.distanceTo(rayPos);
      if (dist < 1.5) {
        ribbon.lastTriggered = nowMs;
        soundEngine.playRibbonGleam(ribbon.note);
      }
    }
  }

  public checkSculpturesProximityChord() {
    // Check distance between Raindrop and Harmonic Sphere, or Harmonic Sphere and String Sculpture
    const distAB = this.raindropGroup.position.distanceTo(this.harmonicSphereGroup.position);
    const distBC = this.harmonicSphereGroup.position.distanceTo(this.stringSculptureGroup.position);

    if (distAB < 0.9 || distBC < 0.9) {
      soundEngine.playHarmonicChord();
      return true;
    }
    return false;
  }

  public setVisibility(v: number) {
    this.visibility = Math.max(0, Math.min(1, v));
    this.group.visible = this.visibility > 0.02;

    const scale = Math.max(0.001, this.visibility);
    this.raindropGroup.scale.set(scale, scale, scale);
    this.harmonicSphereGroup.scale.set(scale, scale, scale);
    this.stringSculptureGroup.scale.set(scale, scale, scale);
    this.ribbonsGroup.scale.set(scale, scale, scale);
  }

  public update(delta: number, elapsed: number) {
    if (!this.group.visible) return;

    // Subtle gentle organic levitation bobbing
    this.raindropGroup.position.y = 1.8 + Math.sin(elapsed * 1.4) * 0.08;
    this.harmonicSphereGroup.position.y = 2.1 + Math.sin(elapsed * 1.1 + 1.2) * 0.06;
    this.stringSculptureGroup.position.y = 1.9 + Math.sin(elapsed * 1.3 + 2.5) * 0.07;

    // Raindrop ripple expansion
    if (this.raindropActive) {
      this.raindropRipplePhase += delta * 2.8;
      this.raindropRipples.forEach((ring, idx) => {
        const ringProgress = (this.raindropRipplePhase - idx * 0.25);
        if (ringProgress > 0 && ringProgress < 1) {
          const s = 1.0 + ringProgress * 2.5;
          ring.scale.set(s, s, 1);
          (ring.material as THREE.MeshBasicMaterial).opacity = (1 - ringProgress) * 0.7;
        } else {
          (ring.material as THREE.MeshBasicMaterial).opacity = 0;
        }
      });

      const dropMat = this.raindropMesh.material as THREE.MeshPhysicalMaterial;
      dropMat.emissiveIntensity = THREE.MathUtils.damp(dropMat.emissiveIntensity, 0.5, 3.0, delta);

      if (this.raindropRipplePhase > 2.0) {
        this.raindropActive = false;
      }
    }

    // Harmonic sphere rotations & glow decay
    this.harmonicRings.rotation.y += delta * 0.6;
    this.harmonicRings.rotation.x += delta * 0.4;
    this.harmonicMesh.rotation.y += delta * 0.2;

    if (this.harmonicActiveTimer > 0) {
      this.harmonicActiveTimer -= delta;
      const sphereMat = this.harmonicMesh.material as THREE.MeshPhysicalMaterial;
      sphereMat.emissiveIntensity = THREE.MathUtils.damp(sphereMat.emissiveIntensity, 0.6, 2.5, delta);
    }

    // String sculpture standing wave vibration
    if (this.stringVibrationTime > 0) {
      this.stringVibrationTime -= delta;
      for (let s = 0; s < this.stringLines.length; s++) {
        const line = this.stringLines[s];
        const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const xBase = -0.28 + s * 0.11;

        for (let p = 0; p <= 10; p++) {
          const wave = Math.sin((p / 10) * Math.PI) * Math.sin(elapsed * 45 + s) * 0.03 * (this.stringVibrationTime);
          arr[p * 3] = xBase + wave;
        }
        posAttr.needsUpdate = true;
      }
    }
  }
}

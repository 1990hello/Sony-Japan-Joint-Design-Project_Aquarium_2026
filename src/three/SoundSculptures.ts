/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { soundEngine } from '../audio/SoundEngine';
import { ExperienceMoment } from '../types';

export type SculptureType = 'raindrop' | 'harmonic_sphere' | 'string_sculpture';

export interface SculptureMeshInfo {
  type: SculptureType;
  object: THREE.Object3D;
  rootGroup: THREE.Group;
  initialPos: THREE.Vector3;
}

interface InstrumentState {
  type: SculptureType;
  group: THREE.Group;
  basePos: THREE.Vector3;
  currentPos: THREE.Vector3;
  isEngaged: boolean;
  inactivityTimer: number; // Counts down from 10.0s when engaged but not interacted with
  isDriftingAway: boolean;
  driftAwayProgress: number; // 0 to 1
  arrivalDelay: number; // Delay in seconds after the 10s observation period (State 3)
  arrivalProgress: number; // 0 to 1
  visibility: number; // 0 to 1
  driftPhase: number;
}

export class SoundSculptures {
  public group: THREE.Group;
  public interactiveMeshes: THREE.Object3D[] = [];
  public sculptureMap = new Map<THREE.Object3D, SculptureMeshInfo>();

  // Object 1: Teardrop-shaped instrument (Raindrop)
  public raindropGroup: THREE.Group;
  private raindropMesh!: THREE.Mesh;
  private raindropRipples: THREE.Mesh[] = [];
  private raindropRipplePhase = 0;
  private raindropActive = false;

  // Object 2: Orb-like instrument (Harmonic Sphere)
  public harmonicSphereGroup: THREE.Group;
  private harmonicMesh!: THREE.Mesh;
  private harmonicCore!: THREE.Mesh;
  private harmonicRings!: THREE.Group;
  private harmonicColorHue = 0.55; // Cyan
  private harmonicActiveTimer = 0;

  // Object 3: String instrument (String Sculpture)
  public stringSculptureGroup: THREE.Group;
  private stringLines: THREE.Line[] = [];
  private stringVibrationTime = 0;

  // Instrument state controllers (Three instruments only)
  private instruments: Map<SculptureType, InstrumentState> = new Map();

  // Experience Flow State Controllers
  private currentMoment: ExperienceMoment = 1;
  private state3ObservationTimer = 0; // Tracks the 10-second instrument-free observation in State 3
  private state3AllArrived = false;

  // State 5: Passive Daydreaming occasional passing instrument invitation prototype
  private state5Timer = 0;
  private state5PassingActive = false;
  private state5PassingType: SculptureType | null = null;
  private state5PassingProgress = 0;

  private noteCounter = 0;

  // Callback to inform SceneManager to advance from State 3 -> 4, or State 5 -> 4
  public onStateTransitionRequested?: (targetMoment: ExperienceMoment) => void;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'SoundSculptures';

    // 1. Create Teardrop-shaped instrument
    this.raindropGroup = this.createRaindrop();
    this.group.add(this.raindropGroup);

    // 2. Create Orb-like instrument
    this.harmonicSphereGroup = this.createHarmonicSphere();
    this.group.add(this.harmonicSphereGroup);

    // 3. Create String instrument
    this.stringSculptureGroup = this.createStringSculpture();
    this.group.add(this.stringSculptureGroup);

    // Initial state definitions for all 3 instruments
    this.initInstrumentStates();

    this.setVisibility(0);
  }

  private initInstrumentStates() {
    // Teardrop: floating left-center
    this.instruments.set('raindrop', {
      type: 'raindrop',
      group: this.raindropGroup,
      basePos: new THREE.Vector3(-1.8, 1.85, -0.8),
      currentPos: new THREE.Vector3(-1.8, 1.85, -0.8),
      isEngaged: false,
      inactivityTimer: 10.0,
      isDriftingAway: false,
      driftAwayProgress: 0,
      arrivalDelay: 0.0, // First instrument to arrive after 10s observation
      arrivalProgress: 0,
      visibility: 0,
      driftPhase: 0.2,
    });

    // Orb: floating center-top
    this.instruments.set('harmonic_sphere', {
      type: 'harmonic_sphere',
      group: this.harmonicSphereGroup,
      basePos: new THREE.Vector3(0.0, 2.05, -1.3),
      currentPos: new THREE.Vector3(0.0, 2.05, -1.3),
      isEngaged: false,
      inactivityTimer: 10.0,
      isDriftingAway: false,
      driftAwayProgress: 0,
      arrivalDelay: 2.4, // Follows ~2.4s later
      arrivalProgress: 0,
      visibility: 0,
      driftPhase: 1.8,
    });

    // String: floating right-center
    this.instruments.set('string_sculpture', {
      type: 'string_sculpture',
      group: this.stringSculptureGroup,
      basePos: new THREE.Vector3(1.8, 1.85, -0.8),
      currentPos: new THREE.Vector3(1.8, 1.85, -0.8),
      isEngaged: false,
      inactivityTimer: 10.0,
      isDriftingAway: false,
      driftAwayProgress: 0,
      arrivalDelay: 4.8, // Follows ~2.4s after the orb
      arrivalProgress: 0,
      visibility: 0,
      driftPhase: 3.4,
    });
  }

  // --- 1. Teardrop-Shaped Instrument ---
  private createRaindrop(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Sculpture_Raindrop';
    group.position.set(-1.8, 1.85, -0.8);

    const dropGeo = new THREE.SphereGeometry(0.25, 32, 24);
    const pos = dropGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) {
        const factor = 1.0 - (y / 0.25) * 0.45;
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
    const rippleGeo = new THREE.RingGeometry(0.28, 0.31, 32);
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
      initialPos: new THREE.Vector3(-1.8, 1.85, -0.8),
    });

    return group;
  }

  // --- 2. Orb-Like Instrument ---
  private createHarmonicSphere(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Sculpture_HarmonicSphere';
    group.position.set(0.0, 2.05, -1.3);

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
      initialPos: new THREE.Vector3(0.0, 2.05, -1.3),
    });

    return group;
  }

  // --- 3. String Instrument ---
  private createStringSculpture(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Sculpture_StringSculpture';
    group.position.set(1.8, 1.85, -0.8);

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

    // Generous hit collider box for easy pinch selection
    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.95, 0.35),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    group.add(hitBox);

    this.interactiveMeshes.push(hitBox);
    this.sculptureMap.set(hitBox, {
      type: 'string_sculpture',
      object: hitBox,
      rootGroup: group,
      initialPos: new THREE.Vector3(1.8, 1.85, -0.8),
    });

    return group;
  }

  // --- Interaction Handler ---
  public triggerSculpture(mesh: THREE.Object3D): SculptureType | null {
    const info = this.sculptureMap.get(mesh);
    if (!info) return null;

    this.noteCounter++;
    const state = this.instruments.get(info.type);

    // If user pinches an instrument in State 5 (Passive Daydreaming):
    // Pause it, move it closer, and initiate seamless transition back into State 4!
    if (this.currentMoment === 5) {
      if (state) {
        state.isEngaged = true;
        state.inactivityTimer = 10.0;
        state.isDriftingAway = false;
        state.driftAwayProgress = 0;
      }
      this.state5PassingActive = false;
      // Request transition to State 4
      if (this.onStateTransitionRequested) {
        this.onStateTransitionRequested(4);
      }
    } else if (state) {
      // In State 4: mark as engaged, reset individual 10-second inactivity timer
      state.isEngaged = true;
      state.inactivityTimer = 10.0;
      state.isDriftingAway = false;
      state.driftAwayProgress = 0;
    }

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

    return null;
  }

  // --- Combination Proximity Chord ---
  public checkSculpturesProximityChord() {
    const distAB = this.raindropGroup.position.distanceTo(this.harmonicSphereGroup.position);
    const distBC = this.harmonicSphereGroup.position.distanceTo(this.stringSculptureGroup.position);

    if (distAB < 1.1 || distBC < 1.1) {
      soundEngine.playHarmonicChord();
      return true;
    }
    return false;
  }

  // --- State Transition Controller ---
  public setMoment(moment: ExperienceMoment) {
    this.currentMoment = moment;

    if (moment === 1 || moment === 2) {
      this.setVisibility(0);
      this.state3ObservationTimer = 0;
      this.state3AllArrived = false;
      this.state5PassingActive = false;
    } else if (moment === 3) {
      // State 3: Underwater Observation
      // Initial state: NO instruments visible for the first 10 seconds!
      this.state3ObservationTimer = 0;
      this.state3AllArrived = false;
      this.state5PassingActive = false;
      this.instruments.forEach((inst) => {
        inst.visibility = 0;
        inst.arrivalProgress = 0;
        inst.isEngaged = false;
        inst.isDriftingAway = false;
      });
      this.setVisibility(0);
    } else if (moment === 4) {
      // State 4: Musical Interaction
      // Ensure all 3 instruments are present and active
      this.state5PassingActive = false;
      this.instruments.forEach((inst) => {
        inst.visibility = 1.0;
        inst.arrivalProgress = 1.0;
        inst.isDriftingAway = false;
        inst.driftAwayProgress = 0;
        inst.inactivityTimer = 10.0;
      });
      this.setVisibility(1.0);
    } else if (moment === 5) {
      // State 5: Passive Daydreaming
      // Instruments are no longer actively arranged for continuous playing
      this.state5Timer = 8.0; // Initial calm pause before occasional passing invitation
      this.state5PassingActive = false;
      this.instruments.forEach((inst) => {
        inst.isEngaged = false;
        inst.isDriftingAway = true;
      });
    }
  }

  public setVisibility(v: number) {
    const val = Math.max(0, Math.min(1, v));
    this.group.visible = val > 0.01;
    const scale = Math.max(0.001, val);
    this.raindropGroup.scale.set(scale, scale, scale);
    this.harmonicSphereGroup.scale.set(scale, scale, scale);
    this.stringSculptureGroup.scale.set(scale, scale, scale);
  }

  // Reset an instrument position to base if dragged
  public resetInstrumentPosition(type: SculptureType) {
    const inst = this.instruments.get(type);
    if (inst) {
      inst.currentPos.copy(inst.basePos);
      inst.group.position.copy(inst.basePos);
    }
  }

  // --- Main Update Loop ---
  public update(delta: number, elapsed: number) {
    // 1. STATE 3: 10-Second Instrument-Free Observation Period & Staggered Arrival
    if (this.currentMoment === 3) {
      this.state3ObservationTimer += delta;

      if (this.state3ObservationTimer < 10.0) {
        // Keep completely instrument-free for the first 10 seconds of State 3
        this.setVisibility(0);
        return;
      } else {
        // After 10s: instruments float in gradually with staggered delays
        this.group.visible = true;
        const timeSince10s = this.state3ObservationTimer - 10.0;
        let allIn = true;

        this.instruments.forEach((inst) => {
          if (timeSince10s >= inst.arrivalDelay) {
            inst.arrivalProgress = Math.min(1.0, inst.arrivalProgress + delta * 0.45); // ~2.2s glide in
            inst.visibility = THREE.MathUtils.damp(inst.visibility, 1.0, 2.0, delta);

            // Interpolate position from deep water (z = -5.5) forward to base position
            const depthStart = inst.basePos.z - 4.5;
            const curZ = THREE.MathUtils.lerp(depthStart, inst.basePos.z, inst.arrivalProgress);
            inst.currentPos.z = curZ;

            const scale = Math.max(0.001, inst.visibility);
            inst.group.scale.set(scale, scale, scale);
          } else {
            inst.visibility = 0;
            inst.group.scale.set(0.001, 0.001, 0.001);
            allIn = false;
          }

          if (inst.arrivalProgress < 0.98) {
            allIn = false;
          }
        });

        // Once all 3 instruments have smoothly entered, automatically advance to State 4
        if (allIn && !this.state3AllArrived && timeSince10s > 8.0) {
          this.state3AllArrived = true;
          if (this.onStateTransitionRequested) {
            this.onStateTransitionRequested(4);
          }
        }
      }
    }

    // 2. STATE 5: Occasional Passing Instrument Invitation Prototype
    if (this.currentMoment === 5) {
      this.state5Timer += delta;

      // Every 25-30 seconds, choose one instrument to float past
      if (!this.state5PassingActive && this.state5Timer >= 26.0) {
        this.state5Timer = 0;
        this.state5PassingActive = true;
        this.state5PassingProgress = 0;
        const types: SculptureType[] = ['raindrop', 'harmonic_sphere', 'string_sculpture'];
        this.state5PassingType = types[Math.floor(Math.random() * types.length)];
      }

      if (this.state5PassingActive && this.state5PassingType) {
        this.state5PassingProgress += delta * 0.08; // ~12 second tranquil crossing
        const inst = this.instruments.get(this.state5PassingType);
        if (inst) {
          this.group.visible = true;
          // Smooth drift from left to right across field of view
          const t = this.state5PassingProgress;
          const posX = THREE.MathUtils.lerp(-4.2, 4.2, t);
          const posY = 1.8 + Math.sin(t * Math.PI) * 0.25;
          const posZ = -1.6 + Math.sin(t * Math.PI) * 0.4;
          inst.group.position.set(posX, posY, posZ);

          // Fade in at start, fade out at end
          const alpha = Math.sin(t * Math.PI);
          inst.visibility = alpha;
          const scale = Math.max(0.001, alpha);
          inst.group.scale.set(scale, scale, scale);

          if (this.state5PassingProgress >= 1.0) {
            // User ignored the passing instrument: continues drifting away, user remains in State 5
            this.state5PassingActive = false;
            this.state5PassingType = null;
            inst.group.scale.set(0.001, 0.001, 0.001);
          }
        }
      }
    }

    // 3. Natural Gentle Floating & 10-Second Inactivity Drift Management
    if (this.currentMoment >= 3 && this.group.visible) {
      this.instruments.forEach((inst) => {
        // Skip position override if this instrument is currently the State 5 passing invitation
        if (this.currentMoment === 5 && this.state5PassingActive && this.state5PassingType === inst.type) {
          return;
        }

        // Handle 10-Second Inactivity Timer per instrument in State 4
        if (this.currentMoment === 4) {
          if (inst.isEngaged) {
            inst.inactivityTimer -= delta;
            if (inst.inactivityTimer <= 0) {
              // 10 seconds of inactivity reached: gently release and drift away
              inst.isEngaged = false;
              inst.isDriftingAway = true;
              inst.driftAwayProgress = 0;
            }
          }

          if (inst.isDriftingAway) {
            inst.driftAwayProgress = Math.min(1.0, inst.driftAwayProgress + delta * 0.25); // ~4.0s departure
            const retreatZ = inst.basePos.z - inst.driftAwayProgress * 3.5;
            inst.currentPos.z = THREE.MathUtils.damp(inst.currentPos.z, retreatZ, 1.8, delta);
            inst.visibility = THREE.MathUtils.damp(inst.visibility, Math.max(0.05, 1.0 - inst.driftAwayProgress * 0.8), 1.8, delta);
            const scale = Math.max(0.001, inst.visibility);
            inst.group.scale.set(scale, scale, scale);
          } else {
            // Not drifting away: keep comfortable scale
            inst.visibility = THREE.MathUtils.damp(inst.visibility, 1.0, 2.5, delta);
            const scale = Math.max(0.001, inst.visibility);
            inst.group.scale.set(scale, scale, scale);
          }
        }

        // Natural, unhurried water drift (Lissajous organic float)
        if (!inst.isEngaged && this.currentMoment !== 5) {
          const t = elapsed + inst.driftPhase;
          const floatX = Math.sin(t * 0.35) * 0.28;
          const floatY = Math.sin(t * 0.5) * 0.12;
          const floatZ = Math.cos(t * 0.3) * 0.25;

          inst.group.position.x = inst.basePos.x + floatX;
          inst.group.position.y = inst.basePos.y + floatY;
          if (!inst.isDriftingAway && inst.arrivalProgress >= 0.99) {
            inst.group.position.z = inst.basePos.z + floatZ;
          }
        }
      });
    }

    // 4. Update Internal Visual Feedback Effects for the 3 Instruments
    // Raindrop ripple expansion
    if (this.raindropActive) {
      this.raindropRipplePhase += delta * 2.8;
      this.raindropRipples.forEach((ring, idx) => {
        const ringProgress = this.raindropRipplePhase - idx * 0.25;
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
          const wave =
            Math.sin((p / 10) * Math.PI) *
            Math.sin(elapsed * 45 + s) *
            0.03 *
            this.stringVibrationTime;
          arr[p * 3] = xBase + wave;
        }
        posAttr.needsUpdate = true;
      }
    }
  }
}

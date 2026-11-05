/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { soundEngine } from '../audio/SoundEngine';
import { ExperienceMoment } from '../types';

export type FishPersonality = 'curious' | 'shy' | 'playful' | 'social';

export const FISH_FOLLOW_DURATION = 10.0; // Strictly 10 seconds of following cursor
export const FISH_DEPARTURE_DURATION = 4.0; // 3 to 5 seconds gradual return transition
export const FISH_TOTAL_INTERACTION_DURATION = FISH_FOLLOW_DURATION + FISH_DEPARTURE_DURATION; // 14.0s

export interface FishEntity {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  tailMesh: THREE.Mesh;
  accentMesh: THREE.Mesh;
  hitProxyMesh?: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
  speed: number;
  normalSpeed: number;
  swimCycle: number;
  inRoom: boolean; // allowed inside living room boundary
  isEmergentFish: boolean; // fish that emerges from the orb during State 2
  personality: FishPersonality;

  // Level 2 Click-to-Select & 10-Second Follow System
  isSelected: boolean;
  followTimer: number; // Elapsed time in seconds since click (0 to 14.0s)
  cursorTarget: THREE.Vector3; // 3D world position of cursor
  departureTarget: THREE.Vector3; // Waypoint picked at 10.0s for unhurried departure
  departureInitialized: boolean;
  pauseTimer: number; // Brief graceful deceleration when clicked

  circleAngle: number;
  circleRadius: number;
  circleSpeed: number;
  circleDir: number; // 1 or -1
  driftTimer: number; // For calm, occasional slow drifting/pausing
  noteTimer: number; // Cadence timer for spawning musical notes while following
}

interface JellyfishEntity {
  group: THREE.Group;
  bellMesh: THREE.Mesh;
  coreGlow: THREE.Mesh;
  tentacles: THREE.Line[];
  tentacleNodes: THREE.Vector3[][];
  pulsePhase: number;
  pulseSpeed: number;
  driftDir: THREE.Vector3;
  baseY: number;
}

interface BubbleEntity {
  mesh: THREE.Mesh;
  baseSpeed: number;
  wobbleSpeed: number;
  wobbleAmt: number;
  phase: number;
  popped: boolean;
  minY: number;
  maxY: number;
  spawnBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

interface SelectionRipple {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  active: boolean;
}

interface MusicalNoteEntity {
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  life: number;
  maxLife: number;
  driftVel: THREE.Vector3;
  wobblePhase: number;
}

interface VisualPopBubbleEntity {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  life: number;
  maxLife: number;
  vel: THREE.Vector3;
}

export class MarineLife {
  public group: THREE.Group;
  public fishList: FishEntity[] = [];
  public jellyfishList: JellyfishEntity[] = [];
  public bubbleList: BubbleEntity[] = [];
  public bubbleMeshGroup: THREE.Group;
  public leviathanGroup: THREE.Group;
  
  // Interactive fish raycasting & selection ripples
  public fishClickableMeshes: THREE.Object3D[] = [];
  public fishRaycastMap = new Map<THREE.Object3D, FishEntity>();
  private ripplePool: SelectionRipple[] = [];
  private rippleGroup: THREE.Group;

  // Musical note trail behind selected fish
  private musicalNotesGroup: THREE.Group;
  private musicalNotePool: MusicalNoteEntity[] = [];
  private noteSequenceIndex = 0;

  // Visual bubble clusters spawned when normal bubbles pop
  private popBubblesGroup: THREE.Group;
  private popBubblesPool: VisualPopBubbleEntity[] = [];
  
  private roomPermeability = 0; // 0: confined to ocean / window; 1: swims freely inside the living room
  private leviathanPos = new THREE.Vector3(-45, 12, -40);
  private leviathanTarget = new THREE.Vector3(45, 14, -40);
  private leviathanActive = false;
  private leviathanTimer = 8; // triggers periodic majestic crossings

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'MarineLife';

    this.bubbleMeshGroup = new THREE.Group();
    this.bubbleMeshGroup.name = 'Bubbles';
    this.group.add(this.bubbleMeshGroup);

    this.rippleGroup = new THREE.Group();
    this.rippleGroup.name = 'SelectionRipples';
    this.group.add(this.rippleGroup);
    this.initRipplePool();

    // Visual pop bubble clusters (purely visual, fixed size 0.65, non-interactive)
    this.popBubblesGroup = new THREE.Group();
    this.popBubblesGroup.name = 'PopBubbleClusters';
    this.group.add(this.popBubblesGroup);
    this.initPopBubblesPool();

    // Musical note trail system for actively selected fish
    this.musicalNotesGroup = new THREE.Group();
    this.musicalNotesGroup.name = 'MusicalNotesTrail';
    this.group.add(this.musicalNotesGroup);
    this.initMusicalNotePool();

    // 1. Create Schools of Bioluminescent Fish
    this.createFishSchool();

    // 2. Create Translucent Bioluminescent Jellyfish
    this.createJellyfish();

    // 3. Create Rising Interactive Bubbles
    this.createBubbles();

    // 4. Create Giant Leviathan
    this.leviathanGroup = this.createGiantLeviathan();
    this.group.add(this.leviathanGroup);
  }

  private initRipplePool() {
    const poolSize = 8;
    const ringGeo = new THREE.RingGeometry(0.06, 0.14, 32);
    for (let i = 0; i < poolSize; i++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(ringGeo, ringMat);
      mesh.visible = false;
      this.rippleGroup.add(mesh);
      this.ripplePool.push({
        mesh,
        life: 0,
        maxLife: 0.9,
        active: false,
      });
    }
  }

  public spawnSelectionRipple(pos: THREE.Vector3) {
    const item = this.ripplePool.find((r) => !r.active) || this.ripplePool[0];
    item.active = true;
    item.life = 0;
    item.mesh.position.copy(pos);
    item.mesh.scale.set(0.4, 0.4, 0.4);
    item.mesh.rotation.set(0, 0, Math.random() * Math.PI);
    (item.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
    item.mesh.visible = true;
  }

  // --- 5. Visual Pop Bubble Cluster (Fixed size 0.65, purely visual, non-interactive) ---
  private initPopBubblesPool() {
    const poolSize = 35;
    const miniGeo = new THREE.SphereGeometry(0.05, 12, 12);
    for (let i = 0; i < poolSize; i++) {
      const bubbleMat = new THREE.MeshBasicMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(miniGeo, bubbleMat);
      // Fixed size of 0.65 as strictly required by specification
      mesh.scale.set(0.65, 0.65, 0.65);
      mesh.visible = false;
      this.popBubblesGroup.add(mesh);

      this.popBubblesPool.push({
        mesh,
        material: bubbleMat,
        active: false,
        life: 0,
        maxLife: 1.8,
        vel: new THREE.Vector3(),
      });
    }
  }

  public spawnPopBubbleCluster(origin: THREE.Vector3) {
    const clusterCount = 5;
    let spawned = 0;

    for (const b of this.popBubblesPool) {
      if (b.active) continue;
      b.active = true;
      b.life = 0;
      b.maxLife = 1.6 + Math.random() * 0.4; // 1.6 to 2.0s
      b.mesh.position.copy(origin).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.08,
        (Math.random() - 0.5) * 0.08,
        (Math.random() - 0.5) * 0.08
      ));
      // Strictly maintain required fixed size of 0.65
      b.mesh.scale.set(0.65, 0.65, 0.65);
      b.material.opacity = 0.65;
      b.vel.set(
        (Math.random() - 0.5) * 0.35,
        0.18 + Math.random() * 0.22, // Gentle upward drift
        (Math.random() - 0.5) * 0.35
      );
      b.mesh.visible = true;

      spawned++;
      if (spawned >= clusterCount) break;
    }
  }

  // --- 2. Musical Note Trail System (Spawned only behind actively selected fish) ---
  private initMusicalNotePool() {
    const poolSize = 25;
    for (let i = 0; i < poolSize; i++) {
      const noteGroup = new THREE.Group();
      const noteMat = new THREE.MeshBasicMaterial({
        color: 0xa5f3fc,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      // 1. Note head: angled oval disc
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), noteMat);
      head.scale.set(1.25, 0.85, 0.4);
      head.rotation.z = 0.35;
      noteGroup.add(head);

      // 2. Note stem
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.18, 8), noteMat);
      stem.position.set(0.048, 0.09, 0);
      noteGroup.add(stem);

      // 3. Note flag
      const flag = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 6, 12, Math.PI / 1.5), noteMat);
      flag.position.set(0.052, 0.165, 0);
      flag.rotation.z = -0.3;
      noteGroup.add(flag);

      noteGroup.visible = false;
      this.musicalNotesGroup.add(noteGroup);

      this.musicalNotePool.push({
        group: noteGroup,
        material: noteMat,
        active: false,
        life: 0,
        maxLife: 2.0,
        driftVel: new THREE.Vector3(),
        wobblePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  public spawnMusicalNote(fishPos: THREE.Vector3, fishVel: THREE.Vector3) {
    const item = this.musicalNotePool.find((n) => !n.active);
    if (!item) return;

    item.active = true;
    item.life = 0;
    item.maxLife = 2.0;

    // Position note slightly behind fish along swimming path
    const backOffset = fishVel.lengthSq() > 0.0001
      ? fishVel.clone().normalize().multiplyScalar(0.24)
      : new THREE.Vector3(0, 0, 0.24);

    item.group.position.copy(fishPos).sub(backOffset);
    item.group.position.y += (Math.random() - 0.5) * 0.06;
    item.group.position.x += (Math.random() - 0.5) * 0.06;

    item.driftVel.set(
      (Math.random() - 0.5) * 0.05,
      0.15 + Math.random() * 0.08, // Serene upward acoustic float
      (Math.random() - 0.5) * 0.05
    );
    item.wobblePhase = Math.random() * Math.PI * 2;

    item.group.scale.set(0.7, 0.7, 0.7);
    item.group.rotation.set(0, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.25);
    item.material.opacity = 0.85;
    item.group.visible = true;
  }

  private createFishSchool() {
    // Noticeably reduced fish population (approx 46% reduction: 15 fish total)
    // 7 in living room (spaced widely apart), 8 outside panoramic window across underwater city
    const fishCount = 15;
    const fishBodyGeo = new THREE.ConeGeometry(0.12, 0.45, 6);
    fishBodyGeo.rotateX(Math.PI / 2);

    const fishTailGeo = new THREE.BufferGeometry();
    const tailVertices = new Float32Array([
      0, 0, 0,
      -0.08, 0.15, -0.22,
      0.08, 0.15, -0.22,
    ]);
    fishTailGeo.setAttribute('position', new THREE.BufferAttribute(tailVertices, 3));
    fishTailGeo.computeVertexNormals();

    const personalities: FishPersonality[] = ['curious', 'shy', 'playful', 'social'];

    for (let i = 0; i < fishCount; i++) {
      const personality = personalities[i % personalities.length];
      const fishGroup = new THREE.Group();
      fishGroup.name = `Fish_${personality}_${i}`;

      // Subtle aesthetic variation according to personality
      let bodyColor = 0x38bdf8;
      let emissiveColor = 0x0284c7;
      let accentColor = 0x67e8f9;

      // Substantially reduced base speed (~55-65% reduction for very slow, serene gliding)
      let baseSpeed = 0.48;

      if (personality === 'curious') {
        bodyColor = 0x38bdf8;
        emissiveColor = 0x0284c7;
        accentColor = 0xa5f3fc; // bright inquisitive cyan-white
        baseSpeed = 0.52;
      } else if (personality === 'shy') {
        bodyColor = 0x2dd4bf; // ethereal emerald-teal
        emissiveColor = 0x0f766e;
        accentColor = 0x99f6e4;
        baseSpeed = 0.42;
      } else if (personality === 'playful') {
        bodyColor = 0x0ea5e9; // electric ocean blue
        emissiveColor = 0x0369a1;
        accentColor = 0x7dd3fc;
        baseSpeed = 0.58;
      } else if (personality === 'social') {
        bodyColor = 0x38bdf8;
        emissiveColor = 0x0284c7;
        accentColor = 0xfde047; // subtle warm golden-bioluminescent flecks
        baseSpeed = 0.46;
      }

      const fishMat = new THREE.MeshPhysicalMaterial({
        color: bodyColor,
        emissive: emissiveColor,
        emissiveIntensity: 0.55,
        roughness: 0.2,
        metalness: 0.3,
        clearcoat: 0.8,
      });

      const tailMat = new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      });

      const bodyMesh = new THREE.Mesh(fishBodyGeo, fishMat);
      fishGroup.add(bodyMesh);

      // Sinuous tail hinge
      const tailMesh = new THREE.Mesh(fishTailGeo, tailMat);
      tailMesh.position.set(0, 0, -0.2);
      fishGroup.add(tailMesh);

      // Subtle bioluminescent accent stripe
      const accentGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.25, 4);
      accentGeo.rotateX(Math.PI / 2);
      const accentMesh = new THREE.Mesh(
        accentGeo,
        new THREE.MeshBasicMaterial({ color: accentColor })
      );
      accentMesh.position.set(0, 0.04, 0.02);
      fishGroup.add(accentMesh);

      // Scales & initial placements
      const scale = 0.55 + Math.random() * 0.45;
      fishGroup.scale.set(scale, scale, scale);

      // 2 emergent fish emerge from the orb in State 2; 7 fish in room, 8 outside in ocean
      const isEmergentFish = i < 2;
      const inRoom = i < 7;

      // Spatially distributed placements to prevent crowding around the window and center
      const inRoomX = ((i % 5) - 2) * 1.5 + (Math.random() - 0.5) * 0.6;
      const inRoomY = 1.3 + (i % 3) * 0.65 + Math.random() * 0.3;
      const inRoomZ = ((i % 4) - 1.5) * 1.3 + (Math.random() - 0.5) * 0.4;

      const initialPos = isEmergentFish
        ? new THREE.Vector3(0, 0.95, 0.4)
        : new THREE.Vector3(
            inRoom ? inRoomX : (Math.random() - 0.5) * 44,
            inRoom ? inRoomY : 2.5 + Math.random() * 9,
            inRoom ? inRoomZ : (-12 - Math.random() * 26)
          );
      fishGroup.position.copy(initialPos);
      fishGroup.visible = false; // Initially hidden in State 1
      this.group.add(fishGroup);

      // Generous invisible hit proxy sphere for smooth and effortless clicking
      const hitProxyGeo = new THREE.SphereGeometry(0.32, 8, 6);
      const hitProxyMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitProxyMesh = new THREE.Mesh(hitProxyGeo, hitProxyMat);
      fishGroup.add(hitProxyMesh);

      const fishEntity: FishEntity = {
        group: fishGroup,
        bodyMesh,
        tailMesh,
        accentMesh,
        hitProxyMesh,
        pos: initialPos,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.12),
        target: new THREE.Vector3().copy(initialPos),
        speed: baseSpeed,
        normalSpeed: baseSpeed,
        swimCycle: Math.random() * Math.PI * 2,
        inRoom,
        isEmergentFish,
        personality,
        isSelected: false,
        followTimer: 0,
        cursorTarget: new THREE.Vector3().copy(initialPos),
        departureTarget: new THREE.Vector3(),
        departureInitialized: false,
        pauseTimer: 0,
        circleAngle: Math.random() * Math.PI * 2,
        circleRadius: 0.65 + Math.random() * 0.35,
        circleSpeed: 0.65 + Math.random() * 0.25,
        circleDir: Math.random() > 0.5 ? 1 : -1,
        driftTimer: 0,
        noteTimer: 0,
      };

      this.fishList.push(fishEntity);
      this.fishClickableMeshes.push(bodyMesh);
      this.fishClickableMeshes.push(hitProxyMesh);
      this.fishRaycastMap.set(bodyMesh, fishEntity);
      this.fishRaycastMap.set(hitProxyMesh, fishEntity);
    }
  }

  private createJellyfish() {
    const jellyCount = 3;
    const bellGeo = new THREE.SphereGeometry(0.45, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);

    const bellMat = new THREE.MeshPhysicalMaterial({
      color: 0x67e8f9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.65,
      transparent: true,
      opacity: 0.48,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.85,
    });

    const tentacleMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
    });

    const initialPlacements = [
      { x: -1.8, y: 1.8, z: 1.2 }, // Near sofa left
      { x: 1.6, y: 2.2, z: 0.8 },  // Near coffee table right
      { x: -0.5, y: 2.7, z: -2.8 }, // Near the panoramic window
    ];

    for (let i = 0; i < jellyCount; i++) {
      const jellyGroup = new THREE.Group();
      jellyGroup.position.set(initialPlacements[i].x, initialPlacements[i].y, initialPlacements[i].z);

      // 1. Translucent Pulsing Bell
      const bellMesh = new THREE.Mesh(bellGeo, bellMat);
      bellMesh.scale.set(1, 0.75, 1);
      jellyGroup.add(bellMesh);

      // 2. Bioluminescent Inner Organelle
      const coreGeo = new THREE.SphereGeometry(0.14, 12, 12);
      const coreGlow = new THREE.Mesh(coreGeo, coreMat);
      coreGlow.position.y = 0.08;
      jellyGroup.add(coreGlow);

      // 3. Trailing Dynamic Tentacles (8 flowing curved lines)
      const tentacles: THREE.Line[] = [];
      const tentacleNodes: THREE.Vector3[][] = [];
      const numTentacles = 8;
      const numSegments = 7;

      for (let t = 0; t < numTentacles; t++) {
        const angle = (t / numTentacles) * Math.PI * 2;
        const rad = 0.35;
        const nodes: THREE.Vector3[] = [];
        const positions = new Float32Array((numSegments + 1) * 3);

        for (let s = 0; s <= numSegments; s++) {
          const node = new THREE.Vector3(
            Math.cos(angle) * rad,
            -s * 0.18,
            Math.sin(angle) * rad
          );
          nodes.push(node);
          positions[s * 3] = node.x;
          positions[s * 3 + 1] = node.y;
          positions[s * 3 + 2] = node.z;
        }

        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const tentacleLine = new THREE.Line(lineGeo, tentacleMat);
        jellyGroup.add(tentacleLine);

        tentacles.push(tentacleLine);
        tentacleNodes.push(nodes);
      }

      jellyGroup.visible = false; // Initially hidden in State 1
      this.group.add(jellyGroup);

      this.jellyfishList.push({
        group: jellyGroup,
        bellMesh,
        coreGlow,
        tentacles,
        tentacleNodes,
        pulsePhase: i * 1.8,
        pulseSpeed: 1.2 + Math.random() * 0.4,
        driftDir: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.1, (Math.random() - 0.5) * 0.2),
        baseY: initialPlacements[i].y,
      });
    }
  }

  private createBubbles() {
    const bubbleCount = 26;
    const bubbleGeo = new THREE.SphereGeometry(0.08, 16, 16);

    const bubbleMat = new THREE.MeshPhysicalMaterial({
      color: 0xbbf7d0,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.5,
      roughness: 0.05,
      metalness: 0.1,
      reflectivity: 0.95,
      clearcoat: 1.0,
      depthWrite: false,
    });

    for (let i = 0; i < bubbleCount; i++) {
      const mesh = new THREE.Mesh(bubbleGeo, bubbleMat);
      const scale = 0.85 + Math.random() * 0.95;
      mesh.scale.set(scale, scale, scale);

      const spawnBounds = {
        minX: -4.5,
        maxX: 4.5,
        minZ: -3.5,
        maxZ: 3.5,
      };

      const x = spawnBounds.minX + Math.random() * (spawnBounds.maxX - spawnBounds.minX);
      const z = spawnBounds.minZ + Math.random() * (spawnBounds.maxZ - spawnBounds.minZ);
      const y = 0.1 + Math.random() * 4.5;

      mesh.position.set(x, y, z);
      this.bubbleMeshGroup.add(mesh);

      this.bubbleList.push({
        mesh,
        baseSpeed: 0.3 + Math.random() * 0.4,
        wobbleSpeed: 2.0 + Math.random() * 2.0,
        wobbleAmt: 0.04 + Math.random() * 0.03,
        phase: Math.random() * Math.PI * 2,
        popped: false,
        minY: 0.1,
        maxY: 4.8,
        spawnBounds,
      });
    }
  }

  private createGiantLeviathan(): THREE.Group {
    const leviathan = new THREE.Group();
    leviathan.name = 'GiantLeviathan';
    leviathan.position.copy(this.leviathanPos);

    // 18-meter majestic celestial manta / whale
    const bodyGeo = new THREE.ConeGeometry(3.5, 14, 12);
    bodyGeo.rotateX(-Math.PI / 2);
    bodyGeo.scale(1.2, 0.4, 1.0); // Flattened streamline

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x061e38,
      roughness: 0.6,
      metalness: 0.3,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
    });
    const mainBody = new THREE.Mesh(bodyGeo, bodyMat);
    leviathan.add(mainBody);

    // Sweeping wings / pectoral fins
    const wingGeo = new THREE.PlaneGeometry(16, 6, 8, 4);
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x082f49,
      emissive: 0x0369a1,
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.4,
    });
    const wings = new THREE.Mesh(wingGeo, wingMat);
    wings.rotation.x = Math.PI / 2;
    wings.position.set(0, 0, 1);
    leviathan.add(wings);

    // Glowing bioluminescent dorsal crest
    const crestGeo = new THREE.CylinderGeometry(0.12, 0.12, 10, 8);
    crestGeo.rotateX(Math.PI / 2);
    const crestMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.8,
    });
    const crest = new THREE.Mesh(crestGeo, crestMat);
    crest.position.set(0, 0.6, 0.5);
    leviathan.add(crest);

    leviathan.visible = false;
    return leviathan;
  }

  public setRoomPermeability(p: number) {
    this.roomPermeability = Math.max(0, Math.min(1, p));
    // Bubble visibility & opacity
    this.bubbleMeshGroup.visible = this.roomPermeability > 0.05;
  }

  public setMarineState(moment: ExperienceMoment) {
    if (moment === 1) {
      // STATE 1 — INITIAL_ORB: Completely clean room, zero fish, zero bubbles, zero jellyfish outside the orb
      this.fishList.forEach((fish) => {
        fish.group.visible = false;
        if (fish.isEmergentFish) {
          fish.pos.set(0, 0.95, 0.4);
          fish.target.set(0, 0.95, 0.4);
          fish.group.position.set(0, 0.95, 0.4);
        }
      });
      this.jellyfishList.forEach((jelly) => {
        jelly.group.visible = false;
      });
      this.bubbleMeshGroup.visible = false;
      this.leviathanGroup.visible = false;
      this.roomPermeability = 0;
    } else if (moment === 2) {
      // STATE 2 — WORLD_EXPANSION: Only emergent fish emerge from the orb into the room!
      this.fishList.forEach((fish) => {
        if (fish.isEmergentFish) {
          fish.group.visible = true;
          // Target a gentle orbit out of the orb
          fish.target.set(
            (Math.random() - 0.5) * 1.8,
            1.1 + Math.random() * 0.6,
            0.4 + (Math.random() - 0.5) * 1.4
          );
        } else {
          fish.group.visible = false;
        }
      });
      this.jellyfishList.forEach((jelly) => {
        jelly.group.visible = false;
      });
      this.bubbleMeshGroup.visible = false; // Orb's emergence bubbles handle state 2
      this.leviathanGroup.visible = false;
      this.roomPermeability = 0.2;
    } else if (moment >= 3) {
      // STATE 3+ — ROOM_TRANSFORMATION / INTERACTIVE / DAYDREAMING
      this.fishList.forEach((fish) => {
        fish.group.visible = true;
      });
      this.jellyfishList.forEach((jelly) => {
        jelly.group.visible = true;
      });
      this.bubbleMeshGroup.visible = true;
      this.roomPermeability = 1.0;

      if (moment === 5) {
        this.triggerLeviathanEncounter();
      }
    }
  }

  /**
   * Smoothly collapses all swimming marine life, jellyfish and bubbles into the glowing orb.
   */
  public collapseIntoOrb(orbPos: THREE.Vector3, progress: number) {
    const p = Math.min(1.0, Math.max(0, progress));
    const invP = 1.0 - p;

    // Fade out active notes & pop clusters rapidly
    this.musicalNotePool.forEach((n) => {
      n.active = false;
      n.group.visible = false;
    });
    this.popBubblesPool.forEach((b) => {
      b.active = false;
      b.mesh.visible = false;
    });

    // Lerp fish towards orb and shrink
    for (const fish of this.fishList) {
      if (!fish.group.visible) continue;
      fish.pos.lerp(orbPos, 0.08 + p * 0.15);
      fish.group.position.copy(fish.pos);
      const s = Math.max(0.001, invP);
      fish.group.scale.set(s, s, s);
    }

    // Lerp jellyfish towards orb and shrink
    for (const jelly of this.jellyfishList) {
      if (!jelly.group.visible) continue;
      jelly.group.position.lerp(orbPos, 0.06 + p * 0.12);
      const s = Math.max(0.001, invP);
      jelly.group.scale.set(s, s, s);
    }

    // Shrink and converge bubbles
    if (this.bubbleMeshGroup.visible) {
      for (const b of this.bubbleList) {
        b.mesh.position.lerp(orbPos, 0.06 + p * 0.12);
        const s = Math.max(0.001, invP);
        b.mesh.scale.set(s, s, s);
      }
    }
  }

  public popBubbleAt(intersectedMesh: THREE.Object3D): boolean {
    const bubble = this.bubbleList.find((b) => b.mesh === intersectedMesh);
    if (bubble && !bubble.popped) {
      bubble.popped = true;
      soundEngine.playBubblePop();
      
      // Spawn small cluster of smaller visual bubbles (fixed size 0.65, purely visual, non-interactive)
      const popPos = bubble.mesh.position.clone();
      this.spawnPopBubbleCluster(popPos);

      // Animate quick pop shrink
      bubble.mesh.scale.set(0.001, 0.001, 0.001);
      
      // Respawn after short delay
      setTimeout(() => {
        bubble.mesh.position.y = bubble.minY;
        bubble.mesh.position.x = bubble.spawnBounds.minX + Math.random() * (bubble.spawnBounds.maxX - bubble.spawnBounds.minX);
        bubble.mesh.position.z = bubble.spawnBounds.minZ + Math.random() * (bubble.spawnBounds.maxZ - bubble.spawnBounds.minZ);
        const scale = 0.85 + Math.random() * 0.95;
        bubble.mesh.scale.set(scale, scale, scale);
        bubble.popped = false;
      }, 1200);
      return true;
    }
    return false;
  }

  public attractFishTowards(pos: THREE.Vector3) {
    // Cause several unselected fish to swim curiously towards the activated sculpture
    let count = 0;
    for (const fish of this.fishList) {
      if (fish.inRoom && !fish.isSelected && Math.random() > 0.4) {
        fish.target.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.2));
        count++;
        if (count >= 5) break;
      }
    }
  }

  public clickFish(
    intersectedObj: THREE.Object3D,
    cursorWorldPos: THREE.Vector3
  ): { fish: FishEntity } | null {
    const fish = this.fishRaycastMap.get(intersectedObj);
    if (!fish || !fish.group.visible) return null;

    // 1. Subtle bioluminescent selection ripple at fish position
    this.spawnSelectionRipple(fish.pos);

    // 2. Play gentle pleasant water acoustic chime
    soundEngine.playRaindrop(Math.floor(Math.random() * 6));

    // 3. Select fish and start 10-second follow countdown
    fish.isSelected = true;
    fish.followTimer = 0.0;
    fish.departureInitialized = false;
    fish.pauseTimer = 0.28; // Brief graceful acknowledgment pause

    const safeCursorX = THREE.MathUtils.clamp(cursorWorldPos.x, -3.8, 3.8);
    const safeCursorY = THREE.MathUtils.clamp(cursorWorldPos.y, 0.7, 3.4);
    const safeCursorZ = THREE.MathUtils.clamp(cursorWorldPos.z, -3.8, 3.0);
    fish.cursorTarget.set(safeCursorX, safeCursorY, safeCursorZ);

    // Distinct organic circling style when following the user's cursor (graceful, relaxed pace)
    if (fish.personality === 'curious') {
      fish.circleRadius = 0.55;
      fish.circleSpeed = 0.65;
    } else if (fish.personality === 'playful') {
      fish.circleRadius = 0.75;
      fish.circleSpeed = 0.85;
      fish.circleDir = Math.random() > 0.5 ? 1 : -1;
    } else if (fish.personality === 'shy') {
      fish.circleRadius = 0.88;
      fish.circleSpeed = 0.52;
    } else if (fish.personality === 'social') {
      fish.circleRadius = 0.65;
      fish.circleSpeed = 0.60;
    }

    // Other fish continue swimming independently. No on-screen text or countdown.
    return { fish };
  }

  public updateCursorInteraction(
    cursorWorldPos: THREE.Vector3,
    _isCursorMoving: boolean,
    _delta: number
  ) {
    const safeCursorX = THREE.MathUtils.clamp(cursorWorldPos.x, -3.8, 3.8);
    const safeCursorY = THREE.MathUtils.clamp(cursorWorldPos.y, 0.7, 3.4);
    const safeCursorZ = THREE.MathUtils.clamp(cursorWorldPos.z, -3.8, 3.0);

    for (const fish of this.fishList) {
      if (!fish.group.visible) continue;

      // Only the selected fish actively tracks the cursor during the 10-second window!
      // Moving the cursor must NOT extend the 10-second duration.
      // Once followTimer >= 10.0s, cursor updates are ignored as the fish departs.
      if (fish.isSelected && fish.followTimer < FISH_FOLLOW_DURATION) {
        fish.cursorTarget.set(safeCursorX, safeCursorY, safeCursorZ);
      }
      // All other fish swim completely independently (zero automatic hover reactions).
    }
  }

  public reactFishToCursor(rayPos: THREE.Vector3) {
    this.updateCursorInteraction(rayPos, false, 0.016);
  }

  public triggerLeviathanEncounter() {
    this.leviathanActive = true;
    this.leviathanGroup.visible = true;
    this.leviathanGroup.position.set(-60, 10, -42);
    this.leviathanTarget.set(60, 13, -42);
  }

  public update(delta: number, elapsed: number) {
    // 0. Update Selection Ripples
    for (const ripple of this.ripplePool) {
      if (!ripple.active) continue;
      ripple.life += delta * 1.6;
      const progress = ripple.life / ripple.maxLife;
      if (progress >= 1.0) {
        ripple.active = false;
        ripple.mesh.visible = false;
      } else {
        const s = 0.4 + progress * 2.8;
        ripple.mesh.scale.set(s, s, s);
        (ripple.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1.0 - progress) * 0.85);
      }
    }

    // 1. Update Fish School Kinematics & Flocking with organic swimming
    for (let i = 0; i < this.fishList.length; i++) {
      const fish = this.fishList[i];
      if (!fish.group.visible) continue;

      // If fish is configured for room, but room permeability is low, keep them near window
      let boundsZ = { min: -12, max: 3.5 };
      if (!fish.inRoom || this.roomPermeability < 0.3) {
        boundsZ = { min: -40, max: -5.5 };
      } else {
        boundsZ = { min: -5.0, max: 3.2 };
      }

      if (fish.isSelected) {
        // Frame-rate independent follow timer
        fish.followTimer += delta;

        if (fish.followTimer < FISH_FOLLOW_DURATION) {
          // ==============================================================
          // PHASE 1: FOLLOW CURSOR (0.0s to 10.0s)
          // ==============================================================
          if (fish.pauseTimer > 0) {
            fish.pauseTimer -= delta;
            fish.vel.multiplyScalar(0.95); // Gentle acknowledgment pause
          } else {
            fish.circleAngle += delta * fish.circleSpeed * fish.circleDir;
            const distToCursor = fish.pos.distanceTo(fish.cursorTarget);

            if (distToCursor > fish.circleRadius * 1.35) {
              // Smooth, unhurried cruise towards cursor
              fish.target.copy(fish.cursorTarget);
              fish.speed = THREE.MathUtils.damp(
                fish.speed,
                fish.normalSpeed * (distToCursor > 2.0 ? 1.35 : 1.2),
                1.8,
                delta
              );
            } else {
              // Gracefully circle/cruise around cursor at natural distance
              const offsetX = Math.cos(fish.circleAngle) * fish.circleRadius;
              const offsetZ = Math.sin(fish.circleAngle) * fish.circleRadius;
              const offsetY = Math.sin(fish.circleAngle * 1.6) * 0.12;
              fish.target.set(
                fish.cursorTarget.x + offsetX,
                fish.cursorTarget.y + offsetY,
                fish.cursorTarget.z + offsetZ
              );
              fish.speed = THREE.MathUtils.damp(fish.speed, fish.normalSpeed * 1.05, 1.8, delta);
            }

            // Spawn musical note trail while fish is following cursor (Requirement 2)
            fish.noteTimer += delta;
            if (fish.noteTimer >= 0.38) {
              fish.noteTimer = 0;
              this.spawnMusicalNote(fish.pos, fish.vel);
              soundEngine.playFishNote(this.noteSequenceIndex++);
            }
          }
        } else if (fish.followTimer < FISH_TOTAL_INTERACTION_DURATION) {
          // Stop spawning notes and sounds once fish enters departure phase
          fish.noteTimer = 0;
          // ==============================================================
          // PHASE 2: GRADUAL RETURN OVER 4 SECONDS (10.0s to 14.0s)
          // ==============================================================
          // Smoothly transitions away from following over 3-5 seconds.
          // Gently turns away and resumes independent swimming direction without abruptness.
          if (!fish.departureInitialized) {
            fish.departureInitialized = true;

            // Compute natural departure trajectory continuing existing momentum
            const currentDir = fish.vel.lengthSq() > 0.0001
              ? fish.vel.clone().normalize()
              : new THREE.Vector3(Math.cos(fish.circleAngle), 0.05, Math.sin(fish.circleAngle));

            // Soft yaw deviation (±25°) away into open swimming volume
            const curveAngle = (Math.random() - 0.5) * 0.8;
            const departureDir = currentDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), curveAngle);

            const destX = THREE.MathUtils.clamp(fish.pos.x + departureDir.x * 4.5, -3.8, 3.8);
            const destY = THREE.MathUtils.clamp(fish.pos.y + departureDir.y * 1.2 + (Math.random() - 0.5) * 0.6, 1.0, 3.0);
            const destZ = THREE.MathUtils.clamp(fish.pos.z + departureDir.z * 4.5, boundsZ.min, boundsZ.max);
            fish.departureTarget.set(destX, destY, destZ);
          }

          // Departure progress: 0.0 at 10.0s -> 1.0 at 14.0s (exactly 4.0s duration)
          const departT = Math.min(1.0, (fish.followTimer - FISH_FOLLOW_DURATION) / FISH_DEPARTURE_DURATION);
          // Smooth cubic ease-in-out S-curve
          const blend = departT * departT * (3.0 - 2.0 * departT);

          // Calculate where the follow position would be right now
          fish.circleAngle += delta * fish.circleSpeed * fish.circleDir;
          const offsetX = Math.cos(fish.circleAngle) * fish.circleRadius;
          const offsetZ = Math.sin(fish.circleAngle) * fish.circleRadius;
          const curFollowPos = new THREE.Vector3(
            fish.cursorTarget.x + offsetX,
            fish.cursorTarget.y,
            fish.cursorTarget.z + offsetZ
          );

          // Seamlessly blend target from follow point to departure target
          fish.target.lerpVectors(curFollowPos, fish.departureTarget, blend);
          fish.speed = THREE.MathUtils.lerp(fish.normalSpeed * 1.05, fish.normalSpeed, blend);

        } else {
          // ==============================================================
          // PHASE 3: FULL AUTONOMOUS RESUMPTION (>= 14.0s)
          // ==============================================================
          fish.isSelected = false;
          fish.followTimer = 0.0;
          fish.departureInitialized = false;
        }
      } else {
        // ==============================================================
        // AUTONOMOUS SWIMMING: Very slow, graceful, calm, and spacious
        // ==============================================================
        if (fish.driftTimer > 0) {
          // Occasional peaceful drift/pause suspended in the water
          fish.driftTimer -= delta;
          fish.speed = THREE.MathUtils.damp(fish.speed, fish.normalSpeed * 0.25, 0.8, delta);
        } else {
          // Smooth, unhurried cruising
          fish.speed = THREE.MathUtils.damp(fish.speed, fish.normalSpeed, 1.2, delta);

          // Update target only when reached or very rarely (prevents frantic path switching)
          if (fish.pos.distanceTo(fish.target) < 0.7 || Math.random() < 0.003) {
            // 35% chance to drift peacefully upon reaching destination
            if (Math.random() < 0.35) {
              fish.driftTimer = 2.5 + Math.random() * 3.5;
            }

            if (fish.inRoom) {
              // Space out targets in the room, keeping central window view uncluttered
              const targetX = ((i % 5) - 2) * 1.4 + (Math.random() - 0.5) * 0.8;
              const targetY = 1.2 + Math.random() * 1.6;
              const targetZ = -2.8 + Math.random() * 4.6;
              fish.target.set(targetX, targetY, targetZ);
            } else {
              // Expansive slow glide outside through distant underwater city
              fish.target.set(
                (Math.random() - 0.5) * 44,
                2.5 + Math.random() * 9,
                boundsZ.min + Math.random() * (boundsZ.max - boundsZ.min)
              );
            }
          }
        }
      }

      // Smooth, viscous steering acceleration & deceleration (like moving through real water)
      const toTarget = new THREE.Vector3().subVectors(fish.target, fish.pos);
      const distToTarget = toTarget.length();

      if (distToTarget > 0.08) {
        const desiredVel = toTarget.normalize().multiplyScalar(fish.speed);
        fish.vel.lerp(desiredVel, 0.028); // Slower, graceful fluid acceleration
      } else {
        fish.vel.multiplyScalar(0.96);
      }

      // Soft vertical bounding
      if (fish.inRoom && this.roomPermeability >= 0.5) {
        if (fish.pos.y < 0.6) fish.vel.y += delta * 0.35;
        if (fish.pos.y > 3.6) fish.vel.y -= delta * 0.35;
      }

      // Position update: delta * 1.05 (substantially reduced from 2.8, achieving the 50-65% speed reduction!)
      fish.pos.add(new THREE.Vector3().copy(fish.vel).multiplyScalar(delta * 1.05));
      fish.group.position.copy(fish.pos);

      // Smooth orientation banking & unhurried turning
      if (fish.vel.lengthSq() > 0.0001) {
        const lookTarget = new THREE.Vector3().addVectors(fish.pos, fish.vel);
        const currentRot = fish.group.rotation.clone();
        fish.group.lookAt(lookTarget);

        // Gentle, calm banking into turns
        const bankAngle = THREE.MathUtils.clamp(-fish.vel.x * 0.22, -0.25, 0.25);
        fish.group.rotation.z = bankAngle;

        // Slow, fluid yaw damping (avoids rapid or robotic turns)
        fish.group.rotation.y = THREE.MathUtils.damp(currentRot.y, fish.group.rotation.y, 1.6, delta);
      }

      // Relaxed, subtle caudal tail flutter
      const waggleRate = Math.max(0.7, fish.vel.length() * 2.2);
      fish.swimCycle += delta * waggleRate;
      fish.tailMesh.rotation.y = Math.sin(fish.swimCycle) * 0.22;
    }

    // 2. Update Jellyfish Pulsing & Drifting
    for (const jelly of this.jellyfishList) {
      jelly.pulsePhase += delta * jelly.pulseSpeed;
      const pulse = (Math.sin(jelly.pulsePhase) + 1) * 0.5; // 0 to 1

      // Asymmetrical bell contraction
      const scaleXZ = 1.0 - pulse * 0.28;
      const scaleY = 0.75 + pulse * 0.35;
      jelly.bellMesh.scale.set(scaleXZ, scaleY, scaleXZ);

      // Core bioluminescent pulse
      (jelly.coreGlow.material as THREE.MeshBasicMaterial).opacity = 0.5 + pulse * 0.45;

      // Vertical drift with upward thrust during contraction
      const upwardPush = Math.max(0, Math.cos(jelly.pulsePhase)) * 0.25;
      jelly.group.position.y = jelly.baseY + Math.sin(jelly.pulsePhase * 0.5) * 0.4 + upwardPush * 0.15;
      jelly.group.position.x += jelly.driftDir.x * delta;
      jelly.group.position.z += jelly.driftDir.z * delta;

      // Update tentacle curves with soft lag
      for (let t = 0; t < jelly.tentacles.length; t++) {
        const nodes = jelly.tentacleNodes[t];
        const line = jelly.tentacles[t];
        const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;

        for (let s = 1; s < nodes.length; s++) {
          const sway = Math.sin(elapsed * 2 + s * 0.5 + t) * (0.02 * s);
          nodes[s].x += (nodes[s - 1].x - nodes[s].x) * 0.18 + sway;
          nodes[s].z += (nodes[s - 1].z - nodes[s].z) * 0.18;
          arr[s * 3] = nodes[s].x;
          arr[s * 3 + 1] = nodes[s].y;
          arr[s * 3 + 2] = nodes[s].z;
        }
        posAttr.needsUpdate = true;
      }
    }

    // 3. Update Rising Bubbles
    if (this.bubbleMeshGroup.visible) {
      const bubbleMotionScale = 0.375; // Half the previous bubble speed for a much calmer, slower drift
      for (const b of this.bubbleList) {
        if (b.popped) continue;
        b.phase += delta * b.wobbleSpeed * bubbleMotionScale;
        b.mesh.position.y += delta * b.baseSpeed * bubbleMotionScale;
        b.mesh.position.x += Math.sin(b.phase) * b.wobbleAmt * delta * bubbleMotionScale;
        b.mesh.position.z += Math.cos(b.phase * 0.8) * b.wobbleAmt * delta * bubbleMotionScale;

        // Reset if reached ceiling
        if (b.mesh.position.y > b.maxY) {
          b.mesh.position.y = b.minY;
          b.mesh.position.x = b.spawnBounds.minX + Math.random() * (b.spawnBounds.maxX - b.spawnBounds.minX);
          b.mesh.position.z = b.spawnBounds.minZ + Math.random() * (b.spawnBounds.maxZ - b.spawnBounds.minZ);
        }
      }
    }

    // 4. Update Giant Leviathan
    this.leviathanTimer -= delta;
    if (this.leviathanTimer <= 0 && !this.leviathanActive) {
      this.triggerLeviathanEncounter();
    }

    if (this.leviathanActive) {
      this.leviathanGroup.position.lerp(this.leviathanTarget, delta * 0.06);
      this.leviathanGroup.lookAt(this.leviathanTarget);

      // Wing gentle flap
      const flap = Math.sin(elapsed * 0.9) * 0.15;
      this.leviathanGroup.rotation.z = flap;

      if (this.leviathanGroup.position.distanceTo(this.leviathanTarget) < 4.0) {
        this.leviathanActive = false;
        this.leviathanGroup.visible = false;
        this.leviathanTimer = 35 + Math.random() * 25; // schedule next encounter
      }
    }

    // 5. Update Musical Notes Trail
    for (const note of this.musicalNotePool) {
      if (!note.active) continue;
      note.life += delta;
      note.wobblePhase += delta * 2.8;

      const progress = note.life / note.maxLife;
      if (progress >= 1.0) {
        note.active = false;
        note.group.visible = false;
      } else {
        note.group.position.addScaledVector(note.driftVel, delta);
        note.group.position.x += Math.sin(note.wobblePhase) * 0.035 * delta;
        // Gentle graceful expansion, then soft fade-out
        const s = 0.7 + Math.sin(progress * Math.PI) * 0.35;
        note.group.scale.set(s, s, s);
        note.material.opacity = Math.max(0, (1.0 - progress) * 0.85);
      }
    }

    // 6. Update Visual Pop Bubble Clusters (Fixed size 0.65, purely visual)
    for (const popB of this.popBubblesPool) {
      if (!popB.active) continue;
      popB.life += delta;

      const progress = popB.life / popB.maxLife;
      if (progress >= 1.0) {
        popB.active = false;
        popB.mesh.visible = false;
      } else {
        popB.mesh.position.addScaledVector(popB.vel, delta);
        popB.vel.y += delta * 0.04; // Very gentle upward buoyancy
        // Strictly maintain required fixed size of 0.65
        popB.mesh.scale.set(0.65, 0.65, 0.65);
        popB.material.opacity = Math.max(0, (1.0 - progress) * 0.65);
      }
    }
  }
}

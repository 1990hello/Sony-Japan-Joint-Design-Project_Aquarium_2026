/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { soundEngine } from '../audio/SoundEngine';

interface FishEntity {
  group: THREE.Group;
  tailMesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
  speed: number;
  swimCycle: number;
  inRoom: boolean; // allowed inside living room boundary
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

export class MarineLife {
  public group: THREE.Group;
  public fishList: FishEntity[] = [];
  public jellyfishList: JellyfishEntity[] = [];
  public bubbleList: BubbleEntity[] = [];
  public bubbleMeshGroup: THREE.Group;
  public leviathanGroup: THREE.Group;
  
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

  private createFishSchool() {
    const fishCount = 28;
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

    const fishMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
      roughness: 0.2,
      metalness: 0.3,
      clearcoat: 0.8,
    });

    const tailMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < fishCount; i++) {
      const fishGroup = new THREE.Group();

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
        new THREE.MeshBasicMaterial({ color: 0xa5f3fc })
      );
      accentMesh.position.set(0, 0.04, 0.02);
      fishGroup.add(accentMesh);

      // Scales & initial placements
      const scale = 0.55 + Math.random() * 0.45;
      fishGroup.scale.set(scale, scale, scale);

      // Start distributed: some in living room range, some in deep ocean
      const inRoom = i < 14;
      const initialPos = new THREE.Vector3(
        (Math.random() - 0.5) * (inRoom ? 7 : 40),
        1.2 + Math.random() * (inRoom ? 2.5 : 10),
        inRoom ? (Math.random() * 4 - 1.5) : (-8 - Math.random() * 30)
      );
      fishGroup.position.copy(initialPos);
      this.group.add(fishGroup);

      this.fishList.push({
        group: fishGroup,
        tailMesh,
        pos: initialPos,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.5),
        target: new THREE.Vector3().copy(initialPos),
        speed: 1.4 + Math.random() * 1.2,
        swimCycle: Math.random() * Math.PI * 2,
        inRoom,
      });
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
      const scale = 0.6 + Math.random() * 1.2;
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

  public popBubbleAt(intersectedMesh: THREE.Object3D): boolean {
    const bubble = this.bubbleList.find((b) => b.mesh === intersectedMesh);
    if (bubble && !bubble.popped) {
      bubble.popped = true;
      soundEngine.playBubblePop();
      
      // Animate quick pop shrink
      bubble.mesh.scale.set(0.001, 0.001, 0.001);
      
      // Respawn after short delay
      setTimeout(() => {
        bubble.mesh.position.y = bubble.minY;
        bubble.mesh.position.x = bubble.spawnBounds.minX + Math.random() * (bubble.spawnBounds.maxX - bubble.spawnBounds.minX);
        bubble.mesh.position.z = bubble.spawnBounds.minZ + Math.random() * (bubble.spawnBounds.maxZ - bubble.spawnBounds.minZ);
        const scale = 0.6 + Math.random() * 1.2;
        bubble.mesh.scale.set(scale, scale, scale);
        bubble.popped = false;
      }, 1200);
      return true;
    }
    return false;
  }

  public attractFishTowards(pos: THREE.Vector3) {
    // Cause several fish to swim curiously towards the activated sculpture
    let count = 0;
    for (const fish of this.fishList) {
      if (fish.inRoom && Math.random() > 0.4) {
        fish.target.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.2));
        count++;
        if (count >= 5) break;
      }
    }
  }

  public reactFishToCursor(rayPos: THREE.Vector3) {
    // If cursor ray is close to a fish, scatter gently
    for (const fish of this.fishList) {
      const dist = fish.group.position.distanceTo(rayPos);
      if (dist < 1.4) {
        const away = new THREE.Vector3().subVectors(fish.group.position, rayPos).normalize().multiplyScalar(0.8);
        fish.vel.add(away);
      }
    }
  }

  public triggerLeviathanEncounter() {
    this.leviathanActive = true;
    this.leviathanGroup.visible = true;
    this.leviathanGroup.position.set(-60, 10, -42);
    this.leviathanTarget.set(60, 13, -42);
  }

  public update(delta: number, elapsed: number) {
    // 1. Update Fish School Kinematics & Flocking
    for (let i = 0; i < this.fishList.length; i++) {
      const fish = this.fishList[i];
      fish.swimCycle += delta * (fish.speed * 4.5);

      // If fish is configured for room, but room permeability is low, keep them near window
      let boundsZ = { min: -12, max: 3.5 };
      if (!fish.inRoom || this.roomPermeability < 0.3) {
        boundsZ = { min: -40, max: -5.5 };
      } else {
        boundsZ = { min: -5.0, max: 3.2 };
      }

      // Random wandering targets
      if (fish.pos.distanceTo(fish.target) < 1.0 || Math.random() < 0.015) {
        fish.target.set(
          (Math.random() - 0.5) * (fish.inRoom ? 7.5 : 35),
          0.8 + Math.random() * (fish.inRoom ? 3.0 : 12),
          boundsZ.min + Math.random() * (boundsZ.max - boundsZ.min)
        );
      }

      // Steer towards target
      const steer = new THREE.Vector3().subVectors(fish.target, fish.pos).normalize().multiplyScalar(fish.speed * delta);
      fish.vel.lerp(steer, 0.08);
      fish.pos.add(fish.vel);
      fish.group.position.copy(fish.pos);

      // Orient fish along motion vector
      if (fish.vel.lengthSq() > 0.0001) {
        const lookTarget = new THREE.Vector3().addVectors(fish.pos, fish.vel);
        fish.group.lookAt(lookTarget);
      }

      // Sinuous caudal tail waggle
      fish.tailMesh.rotation.y = Math.sin(fish.swimCycle) * 0.45;
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
      for (const b of this.bubbleList) {
        if (b.popped) continue;
        b.phase += delta * b.wobbleSpeed;
        b.mesh.position.y += delta * b.baseSpeed;
        b.mesh.position.x += Math.sin(b.phase) * b.wobbleAmt * delta;
        b.mesh.position.z += Math.cos(b.phase * 0.8) * b.wobbleAmt * delta;

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
  }
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { createArchitecturalFloorTexture, createNormalSkylineTexture, createParticleTexture } from './proceduralTextures';

export class LivingRoom {
  public group: THREE.Group;
  public orbGroup: THREE.Group;
  public orbPosition = new THREE.Vector3(0, 0.95, 0.4);
  public orbLight: THREE.PointLight;
  public miniFishGroup: THREE.Group;
  public outdoorSkylineMesh!: THREE.Mesh;
  public emergenceParticles!: THREE.Points;
  public emergenceBubblesGroup!: THREE.Group;
  public orbPinchRippleMesh!: THREE.Mesh;
  public orbHitProxy!: THREE.Mesh;
  
  // Standing Floor Lamp near the window
  public floorLampGroup!: THREE.Group;
  public floorLampLight!: THREE.PointLight;
  public floorLampPos = new THREE.Vector3(3.8, 1.7, -4.1);
  private floorLampShadeMesh!: THREE.Mesh;
  private floorLampBulbMesh!: THREE.Mesh;
  private floorLampTimer = 0;
  private floorLampCurrentIntensity = 0.35;
  private floorLampTargetIntensity = 0.35;
  private nearFishIds = new Set<number>();
  private floorLampDiffuserMaterial!: THREE.MeshBasicMaterial;
  // Warm diffuse bounce highlight on the matte cardboard reflector beside the lamp.
  private floorLampReflectorGlowMaterial!: THREE.MeshBasicMaterial;
  private floorLampReflectorGlowMesh!: THREE.Mesh;
  // Reused world-space scratch vectors for reliable proximity checks.
  private lampWorldPosition = new THREE.Vector3();
  private fishWorldPosition = new THREE.Vector3();
  // Reused colour values for a smooth transition from neutral white to warm amber.
  private readonly lampShadeNeutral = new THREE.Color(0xfff8ee);
  private readonly lampShadeAmber = new THREE.Color(0xffa044);
  private readonly lampShadeEmissiveNeutral = new THREE.Color(0xffeedd);
  private readonly lampShadeEmissiveAmber = new THREE.Color(0xff6a12);
  private readonly lampDiffuserNeutral = new THREE.Color(0xffeed4);
  private readonly lampDiffuserAmber = new THREE.Color(0xff8a24);
  private readonly lampBulbNeutral = new THREE.Color(0xfff4e0);
  private readonly lampBulbAmber = new THREE.Color(0xffff8a);
  private readonly lampBulbEmissiveNeutral = new THREE.Color(0xffb45c);
  private readonly lampBulbEmissiveAmber = new THREE.Color(0xffff24);
  private readonly lampLightNeutral = new THREE.Color(0xffecd1);
  private readonly lampLightAmber = new THREE.Color(0xffff8a);
  
  private floorMesh: THREE.Mesh;
  private causticsOverlayMesh: THREE.Mesh;
  private miniFishList: { mesh: THREE.Mesh; angle: number; speed: number; radius: number; y: number }[] = [];
  private orbGlowMesh!: THREE.Mesh;
  private orbOuterGlass!: THREE.Mesh;
  private emergencePositions!: Float32Array;
  private emergenceVelocities!: Float32Array;
  private emergenceActive = false;
  private emergenceProgress = 0;
  private orbHandHover = false;
  private orbHandPinched = false;
  private pinchRipplePhase = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'LivingRoom';

    // 1. Floor & Walls
    const floorGeo = new THREE.PlaneGeometry(16, 16);
    const floorTex = createArchitecturalFloorTexture();
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.35,
      metalness: 0.15,
    });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.y = 0;
    this.floorMesh.receiveShadow = true;
    this.group.add(this.floorMesh);

    // Caustics projection overlay plane slightly above floor to prevent z-fighting
    const causticsGeo = new THREE.PlaneGeometry(15.9, 15.9);
    const causticsMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.causticsOverlayMesh = new THREE.Mesh(causticsGeo, causticsMat);
    this.causticsOverlayMesh.rotation.x = -Math.PI / 2;
    this.causticsOverlayMesh.position.y = 0.01;
    this.group.add(this.causticsOverlayMesh);

    // Architectural modern walls (Left wall and ceiling, leaving North open for floor-to-ceiling glass window)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x171f2c,
      roughness: 0.85,
      metalness: 0.05,
    });

    // Left Wall
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 14), wallMat);
    leftWall.position.set(-6, 3, 0);
    this.group.add(leftWall);

    // Right Wall (set further back so space feels expansive)
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 14), wallMat);
    rightWall.position.set(6, 3, 0);
    this.group.add(rightWall);

    // Ceiling
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x0f1724,
      roughness: 0.9,
    });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 5.6;
    this.group.add(ceiling);

    // Floor-to-ceiling window frame structure (North wall opening)
    this.createWindowFrame();

    // Designer Curved Sofa
    this.createSofa();

    // Designer Coffee Table
    this.createCoffeeTable();

    // Miniature City in Glass Orb
    const orbElements = this.createGlowingOrb();
    this.orbGroup = orbElements.group;
    this.orbLight = orbElements.pointLight;
    this.miniFishGroup = orbElements.fishGroup;
    this.orbGlowMesh = orbElements.glowMesh;
    this.orbOuterGlass = orbElements.outerGlass;
    this.group.add(this.orbGroup);

    // Area rug beneath coffee table
    this.createAreaRug();

    // Standing Floor Lamp near the panoramic window
    this.createFloorLamp();
    this.createLampReflector();

    // Emergence Particle System (releases particles and bubbles from the orb during State 2)
    this.createEmergenceSystem();
  }

  private createWindowFrame() {
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x0a111a,
      roughness: 0.4,
      metalness: 0.8,
    });

    const windowGroup = new THREE.Group();
    windowGroup.position.set(0, 0, -4.8);

    // Top beam
    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(14, 0.35, 0.35), frameMat);
    topBeam.position.set(0, 5.4, 0);
    windowGroup.add(topBeam);

    // Bottom sill
    const bottomSill = new THREE.Mesh(new THREE.BoxGeometry(14, 0.25, 0.35), frameMat);
    bottomSill.position.set(0, 0.12, 0);
    windowGroup.add(bottomSill);

    // Vertical structural mullions (4 large architectural glass panes)
    const mullionPositions = [-5.5, -2, 2, 5.5];
    mullionPositions.forEach((x) => {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5.4, 0.3), frameMat);
      mullion.position.set(x, 2.7, 0);
      windowGroup.add(mullion);
    });

    // Glass panes with subtle reflection
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x103045,
      transparent: true,
      opacity: 0.25,
      roughness: 0.1,
      metalness: 0.1,
      reflectivity: 0.9,
      depthWrite: false,
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(12, 5.2), glassMat);
    glass.position.set(0, 2.7, 0.05);
    windowGroup.add(glass);

    // Ordinary outdoor evening skyline backdrop for State 1
    const skylineTex = createNormalSkylineTexture();
    const skylineMat = new THREE.MeshBasicMaterial({
      map: skylineTex,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    });
    this.outdoorSkylineMesh = new THREE.Mesh(new THREE.PlaneGeometry(15, 6.8), skylineMat);
    this.outdoorSkylineMesh.position.set(0, 2.7, -0.15);
    windowGroup.add(this.outdoorSkylineMesh);

    this.group.add(windowGroup);
  }

  private createSofa() {
    const sofaGroup = new THREE.Group();
    sofaGroup.name = 'Sofa';
    sofaGroup.position.set(0, 0, 2.4);

    const sofaMat = new THREE.MeshStandardMaterial({
      color: 0x222e42, // Deep muted modern slate blue
      roughness: 0.8,
      metalness: 0.05,
    });

    const woodLegMat = new THREE.MeshStandardMaterial({
      color: 0x1f1915,
      roughness: 0.4,
      metalness: 0.5,
    });

    // 1. Sofa Main Base
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, 1.4), sofaMat);
    base.position.set(0, 0.35, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    sofaGroup.add(base);

    // 2. Main Seat Cushions (Left and Right)
    const cushionGeo = new THREE.BoxGeometry(1.65, 0.28, 1.25);
    const cushionLeft = new THREE.Mesh(cushionGeo, sofaMat);
    cushionLeft.position.set(-0.85, 0.62, 0.05);
    cushionLeft.castShadow = true;
    sofaGroup.add(cushionLeft);

    const cushionRight = new THREE.Mesh(cushionGeo, sofaMat);
    cushionRight.position.set(0.85, 0.62, 0.05);
    cushionRight.castShadow = true;
    sofaGroup.add(cushionRight);

    // 3. Backrest
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.85, 0.45), sofaMat);
    backrest.position.set(0, 0.95, 0.52);
    backrest.castShadow = true;
    sofaGroup.add(backrest);

    // 4. Armrests
    const armrestGeo = new THREE.BoxGeometry(0.35, 0.65, 1.4);
    const leftArm = new THREE.Mesh(armrestGeo, sofaMat);
    leftArm.position.set(-1.95, 0.65, 0);
    leftArm.castShadow = true;
    sofaGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armrestGeo, sofaMat);
    rightArm.position.set(1.95, 0.65, 0);
    rightArm.castShadow = true;
    sofaGroup.add(rightArm);

    // 5. Accent Throw Pillows
    const pillowMat = new THREE.MeshStandardMaterial({
      color: 0x145369, // Deep teal accent
      roughness: 0.85,
    });
    const pillowGeo = new THREE.BoxGeometry(0.55, 0.55, 0.2);
    const pillow1 = new THREE.Mesh(pillowGeo, pillowMat);
    pillow1.position.set(-1.4, 0.85, 0.35);
    pillow1.rotation.set(0.1, 0.3, -0.15);
    sofaGroup.add(pillow1);

    const pillow2 = new THREE.Mesh(pillowGeo, pillowMat);
    pillow2.position.set(1.4, 0.85, 0.35);
    pillow2.rotation.set(0.1, -0.3, 0.15);
    sofaGroup.add(pillow2);

    // 6. Sleek Minimalist Legs
    const legGeo = new THREE.CylinderGeometry(0.04, 0.025, 0.22, 16);
    const legCoords = [
      [-1.6, 0.11, -0.55],
      [1.6, 0.11, -0.55],
      [-1.6, 0.11, 0.55],
      [1.6, 0.11, 0.55],
    ];
    legCoords.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo, woodLegMat);
      leg.position.set(x, y, z);
      sofaGroup.add(leg);
    });

    // Contact shadow beneath sofa
    const sofaShadowGeo = new THREE.PlaneGeometry(3.8, 1.7);
    const sofaShadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const sofaShadow = new THREE.Mesh(sofaShadowGeo, sofaShadowMat);
    sofaShadow.rotation.x = -Math.PI / 2;
    sofaShadow.position.set(0, 0.015, 0);
    sofaGroup.add(sofaShadow);

    this.group.add(sofaGroup);
  }

  private createCoffeeTable() {
    const tableGroup = new THREE.Group();
    tableGroup.name = 'CoffeeTable';
    tableGroup.position.set(this.orbPosition.x, 0, this.orbPosition.z);

    // Bronze / brushed graphite metal base
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x242d38,
      roughness: 0.35,
      metalness: 0.85,
    });

    // Heavy round floor base
    const baseDisk = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.05, 32), baseMat);
    baseDisk.position.y = 0.025;
    baseDisk.receiveShadow = true;
    tableGroup.add(baseDisk);

    // Architectural central pedestal stem
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.45, 24), baseMat);
    stem.position.y = 0.27;
    tableGroup.add(stem);

    // Glass Tabletop (Smoked beveled glass)
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x182836,
      transparent: true,
      opacity: 0.55,
      roughness: 0.15,
      metalness: 0.1,
      reflectivity: 0.8,
      clearcoat: 1.0,
      depthWrite: false,
    });
    const tabletop = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.04, 48), glassMat);
    tabletop.position.y = 0.52;
    tabletop.receiveShadow = true;
    tableGroup.add(tabletop);

    // Metallic trim ring around glass
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.25,
      metalness: 0.9,
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.018, 16, 48), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.52;
    tableGroup.add(rim);

    // Table contact shadow
    const tableShadowGeo = new THREE.CircleGeometry(1.3, 32);
    const tableShadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const tableShadow = new THREE.Mesh(tableShadowGeo, tableShadowMat);
    tableShadow.rotation.x = -Math.PI / 2;
    tableShadow.position.y = 0.012;
    tableGroup.add(tableShadow);

    this.group.add(tableGroup);
  }

  private createAreaRug() {
    const rugMat = new THREE.MeshStandardMaterial({
      color: 0x131d2a,
      roughness: 0.95,
      metalness: 0.05,
    });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.8), rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, 1.3);
    rug.receiveShadow = true;
    this.group.add(rug);
  }

  private createFloorLamp() {
    const lamp = new THREE.Group();
    lamp.name = 'StandingFloorLamp';
    lamp.position.set(this.floorLampPos.x, 0, this.floorLampPos.z);

    // 1. Heavy cast blackened bronze base plate
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1a212b,
      roughness: 0.35,
      metalness: 0.85,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.035, 32), baseMat);
    base.position.y = 0.018;
    base.receiveShadow = true;
    lamp.add(base);

    // 2. Slender brushed brass stem
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Brushed warm brass
      roughness: 0.25,
      metalness: 0.9,
    });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.78, 16), brassMat);
    stem.position.y = 0.90;
    lamp.add(stem);

    // 3. Arched neck fitting
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 12, 24, Math.PI / 2), brassMat);
    neck.rotation.z = -Math.PI / 2;
    neck.position.set(-0.06, 1.78, 0);
    lamp.add(neck);

    // 4. Contemporary conical linen lampshade
    const shadeGeo = new THREE.CylinderGeometry(0.13, 0.22, 0.28, 32, 1, true);
    const shadeMat = new THREE.MeshStandardMaterial({
      color: 0xfff8ee,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
      emissive: 0xffeedd,
      emissiveIntensity: 0.25,
    });
    this.floorLampShadeMesh = new THREE.Mesh(shadeGeo, shadeMat);
    this.floorLampShadeMesh.position.set(-0.06, 1.70, 0);
    lamp.add(this.floorLampShadeMesh);

    // 5. Diffuser disc at bottom of shade
    this.floorLampDiffuserMaterial = new THREE.MeshBasicMaterial({
      color: 0xffeed4,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const diffuser = new THREE.Mesh(new THREE.CircleGeometry(0.20, 24), this.floorLampDiffuserMaterial);
    diffuser.rotation.x = Math.PI / 2;
    diffuser.position.set(-0.06, 1.57, 0);
    lamp.add(diffuser);

    // 6. Warm LED Bulb with animated emissive glow
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff4e0,
      emissive: 0xffb45c,
      emissiveIntensity: 0.15,
      roughness: 0.28,
      metalness: 0.0,
    });
    this.floorLampBulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 16), bulbMat);
    this.floorLampBulbMesh.position.set(-0.06, 1.68, 0);
    lamp.add(this.floorLampBulbMesh);

    // 7. Floor lamp point light (soft, realistic warmth)
    this.floorLampLight = new THREE.PointLight(0xffecd1, 0.35, 7.5, 1.2);
    this.floorLampLight.position.set(-0.06, 1.65, 0);
    this.floorLampLight.castShadow = false;
    lamp.add(this.floorLampLight);

    this.floorLampGroup = lamp;
    this.group.add(lamp);
  }

  private createLampReflector() {
    const reflectorGroup = new THREE.Group();
    reflectorGroup.name = 'FloorLampCardboardReflector';

    // Set just behind and to the side of the lamp, angled toward both the lamp
    // and the viewing area so its warm reflected light is easy to read.
    reflectorGroup.position.set(4.55, 0, -4.55);
    reflectorGroup.rotation.y = -0.8;

    // A simple matte sand-ivory cardboard panel with a visible, slightly darker edge.
    const cardboardMaterial = new THREE.MeshStandardMaterial({
      color: 0x806044,
      roughness: 0.96,
      metalness: 0.0,
    });
    const cardboard = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 1.42, 0.06),
      cardboardMaterial
    );
    cardboard.position.set(0, 0.78, 0);
    cardboard.castShadow = true;
    cardboard.receiveShadow = true;
    reflectorGroup.add(cardboard);

    // Small understated feet keep the board grounded without turning it into signage.
    const footMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3025,
      roughness: 0.82,
      metalness: 0.08,
    });
    const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.22), footMaterial);
    leftFoot.position.set(-0.36, 0.09, -0.07);
    reflectorGroup.add(leftFoot);
    const rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.22), footMaterial);
    rightFoot.position.set(0.36, 0.09, -0.07);
    reflectorGroup.add(rightFoot);

    // A soft radial amber wash makes the light bounce legible on the cardboard.
    // The existing floor-lamp point light still provides the actual scene illumination.
    const textureSize = 96;
    const pixels = new Uint8Array(textureSize * textureSize * 4);
    for (let y = 0; y < textureSize; y++) {
      for (let x = 0; x < textureSize; x++) {
        const u = (x / (textureSize - 1) - 0.5) / 0.62;
        const v = (y / (textureSize - 1) - 0.52) / 0.78;
        const radius = Math.sqrt(u * u + v * v);
        const falloff = Math.max(0, 1 - radius);
        const alpha = Math.round(Math.pow(falloff, 2.0) * 230);
        const index = (y * textureSize + x) * 4;
        pixels[index] = 255;
        pixels[index + 1] = 255;
        pixels[index + 2] = 255;
        pixels[index + 3] = alpha;
      }
    }

    const bounceTexture = new THREE.DataTexture(
      pixels,
      textureSize,
      textureSize,
      THREE.RGBAFormat
    );
    bounceTexture.needsUpdate = true;

    this.floorLampReflectorGlowMaterial = new THREE.MeshBasicMaterial({
      map: bounceTexture,
      color: 0xffa34d,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.floorLampReflectorGlowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 1.22),
      this.floorLampReflectorGlowMaterial
    );
    this.floorLampReflectorGlowMesh.position.set(0, 0.78, 0.032);
    this.floorLampReflectorGlowMesh.visible = false;
    reflectorGroup.add(this.floorLampReflectorGlowMesh);

    this.group.add(reflectorGroup);
  }

  public checkFishLampProximity(fishList: { pos: THREE.Vector3; group: THREE.Group }[]) {
    const triggerRadiusSq = 2.6 * 2.6; // Slightly forgiving radius around the lamp shade
    const exitRadiusSq = 3.2 * 3.2;    // Hysteresis prevents repeated edge triggers

    // Compare actual scene-space positions so parent transforms cannot desynchronise
    // the fish route from the physical lamp's location.
    this.floorLampLight.getWorldPosition(this.lampWorldPosition);

    for (let i = 0; i < fishList.length; i++) {
      const fish = fishList[i];
      if (!fish.group.visible) continue;

      fish.group.getWorldPosition(this.fishWorldPosition);
      const distSq = this.lampWorldPosition.distanceToSquared(this.fishWorldPosition);

      if (distSq < triggerRadiusSq) {
        if (!this.nearFishIds.has(i)) {
          // Fish enters the lamp's world-space radius: trigger a full three-second glow.
          this.nearFishIds.add(i);
          this.floorLampTimer = 3.0;
        }
      } else if (distSq > exitRadiusSq) {
        // Fish leaves proximity: allow a new glow on its next pass.
        this.nearFishIds.delete(i);
      }
    }
  }

  private createGlowingOrb() {
    const orbRoot = new THREE.Group();
    orbRoot.name = 'PhysicalGlowingOrb';
    orbRoot.position.copy(this.orbPosition);

    // 1. Sculptural brass / dark chrome ring pedestal
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x1e2d3d,
      roughness: 0.25,
      metalness: 0.9,
    });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.08, 32), pedestalMat);
    pedestal.position.y = -0.38;
    orbRoot.add(pedestal);

    const pedestalRing = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.015, 16, 32), pedestalMat);
    pedestalRing.rotation.x = Math.PI / 2;
    pedestalRing.position.y = -0.34;
    orbRoot.add(pedestalRing);

    // 2. Miniature Underwater City Base inside orb
    const seabedMat = new THREE.MeshStandardMaterial({
      color: 0x0d283c,
      roughness: 0.8,
    });
    const seabed = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 24), seabedMat);
    seabed.position.y = -0.32;
    orbRoot.add(seabed);

    // 3. Miniature Crystalline Buildings
    const bldgMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 0.9,
    });

    const miniBldgGroup = new THREE.Group();
    // Central miniature spire
    const spireGeo = new THREE.ConeGeometry(0.06, 0.42, 8);
    const mainSpire = new THREE.Mesh(spireGeo, bldgMat);
    mainSpire.position.set(0, -0.09, 0);
    miniBldgGroup.add(mainSpire);

    // Surrounding miniature futuristic highrises
    const miniPositions = [
      { x: 0.12, z: 0.08, h: 0.24, w: 0.045 },
      { x: -0.11, z: 0.09, h: 0.28, w: 0.04 },
      { x: 0.09, z: -0.12, h: 0.22, w: 0.05 },
      { x: -0.13, z: -0.07, h: 0.31, w: 0.04 },
      { x: 0.0, z: 0.16, h: 0.18, w: 0.035 },
      { x: -0.02, z: -0.17, h: 0.20, w: 0.04 },
    ];

    miniPositions.forEach((pos) => {
      const bldg = new THREE.Mesh(new THREE.BoxGeometry(pos.w, pos.h, pos.w), bldgMat);
      bldg.position.set(pos.x, -0.32 + pos.h / 2, pos.z);
      miniBldgGroup.add(bldg);

      // Tiny pinnacle antennas
      const antenna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, 0.06, 8),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9 })
      );
      antenna.position.set(pos.x, -0.32 + pos.h + 0.03, pos.z);
      miniBldgGroup.add(antenna);
    });

    // Miniature underwater domes
    const domeMat = new THREE.MeshPhysicalMaterial({
      color: 0x2dd4bf,
      emissive: 0x0d9488,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.7,
      roughness: 0.1,
    });
    const dome1 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome1.position.set(0.14, -0.32, -0.04);
    miniBldgGroup.add(dome1);

    orbRoot.add(miniBldgGroup);

    // 4. Miniature Circling Fish inside the orb
    const miniFishGroup = new THREE.Group();
    const fishGeo = new THREE.ConeGeometry(0.016, 0.045, 6);
    fishGeo.rotateX(Math.PI / 2);
    const miniFishMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
    });

    for (let i = 0; i < 7; i++) {
      const fishMesh = new THREE.Mesh(fishGeo, miniFishMat);
      const angle = (i / 7) * Math.PI * 2;
      const radius = 0.16 + Math.random() * 0.1;
      const y = -0.22 + Math.random() * 0.28;
      fishMesh.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      miniFishGroup.add(fishMesh);

      this.miniFishList.push({
        mesh: fishMesh,
        angle,
        speed: 0.6 + Math.random() * 0.5,
        radius,
        y,
      });
    }
    orbRoot.add(miniFishGroup);

    // 5. Inner Bioluminescent Point Light
    const pointLight = new THREE.PointLight(0x38bdf8, 2.2, 3.5);
    pointLight.position.set(0, -0.05, 0);
    orbRoot.add(pointLight);

    // 6. Volumetric Glow Shell
    const glowGeo = new THREE.SphereGeometry(0.39, 32, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    orbRoot.add(glowMesh);

    // 7. Outer Glass Orb Spherical Vessel
    const glassGeo = new THREE.SphereGeometry(0.42, 48, 48);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x7dd3fc,
      roughness: 0.05,
      metalness: 0.05,
      transparent: true,
      opacity: 0.45,
      reflectivity: 0.95,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      depthWrite: false,
    });
    const outerGlass = new THREE.Mesh(glassGeo, glassMat);
    outerGlass.castShadow = false;
    orbRoot.add(outerGlass);

    // 8. Subtle glowing ripple ring around the orb for hand pinch confirmation
    const rippleGeo = new THREE.RingGeometry(0.44, 0.49, 48);
    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pinchRipple = new THREE.Mesh(rippleGeo, rippleMat);
    pinchRipple.rotation.x = Math.PI / 2;
    pinchRipple.position.y = -0.15;
    pinchRipple.visible = false;
    orbRoot.add(pinchRipple);
    this.orbPinchRippleMesh = pinchRipple;

    // 9. Generous invisible hit-proxy sphere to guarantee crisp mouse and hand raycasting
    const hitGeo = new THREE.SphereGeometry(0.52, 24, 24);
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    const hitProxy = new THREE.Mesh(hitGeo, hitMat);
    hitProxy.name = 'OrbHitProxy';
    orbRoot.add(hitProxy);
    this.orbHitProxy = hitProxy;

    return {
      group: orbRoot,
      pointLight,
      fishGroup: miniFishGroup,
      glowMesh,
      outerGlass,
    };
  }

  public setOrbHandHover(isHovering: boolean) {
    this.orbHandHover = isHovering;
  }

  public setOrbHandPinching(isPinching: boolean) {
    this.orbHandPinched = isPinching;
    if (isPinching) {
      this.pinchRipplePhase = 0;
    }
  }

  public triggerOrbClickFeedback() {
    this.orbHandHover = false;
    this.orbHandPinched = true;
    this.pinchRipplePhase = 0;
    this.orbPinchRippleMesh.visible = true;
    this.orbPinchRippleMesh.scale.set(1.35, 1.35, 1.35);
    (this.orbPinchRippleMesh.material as THREE.MeshBasicMaterial).opacity = 1.0;
    this.orbLight.intensity = 5.5;
  }

  private createEmergenceSystem() {
    // Significantly reduced particle count: sparse, controlled, elegant emission (36 particles)
    const count = 36;
    const geo = new THREE.BufferGeometry();
    this.emergencePositions = new Float32Array(count * 3);
    this.emergenceVelocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      this.resetEmergenceParticle(i);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.emergencePositions, 3));

    // Delicate, small glowing motes with subtle transparency
    const mat = new THREE.PointsMaterial({
      size: 0.065,
      map: createParticleTexture(),
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.emergenceParticles = new THREE.Points(geo, mat);
    this.group.add(this.emergenceParticles);

    // Small bubbles emerging directly from the orb (kept completely unchanged)
    this.emergenceBubblesGroup = new THREE.Group();
    const bubbleGeo = new THREE.SphereGeometry(0.04, 12, 12);
    const bubbleMat = new THREE.MeshPhysicalMaterial({
      color: 0x67e8f9,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.65,
      roughness: 0.1,
      metalness: 0.1,
      clearcoat: 1.0,
      depthWrite: false,
    });

    for (let b = 0; b < 14; b++) {
      const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
      bubble.position.copy(this.orbPosition);
      bubble.scale.set(0.001, 0.001, 0.001);
      this.emergenceBubblesGroup.add(bubble);
    }
    this.emergenceBubblesGroup.visible = false;
    this.group.add(this.emergenceBubblesGroup);
  }

  private resetEmergenceParticle(i: number) {
    const angle = Math.random() * Math.PI * 2;
    const r = 0.06 + Math.random() * 0.16; // Restrained radius close to orb surface
    this.emergencePositions[i * 3] = this.orbPosition.x + Math.cos(angle) * r;
    this.emergencePositions[i * 3 + 1] = this.orbPosition.y - 0.04 + Math.random() * 0.16;
    this.emergencePositions[i * 3 + 2] = this.orbPosition.z + Math.sin(angle) * r;

    // Slow, unhurried, gentle upward drifting velocity
    this.emergenceVelocities[i * 3] = Math.cos(angle) * 0.08 + (Math.random() - 0.5) * 0.05;
    this.emergenceVelocities[i * 3 + 1] = 0.12 + Math.random() * 0.15;
    this.emergenceVelocities[i * 3 + 2] = Math.sin(angle) * 0.08 + (Math.random() - 0.5) * 0.05;
  }

  public setOutdoorSkylineOpacity(opacity: number) {
    (this.outdoorSkylineMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, Math.min(1, opacity));
    this.outdoorSkylineMesh.visible = opacity > 0.01;
  }

  public setEmergenceProgress(progress: number) {
    this.emergenceProgress = progress;
    this.emergenceActive = progress > 0.01;
    // Subtle glow and transparency: capped at 0.42 to prevent visual overwhelm
    (this.emergenceParticles.material as THREE.PointsMaterial).opacity = Math.min(0.42, progress * 0.42);
    this.emergenceBubblesGroup.visible = progress > 0.05;
  }

  public setCausticOpacity(opacity: number) {
    (this.causticsOverlayMesh.material as THREE.MeshBasicMaterial).opacity = opacity;
  }

  public setCausticMap(texture: THREE.CanvasTexture) {
    (this.causticsOverlayMesh.material as THREE.MeshBasicMaterial).map = texture;
    (this.causticsOverlayMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
  }

  public setOrbExpansion(progress: number) {
    // progress: 0 (default miniature) to 1 (full energy expansion)
    this.orbLight.intensity = 2.2 + progress * 4.0;
    (this.orbGlowMesh.material as THREE.MeshBasicMaterial).opacity = 0.15 + progress * 0.4;
    const pulseScale = 1.0 + progress * 0.15;
    this.orbGlowMesh.scale.set(pulseScale, pulseScale, pulseScale);
  }

  public update(delta: number, elapsed: number) {
    // Animate miniature fish inside the orb
    for (const item of this.miniFishList) {
      item.angle += item.speed * delta;
      item.mesh.position.x = Math.cos(item.angle) * item.radius;
      item.mesh.position.z = Math.sin(item.angle) * item.radius;
      item.mesh.position.y = item.y + Math.sin(elapsed * 2 + item.angle) * 0.02;

      // Rotate fish towards heading
      item.mesh.rotation.y = -item.angle + Math.PI / 2;
    }

    // Gentle pulse of the orb core glow + subtle hand pinch/hover feedback
    const pulse = Math.sin(elapsed * 1.8) * 0.05;
    let handBoost = 0;
    if (this.orbHandPinched) {
      handBoost = 1.4;
      this.pinchRipplePhase += delta * 4.0;
      this.orbPinchRippleMesh.visible = true;
      const s = 1.0 + (Math.sin(this.pinchRipplePhase) + 1) * 0.08;
      this.orbPinchRippleMesh.scale.set(s, s, s);
      (this.orbPinchRippleMesh.material as THREE.MeshBasicMaterial).opacity = 0.85;
    } else if (this.orbHandHover) {
      handBoost = 0.45;
      this.orbPinchRippleMesh.visible = true;
      this.orbPinchRippleMesh.scale.set(1.0, 1.0, 1.0);
      (this.orbPinchRippleMesh.material as THREE.MeshBasicMaterial).opacity = 0.28;
    } else {
      const mat = this.orbPinchRippleMesh.material as THREE.MeshBasicMaterial;
      if (mat.opacity > 0.01) {
        mat.opacity = THREE.MathUtils.damp(mat.opacity, 0.0, 4.0, delta);
      } else {
        this.orbPinchRippleMesh.visible = false;
      }
    }
    this.orbLight.intensity = (2.2 + pulse + handBoost) * (1.0 + this.emergenceProgress * 1.5);

    // Floor lamp glow: ramp up visibly, hold for three seconds, then fade smoothly.
    if (this.floorLampTimer > 0) {
      this.floorLampTimer = Math.max(0, this.floorLampTimer - delta);
      this.floorLampTargetIntensity = 7.5;
    } else {
      this.floorLampTargetIntensity = 0.35;
    }

    this.floorLampCurrentIntensity = THREE.MathUtils.damp(
      this.floorLampCurrentIntensity,
      this.floorLampTargetIntensity,
      2.8,
      delta
    );
    this.floorLampLight.intensity = this.floorLampCurrentIntensity;

    const glowAmount = THREE.MathUtils.clamp(
      (this.floorLampCurrentIntensity - 0.35) / (7.5 - 0.35),
      0,
      1
    );

    // The reflector's warm patch follows the exact lamp glow envelope, then fades away with it.
    if (this.floorLampReflectorGlowMaterial && this.floorLampReflectorGlowMesh) {
      this.floorLampReflectorGlowMaterial.opacity = glowAmount * 0.46;
      this.floorLampReflectorGlowMesh.visible = glowAmount > 0.015;
    }
    // Shift the lamp itself from soft neutral white to a visible warm amber-orange.
    // Using reusable colours avoids allocating new Color objects in the render loop.
    if (this.floorLampShadeMesh) {
      const shadeMaterial = this.floorLampShadeMesh.material as THREE.MeshStandardMaterial;
      shadeMaterial.color.lerpColors(this.lampShadeNeutral, this.lampShadeAmber, glowAmount);
      shadeMaterial.emissive.lerpColors(
        this.lampShadeEmissiveNeutral,
        this.lampShadeEmissiveAmber,
        glowAmount
      );
      shadeMaterial.emissiveIntensity = 0.15 + glowAmount * 1.9;
    }
    if (this.floorLampBulbMesh) {
      const bulbMaterial = this.floorLampBulbMesh.material as THREE.MeshStandardMaterial;
      bulbMaterial.color.lerpColors(this.lampBulbNeutral, this.lampBulbAmber, glowAmount);
      bulbMaterial.emissive.lerpColors(
        this.lampBulbEmissiveNeutral,
        this.lampBulbEmissiveAmber,
        glowAmount
      );
      bulbMaterial.emissiveIntensity = 0.15 + glowAmount * 4.6;
      this.floorLampBulbMesh.scale.setScalar(1.0 + glowAmount * 0.22);
    }
    if (this.floorLampDiffuserMaterial) {
      this.floorLampDiffuserMaterial.color.lerpColors(
        this.lampDiffuserNeutral,
        this.lampDiffuserAmber,
        glowAmount
      );
      this.floorLampDiffuserMaterial.opacity = 0.45 + glowAmount * 0.5;
    }
    this.floorLampLight.color.lerpColors(
      this.lampLightNeutral,
      this.lampLightAmber,
      glowAmount
    );

    // Animate emergence particles rising and floating out of the orb
    if (this.emergenceActive) {
      const posAttr = this.emergenceParticles.geometry.attributes.position as THREE.BufferAttribute;
      const count = this.emergencePositions.length / 3;

      for (let i = 0; i < count; i++) {
        this.emergencePositions[i * 3] += this.emergenceVelocities[i * 3] * delta;
        this.emergencePositions[i * 3 + 1] += this.emergenceVelocities[i * 3 + 1] * delta;
        this.emergencePositions[i * 3 + 2] += this.emergenceVelocities[i * 3 + 2] * delta;

        // Gentle subtle swirl around orb column
        const swirl = delta * 0.35;
        const dx = this.emergencePositions[i * 3] - this.orbPosition.x;
        const dz = this.emergencePositions[i * 3 + 2] - this.orbPosition.z;
        this.emergencePositions[i * 3] = this.orbPosition.x + dx * Math.cos(swirl) - dz * Math.sin(swirl);
        this.emergencePositions[i * 3 + 2] = this.orbPosition.z + dx * Math.sin(swirl) + dz * Math.cos(swirl);

        // Restrained boundary: rises only ~1.3m above the orb and stays within 0.85m radius
        // Prevents particles from filling the screen or obscuring room and window
        if (this.emergencePositions[i * 3 + 1] > 2.25 || Math.hypot(dx, dz) > 0.85) {
          this.resetEmergenceParticle(i);
        }
      }
      posAttr.needsUpdate = true;

      // Animate emergence bubbles rising from orb
      const bubbles = this.emergenceBubblesGroup.children;
      for (let b = 0; b < bubbles.length; b++) {
        const bubble = bubbles[b] as THREE.Mesh;
        const phase = (elapsed * 0.8 + b * 0.45) % 2.5; // cycle 0 to 2.5 seconds
        const y = this.orbPosition.y + 0.35 + phase * 0.9;
        const spread = (phase / 2.5) * 0.6;
        const angle = b * 0.8;
        bubble.position.set(
          this.orbPosition.x + Math.cos(angle) * spread,
          y,
          this.orbPosition.z + Math.sin(angle) * spread
        );
        const s = Math.sin((phase / 2.5) * Math.PI) * (0.8 + (b % 3) * 0.3);
        bubble.scale.set(s, s, s);
      }
    }
  }
}

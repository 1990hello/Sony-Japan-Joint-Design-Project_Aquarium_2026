/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LivingRoom } from './LivingRoom';
import { UnderwaterCity } from './UnderwaterCity';
import { MarineLife, type FishEntity } from './MarineLife';
import { SoundSculptures } from './SoundSculptures';
import { DynamicCausticsTexture } from './proceduralTextures';
import { soundEngine } from '../audio/SoundEngine';
import { ExperienceMoment, CameraPreset } from '../types';

export class SceneManager {
  private container: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;
  private isSoftwareGl: boolean;
  private frameId = 0;
  private isDisposed = false;

  // Scene Sub-components
  public livingRoom: LivingRoom;
  public underwaterCity: UnderwaterCity;
  public marineLife: MarineLife;
  public soundSculptures: SoundSculptures;
  private dynamicCaustics: DynamicCausticsTexture;

  // Lighting
  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private roomAmbientLight: THREE.PointLight;

  // Interaction & Raycasting
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-999, -999);
  private dragPlane = new THREE.Plane();
  private dragIntersection = new THREE.Vector3();
  private draggedObject: THREE.Group | null = null;
  private draggedFish: FishEntity | null = null;
  private dragOffset = new THREE.Vector3();

  // Hand Tracking Raycasting & Pinch Interaction
  private handRaycaster = new THREE.Raycaster();
  private handNdc = new THREE.Vector2(-999, -999);
  private isHandPinchingOrb = false;

  // Camera & Moment States
  private currentMoment: ExperienceMoment = 1;
  private cameraMode: CameraPreset = 'cinematic';
  private cameraTargetPos = new THREE.Vector3(0, 1.35, 1.5);
  private cameraLookAtTarget = new THREE.Vector3(0, 0.95, 0.4);
  private cameraCurrentLookAt = new THREE.Vector3(0, 0.95, 0.4);

  // Free look mouse navigation
  private isMouseDown = false;
  private prevMouseX = 0;
  private prevMouseY = 0;
  private spherical = { radius: 3.5, theta: 0, phi: Math.PI / 2.3 };

  // Callbacks to React
  private onMomentAdvanceCallback?: (moment: ExperienceMoment) => void;
  private onInteractionNoticeCallback?: (text: string) => void;

  // Experience Reverse Collapse to Orb State
  private isCollapsingBackToOrb = false;
  private collapseElapsed = 0;
  private readonly collapseDuration = 3.5;

  constructor(
    container: HTMLDivElement,
    callbacks?: {
      onMomentAdvance?: (moment: ExperienceMoment) => void;
      onInteractionNotice?: (text: string) => void;
    }
  ) {
    this.container = container;
    this.onMomentAdvanceCallback = callbacks?.onMomentAdvance;
    this.onInteractionNoticeCallback = callbacks?.onInteractionNotice;
    this.clock = new THREE.Clock();

    // 1. Software WebGL Detection
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    // 3. Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c101d);
    // Subtle evening horizon fog for normal room
    this.scene.fog = new THREE.FogExp2(0x0e1320, 0.008);

    this.camera = new THREE.PerspectiveCamera(
      52,
      container.clientWidth / container.clientHeight,
      0.1,
      250
    );
    this.camera.position.set(0, 1.25, 1.4);
    this.camera.lookAt(0, 0.95, 0.4);

    // 4. Studio Environment Reflection Map
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 5. Lighting Setup
    this.hemiLight = new THREE.HemisphereLight(0xe0e7ff, 0x1a1a24, 0.85);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff1e6, 1.6);
    this.keyLight.position.set(4, 8, -6);
    this.keyLight.castShadow = !this.isSoftwareGl;
    if (this.keyLight.castShadow) {
      this.keyLight.shadow.mapSize.width = 1024;
      this.keyLight.shadow.mapSize.height = 1024;
      this.keyLight.shadow.bias = -0.0005;
      this.keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.keyLight);

    // Warm ceiling interior fill
    this.roomAmbientLight = new THREE.PointLight(0xffedd5, 0.45, 12);
    this.roomAmbientLight.position.set(0, 4.5, 0);
    this.scene.add(this.roomAmbientLight);

    // 6. Sub-components
    this.dynamicCaustics = new DynamicCausticsTexture();

    this.livingRoom = new LivingRoom();
    this.livingRoom.setCausticMap(this.dynamicCaustics.texture);
    this.scene.add(this.livingRoom.group);

    this.underwaterCity = new UnderwaterCity();
    this.scene.add(this.underwaterCity.group);

    this.marineLife = new MarineLife();
    this.marineLife.setLampPosition(this.livingRoom.floorLampPos);
    this.scene.add(this.marineLife.group);

    this.soundSculptures = new SoundSculptures();
    this.soundSculptures.onStateTransitionRequested = (targetMoment) => {
      this.setMoment(targetMoment);
    };
    this.scene.add(this.soundSculptures.group);

    // 7. Event Listeners
    this.setupEventListeners();

    // 8. Apply Initial Moment State
    this.setMoment(1, false);

    // 9. Pre-warm shaders
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 10. Start Animation Loop
    this.startLoop();
  }

  private setupEventListeners() {
    window.addEventListener('resize', this.onResize);
    this.container.addEventListener('pointermove', this.onPointerMove);
    this.container.addEventListener('pointerdown', this.onPointerDown);
    this.container.addEventListener('pointerup', this.onPointerUp);
    this.container.addEventListener('pointercancel', this.onPointerUp);
  }

  private onResize = () => {
    if (!this.container || this.isDisposed) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Raycast for hover interactions
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const planeIntersect = new THREE.Vector3();
    const cursorRay = this.raycaster.ray;

    // Drag a selected fish directly under the mouse or finger.
    if (this.draggedFish) {
      if (cursorRay.intersectPlane(this.dragPlane, planeIntersect)) {
        this.marineLife.moveDraggedFish(this.draggedFish, planeIntersect.sub(this.dragOffset));
      }
      return;
    }

    // If dragging a sound sculpture
    if (this.draggedObject) {
      if (cursorRay.intersectPlane(this.dragPlane, planeIntersect)) {
        this.draggedObject.position.copy(planeIntersect.sub(this.dragOffset));
        // Keep within room elevation bounds
        this.draggedObject.position.y = Math.max(0.8, Math.min(3.2, this.draggedObject.position.y));
        this.soundSculptures.checkSculpturesProximityChord();
      }
      return;
    }

    // Free look rotation when dragging background
    if (this.isMouseDown && this.cameraMode === 'free') {
      const deltaX = e.clientX - this.prevMouseX;
      const deltaY = e.clientY - this.prevMouseY;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;

      this.spherical.theta -= deltaX * 0.005;
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.2, this.spherical.phi - deltaY * 0.005));

      const sinPhi = Math.sin(this.spherical.phi);
      this.cameraTargetPos.set(
        this.cameraLookAtTarget.x + this.spherical.radius * sinPhi * Math.sin(this.spherical.theta),
        this.cameraLookAtTarget.y + this.spherical.radius * Math.cos(this.spherical.phi),
        this.cameraLookAtTarget.z + this.spherical.radius * sinPhi * Math.cos(this.spherical.theta)
      );
      return;
    }

    // Cursor proximity reactions
    const worldPoint = cursorRay.origin.clone().add(cursorRay.direction.clone().multiplyScalar(4));
    const isMoving = (Math.abs(e.movementX) + Math.abs(e.movementY)) > 0.6;
    this.marineLife.updateCursorInteraction(worldPoint, isMoving, 0.016);

    // Check hover cursor: the orb is interactive during World Emergence (State 2).
    if (this.currentMoment === 2) {
      const orbIntersects = this.raycaster.intersectObjects(this.livingRoom.orbGroup.children, true);
      const isHover = orbIntersects.length > 0;
      this.container.style.cursor = isHover ? 'pointer' : 'default';
      this.livingRoom.setOrbHandHover(isHover);
    } else {
      const scIntersects = this.raycaster.intersectObjects(this.soundSculptures.interactiveMeshes, true);
      const bubbleIntersects = this.raycaster.intersectObjects(this.marineLife.bubbleMeshGroup.children, false);
      const fishIntersects = this.raycaster.intersectObjects(this.marineLife.fishClickableMeshes, false);
      const isHovering = scIntersects.length > 0 || bubbleIntersects.length > 0 || fishIntersects.length > 0;
      this.container.style.cursor = isHovering ? 'pointer' : 'default';
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    soundEngine.init(); // Initialize audio context on first user interaction
    this.prevMouseX = e.clientX;
    this.prevMouseY = e.clientY;
    this.isMouseDown = true;

    // Direct NDC mouse calculation prevents uninitialized coordinate misses
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const cursorRay = this.raycaster.ray;
    const worldPoint = cursorRay.origin.clone().add(cursorRay.direction.clone().multiplyScalar(4));

    // 1. In World Emergence (State 2), clicking the physical glowing orb transforms the room.
    if (this.currentMoment === 2) {
      const orbIntersects = this.raycaster.intersectObjects(this.livingRoom.orbGroup.children, true);
      if (orbIntersects.length > 0) {
        this.livingRoom.triggerOrbClickFeedback();
        soundEngine.playPinchFeedback();
        this.advanceMoment();
        return;
      }
    }

    // 2. Interactive Fish Clicking (Level 2: 10-second follow and 3-5s gentle departure)
    if (this.currentMoment >= 2) {
      const fishIntersects = this.raycaster.intersectObjects(this.marineLife.fishClickableMeshes, false);
      if (fishIntersects.length > 0) {
        const hitFish = fishIntersects[0].object;
        const result = this.marineLife.clickFish(hitFish, worldPoint);
        if (result) {
          this.draggedFish = result.fish;
          result.fish.isBeingDragged = true;
          result.fish.dragPreviousPos.copy(result.fish.pos);
          result.fish.dragSmoothedVelocity.set(0, 0, 0);
          result.fish.vel.set(0, 0, 0);

          // Keep the fish at its original depth while the pointer moves across the screen.
          const normal = this.camera.getWorldDirection(new THREE.Vector3()).negate();
          this.dragPlane.setFromNormalAndCoplanarPoint(normal, result.fish.pos);
          if (cursorRay.intersectPlane(this.dragPlane, this.dragIntersection)) {
            this.dragOffset.copy(this.dragIntersection).sub(result.fish.pos);
          }

          // Pointer capture keeps the drag alive if a finger or mouse leaves the canvas.
          this.renderer.domElement.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    // 3. Interactive Sound Sculptures (Available once arrived in State 3, throughout State 4 and State 5)
    if (this.currentMoment >= 3) {
      const scIntersects = this.raycaster.intersectObjects(this.soundSculptures.interactiveMeshes, true);
      if (scIntersects.length > 0) {
        const hit = scIntersects[0].object;
        const activated = this.soundSculptures.triggerSculpture(hit);
        if (activated) {
          const info = this.soundSculptures.sculptureMap.get(hit);
          if (info) {
            this.draggedObject = info.rootGroup;
            // Set drag plane facing camera at object position
            const normal = this.camera.getWorldDirection(new THREE.Vector3()).negate();
            this.dragPlane.setFromNormalAndCoplanarPoint(normal, info.rootGroup.position);
            if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragIntersection)) {
              this.dragOffset.copy(this.dragIntersection).sub(info.rootGroup.position);
            }
            // Attract nearby fish
            this.marineLife.attractFishTowards(info.rootGroup.position);
          }
          return;
        }
      }
    }

    // 4. Interactive Bubbles
    const bubbleIntersects = this.raycaster.intersectObjects(this.marineLife.bubbleMeshGroup.children, false);
    if (bubbleIntersects.length > 0) {
      this.marineLife.popBubbleAt(bubbleIntersects[0].object);
      return;
    }
  };

  private onPointerUp = () => {
    this.isMouseDown = false;
    if (this.draggedFish) {
      this.draggedFish.isBeingDragged = false;
      this.draggedFish = null;
    }
    this.draggedObject = null;
  };

  /**
   * Evaluates hand position for spatial hover states and returns contextual target info
   */
  public onHandMove(
    normX: number,
    normY: number,
    isPinching: boolean
  ): { isOverOrb: boolean; target: 'NONE' | 'PHYSICAL ORB' | 'FISH' | 'BUBBLE' | 'INSTRUMENT' } {
    this.handNdc.set(normX * 2 - 1, -(normY * 2 - 1));
    this.handRaycaster.setFromCamera(this.handNdc, this.camera);

    const handRay = this.handRaycaster.ray;
    const worldPoint = handRay.origin.clone().add(handRay.direction.clone().multiplyScalar(4));

    // Keep the selected fish responsive to hand movement, just as it is to mouse movement.
    // Only intentionally selected fish follow; all other fish remain autonomous.
    this.marineLife.updateCursorInteraction(worldPoint, true, 0.016);

    // Pinch-and-hold lets the user drag a fish directly through the water.
    if (isPinching && this.draggedFish) {
      if (handRay.intersectPlane(this.dragPlane, this.dragIntersection)) {
        this.marineLife.moveDraggedFish(
          this.draggedFish,
          this.dragIntersection.sub(this.dragOffset)
        );
      }
    }

    // Pinch-and-hold also lets the user move a sound sculpture through the room.
    if (isPinching && this.draggedObject) {
      if (handRay.intersectPlane(this.dragPlane, this.dragIntersection)) {
        this.draggedObject.position.copy(this.dragIntersection.sub(this.dragOffset));
        this.draggedObject.position.y = Math.max(0.8, Math.min(3.2, this.draggedObject.position.y));
        this.soundSculptures.checkSculpturesProximityChord();
      }
    }

    let isOverOrb = false;
    let target: 'NONE' | 'PHYSICAL ORB' | 'FISH' | 'BUBBLE' | 'INSTRUMENT' = 'NONE';

    if (this.currentMoment === 2) {
      const orbHits = this.handRaycaster.intersectObjects(this.livingRoom.orbGroup.children, true);
      isOverOrb = orbHits.length > 0;
      if (isOverOrb) target = 'PHYSICAL ORB';
      this.livingRoom.setOrbHandHover(isOverOrb);
    } else {
      this.livingRoom.setOrbHandHover(false);

      // Diagnostic hover raycasts use the same targets as pinch activation.
      // Report the nearest target so we can distinguish a missed ray from a missed pinch event.
      const candidates: {
        name: 'FISH' | 'BUBBLE' | 'INSTRUMENT';
        hits: THREE.Intersection[];
      }[] = [
        {
          name: 'FISH',
          hits: this.currentMoment >= 2
            ? this.handRaycaster.intersectObjects(this.marineLife.fishClickableMeshes, false)
            : [],
        },
        {
          name: 'BUBBLE',
          hits: this.handRaycaster.intersectObjects(this.marineLife.bubbleMeshGroup.children, false),
        },
        {
          name: 'INSTRUMENT',
          hits: this.currentMoment >= 3
            ? this.handRaycaster.intersectObjects(this.soundSculptures.interactiveMeshes, true)
            : [],
        },
      ];

      let nearestDistance = Infinity;
      for (const candidate of candidates) {
        const hit = candidate.hits[0];
        if (hit && hit.distance < nearestDistance) {
          nearestDistance = hit.distance;
          target = candidate.name;
        }
      }
    }

    return { isOverOrb, target };
  }

  /**
   * Handles user initiating a pinch gesture at normalized screen coordinates
   */
  public onHandPinchStart(normX: number, normY: number): boolean {
    soundEngine.init();
    this.handNdc.set(normX * 2 - 1, -(normY * 2 - 1));
    this.handRaycaster.setFromCamera(this.handNdc, this.camera);

    const handRay = this.handRaycaster.ray;
    const worldPoint = handRay.origin.clone().add(handRay.direction.clone().multiplyScalar(4));

    // State 2: pinch the physical orb to enter the full room transformation.
    if (this.currentMoment === 2) {
      const orbHits = this.handRaycaster.intersectObjects(this.livingRoom.orbGroup.children, true);
      if (orbHits.length > 0) {
        this.isHandPinchingOrb = true;
        this.livingRoom.setOrbHandPinching(true);
        soundEngine.playPinchFeedback();
        this.livingRoom.triggerOrbClickFeedback();
        this.advanceMoment();
        return true;
      }
    }

    // Fish: pinch to grab, then keep pinching to drag it with the hand.
    if (this.currentMoment >= 2) {
      const fishHits = this.handRaycaster.intersectObjects(this.marineLife.fishClickableMeshes, false);
      if (fishHits.length > 0) {
        const selected = this.marineLife.clickFish(fishHits[0].object, worldPoint);
        if (selected) {
          this.draggedFish = selected.fish;
          selected.fish.isBeingDragged = true;
          selected.fish.dragPreviousPos.copy(selected.fish.pos);
          selected.fish.dragSmoothedVelocity.set(0, 0, 0);
          selected.fish.vel.set(0, 0, 0);

          // Keep the fish on its original depth plane while the hand moves.
          const normal = this.camera.getWorldDirection(new THREE.Vector3()).negate();
          this.dragPlane.setFromNormalAndCoplanarPoint(normal, selected.fish.pos);
          if (handRay.intersectPlane(this.dragPlane, this.dragIntersection)) {
            this.dragOffset.copy(this.dragIntersection).sub(selected.fish.pos);
          }
          return true;
        }
      }
    }

    // Sound sculptures: pinch to activate and hold to move, matching the mouse interaction.
    if (this.currentMoment >= 3) {
      const sculptureHits = this.handRaycaster.intersectObjects(this.soundSculptures.interactiveMeshes, true);
      if (sculptureHits.length > 0) {
        const hit = sculptureHits[0].object;
        const activated = this.soundSculptures.triggerSculpture(hit);
        if (activated) {
          const info = this.soundSculptures.sculptureMap.get(hit);
          if (info) {
            this.draggedObject = info.rootGroup;
            const normal = this.camera.getWorldDirection(new THREE.Vector3()).negate();
            this.dragPlane.setFromNormalAndCoplanarPoint(normal, info.rootGroup.position);
            if (handRay.intersectPlane(this.dragPlane, this.dragIntersection)) {
              this.dragOffset.copy(this.dragIntersection).sub(info.rootGroup.position);
            }
            this.marineLife.attractFishTowards(info.rootGroup.position);
          }
          return true;
        }
      }
    }

    // Bubbles: a quick pinch pops the bubble.
    const bubbleHits = this.handRaycaster.intersectObjects(this.marineLife.bubbleMeshGroup.children, false);
    if (bubbleHits.length > 0 && this.marineLife.popBubbleAt(bubbleHits[0].object)) {
      return true;
    }

    return false;
  }

  /**
   * Handles releasing a pinch: drops held instruments and clears the orb's pressed visual state.
   * The orb transformation itself is triggered immediately when the pinch begins.
   */
  public onHandPinchRelease(normX: number, normY: number): boolean {
    this.handNdc.set(normX * 2 - 1, -(normY * 2 - 1));
    this.handRaycaster.setFromCamera(this.handNdc, this.camera);

    // Releasing a pinch lets a dragged fish resume its selected-follow behaviour.
    if (this.draggedFish) {
      this.draggedFish.isBeingDragged = false;
      this.draggedFish = null;
    }

    // Releasing a pinch drops any sound sculpture being held.
    this.draggedObject = null;

    if (this.isHandPinchingOrb) {
      this.isHandPinchingOrb = false;
      this.livingRoom.setOrbHandPinching(false);
      this.livingRoom.setOrbHandHover(false);
      return true;
    }
    return false;
  }

  private lastAdvanceTime = 0;

  public advanceMoment() {
    const now = performance.now();
    if (now - this.lastAdvanceTime < 700) return;
    this.lastAdvanceTime = now;
    const next = Math.min(5, this.currentMoment + 1) as ExperienceMoment;
    this.setMoment(next);
  }

  public setMoment(moment: ExperienceMoment, playSound = true) {
    this.currentMoment = moment;
    this.soundSculptures.setMoment(moment);
    if (playSound) {
      soundEngine.playMomentTransition(moment);
    }
    if (this.onMomentAdvanceCallback) {
      this.onMomentAdvanceCallback(moment);
    }

    switch (moment) {
      case 1: // STATE 1 — THE MINIATURE WORLD INSIDE THE ORB (INITIAL_ORB)
        this.cameraMode = 'orb';
        this.cameraTargetPos.set(0, 1.25, 1.4);
        this.cameraLookAtTarget.set(0, 0.95, 0.4);

        // Windows show ordinary outdoor environment (normal evening city skyline)
        this.livingRoom.setOutdoorSkylineOpacity(1.0);
        // NO underwater city outside the windows
        this.underwaterCity.setVisibility(0.0);

        // Living room looks completely normal: floor and furniture have original appearance
        this.livingRoom.setCausticOpacity(0.0);
        this.livingRoom.setOrbExpansion(0.0);
        this.livingRoom.setEmergenceProgress(0.0);

        // NO fish in room, NO bubbles, NO jellyfish outside the orb
        this.marineLife.setMarineState(1);
        this.soundSculptures.setVisibility(0.0);

        // Warm cozy interior lighting
        this.roomAmbientLight.color.setHex(0xffedd5);
        this.roomAmbientLight.intensity = 0.8;
        this.hemiLight.color.setHex(0xe0e7ff);
        this.hemiLight.groundColor.setHex(0x1a1a24);
        this.hemiLight.intensity = 0.85;
        this.scene.fog = new THREE.FogExp2(0x0e1320, 0.008);
        break;

      case 2: // STATE 2 — THE UNDERWATER WORLD EMERGES (WORLD_EXPANSION)
        // Camera moves back slightly to frame the glowing orb releasing its world
        this.cameraMode = 'orb';
        this.cameraTargetPos.set(0, 1.4, 1.7);
        this.cameraLookAtTarget.set(0, 1.0, 0.4);

        // Windows still show ordinary outdoor view (not yet underwater)
        this.livingRoom.setOutdoorSkylineOpacity(1.0);
        this.underwaterCity.setVisibility(0.0);

        // Orb glows brighter, releasing small particles, tiny bubbles, and miniature fish
        this.livingRoom.setOrbExpansion(1.0);
        this.livingRoom.setEmergenceProgress(1.0);
        this.livingRoom.setCausticOpacity(0.12);

        // Small fish gradually emerge from the orb into the room!
        this.marineLife.setMarineState(2);
        this.soundSculptures.setVisibility(0.0);

        // Glowing underwater light gradually spreads into the living room
        this.roomAmbientLight.color.setHex(0xbae6fd);
        this.roomAmbientLight.intensity = 0.65;
        this.hemiLight.color.setHex(0x38bdf8);
        this.hemiLight.groundColor.setHex(0x0a1e38);
        this.hemiLight.intensity = 0.75;
        this.scene.fog = new THREE.FogExp2(0x0a1628, 0.015);
        break;

      case 3: // STATE 3 — THE LIVING ROOM TRANSFORMS (ROOM_TRANSFORMATION)
        // Camera smoothly glides back to view the transformed room and panoramic window
        this.cameraMode = 'livingroom';
        this.cameraTargetPos.set(0, 1.75, 3.2);
        this.cameraLookAtTarget.set(0, 2.2, -4.0);

        // Ordinary outdoor view gradually transforms into the enormous underwater metropolis
        this.livingRoom.setOutdoorSkylineOpacity(0.0);
        this.underwaterCity.setVisibility(1.0);

        // Moving underwater caustics spread across furniture and floor
        this.livingRoom.setOrbExpansion(0.7);
        this.livingRoom.setEmergenceProgress(0.12); // Very minimal residual emission
        this.livingRoom.setCausticOpacity(0.55);

        // Schools of fish swim through the room, bubbles float upwards, jellyfish appear
        this.marineLife.setMarineState(3);
        this.soundSculptures.setVisibility(0.15);

        // Deep ocean ambient lighting and ocean depth fog
        this.roomAmbientLight.color.setHex(0x7dd3fc);
        this.roomAmbientLight.intensity = 0.45;
        this.hemiLight.color.setHex(0x38bdf8);
        this.hemiLight.groundColor.setHex(0x031226);
        this.hemiLight.intensity = 0.9;
        this.scene.fog = new THREE.FogExp2(0x031022, 0.024);
        break;

      case 4: // STATE 4 — INTERACTIVE UNDERWATER WORLD (INTERACTIVE_WORLD)
        this.cameraMode = 'cinematic';
        this.cameraTargetPos.set(0, 1.7, 2.2);
        this.cameraLookAtTarget.set(0, 1.85, -0.7);

        this.livingRoom.setOutdoorSkylineOpacity(0.0);
        this.underwaterCity.setVisibility(1.0);
        this.livingRoom.setCausticOpacity(0.5);
        this.livingRoom.setEmergenceProgress(0.0);

        // Full autonomous environment + floating sound sculptures
        this.marineLife.setMarineState(4);
        this.soundSculptures.setVisibility(1.0);
        break;

      case 5: // STATE 5 — PASSIVE DAYDREAMING (DAYDREAMING)
        this.cameraMode = 'cinematic';
        this.cameraTargetPos.set(-0.8, 1.75, 2.5);
        this.cameraLookAtTarget.set(0.2, 1.9, -4.0);

        this.livingRoom.setOutdoorSkylineOpacity(0.0);
        this.underwaterCity.setVisibility(1.0);
        this.livingRoom.setCausticOpacity(0.5);
        this.livingRoom.setEmergenceProgress(0.0);

        this.marineLife.setMarineState(5);
        this.soundSculptures.setVisibility(0.85);
        break;
    }
  }

  /**
   * Smoothly collapses the entire underwater world back into the physical orb over 3.5 seconds.
   * Triggered by two hands brought together or keyboard/dock fallback.
   */
  public startCollapseWorldBackToOrb() {
    if (this.isCollapsingBackToOrb || this.currentMoment === 1) return;
    this.isCollapsingBackToOrb = true;
    this.collapseElapsed = 0;
    this.draggedObject = null;
    soundEngine.playMomentTransition(1);
    this.onInteractionNoticeCallback?.('Returning underwater world into the physical orb...');
  }

  public setCameraPreset(preset: CameraPreset) {
    this.cameraMode = preset;
    switch (preset) {
      case 'orb':
        this.cameraTargetPos.set(0, 1.25, 1.4);
        this.cameraLookAtTarget.set(0, 0.95, 0.4);
        break;
      case 'window':
        this.cameraTargetPos.set(0, 1.85, 3.4);
        this.cameraLookAtTarget.set(0, 2.4, -12.0);
        break;
      case 'livingroom':
        this.cameraTargetPos.set(1.4, 1.65, 2.6);
        this.cameraLookAtTarget.set(-0.3, 1.4, 0.1);
        break;
      case 'cinematic':
        this.cameraTargetPos.set(0, 1.7, 2.2);
        this.cameraLookAtTarget.set(0, 1.8, -1.0);
        break;
      case 'free':
        // Keep current pos
        break;
    }
  }

  private startLoop() {
    const tick = () => {
      if (this.isDisposed) return;
      const delta = Math.min(0.1, this.clock.getDelta());
      const elapsed = this.clock.getElapsedTime();

      // Update scene components
      this.dynamicCaustics.update(delta);
      this.livingRoom.update(delta, elapsed);
      this.underwaterCity.update(delta, elapsed);
      this.marineLife.update(delta, elapsed);
      this.soundSculptures.update(delta, elapsed);

      // 1. Standing floor lamp proximity check (triggers soft illumination when fish swim past)
      this.livingRoom.checkFishLampProximity(this.marineLife.fishList);

      // 2. Reverse Collapse Transition to Orb (Triggered by two hands together or manual fallback)
      if (this.isCollapsingBackToOrb) {
        this.collapseElapsed += delta;
        const progress = Math.min(1.0, this.collapseElapsed / this.collapseDuration);
        const invP = 1.0 - progress;

        // Camera smoothly glides back towards orb
        this.cameraTargetPos.set(0, 1.25, 1.4);
        this.cameraLookAtTarget.set(0, 0.95, 0.4);

        // Reverse environment transitions
        this.livingRoom.setOutdoorSkylineOpacity(progress);
        this.underwaterCity.setVisibility(invP);
        this.livingRoom.setCausticOpacity(0.55 * invP);
        this.livingRoom.setOrbExpansion(invP);
        this.livingRoom.setEmergenceProgress(invP * 0.1);
        this.soundSculptures.setVisibility(invP);

        // Collapse marine life into orb
        this.marineLife.collapseIntoOrb(this.livingRoom.orbPosition, progress);

        // Smoothly restore warm room lighting
        this.roomAmbientLight.color.lerp(new THREE.Color(0xffedd5), delta * 2.5);
        this.roomAmbientLight.intensity = THREE.MathUtils.lerp(this.roomAmbientLight.intensity, 0.8, delta * 2.5);
        this.hemiLight.color.lerp(new THREE.Color(0xe0e7ff), delta * 2.5);
        this.hemiLight.groundColor.lerp(new THREE.Color(0x1a1a24), delta * 2.5);
        this.hemiLight.intensity = THREE.MathUtils.lerp(this.hemiLight.intensity, 0.85, delta * 2.5);
        if (this.scene.fog && this.scene.fog instanceof THREE.FogExp2) {
          this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, 0.008, delta * 2.5);
        }

        if (progress >= 1.0) {
          this.isCollapsingBackToOrb = false;
          this.setMoment(1, false);
          this.onInteractionNoticeCallback?.('Experience returned to the physical orb.');
        }
      }

      // Smooth camera interpolation with exponential damping
      if (this.cameraMode === 'cinematic' && this.currentMoment === 5 && !this.isCollapsingBackToOrb) {
        // Daydream subtle slow sway
        const swayX = Math.sin(elapsed * 0.25) * 0.4;
        const swayY = Math.cos(elapsed * 0.18) * 0.15;
        this.cameraTargetPos.set(-0.8 + swayX, 1.75 + swayY, 2.5);
      }

      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.cameraTargetPos.x, 2.5, delta);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.cameraTargetPos.y, 2.5, delta);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.cameraTargetPos.z, 2.5, delta);

      this.cameraCurrentLookAt.x = THREE.MathUtils.damp(this.cameraCurrentLookAt.x, this.cameraLookAtTarget.x, 3.0, delta);
      this.cameraCurrentLookAt.y = THREE.MathUtils.damp(this.cameraCurrentLookAt.y, this.cameraLookAtTarget.y, 3.0, delta);
      this.cameraCurrentLookAt.z = THREE.MathUtils.damp(this.cameraCurrentLookAt.z, this.cameraLookAtTarget.z, 3.0, delta);
      this.camera.lookAt(this.cameraCurrentLookAt);

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.isDisposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 60);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose() {
    this.isDisposed = true;
    window.removeEventListener('resize', this.onResize);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('pointercancel', this.onPointerUp);
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.renderer.dispose();
  }
}

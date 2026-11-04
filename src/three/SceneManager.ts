/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LivingRoom } from './LivingRoom';
import { UnderwaterCity } from './UnderwaterCity';
import { MarineLife } from './MarineLife';
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
  private dragOffset = new THREE.Vector3();

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
    this.scene.add(this.marineLife.group);

    this.soundSculptures = new SoundSculptures();
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
    this.marineLife.reactFishToCursor(worldPoint);
    this.soundSculptures.checkRibbonProximity(worldPoint, performance.now());

    // Check hover cursor
    if (this.currentMoment === 1) {
      const orbIntersects = this.raycaster.intersectObjects(this.livingRoom.orbGroup.children, true);
      this.container.style.cursor = orbIntersects.length > 0 ? 'pointer' : 'default';
    } else {
      const scIntersects = this.raycaster.intersectObjects(this.soundSculptures.interactiveMeshes, true);
      const bubbleIntersects = this.raycaster.intersectObjects(this.marineLife.bubbleMeshGroup.children, false);
      this.container.style.cursor = (scIntersects.length > 0 || bubbleIntersects.length > 0) ? 'pointer' : 'default';
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    soundEngine.init(); // Initialize audio context on first user interaction
    this.prevMouseX = e.clientX;
    this.prevMouseY = e.clientY;
    this.isMouseDown = true;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 1. If in Moment 1, clicking the orb enters the experience
    if (this.currentMoment === 1) {
      const orbIntersects = this.raycaster.intersectObjects(this.livingRoom.orbGroup.children, true);
      if (orbIntersects.length > 0) {
        this.advanceMoment();
        return;
      }
    }

    // 2. Interactive Sound Sculptures
    if (this.currentMoment >= 4) {
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

    // 3. Interactive Bubbles
    const bubbleIntersects = this.raycaster.intersectObjects(this.marineLife.bubbleMeshGroup.children, false);
    if (bubbleIntersects.length > 0) {
      this.marineLife.popBubbleAt(bubbleIntersects[0].object);
      return;
    }
  };

  private onPointerUp = () => {
    this.isMouseDown = false;
    this.draggedObject = null;
  };

  public advanceMoment() {
    const next = Math.min(5, this.currentMoment + 1) as ExperienceMoment;
    this.setMoment(next);
  }

  public setMoment(moment: ExperienceMoment, playSound = true) {
    this.currentMoment = moment;
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
        this.livingRoom.setEmergenceProgress(0.3);
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

      // Smooth camera interpolation with exponential damping
      if (this.cameraMode === 'cinematic' && this.currentMoment === 5) {
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
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.renderer.dispose();
  }
}

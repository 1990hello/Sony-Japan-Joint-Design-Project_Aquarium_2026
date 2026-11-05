/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export type HandTrackerStatus =
  | 'idle'
  | 'requesting'
  | 'loading_model'
  | 'tracking'
  | 'no_hand'
  | 'denied'
  | 'unsupported'
  | 'error'
  | 'stopped';

export interface HandLandmarkPoint {
  x: number; // 0..1 normalized mirrored screen coordinate
  y: number; // 0..1 normalized screen coordinate
  z: number;
}

export interface HandGestureState {
  isHandDetected: boolean;
  rawX: number; // 0..1 normalized mirrored screen coordinate
  rawY: number; // 0..1 normalized screen coordinate
  x: number; // smoothed x (0..1)
  y: number; // smoothed y (0..1)
  pinchDistance: number; // Euclidean distance between thumb & index tips
  isPinching: boolean;
  pinchProgress: number; // 0.0 (open) to 1.0 (fully touching)
  thumbTip: HandLandmarkPoint;
  indexTip: HandLandmarkPoint;
  allLandmarks?: HandLandmarkPoint[];
  isTwoHandsDetected?: boolean;
  twoHandsDistance?: number;
  twoHandsDwellProgress?: number; // 0 to 1
  secondHandLandmarks?: HandLandmarkPoint[];
}

export interface HandTrackerCallbacks {
  onGestureState?: (state: HandGestureState) => void;
  onPinchStart?: (normX: number, normY: number) => void;
  onPinchRelease?: (normX: number, normY: number) => void;
  onTwoHandsTogether?: () => void;
  onStatusChange?: (status: HandTrackerStatus, message?: string) => void;
}

// Distance thresholds in normalized coordinate space with hysteresis margin
export const PINCH_DOWN_THRESHOLD = 0.085;
export const PINCH_UP_THRESHOLD = 0.125;

// Smoothing factor for Exponential Moving Average (EMA)
const ALPHA_POS = 0.38;
const ALPHA_DIST = 0.42;

// Wasm fallback candidates to guarantee reliable loading across networks
const WASM_CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
];

const MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export class HandTracker {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private landmarker: HandLandmarker | null = null;
  private animFrameId: number | null = null;
  private lastVideoTime = -1;

  private status: HandTrackerStatus = 'idle';
  private statusMessage = '';
  private callbacks: HandTrackerCallbacks = {};

  // Smoothing states
  private smoothedX: number | null = null;
  private smoothedY: number | null = null;
  private smoothedDist: number | null = null;

  // Interaction tracking state
  private isPinching = false;
  private isHandDetected = false;

  // Two-hand ending gesture state (bringing both hands together)
  private twoHandsDwellTimer = 0;
  private twoHandsTriggered = false;
  private lastFrameTimestamp = 0;

  constructor(callbacks: HandTrackerCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public resetTwoHandsTrigger() {
    this.twoHandsTriggered = false;
    this.twoHandsDwellTimer = 0;
  }

  public setCallbacks(callbacks: HandTrackerCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public getStatus(): HandTrackerStatus {
    return this.status;
  }

  public getStatusMessage(): string {
    return this.statusMessage;
  }

  public getVideo(): HTMLVideoElement | null {
    return this.video;
  }

  private setStatus(status: HandTrackerStatus, message = '') {
    this.status = status;
    this.statusMessage = message;
    this.callbacks.onStatusChange?.(status, message);
  }

  /**
   * Initializes MediaPipe HandLandmarker and requests webcam access.
   */
  public async startTracking(): Promise<boolean> {
    if (this.status === 'tracking' || this.status === 'requesting' || this.status === 'loading_model') {
      return true;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.setStatus('unsupported', 'Webcam is not supported in this browser environment.');
      return false;
    }

    try {
      this.setStatus('requesting', 'Requesting webcam access...');

      // 1. Request Webcam Stream with optimal 640x480 resolution
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      this.stream = stream;

      // 2. Setup video element without 'display: none' so browser engine actively decodes frames
      if (!this.video) {
        this.video = document.createElement('video');
        this.video.setAttribute('playsinline', 'true');
        this.video.setAttribute('webkit-playsinline', 'true');
        this.video.autoplay = true;
        this.video.muted = true;
        this.video.width = 640;
        this.video.height = 480;
        // Position off-screen without hiding display so frame rasterization runs smoothly
        this.video.style.position = 'fixed';
        this.video.style.top = '-9999px';
        this.video.style.left = '-9999px';
        this.video.style.width = '640px';
        this.video.style.height = '480px';
        this.video.style.opacity = '0';
        this.video.style.pointerEvents = 'none';
        this.video.style.zIndex = '-1';
        document.body.appendChild(this.video);
      }

      this.video.srcObject = stream;
      await this.video.play();

      // Wait until video has loaded enough data to read frames
      if (this.video.readyState < 2) {
        await new Promise<void>((resolve) => {
          if (!this.video) return resolve();
          this.video.onloadeddata = () => resolve();
        });
      }

      // 3. Load MediaPipe Hand Landmarker model with CDN fallbacks
      this.setStatus('loading_model', 'Loading hand tracking model...');
      if (!this.landmarker) {
        let visionInstance = null;
        for (const wasmUrl of WASM_CDN_URLS) {
          try {
            visionInstance = await FilesetResolver.forVisionTasks(wasmUrl);
            if (visionInstance) break;
          } catch (wasmErr) {
            console.warn(`FilesetResolver failed with ${wasmUrl}:`, wasmErr);
          }
        }

        if (!visionInstance) {
          throw new Error('Could not initialize MediaPipe vision tasks WebAssembly resolver.');
        }

        try {
          // Attempt GPU delegate first for 60fps hardware acceleration
          this.landmarker = await HandLandmarker.createFromOptions(visionInstance, {
            baseOptions: {
              modelAssetPath: MODEL_ASSET_URL,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch (gpuErr) {
          console.warn('MediaPipe GPU delegate unavailable, falling back to CPU delegate:', gpuErr);
          this.landmarker = await HandLandmarker.createFromOptions(visionInstance, {
            baseOptions: {
              modelAssetPath: MODEL_ASSET_URL,
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.45,
            minHandPresenceConfidence: 0.45,
            minTrackingConfidence: 0.45,
          });
        }
      }

      this.setStatus('tracking', 'Hand tracking active');
      this.startDetectionLoop();
      return true;
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      console.warn('Webcam / Hand tracking initialization error:', err);

      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        this.setStatus('denied', 'Camera permission was denied. You can continue using the mouse.');
      } else {
        this.setStatus('error', error?.message || 'Unable to access camera or load tracking model.');
      }
      this.stopTracking(false);
      return false;
    }
  }

  private startDetectionLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }

    const tick = () => {
      if (!this.video || !this.landmarker || this.status === 'stopped' || this.status === 'denied' || this.status === 'error') {
        return;
      }

      if (this.video.readyState >= 2 && !this.video.paused && this.video.videoWidth > 0) {
        const now = Math.round(performance.now());
        if (now > this.lastVideoTime) {
          this.lastVideoTime = now;
          try {
            const results = this.landmarker.detectForVideo(this.video, now);
            this.processLandmarks(results);
          } catch (e) {
            // Transient frame skip
          }
        }
      }

      this.animFrameId = requestAnimationFrame(tick);
    };

    this.animFrameId = requestAnimationFrame(tick);
  }

  private processLandmarks(results: { landmarks?: { x: number; y: number; z: number }[][] }) {
    const now = performance.now();
    const dt = this.lastFrameTimestamp > 0 ? Math.min(0.1, (now - this.lastFrameTimestamp) / 1000) : 0.016;
    this.lastFrameTimestamp = now;

    if (!results.landmarks || results.landmarks.length === 0) {
      if (this.isHandDetected) {
        this.isHandDetected = false;
        // If hand is lost while pinching, trigger safe release
        if (this.isPinching) {
          this.isPinching = false;
          if (this.smoothedX !== null && this.smoothedY !== null) {
            this.callbacks.onPinchRelease?.(this.smoothedX, this.smoothedY);
          }
        }
        this.twoHandsDwellTimer = Math.max(0, this.twoHandsDwellTimer - dt * 2.0);
        this.callbacks.onGestureState?.({
          isHandDetected: false,
          rawX: 0.5,
          rawY: 0.5,
          x: this.smoothedX ?? 0.5,
          y: this.smoothedY ?? 0.5,
          pinchDistance: 0.2,
          isPinching: false,
          pinchProgress: 0,
          thumbTip: { x: 0, y: 0, z: 0 },
          indexTip: { x: 0, y: 0, z: 0 },
          allLandmarks: [],
          isTwoHandsDetected: false,
          twoHandsDistance: undefined,
          twoHandsDwellProgress: 0,
          secondHandLandmarks: undefined,
        });
      }
      return;
    }

    this.isHandDetected = true;
    const hand = results.landmarks[0];

    // Landmark 4: Thumb Tip, Landmark 8: Index Tip
    const thumb = hand[4];
    const index = hand[8];

    // Natural mirror transformation: user moving their right hand rightwards moves pointer right
    const rawInteractionX = 1 - (thumb.x + index.x) * 0.5;
    const rawInteractionY = (thumb.y + index.y) * 0.5;

    // Euclidean distance between thumb and index tips
    const dx = thumb.x - index.x;
    const dy = thumb.y - index.y;
    const dz = (thumb.z || 0) - (index.z || 0);
    const rawDist = Math.sqrt(dx * dx + dy * dy + dz * dz * 1.2);

    // Apply Exponential Moving Average (EMA) smoothing
    if (this.smoothedX === null || this.smoothedY === null || this.smoothedDist === null) {
      this.smoothedX = rawInteractionX;
      this.smoothedY = rawInteractionY;
      this.smoothedDist = rawDist;
    } else {
      this.smoothedX = this.smoothedX * (1 - ALPHA_POS) + rawInteractionX * ALPHA_POS;
      this.smoothedY = this.smoothedY * (1 - ALPHA_POS) + rawInteractionY * ALPHA_POS;
      this.smoothedDist = this.smoothedDist * (1 - ALPHA_DIST) + rawDist * ALPHA_DIST;
    }

    // Clamp coordinates to safe normalized [0, 1] bounds
    const posX = Math.max(0, Math.min(1, this.smoothedX));
    const posY = Math.max(0, Math.min(1, this.smoothedY));
    const dist = this.smoothedDist;

    // Calculate pinch progress (0.0 to 1.0)
    const pinchProgress = Math.max(
      0,
      Math.min(1, (PINCH_UP_THRESHOLD - dist) / (PINCH_UP_THRESHOLD - PINCH_DOWN_THRESHOLD))
    );

    // Pinch state machine with hysteresis to prevent flickering
    if (!this.isPinching && dist < PINCH_DOWN_THRESHOLD) {
      this.isPinching = true;
      this.callbacks.onPinchStart?.(posX, posY);
    } else if (this.isPinching && dist > PINCH_UP_THRESHOLD) {
      this.isPinching = false;
      this.callbacks.onPinchRelease?.(posX, posY);
    }

    // Two hands detection & proximity calculation
    let isTwoHandsDetected = false;
    let twoHandsDistance: number | undefined = undefined;
    let secondHandMirrored: { x: number; y: number; z: number }[] | undefined = undefined;

    if (results.landmarks.length >= 2) {
      isTwoHandsDetected = true;
      const hand0 = results.landmarks[0];
      const hand1 = results.landmarks[1];

      // Mirror second hand for rendering
      secondHandMirrored = hand1.map((lm) => ({
        x: 1 - lm.x,
        y: lm.y,
        z: lm.z || 0,
      }));

      // Calculate palm midpoints (midpoint between wrist [0] and middle finger MCP [9])
      const palm0X = (hand0[0].x + hand0[9].x) * 0.5;
      const palm0Y = (hand0[0].y + hand0[9].y) * 0.5;
      const palm0Z = ((hand0[0].z || 0) + (hand0[9].z || 0)) * 0.5;

      const palm1X = (hand1[0].x + hand1[9].x) * 0.5;
      const palm1Y = (hand1[0].y + hand1[9].y) * 0.5;
      const palm1Z = ((hand1[0].z || 0) + (hand1[9].z || 0)) * 0.5;

      const pdx = palm0X - palm1X;
      const pdy = palm0Y - palm1Y;
      const pdz = palm0Z - palm1Z;
      twoHandsDistance = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);

      // Threshold: palms within ~0.17 normalized screen units
      const TWO_HANDS_PROXIMITY_THRESHOLD = 0.17;
      if (twoHandsDistance < TWO_HANDS_PROXIMITY_THRESHOLD) {
        this.twoHandsDwellTimer += dt;
        if (this.twoHandsDwellTimer >= 1.0 && !this.twoHandsTriggered) {
          this.twoHandsTriggered = true;
          this.callbacks.onTwoHandsTogether?.();
        }
      } else {
        this.twoHandsDwellTimer = Math.max(0, this.twoHandsDwellTimer - dt * 2.0);
      }
    } else {
      this.twoHandsDwellTimer = Math.max(0, this.twoHandsDwellTimer - dt * 2.0);
    }

    const twoHandsDwellProgress = Math.min(1.0, this.twoHandsDwellTimer / 1.0);

    // Transform all landmarks with mirror X for debug overlay rendering
    const allMirrored = hand.map((lm) => ({
      x: 1 - lm.x,
      y: lm.y,
      z: lm.z || 0,
    }));

    const gestureState: HandGestureState = {
      isHandDetected: true,
      rawX: rawInteractionX,
      rawY: rawInteractionY,
      x: posX,
      y: posY,
      pinchDistance: dist,
      isPinching: this.isPinching,
      pinchProgress,
      thumbTip: { x: 1 - thumb.x, y: thumb.y, z: thumb.z || 0 },
      indexTip: { x: 1 - index.x, y: index.y, z: index.z || 0 },
      allLandmarks: allMirrored,
      isTwoHandsDetected,
      twoHandsDistance,
      twoHandsDwellProgress,
      secondHandLandmarks: secondHandMirrored,
    };

    this.callbacks.onGestureState?.(gestureState);
  }

  /**
   * Stops video stream and pauses detection loop while retaining loaded models.
   */
  public stopTracking(notify = true) {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
    }

    this.isHandDetected = false;
    this.isPinching = false;
    this.smoothedX = null;
    this.smoothedY = null;
    this.smoothedDist = null;

    if (notify) {
      this.setStatus('stopped', 'Hand tracking paused');
    }
  }

  /**
   * Toggles hand tracking on/off.
   */
  public toggleTracking(): Promise<boolean> {
    if (this.status === 'tracking' || this.status === 'requesting' || this.status === 'loading_model') {
      this.stopTracking();
      return Promise.resolve(false);
    } else {
      return this.startTracking();
    }
  }

  /**
   * Fully disposes of tracking resources, video elements, and WebAssembly instances.
   */
  public dispose() {
    this.stopTracking(false);

    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch (e) {
        // Ignore disposal error
      }
      this.landmarker = null;
    }

    if (this.video && this.video.parentNode) {
      this.video.parentNode.removeChild(this.video);
      this.video = null;
    }

    this.callbacks = {};
    this.status = 'idle';
  }
}

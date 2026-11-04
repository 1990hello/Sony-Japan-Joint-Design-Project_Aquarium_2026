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

export interface HandGestureState {
  isHandDetected: boolean;
  rawX: number; // 0..1 normalized mirrored screen coordinate
  rawY: number; // 0..1 normalized screen coordinate
  x: number; // smoothed x (0..1)
  y: number; // smoothed y (0..1)
  pinchDistance: number; // Euclidean distance between thumb & index tips
  isPinching: boolean;
  pinchProgress: number; // 0.0 (open) to 1.0 (fully touching)
  thumbTip: { x: number; y: number; z: number };
  indexTip: { x: number; y: number; z: number };
}

export interface HandTrackerCallbacks {
  onGestureState?: (state: HandGestureState) => void;
  onPinchStart?: (normX: number, normY: number) => void;
  onPinchRelease?: (normX: number, normY: number) => void;
  onStatusChange?: (status: HandTrackerStatus, message?: string) => void;
}

// Distance thresholds in normalized coordinate space with hysteresis margin
const PINCH_DOWN_THRESHOLD = 0.065;
const PINCH_UP_THRESHOLD = 0.105;

// Smoothing factor for Exponential Moving Average (EMA)
// 0.38 provides buttery fluid motion with negligible latency (~20ms)
const ALPHA_POS = 0.38;
const ALPHA_DIST = 0.42;

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

  constructor(callbacks: HandTrackerCallbacks = {}) {
    this.callbacks = callbacks;
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

      // 1. Request Webcam Stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      this.stream = stream;

      // 2. Create off-screen video element for frame ingestion
      if (!this.video) {
        this.video = document.createElement('video');
        this.video.playsInline = true;
        this.video.autoplay = true;
        this.video.muted = true;
        this.video.style.display = 'none';
        document.body.appendChild(this.video);
      }

      this.video.srcObject = stream;
      await this.video.play();

      // 3. Load MediaPipe Hand Landmarker model
      this.setStatus('loading_model', 'Loading hand tracking model...');
      if (!this.landmarker) {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );

        try {
          // Attempt GPU delegate first for hardware acceleration
          this.landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 1,
          });
        } catch (gpuErr) {
          console.warn('MediaPipe GPU delegate unavailable, falling back to CPU:', gpuErr);
          this.landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: 1,
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

      if (this.video.readyState >= 2 && !this.video.paused) {
        const now = performance.now();
        if (now !== this.lastVideoTime) {
          this.lastVideoTime = now;
          try {
            const results = this.landmarker.detectForVideo(this.video, now);
            this.processLandmarks(results);
          } catch (e) {
            // Context loss or transient frame skip
          }
        }
      }

      this.animFrameId = requestAnimationFrame(tick);
    };

    this.animFrameId = requestAnimationFrame(tick);
  }

  private processLandmarks(results: { landmarks?: { x: number; y: number; z: number }[][] }) {
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

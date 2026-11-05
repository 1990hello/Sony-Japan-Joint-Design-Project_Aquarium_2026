/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { SceneManager } from './three/SceneManager';
import { SmartGlassesHUD } from './components/SmartGlassesHUD';
import { NavigationDock } from './components/NavigationDock';
import { IntroOverlay } from './components/IntroOverlay';
import { HandIndicator } from './components/HandIndicator';
import { HandDebugPanel } from './components/HandDebugPanel';
import { HandTracker, HandGestureState, HandTrackerStatus } from './services/HandTracker';
import { ExperienceMoment, CameraPreset } from './types';
import { soundEngine } from './audio/SoundEngine';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const handTrackerRef = useRef<HandTracker | null>(null);

  const [currentMoment, setCurrentMoment] = useState<ExperienceMoment>(1);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('cinematic');
  const [isHUDVisible, setIsHUDVisible] = useState(true);
  const [isDebugHUDVisible, setIsDebugHUDVisible] = useState(false);
  const [interactionToast, setInteractionToast] = useState<string | null>(null);

  // Hand tracking states
  const [handState, setHandState] = useState<HandGestureState | null>(null);
  const [handStatus, setHandStatus] = useState<HandTrackerStatus>('idle');
  const [isOverOrb, setIsOverOrb] = useState(false);
  const [handRaycastTarget, setHandRaycastTarget] = useState('NONE');
  const [lastHandPinchResult, setLastHandPinchResult] = useState('NOT TESTED');
  const [isHandTrackingActive, setIsHandTrackingActive] = useState(false);

  const showToast = useCallback((msg: string) => {
    setInteractionToast(msg);
    setTimeout(() => {
      setInteractionToast((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Initialize SceneManager
  useEffect(() => {
    if (!canvasMountRef.current) return;

    const manager = new SceneManager(canvasMountRef.current, {
      onMomentAdvance: (newMoment) => {
        setCurrentMoment(newMoment);
      },
      onInteractionNotice: (text) => {
        showToast(text);
      },
    });
    sceneManagerRef.current = manager;

    return () => {
      manager.dispose();
      sceneManagerRef.current = null;
      soundEngine.dispose();
    };
  }, [showToast]);

  // Initialize HandTracker service
  useEffect(() => {
    const tracker = new HandTracker({
      onGestureState: (state) => {
        setHandState(state);
        if (state.isHandDetected && sceneManagerRef.current) {
          const res = sceneManagerRef.current.onHandMove(state.x, state.y, state.isPinching);
          setIsOverOrb(!!res?.isOverOrb);
          if (res?.target) setHandRaycastTarget(res.target);
        } else {
          setIsOverOrb(false);
          setHandRaycastTarget('NONE');
        }
      },
      onPinchStart: (x, y) => {
        const activated = sceneManagerRef.current?.onHandPinchStart(x, y) ?? false;
        setLastHandPinchResult(activated ? 'HIT' : 'MISS');
      },
      onPinchRelease: (x, y) => {
        sceneManagerRef.current?.onHandPinchRelease(x, y);
      },
      onTwoHandsTogether: () => {
        sceneManagerRef.current?.startCollapseWorldBackToOrb();
        showToast('Both hands joined: Returning underwater world into the physical orb');
      },
      onStatusChange: (status, message) => {
        setHandStatus(status);
        setIsHandTrackingActive(status === 'tracking' || status === 'loading_model' || status === 'requesting');
        if (message && status !== 'tracking') {
          showToast(message);
        }
      },
    });

    handTrackerRef.current = tracker;

    return () => {
      tracker.dispose();
      handTrackerRef.current = null;
    };
  }, [showToast]);

  // Handle hand tracking toggle
  const handleToggleHandTracking = useCallback(async () => {
    if (!handTrackerRef.current) return;
    const active = await handTrackerRef.current.toggleTracking();
    setIsHandTrackingActive(active);
    if (active) {
      showToast('Hand tracking enabled. Bring your hand into webcam view.');
    } else {
      showToast('Hand tracking paused. Mouse fallback active.');
    }
  }, [showToast]);

  // Handle moment changes
  const handleSelectMoment = useCallback((moment: ExperienceMoment) => {
    setCurrentMoment(moment);
    sceneManagerRef.current?.setMoment(moment);
    if (moment === 1) {
      handTrackerRef.current?.resetTwoHandsTrigger();
    }

    // Update camera preset label to match mode
    if (moment === 1 || moment === 2) setCameraPreset('orb');
    else if (moment === 3) setCameraPreset('livingroom');
    else setCameraPreset('cinematic');
  }, []);

  // Handle camera changes
  const handleSelectCamera = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    sceneManagerRef.current?.setCameraPreset(preset);
  }, []);

  // Handle experience reset / collapse into orb
  const handleCollapseToOrb = useCallback(() => {
    sceneManagerRef.current?.startCollapseWorldBackToOrb();
    handTrackerRef.current?.resetTwoHandsTrigger();
  }, []);

  const handleReset = useCallback(() => {
    handleSelectMoment(1);
    showToast('Experience reset to Moment 1: Discovery');
  }, [handleSelectMoment, showToast]);

  // Keyboard shortcut controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handleSelectMoment(currentMoment === 5 ? 4 : 5);
      } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
        handleSelectMoment(parseInt(e.key, 10) as ExperienceMoment);
      } else if (e.key.toLowerCase() === 'e' || e.key === 'Escape') {
        handleCollapseToOrb();
      } else if (e.key.toLowerCase() === 'm') {
        soundEngine.toggleMute();
      } else if (e.key.toLowerCase() === 'h') {
        handleToggleHandTracking();
      } else if (e.key.toLowerCase() === 'd') {
        setIsDebugHUDVisible((prev) => !prev);
      } else if (e.key.toLowerCase() === 'c') {
        const presets: CameraPreset[] = ['cinematic', 'orb', 'window', 'livingroom', 'free'];
        const nextIdx = (presets.indexOf(cameraPreset) + 1) % presets.length;
        handleSelectCamera(presets[nextIdx]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentMoment, cameraPreset, handleSelectMoment, handleSelectCamera, handleToggleHandTracking, handleCollapseToOrb]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#020712] select-none">
      {/* 1. Isolated WebGL 3D Canvas Mount */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* 2. EXORA 3D Smart Glasses Transparent Waveguide HUD */}
      <SmartGlassesHUD
        moment={currentMoment}
        visible={isHUDVisible}
        onToggle={() => setIsHUDVisible(!isHUDVisible)}
        isHandTrackingActive={isHandTrackingActive}
        isHandDetected={!!handState?.isHandDetected}
        isPinching={!!handState?.isPinching}
      />

      {/* 2b. Visual Hand Tracking and Pinch Indicator */}
      <HandIndicator
        gestureState={handState}
        isOverOrb={isOverOrb}
      />

      {/* 2c. Dev Debugging Panel for Webcam, Hand, and Pinch Telemetry */}
      <HandDebugPanel
        visible={isDebugHUDVisible}
        onClose={() => setIsDebugHUDVisible(false)}
        handState={handState}
        handStatus={handStatus}
        isOverOrb={isOverOrb}
        raycastTarget={handRaycastTarget}
        lastPinchResult={lastHandPinchResult}
        isTrackingActive={isHandTrackingActive}
        onToggleTracking={handleToggleHandTracking}
        videoElement={handTrackerRef.current?.getVideo() ?? null}
      />

      {/* 3. Moment 1 Cinematic Discovery Intro Overlay */}
      <IntroOverlay
        visible={currentMoment === 1}
        onEnter={() => handleSelectMoment(2)}
        onStartHandTracking={handleToggleHandTracking}
        isHandTrackingActive={isHandTrackingActive}
      />

      {/* 4. Moment 4 / 3 Interaction Toast Hint */}
      {interactionToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none transition-all duration-300">
          <div className="px-4 py-2 bg-slate-950/80 border border-cyan-400/30 text-cyan-200 text-xs font-mono-display tracking-wider rounded-full shadow-xl">
            {interactionToast}
          </div>
        </div>
      )}

      {/* 5. Unobstructed Collapsible Bottom Dock */}
      <NavigationDock
        currentMoment={currentMoment}
        onSelectMoment={handleSelectMoment}
        cameraPreset={cameraPreset}
        onSelectCamera={handleSelectCamera}
        onReset={handleReset}
        onCollapseToOrb={handleCollapseToOrb}
        isHandTrackingActive={isHandTrackingActive}
        onToggleHandTracking={handleToggleHandTracking}
        handStatus={handStatus}
        isDebugHUDVisible={isDebugHUDVisible}
        onToggleDebugHUD={() => setIsDebugHUDVisible((prev) => !prev)}
      />
    </main>
  );
}

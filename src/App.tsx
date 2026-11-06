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
  const enterButtonRef = useRef<HTMLButtonElement>(null);
  const currentMomentRef = useRef<ExperienceMoment>(1);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const handTrackerRef = useRef<HandTracker | null>(null);

  const [currentMoment, setCurrentMoment] = useState<ExperienceMoment>(1);
  currentMomentRef.current = currentMoment;
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
  const [isInteractionGuideVisible, setIsInteractionGuideVisible] = useState(false);
  const [isHandHoveringEnter, setIsHandHoveringEnter] = useState(false);

  const showToast = useCallback((msg: string) => {
    setInteractionToast(msg);
    setTimeout(() => {
      setInteractionToast((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Show concise, stage-specific interaction guidance when the underwater experience changes mode.
  useEffect(() => {
    setIsInteractionGuideVisible(currentMoment >= 3);
  }, [currentMoment]);

  const isPointOverEnterButton = useCallback((normX: number, normY: number) => {
    const rect = enterButtonRef.current?.getBoundingClientRect();
    if (!rect) return false;

    const pointX = normX * window.innerWidth;
    const pointY = normY * window.innerHeight;
    return pointX >= rect.left && pointX <= rect.right &&
      pointY >= rect.top && pointY <= rect.bottom;
  }, []);

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
        if (state.isHandDetected && currentMomentRef.current === 1) {
          setIsHandHoveringEnter(isPointOverEnterButton(state.x, state.y));
        } else {
          setIsHandHoveringEnter(false);
        }
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
        // In the opening screen, a pinch directly over Enter EXORA activates it immediately.
        if (currentMomentRef.current === 1 && isPointOverEnterButton(x, y)) {
          setIsHandHoveringEnter(false);
          setLastHandPinchResult('HIT');
          handleSelectMoment(2);
          return;
        }

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
        if (status !== 'tracking') setIsHandHoveringEnter(false);
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
  }, [showToast, isPointOverEnterButton, handleSelectMoment]);

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
        twoHandsDwellProgress={handState?.twoHandsDwellProgress ?? 0}
        isTwoHandsDetected={!!handState?.isTwoHandsDetected}
        secondHandLandmarks={handState?.secondHandLandmarks}
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
        enterButtonRef={enterButtonRef}
        isHandHoveringEnter={isHandHoveringEnter}
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


      {/* 4b. Contextual Interaction Guide */}
      {currentMoment >= 3 && (
        <div className="fixed top-24 left-4 z-30 w-[min(340px,calc(100vw-2rem))] pointer-events-auto">
          {isInteractionGuideVisible ? (
            <section className="relative rounded-xl border border-cyan-300/20 bg-slate-950/75 px-4 py-3 text-slate-200 shadow-xl backdrop-blur-sm">
              <button
                type="button"
                aria-label="Dismiss interaction guide"
                onClick={() => setIsInteractionGuideVisible(false)}
                className="absolute right-3 top-2 text-lg leading-none text-cyan-200/60 hover:text-cyan-100"
              >
                ×
              </button>
              <p className="mb-1 text-[9px] font-mono-display tracking-[0.2em] text-cyan-300/70">
                EXORA · INTERACTION GUIDE
              </p>
              <h2 className="mb-1 pr-6 text-sm font-semibold tracking-wide text-cyan-100">
                {currentMoment === 3
                  ? 'Observe & explore'
                  : currentMoment === 4
                  ? 'Interact with the soundscape'
                  : 'Daydream at your own pace'}
              </h2>
              <p className="text-[11px] leading-relaxed text-slate-300">
                {currentMoment === 3
                  ? 'Take in the underwater city. Pinch a fish to invite it to follow for a moment, or pinch a bubble to pop it. The musical forms will arrive gradually.'
                  : currentMoment === 4
                  ? 'Pinch a fish to invite it to follow for 10 seconds. Pinch bubbles to pop them. Pinch a musical form to play it; keep pinched to move it.'
                  : 'Simply watch and drift—nothing is required. If a musical form floats past, pinch it to return to musical interaction.'}
              </p>
              <div className="mt-2 border-t border-cyan-400/15 pt-2 text-[10px] leading-relaxed text-cyan-100/75">
                <span className="font-semibold text-cyan-200">To return to the orb:</span>
                {' '}bring both palms together and hold. The ring between your hands shows your progress.
              </div>
            </section>
          ) : (
            <button
              type="button"
              onClick={() => setIsInteractionGuideVisible(true)}
              className="rounded-full border border-cyan-300/25 bg-slate-950/70 px-3 py-1.5 text-[10px] font-mono-display tracking-wider text-cyan-100/80 shadow-lg backdrop-blur-sm hover:border-cyan-300/50 hover:text-cyan-50"
            >
              ? INTERACTION GUIDE
            </button>
          )}
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

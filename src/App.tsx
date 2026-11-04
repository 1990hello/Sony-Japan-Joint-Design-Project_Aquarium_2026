/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { SceneManager } from './three/SceneManager';
import { SmartGlassesHUD } from './components/SmartGlassesHUD';
import { NavigationDock } from './components/NavigationDock';
import { IntroOverlay } from './components/IntroOverlay';
import { ExperienceMoment, CameraPreset } from './types';
import { soundEngine } from './audio/SoundEngine';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);

  const [currentMoment, setCurrentMoment] = useState<ExperienceMoment>(1);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('cinematic');
  const [isHUDVisible, setIsHUDVisible] = useState(true);
  const [interactionToast, setInteractionToast] = useState<string | null>(null);

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

  // Handle moment changes
  const handleSelectMoment = useCallback((moment: ExperienceMoment) => {
    setCurrentMoment(moment);
    sceneManagerRef.current?.setMoment(moment);

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

  // Handle experience reset
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
      } else if (e.key.toLowerCase() === 'm') {
        soundEngine.toggleMute();
      } else if (e.key.toLowerCase() === 'c') {
        const presets: CameraPreset[] = ['cinematic', 'orb', 'window', 'livingroom', 'free'];
        const nextIdx = (presets.indexOf(cameraPreset) + 1) % presets.length;
        handleSelectCamera(presets[nextIdx]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentMoment, cameraPreset, handleSelectMoment, handleSelectCamera]);

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
      />

      {/* 3. Moment 1 Cinematic Discovery Intro Overlay */}
      <IntroOverlay
        visible={currentMoment === 1}
        onEnter={() => handleSelectMoment(2)}
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
      />
    </main>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ExperienceMoment } from '../types';
import { Eye, Waves, Sparkles } from 'lucide-react';

interface SmartGlassesHUDProps {
  moment: ExperienceMoment;
  visible: boolean;
  onToggle: () => void;
  isHandTrackingActive?: boolean;
  isHandDetected?: boolean;
  isPinching?: boolean;
}

export const SmartGlassesHUD: React.FC<SmartGlassesHUDProps> = ({
  moment,
  visible,
  onToggle,
  isHandTrackingActive = false,
  isHandDetected = false,
  isPinching = false,
}) => {
  // Biometric stress level calculation according to moment
  // 1: 82% (work stress), 2: 64%, 3: 45%, 4: 28%, 5: 14% (deep restoration)
  const stressValues = [82, 64, 45, 28, 14];
  const heartRateValues = [82, 75, 68, 62, 56];
  const brainwaveModes = [
    'Beta Wave (Hyper-Alert)',
    'Alpha Transition (Decompressing)',
    'Alpha Flow (Somatic Calming)',
    'Theta Resonant (Playful Flow)',
    'Theta Deep (Autonomous Daydream)',
  ];

  const currentStress = stressValues[moment - 1];
  const currentHeartRate = heartRateValues[moment - 1];
  const currentMode = brainwaveModes[moment - 1];

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {/* Subtle Peripheral Optical Waveguide Framing */}
      <div
        className={`absolute inset-0 transition-opacity duration-1000 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Optical edge vignette */}
        <div className="absolute inset-0 border border-cyan-500/10 pointer-events-none [box-shadow:inset_0_0_80px_rgba(6,182,212,0.06)]" />

        {/* Top-Left: EXORA Spatial AR Header & System Telemetry */}
        <div className="absolute top-6 left-8 flex flex-col gap-1 text-xs font-mono-display tracking-wider text-cyan-400/80">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-cyan-400 rounded-none opacity-80" />
            <span className="font-semibold text-slate-100 tracking-widest text-sm">EXORA</span>
            <span className="text-cyan-300/40">|</span>
            <span className="text-cyan-300/70">WAVEGUIDE AR v4.2</span>
          </div>
          <div className="text-[11px] text-cyan-300/60 pl-4 flex items-center gap-2">
            <span>STAGE 4 // PERSPECTIVE TRANSLATION</span>
            {isHandTrackingActive && (
              <>
                <span className="text-cyan-500/40">•</span>
                <span className={isHandDetected ? (isPinching ? 'text-emerald-400 font-semibold' : 'text-cyan-300') : 'text-slate-400'}>
                  PINCH SENSOR: {isHandDetected ? (isPinching ? 'PINCHING' : 'HAND DETECTED') : 'READY'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Top-Right: Somatic Biometrics & Stress Decompression Index */}
        <div className="absolute top-6 right-8 flex flex-col items-end gap-1.5 text-xs font-mono-display">
          <div className="flex items-center gap-3 bg-slate-950/60 border border-cyan-500/20 px-3 py-1.5 rounded-sm">
            <div className="flex items-center gap-1.5 text-cyan-300">
              <Waves className="w-3.5 h-3.5 text-cyan-400" />
              <span>STRESS:</span>
              <span className="font-semibold text-cyan-100">{currentStress}%</span>
            </div>
            <span className="text-cyan-500/30">|</span>
            <div className="flex items-center gap-1.5 text-cyan-300">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              <span>HR:</span>
              <span className="font-semibold text-cyan-100">{currentHeartRate} BPM</span>
            </div>
          </div>
          <div className="text-[10px] text-cyan-400/60 uppercase tracking-wider">
            {currentMode}
          </div>
        </div>

        {/* Center Reticle: Minimal Spatial Focus Mark */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 opacity-25">
          <div className="w-full h-full border border-cyan-400/40 rounded-full flex items-center justify-center">
            <div className="w-1 h-1 bg-cyan-300 rounded-full" />
          </div>
        </div>

        {/* Moment 5: Daydreaming Special Aesthetic Whispering Message */}
        {moment === 5 && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 text-center pointer-events-none transition-all duration-1000 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-950/50 border border-cyan-400/20 backdrop-blur-none text-cyan-200/90 text-sm font-light tracking-widest rounded-full shadow-lg">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>You don't have to do anything. Just be here.</span>
            </div>
          </div>
        )}
      </div>

      {/* Glass HUD Toggle in upper right corner */}
      <div className="absolute top-6 right-8 pointer-events-auto">
        <button
          onClick={onToggle}
          title={visible ? 'Hide EXORA Smart Glasses Overlay' : 'Show EXORA Smart Glasses Overlay'}
          className="group flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono-display tracking-wider border rounded transition-all duration-200 bg-slate-950/80 border-cyan-500/30 hover:border-cyan-400 text-cyan-300 hover:text-white"
        >
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          <span>{visible ? 'AR GLASSES: ON' : 'AR GLASSES: OFF'}</span>
        </button>
      </div>
    </div>
  );
};

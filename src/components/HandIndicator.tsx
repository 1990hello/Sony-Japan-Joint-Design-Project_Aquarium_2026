/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HandGestureState } from '../services/HandTracker';

interface HandIndicatorProps {
  gestureState: HandGestureState | null;
  isOverOrb: boolean;
  twoHandsDwellProgress?: number;
  isTwoHandsDetected?: boolean;
  secondHandLandmarks?: { x: number; y: number; z: number }[];
}

export const HandIndicator: React.FC<HandIndicatorProps> = ({
  gestureState,
  isOverOrb,
  twoHandsDwellProgress = 0,
  isTwoHandsDetected = false,
  secondHandLandmarks,
}) => {
  if (!gestureState || !gestureState.isHandDetected) {
    return null;
  }

  const { x, y, isPinching, pinchProgress } = gestureState;

  // Outer reticle diameter contracts smoothly as pinch progress increases (28px -> 12px)
  const ringSize = Math.max(12, Math.round(28 - pinchProgress * 16));

  const showReturnProgress = isTwoHandsDetected && twoHandsDwellProgress > 0.01 && !!secondHandLandmarks?.[0] && !!gestureState.allLandmarks?.[0];
  const firstWrist = gestureState.allLandmarks?.[0];
  const firstPalmBase = gestureState.allLandmarks?.[9];
  const secondWrist = secondHandLandmarks?.[0];
  const secondPalmBase = secondHandLandmarks?.[9];
  const firstPalm = firstWrist && firstPalmBase
    ? { x: (firstWrist.x + firstPalmBase.x) / 2, y: (firstWrist.y + firstPalmBase.y) / 2 }
    : null;
  const secondPalm = secondWrist && secondPalmBase
    ? { x: (secondWrist.x + secondPalmBase.x) / 2, y: (secondWrist.y + secondPalmBase.y) / 2 }
    : null;
  const midpoint = firstPalm && secondPalm
    ? { x: (firstPalm.x + secondPalm.x) / 2, y: (firstPalm.y + secondPalm.y) / 2 }
    : { x: 0.5, y: 0.5 };
  const remaining = Math.max(0, 1 - twoHandsDwellProgress);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 ease-out"
        style={{
          left: `${(x * 100).toFixed(2)}%`,
          top: `${(y * 100).toFixed(2)}%`,
        }}
      >
        {/* Subtle pinch-release confirmation shockwave ripple */}
        {isPinching && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-amber-300/80 animate-ping opacity-60" />
        )}

        {/* Dynamic Holographic Reticle Ring */}
        <div
          className={`flex items-center justify-center rounded-full transition-all duration-100 ${
            isPinching
              ? 'border-2 border-emerald-400 bg-emerald-400/20 [box-shadow:0_0_16px_rgba(52,211,153,0.8)]'
              : isOverOrb
              ? 'border border-yellow-200 bg-amber-300/15 [box-shadow:0_0_12px_rgba(253,224,71,0.85)]'
              : 'border border-amber-300/90 bg-slate-950/20 [box-shadow:0_0_8px_rgba(251,191,36,0.55)]'
          }`}
          style={{
            width: `${ringSize}px`,
            height: `${ringSize}px`,
          }}
        >
          {/* Central Precision Micro-dot */}
          <div
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 ${
              isPinching
                ? 'bg-emerald-300 [box-shadow:0_0_6px_rgba(110,231,183,1)]'
                : isOverOrb
                ? 'bg-yellow-100 [box-shadow:0_0_5px_rgba(254,249,195,1)]'
                : 'bg-amber-300 [box-shadow:0_0_6px_rgba(252,211,77,0.95)]'
            }`}
          />
        </div>

        {/* Minimal Contextual Spatial Label when hovering interactive objects */}
        {isOverOrb && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <div
              className={`px-2 py-0.5 rounded text-[9px] font-mono tracking-widest uppercase transition-all duration-200 ${
                isPinching
                  ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-400/40'
                  : 'bg-slate-950/70 text-amber-100 border border-amber-300/40'
              }`}
            >
              {isPinching ? 'RELEASE TO EXPAND' : 'PINCH TO SELECT'}
            </div>
          </div>
        )}
      </div>

      {showReturnProgress && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
          style={{ left: `${(midpoint.x * 100).toFixed(2)}%`, top: `${(midpoint.y * 100).toFixed(2)}%` }}
        >
          <div
            className="relative flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(rgba(253,224,71,0.98) ${twoHandsDwellProgress * 360}deg, rgba(251,191,36,0.18) 0deg)`,
              filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.4))',
            }}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-200/25 bg-slate-950/90 text-[11px] font-mono-display text-amber-100">
              {(remaining).toFixed(1)}s
            </div>
          </div>
          <span className="whitespace-nowrap rounded-full border border-amber-300/30 bg-slate-950/85 px-2.5 py-1 text-[9px] font-mono-display tracking-wider text-amber-100 shadow-lg">
            KEEP HOLDING · RETURN TO ORB
          </span>
        </div>
      )}
    </div>
  );
};

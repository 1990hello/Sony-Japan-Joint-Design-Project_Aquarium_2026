/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowRight, Compass } from 'lucide-react';

interface IntroOverlayProps {
  visible: boolean;
  onEnter: () => void;
  onStartHandTracking?: () => void;
  isHandTrackingActive?: boolean;
  enterButtonRef?: React.RefObject<HTMLButtonElement>;
  isHandHoveringEnter?: boolean;
}

export const IntroOverlay: React.FC<IntroOverlayProps> = ({
  visible,
  onEnter,
  onStartHandTracking,
  isHandTrackingActive = false,
  enterButtonRef,
  isHandHoveringEnter = false,
}) => {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-8 sm:p-12 transition-opacity duration-1000">
      {/* Top Header */}
      <div className="flex items-center justify-between pointer-events-auto">
        <div className="flex flex-col">
          <span className="text-xl sm:text-2xl font-light tracking-[0.35em] text-slate-100">
            EXORA
          </span>
          <span className="text-[11px] font-mono-display tracking-widest text-cyan-400/70 uppercase mt-0.5">
            Stage 4 — Perspective
          </span>
        </div>
      </div>

      {/* Main Narrative Card: Docked to bottom to leave glowing orb in center 100% visible and clickable */}
      <div className="mt-auto mb-16 sm:mb-20 self-center max-w-lg text-center flex flex-col items-center gap-4 pointer-events-auto bg-slate-950/80 border border-cyan-500/25 px-6 py-6 sm:px-8 sm:py-7 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-md">
        <div className="w-9 h-9 rounded-full border border-cyan-400/40 flex items-center justify-center text-cyan-300 bg-cyan-950/40">
          <Compass className="w-4 h-4 stroke-[1.5]" />
        </div>

        <div className="space-y-2">
          <p className="text-base sm:text-lg font-light tracking-wide text-slate-100 leading-snug italic font-serif">
            "Somewhere beyond the familiar, another world is waiting."
          </p>
          <p className="text-xs text-cyan-300/80 font-normal leading-relaxed max-w-sm mx-auto">
            Click or tap Enter EXORA to begin. With hand tracking active, move your hand cursor over the button and pinch. In World Emergence, click the glowing orb or pinch and release it to transform the room.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
          <button
            ref={enterButtonRef}
            onClick={onEnter}
            className={`group relative inline-flex items-center gap-2.5 px-6 py-2.5 text-xs font-semibold tracking-wider text-slate-950 bg-gradient-to-r from-cyan-400 to-teal-300 rounded-full hover:from-cyan-300 hover:to-teal-200 transition-all duration-300 shadow-[0_0_20px_rgba(34,211,238,0.4)] hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] cursor-pointer ${isHandHoveringEnter ? 'scale-105 ring-2 ring-cyan-100/80 shadow-[0_0_34px_rgba(103,232,249,0.75)]' : ''}`}
          >
            <span>Enter EXORA</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" />
          </button>

          {onStartHandTracking && !isHandTrackingActive && (
            <button
              onClick={onStartHandTracking}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono tracking-wider text-cyan-300 hover:text-cyan-100 bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-500/35 rounded-full transition-colors cursor-pointer"
            >
              <span>Enable Hand Tracking</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom Footer Note */}
      <div className="text-center text-[10px] font-mono-display tracking-widest text-slate-500 uppercase pb-1">
        Enter EXORA • Orb Click or Hand Pinch in World Emergence • Work-to-Rest Emotional Transition
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowRight, Compass } from 'lucide-react';

interface IntroOverlayProps {
  visible: boolean;
  onEnter: () => void;
}

export const IntroOverlay: React.FC<IntroOverlayProps> = ({ visible, onEnter }) => {
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

      {/* Main Narrative Card: Minimal, Centered-Bottom */}
      <div className="self-center max-w-xl text-center flex flex-col items-center gap-6 pointer-events-auto bg-slate-950/70 border border-cyan-500/20 px-8 py-8 sm:px-12 sm:py-10 rounded-2xl shadow-2xl backdrop-blur-none">
        <div className="w-10 h-10 rounded-full border border-cyan-400/40 flex items-center justify-center text-cyan-300">
          <Compass className="w-5 h-5 stroke-[1.5]" />
        </div>

        <div className="space-y-3">
          <p className="text-lg sm:text-xl font-light tracking-wide text-slate-100 leading-relaxed italic font-serif">
            "Somewhere beyond the familiar, another world is waiting."
          </p>
          <p className="text-xs sm:text-sm text-cyan-300/80 font-normal leading-relaxed max-w-md mx-auto">
            Take a breath and step away from work. Inside the glowing glass orb on the coffee table is the doorway to an underwater sanctuary.
          </p>
        </div>

        <button
          onClick={onEnter}
          className="group relative inline-flex items-center gap-3 px-7 py-3 text-sm font-medium tracking-wider text-slate-950 bg-gradient-to-r from-cyan-400 to-teal-300 rounded-full hover:from-cyan-300 hover:to-teal-200 transition-all duration-300 shadow-[0_0_25px_rgba(34,211,238,0.4)] hover:shadow-[0_0_35px_rgba(34,211,238,0.6)] cursor-pointer"
        >
          <span>Enter EXORA</span>
          <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
        </button>

        <span className="text-[11px] font-mono-display text-slate-400 tracking-wider">
          Click the button or touch the glowing orb to begin
        </span>
      </div>

      {/* Bottom Footer Note */}
      <div className="text-center text-[11px] font-mono-display tracking-widest text-slate-500 uppercase">
        Work-to-Rest Emotional Transition • Interactive Optional
      </div>
    </div>
  );
};

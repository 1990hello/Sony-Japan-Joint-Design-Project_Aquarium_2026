/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import {
  HandGestureState,
  HandTrackerStatus,
  PINCH_DOWN_THRESHOLD,
  PINCH_UP_THRESHOLD,
} from '../services/HandTracker';
import { Camera, X, Activity, Eye, Zap, Crosshair } from 'lucide-react';

interface HandDebugPanelProps {
  visible: boolean;
  onClose: () => void;
  handState: HandGestureState | null;
  handStatus: HandTrackerStatus;
  isOverOrb: boolean;
  raycastTarget: string;
  lastPinchResult: string;
  isTrackingActive: boolean;
  onToggleTracking: () => void;
  videoElement: HTMLVideoElement | null;
}

// MediaPipe 21 hand landmarks skeletal connections
const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm Base knuckles
  [5, 9], [9, 13], [13, 17],
];

export const HandDebugPanel: React.FC<HandDebugPanelProps> = ({
  visible,
  onClose,
  handState,
  handStatus,
  isOverOrb,
  raycastTarget,
  lastPinchResult,
  isTrackingActive,
  onToggleTracking,
  videoElement,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render video frame and skeleton overlay onto canvas
  useEffect(() => {
    if (!visible) return;

    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Draw webcam video if available
      if (videoElement && videoElement.readyState >= 2 && !videoElement.paused) {
        ctx.save();
        // Mirror horizontally so user movement is natural
        ctx.scale(-1, 1);
        ctx.drawImage(videoElement, -w, 0, w, h);
        ctx.restore();

        // Dark tint overlay for HUD contrast
        ctx.fillStyle = 'rgba(2, 7, 20, 0.45)';
        ctx.fillRect(0, 0, w, h);
      } else {
        // Fallback dark grid when video is not active
        ctx.fillStyle = '#060d1b';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.1)';
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 20) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += 20) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          isTrackingActive ? 'Acquiring Video...' : 'Webcam Inactive',
          w / 2,
          h / 2
        );
      }

      // Draw full hand skeleton if landmarks are detected
      const landmarks = handState?.allLandmarks;
      if (handState?.isHandDetected && landmarks && landmarks.length === 21) {
        // 1. Draw bone connections
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
          const p1 = landmarks[startIdx];
          const p2 = landmarks[endIdx];
          if (p1 && p2) {
            ctx.moveTo(p1.x * w, p1.y * h);
            ctx.lineTo(p2.x * w, p2.y * h);
          }
        }
        ctx.stroke();

        // 2. Draw all joint nodes
        for (let i = 0; i < landmarks.length; i++) {
          const pt = landmarks[i];
          ctx.beginPath();
          ctx.arc(pt.x * w, pt.y * h, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#38bdf8';
          ctx.fill();
        }

        // 3. Highlight Thumb Tip (index 4) and Index Tip (index 8)
        const thumb = landmarks[4];
        const index = landmarks[8];

        if (thumb && index) {
          const isPinching = handState.isPinching;
          const lineColor = isPinching
            ? 'rgba(52, 211, 153, 0.95)'
            : 'rgba(251, 191, 36, 0.8)';

          // Line connecting thumb & index
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = isPinching ? 3 : 2;
          ctx.setLineDash(isPinching ? [] : [3, 3]);
          ctx.beginPath();
          ctx.moveTo(thumb.x * w, thumb.y * h);
          ctx.lineTo(index.x * w, index.y * h);
          ctx.stroke();
          ctx.setLineDash([]);

          // Thumb tip node
          ctx.beginPath();
          ctx.arc(thumb.x * w, thumb.y * h, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Index tip node
          ctx.beginPath();
          ctx.arc(index.x * w, index.y * h, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#a855f7';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Pinch midpoint indicator
          const midX = (thumb.x + index.x) * 0.5 * w;
          const midY = (thumb.y + index.y) * 0.5 * h;
          ctx.beginPath();
          ctx.arc(midX, midY, isPinching ? 8 : 4, 0, Math.PI * 2);
          ctx.fillStyle = isPinching ? 'rgba(52, 211, 153, 0.4)' : 'rgba(251, 191, 36, 0.3)';
          ctx.fill();
          ctx.strokeStyle = isPinching ? '#34d399' : '#fbbf24';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Draw second hand skeleton if detected
      const secondLandmarks = handState?.secondHandLandmarks;
      if (secondLandmarks && secondLandmarks.length === 21) {
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
          const p1 = secondLandmarks[startIdx];
          const p2 = secondLandmarks[endIdx];
          if (p1 && p2) {
            ctx.moveTo(p1.x * w, p1.y * h);
            ctx.lineTo(p2.x * w, p2.y * h);
          }
        }
        ctx.stroke();

        for (let i = 0; i < secondLandmarks.length; i++) {
          const pt = secondLandmarks[i];
          ctx.beginPath();
          ctx.arc(pt.x * w, pt.y * h, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#c084fc';
          ctx.fill();
        }
      }

      // If two hands dwell is active, render connection line and dwell progress arc
      if (handState?.isTwoHandsDetected && landmarks && secondLandmarks && landmarks[0] && secondLandmarks[0]) {
        const p1x = landmarks[0].x * w;
        const p1y = landmarks[0].y * h;
        const p2x = secondLandmarks[0].x * w;
        const p2y = secondLandmarks[0].y * h;
        const cx = (p1x + p2x) * 0.5;
        const cy = (p1y + p2y) * 0.5;

        ctx.strokeStyle = 'rgba(244, 114, 182, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p2x, p2y);
        ctx.stroke();
        ctx.setLineDash([]);

        const dwell = handState.twoHandsDwellProgress ?? 0;
        if (dwell > 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dwell);
          ctx.strokeStyle = '#f472b6';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [visible, videoElement, handState, isTrackingActive]);

  if (!visible) return null;

  const isDetected = !!handState?.isHandDetected;
  const isPinching = !!handState?.isPinching;
  const dist = handState?.pinchDistance ?? 0.2;
  const progress = handState?.pinchProgress ?? 0;

  return (
    <div className="fixed top-4 right-4 z-40 w-80 bg-slate-950/95 border border-cyan-500/35 rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl text-slate-200 overflow-hidden text-xs font-mono font-normal">
      {/* HUD Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border-b border-cyan-500/20">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="font-semibold text-slate-100 text-[11px] tracking-wider uppercase">
            EXORA DEV HUD
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
              handStatus === 'tracking'
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                : handStatus === 'loading_model' || handStatus === 'requesting'
                ? 'bg-amber-950/80 text-amber-300 border border-amber-500/30'
                : 'bg-slate-900 text-slate-400 border border-slate-700/50'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                handStatus === 'tracking'
                  ? 'bg-emerald-400 animate-ping'
                  : handStatus === 'loading_model'
                  ? 'bg-amber-400'
                  : 'bg-slate-500'
              }`}
            />
            {handStatus}
          </span>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
            title="Close HUD (Press D)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Live Camera Feed Canvas */}
        <div className="relative w-full rounded-lg overflow-hidden border border-cyan-500/20 bg-slate-950">
          <canvas
            ref={canvasRef}
            width={300}
            height={190}
            className="w-full h-auto block"
          />
          <div className="absolute top-1.5 left-2 flex items-center gap-1.5 text-[9px] text-cyan-300/80 font-mono">
            <Camera className="w-3 h-3 text-cyan-400" />
            <span>640x480 user mirror</span>
          </div>
          {raycastTarget !== 'NONE' && (
            <div className="absolute top-1.5 right-2 px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 text-[9px] font-bold tracking-widest animate-pulse">
              {raycastTarget} TARGET
            </div>
          )}
        </div>

        {/* State Badges Grid */}
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800 flex flex-col gap-1">
            <span className="text-slate-400 flex items-center gap-1">
              <Eye className="w-3 h-3 text-cyan-400" /> Hand Detected:
            </span>
            <span
              className={`font-semibold tracking-wider ${
                isDetected ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              {isDetected ? 'YES (TRACKED)' : 'NO (SEARCHING)'}
            </span>
          </div>

          <div className="p-2 rounded bg-slate-900/80 border border-slate-800 flex flex-col gap-1">
            <span className="text-slate-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" /> Pinch State:
            </span>
            <span
              className={`font-semibold tracking-wider ${
                isPinching ? 'text-emerald-300 font-bold animate-pulse' : 'text-cyan-400/70'
              }`}
            >
              {isPinching ? 'PINCHING (ACTIVE)' : 'OPEN / IDLE'}
            </span>
          </div>
        </div>

        {/* Target Raycast Status */}
        <div className="p-2 rounded bg-slate-900/80 border border-slate-800 flex items-center justify-between text-[10px]">
          <span className="text-slate-400 flex items-center gap-1">
            <Crosshair className="w-3 h-3 text-cyan-400" /> Raycast Target:
          </span>
          <span
            className={`font-semibold tracking-wide ${
              raycastTarget !== 'NONE' ? 'text-cyan-300' : 'text-slate-400'
            }`}
          >
            {raycastTarget}
          </span>
        </div>

        <div className="p-2 rounded bg-slate-900/80 border border-slate-800 flex items-center justify-between text-[10px]">
          <span className="text-slate-400">Last pinch activation:</span>
          <span className={`font-semibold tracking-wide ${lastPinchResult === 'HIT' ? 'text-emerald-300' : lastPinchResult === 'MISS' ? 'text-rose-300' : 'text-slate-400'}`}>
            {lastPinchResult}
          </span>
        </div>

        {/* Pinch Distance & Threshold Meter */}
        <div className="space-y-1.5 p-2 rounded bg-slate-900/80 border border-slate-800">
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-slate-400">Pinch Distance:</span>
            <span className="font-mono text-cyan-300 font-medium">
              {dist.toFixed(3)}{' '}
              <span className="text-slate-500">
                (Down: &lt;{PINCH_DOWN_THRESHOLD}, Up: &gt;{PINCH_UP_THRESHOLD})
              </span>
            </span>
          </div>

          {/* Dynamic Progress Bar */}
          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800 relative">
            <div
              className={`h-full transition-all duration-75 ${
                isPinching
                  ? 'bg-gradient-to-r from-emerald-400 to-teal-300'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-500'
              }`}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
            {/* Threshold indicator line at down threshold */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-emerald-400/80"
              style={{ left: '65%' }}
              title="Pinch Activation Threshold"
            />
          </div>
        </div>

        {/* Landmark Precision Coordinates */}
        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
          <div>
            Thumb: X:{' '}
            <span className="text-slate-200">
              {handState ? handState.thumbTip.x.toFixed(2) : '--'}
            </span>{' '}
            Y:{' '}
            <span className="text-slate-200">
              {handState ? handState.thumbTip.y.toFixed(2) : '--'}
            </span>
          </div>
          <div>
            Index: X:{' '}
            <span className="text-slate-200">
              {handState ? handState.indexTip.x.toFixed(2) : '--'}
            </span>{' '}
            Y:{' '}
            <span className="text-slate-200">
              {handState ? handState.indexTip.y.toFixed(2) : '--'}
            </span>
          </div>
        </div>

        {/* Two-Hand End Gesture Telemetry */}
        <div className="space-y-1.5 p-2 rounded bg-slate-900/80 border border-slate-800">
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-slate-400">Two Hands (End Experience):</span>
            <span className="font-mono text-pink-300 font-medium">
              {handState?.isTwoHandsDetected ? (
                <>
                  Dist: {handState.twoHandsDistance?.toFixed(2) ?? '--'} (Threshold: &lt;0.17)
                </>
              ) : (
                <span className="text-slate-500">1 Hand Detected</span>
              )}
            </span>
          </div>

          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800 relative">
            <div
              className="h-full transition-all duration-75 bg-gradient-to-r from-pink-500 to-rose-400"
              style={{ width: `${Math.round((handState?.twoHandsDwellProgress ?? 0) * 100)}%` }}
            />
          </div>
          <div className="text-[9px] text-slate-500 flex justify-between">
            <span>Dwell confirmation: 1.0s</span>
            <span>{Math.round((handState?.twoHandsDwellProgress ?? 0) * 100)}%</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="pt-1 flex items-center gap-2">
          <button
            onClick={onToggleTracking}
            className={`flex-1 py-1.5 px-3 rounded text-[11px] font-semibold tracking-wider transition-all cursor-pointer ${
              isTrackingActive
                ? 'bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-200'
                : 'bg-cyan-600 hover:bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
            }`}
          >
            {isTrackingActive ? 'Stop Camera' : 'Start Hand Tracking'}
          </button>
        </div>

        {/* Shortcut Hint */}
        <div className="text-[9px] text-slate-500 text-center tracking-wide">
          Press <kbd className="px-1 py-0.5 bg-slate-900 rounded text-cyan-400 font-bold border border-slate-700">D</kbd> to toggle HUD • Parallel Mouse + Pinch active
        </div>
      </div>
    </div>
  );
};

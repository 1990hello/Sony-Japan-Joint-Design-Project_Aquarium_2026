/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ExperienceMoment,
  MOMENT_DETAILS,
  CameraPreset,
} from '../types';
import { soundEngine } from '../audio/SoundEngine';
import {
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  Camera,
  Music,
  Info,
  Mic,
  MicOff,
  Hand,
  Activity,
  CircleDot,
} from 'lucide-react';

interface NavigationDockProps {
  currentMoment: ExperienceMoment;
  onSelectMoment: (moment: ExperienceMoment) => void;
  cameraPreset: CameraPreset;
  onSelectCamera: (preset: CameraPreset) => void;
  onReset: () => void;
  onCollapseToOrb?: () => void;
  isHandTrackingActive?: boolean;
  onToggleHandTracking?: () => void;
  handStatus?: string;
  isDebugHUDVisible?: boolean;
  onToggleDebugHUD?: () => void;
}

export const NavigationDock: React.FC<NavigationDockProps> = ({
  currentMoment,
  onSelectMoment,
  cameraPreset,
  onSelectCamera,
  onReset,
  onCollapseToOrb,
  isHandTrackingActive = false,
  onToggleHandTracking,
  handStatus = 'idle',
  isDebugHUDVisible = false,
  onToggleDebugHUD,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMuted, setIsMuted] = useState(soundEngine.getMuted());
  const [masterVolume, setMasterVolume] = useState(0.75);
  const [activeTab, setActiveTab] = useState<'moments' | 'audio' | 'camera' | 'guide'>('moments');
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  const toggleMute = () => {
    const muted = soundEngine.toggleMute();
    setIsMuted(muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setMasterVolume(val);
    soundEngine.setMasterVolume(val);
    if (isMuted && val > 0) {
      soundEngine.toggleMute();
      setIsMuted(false);
    }
  };

  // Optional voice command listener
  const toggleVoiceRecognition = () => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceNotice('Voice navigation is not supported in this browser.');
      setTimeout(() => setVoiceNotice(null), 3000);
      return;
    }

    if (isVoiceActive) {
      setIsVoiceActive(false);
      setVoiceNotice(null);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsVoiceActive(true);
        setVoiceNotice('Listening... Whisper "daydream", "music", "expand", or "reset".');
      };

      recognition.onresult = (event: any) => {
        const last = event.results.length - 1;
        const text = event.results[last][0].transcript.toLowerCase().trim();

        if (text.includes('daydream') || text.includes('drift')) {
          onSelectMoment(5);
          setVoiceNotice('Transitioning to Daydreaming...');
        } else if (text.includes('music') || text.includes('sound') || text.includes('play')) {
          onSelectMoment(4);
          setVoiceNotice('Activating Sound Sculptures...');
        } else if (text.includes('expand') || text.includes('world') || text.includes('ocean')) {
          onSelectMoment(3);
          setVoiceNotice('The underwater world enters the room...');
        } else if (text.includes('reset') || text.includes('home') || text.includes('room')) {
          onReset();
          setVoiceNotice('Resetting to Discovery...');
        }
        setTimeout(() => setVoiceNotice(null), 2500);
      };

      recognition.onerror = () => {
        setIsVoiceActive(false);
        setVoiceNotice(null);
      };

      recognition.onend = () => {
        setIsVoiceActive(false);
      };

      recognition.start();
    } catch {
      setVoiceNotice('Could not initialize microphone.');
      setTimeout(() => setVoiceNotice(null), 3000);
    }
  };

  const currentInfo = MOMENT_DETAILS[currentMoment];

  return (
    <div
      className="fixed z-30 transition-all duration-500 ease-out flex flex-col items-center"
      style={{
        bottom: '20px',
        left: '50%',
        transform: isCollapsed ? 'translate(-50%, calc(100% - 32px))' : 'translate(-50%, 0)',
        maxWidth: 'min(940px, 94vw)',
        width: '100%',
      }}
    >
      {/* Drawer Toggle Header Tab */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-2 px-4 py-1 text-[11px] font-mono-display tracking-widest text-cyan-300 bg-[#081220] border-t border-x border-cyan-500/20 rounded-t-lg hover:text-white hover:bg-[#0c1a2e] transition-colors cursor-pointer select-none"
      >
        {isCollapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
            <span>SHOW CONTROLS</span>
            <span className="text-cyan-400/50 text-[10px] ml-1">[H]</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
            <span>HIDE CONTROLS (ZEN MODE)</span>
            <span className="text-cyan-400/50 text-[10px] ml-1">[H]</span>
          </>
        )}
      </button>

      {/* Main Glass Control Dock Container */}
      <div className="w-full glass-panel rounded-2xl p-4 sm:p-5 flex flex-col gap-4 text-slate-200">
        {/* Top Row: Moment Name + Tab Switcher + Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/10 pb-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono-display text-cyan-400 font-semibold px-2 py-0.5 bg-cyan-950/60 border border-cyan-500/30 rounded">
              {currentInfo.tag}
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-wide text-slate-100">
                {currentInfo.title}
              </span>
              <span className="text-[11px] text-cyan-300/70 font-light">
                {currentInfo.subtitle}
              </span>
            </div>
          </div>

          {/* Center Tabs */}
          <div className="flex items-center bg-slate-950/70 p-1 rounded-xl border border-cyan-500/15 text-xs font-medium">
            <button
              onClick={() => setActiveTab('moments')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'moments'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Moments
            </button>
            <button
              onClick={() => setActiveTab('camera')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'camera'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Camera</span>
            </button>
            <button
              onClick={() => setActiveTab('audio')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'audio'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>Soundscape</span>
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'guide'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>Experience</span>
            </button>
          </div>

          {/* Right Action Icons: Daydream, Reset, Voice */}
          <div className="flex items-center gap-2">
            {/* Quick Daydream Mode */}
            {currentMoment !== 5 && (
              <button
                onClick={() => onSelectMoment(5)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-cyan-200 bg-cyan-950/60 border border-cyan-500/40 rounded-lg hover:bg-cyan-900/60 transition-colors cursor-pointer"
                title="Enter deep passive daydreaming mode"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Daydream</span>
              </button>
            )}

            {/* Hand Tracking Webcam Toggle */}
            {onToggleHandTracking && (
              <button
                onClick={onToggleHandTracking}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono tracking-wider transition-colors cursor-pointer ${
                  isHandTrackingActive
                    ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 [box-shadow:0_0_10px_rgba(34,211,238,0.25)]'
                    : 'bg-slate-950/60 border-cyan-500/20 text-slate-400 hover:text-cyan-300'
                }`}
                title={
                  isHandTrackingActive
                    ? 'Hand tracking active (Click to pause)'
                    : handStatus === 'denied'
                    ? 'Camera permission denied (Click to retry)'
                    : 'Enable webcam hand tracking & pinch gestures'
                }
              >
                <Hand className={`w-3.5 h-3.5 ${isHandTrackingActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span className="hidden sm:inline text-[11px]">
                  {isHandTrackingActive ? 'HAND ON' : 'HAND'}
                </span>
                {isHandTrackingActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>
            )}

            {/* Dev HUD Toggle Button */}
            {onToggleDebugHUD && (
              <button
                onClick={onToggleDebugHUD}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono tracking-wider transition-colors cursor-pointer ${
                  isDebugHUDVisible
                    ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200 [box-shadow:0_0_10px_rgba(52,211,153,0.3)]'
                    : 'bg-slate-950/60 border-cyan-500/20 text-slate-400 hover:text-cyan-300'
                }`}
                title="Toggle Hand & Pinch Developer Debug HUD (Press D)"
              >
                <Activity className={`w-3.5 h-3.5 ${isDebugHUDVisible ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className="hidden sm:inline text-[11px]">DEV HUD</span>
              </button>
            )}

            {/* Voice toggle */}
            <button
              onClick={toggleVoiceRecognition}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isVoiceActive
                  ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300'
                  : 'bg-slate-950/60 border-cyan-500/20 text-slate-400 hover:text-cyan-300'
              }`}
              title="Optional voice recognition"
            >
              {isVoiceActive ? <Mic className="w-4 h-4 text-emerald-400" /> : <MicOff className="w-4 h-4" />}
            </button>

            {/* Return to Orb button */}
            {currentMoment > 1 && (
              <button
                onClick={onCollapseToOrb}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-950/70 border border-cyan-400/40 rounded-lg text-cyan-200 hover:text-white hover:bg-cyan-900/60 transition-colors cursor-pointer text-[11px] font-mono-display shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                title="Return underwater world into the physical orb (Shortcut: E or join both hands together)"
              >
                <CircleDot className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
                <span className="hidden sm:inline">Return to Orb</span>
              </button>
            )}

            {/* Reset button */}
            <button
              onClick={onReset}
              className="p-1.5 bg-slate-950/60 border border-cyan-500/20 rounded-lg text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
              title="Reset experience to discovery"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Voice Feedback Banner */}
        {voiceNotice && (
          <div className="text-xs text-center text-cyan-300 bg-cyan-950/40 py-1 px-3 border border-cyan-500/30 rounded-lg">
            {voiceNotice}
          </div>
        )}

        {/* Tab 1: Five Moments Stepper / Scrubber */}
        {activeTab === 'moments' && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-5 gap-2">
              {([1, 2, 3, 4, 5] as ExperienceMoment[]).map((m) => {
                const info = MOMENT_DETAILS[m];
                const isActive = currentMoment === m;
                const isPast = currentMoment > m;

                return (
                  <button
                    key={m}
                    onClick={() => onSelectMoment(m)}
                    className={`group relative flex flex-col p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-cyan-950/80 border-cyan-400 text-white shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                        : isPast
                        ? 'bg-slate-950/50 border-cyan-500/20 text-slate-300 hover:border-cyan-400/50'
                        : 'bg-slate-950/30 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono-display mb-1">
                      <span className={isActive ? 'text-cyan-300 font-bold' : 'text-slate-400'}>
                        0{m}
                      </span>
                      {isActive && (
                        <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                      )}
                    </div>
                    <span className="text-xs font-medium truncate">{info.title}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400/80 italic text-center mt-1">
              {currentInfo.description}
            </p>
          </div>
        )}

        {/* Tab 2: Camera Viewpoints */}
        {activeTab === 'camera' && (
          <div className="flex flex-wrap items-center justify-between gap-3 py-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono-display">VIEW:</span>
              <div className="flex items-center gap-1.5 bg-slate-950/70 p-1 rounded-lg border border-cyan-500/15">
                {[
                  { id: 'cinematic', label: 'Cinematic' },
                  { id: 'orb', label: 'The Glass Orb' },
                  { id: 'window', label: 'Ocean Metropolis' },
                  { id: 'livingroom', label: 'Living Room' },
                  { id: 'free', label: 'Free Look (Drag)' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onSelectCamera(item.id as CameraPreset)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                      cameraPreset === item.id
                        ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-[11px] text-slate-400 font-mono-display">
              Tip: Drag cursor anywhere in Free Look mode to rotate perspective
            </span>
          </div>
        )}

        {/* Tab 3: Soundscape & Audio Volume */}
        {activeTab === 'audio' && (
          <div className="flex flex-wrap items-center justify-between gap-4 py-1">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleMute}
                className="p-2 bg-slate-950/80 border border-cyan-500/20 rounded-lg text-cyan-300 hover:text-white cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
              </button>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-mono-display text-slate-400">MASTER VOLUME</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={isMuted ? 0 : masterVolume}
                  onChange={handleVolumeChange}
                  className="w-32 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono-display text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-cyan-400 rounded-full" />
                <span>Ocean Sub-Bass (Eb)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-teal-400 rounded-full" />
                <span>Lydian Chimes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-sky-400 rounded-full" />
                <span>Crystal Droplets</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Design Guidance / Principles */}
        {activeTab === 'guide' && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs text-slate-300">
            <div className="bg-slate-950/50 p-2.5 rounded-lg border border-cyan-500/10">
              <span className="text-cyan-300 font-semibold block mb-1">Invite a fish</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Pinch a fish to invite it to follow your hand for about 10 seconds. It then gently returns to swimming on its own.
              </p>
            </div>
            <div className="bg-slate-950/50 p-2.5 rounded-lg border border-cyan-500/10">
              <span className="text-cyan-300 font-semibold block mb-1">Pop a bubble</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Pinch a floating bubble to pop it and release a small, delicate cluster of bubbles.
              </p>
            </div>
            <div className="bg-slate-950/50 p-2.5 rounded-lg border border-cyan-500/10">
              <span className="text-cyan-300 font-semibold block mb-1">Play the sound forms</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Pinch a raindrop, harmonic sphere, or string instrument to make a sound. Keep pinched to move it; release to let it drift.
              </p>
            </div>
            <div className="bg-slate-950/50 p-2.5 rounded-lg border border-cyan-500/10">
              <span className="text-cyan-300 font-semibold block mb-1">Return to the orb</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Bring both palms together and hold until the progress ring completes. You can also use the Return to Orb control.
              </p>
            </div>
            <p className="sm:col-span-4 text-[11px] text-slate-400">
              No interaction is required. In Daydreaming, you can simply watch the underwater world drift by.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

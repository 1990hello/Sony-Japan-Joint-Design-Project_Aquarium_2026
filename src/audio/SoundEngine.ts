/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Procedural Web Audio API sound engine for EXORA
// Zero external audio files, 100% synthetic, harmonically tuned to peaceful pentatonic scale (Eb Dorian / Lydian)

const PENTATONIC_FREQS = [
  155.56, // Eb3
  174.61, // F3
  196.00, // G3
  233.08, // Bb3
  261.63, // C4
  311.13, // Eb4
  349.23, // F4
  392.00, // G4
  466.16, // Bb4
  523.25, // C5
  622.25, // Eb5
  698.46, // F5
  784.00, // G5
];

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  
  // Ambient nodes
  private noiseNode: AudioBufferSourceNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private filterLfo: OscillatorNode | null = null;
  
  private isInitialized = false;
  private isMuted = false;
  private currentMasterVol = 0.75;
  private currentAmbienceVol = 0.65;
  private currentSfxVol = 0.8;

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  public init() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.currentMasterVol, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.setValueAtTime(this.currentAmbienceVol, this.ctx.currentTime);
      this.ambienceGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.currentSfxVol, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.setupAmbience();
      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio initialization error:', e);
    }
  }

  private setupAmbience() {
    if (!this.ctx || !this.ambienceGain) return;

    // 1. Procedural pink/underwater current noise
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.035;
      b6 = white * 0.115926;
    }

    this.noiseNode = this.ctx.createBufferSource();
    this.noiseNode.buffer = noiseBuffer;
    this.noiseNode.loop = true;

    // Ocean depth filter
    const oceanFilter = this.ctx.createBiquadFilter();
    oceanFilter.type = 'lowpass';
    oceanFilter.frequency.setValueAtTime(260, this.ctx.currentTime);
    oceanFilter.Q.setValueAtTime(2.0, this.ctx.currentTime);

    // Subtle gentle swell modulation
    this.filterLfo = this.ctx.createOscillator();
    this.filterLfo.frequency.setValueAtTime(0.08, this.ctx.currentTime); // ~12 second swell
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(90, this.ctx.currentTime);
    this.filterLfo.connect(lfoGain);
    lfoGain.connect(oceanFilter.frequency);
    this.filterLfo.start();

    this.noiseNode.connect(oceanFilter);
    oceanFilter.connect(this.ambienceGain);
    this.noiseNode.start();

    // 2. Warm sub-bass drone
    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc1.type = 'sine';
    this.droneOsc1.frequency.setValueAtTime(77.78, this.ctx.currentTime); // Eb2
    const droneGain1 = this.ctx.createGain();
    droneGain1.gain.setValueAtTime(0.18, this.ctx.currentTime);
    this.droneOsc1.connect(droneGain1);
    droneGain1.connect(this.ambienceGain);
    this.droneOsc1.start();

    // Fifth overtone drone
    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc2.type = 'sine';
    this.droneOsc2.frequency.setValueAtTime(116.54, this.ctx.currentTime); // Bb2
    const droneGain2 = this.ctx.createGain();
    droneGain2.gain.setValueAtTime(0.09, this.ctx.currentTime);
    this.droneOsc2.connect(droneGain2);
    droneGain2.connect(this.ambienceGain);
    this.droneOsc2.start();
  }

  // --- SOUND SCULPTURE A: Raindrop ---
  public playRaindrop(pitchIndex = 0) {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    
    const baseFreq = PENTATONIC_FREQS[Math.min(PENTATONIC_FREQS.length - 1, 6 + (pitchIndex % 7))];
    
    // Droplet pitch drop
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * 1.8, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    // Subtle bandpass ring
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(baseFreq, now);
    filter.Q.setValueAtTime(8, now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  // --- SOUND SCULPTURE B: Harmonic Bell / Piano Sphere ---
  public playHarmonicSphere(pitchIndex = 0) {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const freq = PENTATONIC_FREQS[pitchIndex % PENTATONIC_FREQS.length];

    // Bell chime with fundamental + octave + major third
    const partials = [
      { ratio: 1.0, gain: 0.35, decay: 2.8 },
      { ratio: 2.01, gain: 0.18, decay: 2.1 },
      { ratio: 2.76, gain: 0.09, decay: 1.4 },
      { ratio: 4.05, gain: 0.05, decay: 0.9 },
    ];

    partials.forEach((p) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * p.ratio, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(p.gain, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + p.decay + 0.1);
    });
  }

  // --- SOUND SCULPTURE C: Vibrating String Ribbon ---
  public playStringSculpture(pitchIndex = 0) {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const freq = PENTATONIC_FREQS[Math.max(0, (pitchIndex % 6) + 1)];

    // Lush detuned warm bowed string
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';

    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 1.004, now); // slight chorus detune

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 3.5, now + 0.6);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.2, now + 3.2);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.5); // soft bowed attack
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.6);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 3.8);
    osc2.stop(now + 3.8);
  }

  // --- MUSICAL NOTE TRAIL (Spawned behind actively selected fish) ---
  public playFishNote(stepIndex = 0) {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Pleasant, harmonious pentatonic tune sequence
    const melodyPattern = [4, 6, 7, 9, 8, 7, 6, 4, 3, 4, 6, 8];
    const pitchIdx = melodyPattern[Math.abs(stepIndex) % melodyPattern.length];
    const freq = PENTATONIC_FREQS[Math.min(PENTATONIC_FREQS.length - 1, pitchIdx)];

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 3.5, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.8);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.03); // Soft, non-jarring attack
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 1.25);
  }

  // --- COMBINATION CHORD (When sound sculptures are brought together) ---
  public playHarmonicChord() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const chordPitches = [3, 5, 7, 10]; // Eb3, Eb4, G4, Eb5
    chordPitches.forEach((p, idx) => {
      setTimeout(() => {
        this.playHarmonicSphere(p);
      }, idx * 60);
    });
  }

  // --- BUBBLE POP INTERACTION ---
  public playBubblePop() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const randomFreq = 500 + Math.random() * 450;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(randomFreq, now);
    osc.frequency.exponentialRampToValueAtTime(randomFreq * 1.6, now + 0.06);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // --- PINCH AUDIO FEEDBACK (Subtle crystalline confirmation chime) ---
  public playPinchFeedback() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(622.25, now); // Eb5
    osc.frequency.exponentialRampToValueAtTime(784.00, now + 0.08); // G5 harmonic shimmer

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.28);
  }

  // --- RIBBON GLISSANDO (When cursor sweeps across floating ribbons) ---
  public playRibbonGleam(noteIndex = 0) {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const freq = PENTATONIC_FREQS[Math.min(PENTATONIC_FREQS.length - 1, 4 + (noteIndex % 8))];

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 1.0);
  }

  // --- TRANSITION SWELL (Between moments) ---
  public playMomentTransition(moment: number) {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    
    // Low oceanic whoosh + shimmering bell
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(140 + moment * 40, now);
    filter.Q.setValueAtTime(3, now);

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 1.2);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 1.9);

    // Chime
    setTimeout(() => {
      this.playHarmonicSphere(moment * 2);
    }, 400);
  }

  // --- CONTROLS ---
  public setMasterVolume(val: number) {
    this.currentMasterVol = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setTargetAtTime(this.currentMasterVol, this.ctx.currentTime, 0.05);
    }
  }

  public setAmbienceVolume(val: number) {
    this.currentAmbienceVol = Math.max(0, Math.min(1, val));
    if (this.ambienceGain && this.ctx) {
      this.ambienceGain.gain.setTargetAtTime(this.currentAmbienceVol, this.ctx.currentTime, 0.05);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      const target = this.isMuted ? 0 : this.currentMasterVol;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public dispose() {
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
    }
    this.isInitialized = false;
  }
}

export const soundEngine = new SoundEngine();

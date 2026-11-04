/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ExperienceMoment = 1 | 2 | 3 | 4 | 5;

export interface MomentInfo {
  id: ExperienceMoment;
  title: string;
  subtitle: string;
  description: string;
  tag: string;
}

export const MOMENT_DETAILS: Record<ExperienceMoment, MomentInfo> = {
  1: {
    id: 1,
    title: 'Discovery',
    subtitle: 'The Miniature City',
    description: 'Inside a decorative glass orb on your coffee table rests a glowing miniature underwater metropolis.',
    tag: 'Phase 01',
  },
  2: {
    id: 2,
    title: 'Immersion',
    subtitle: 'Beyond the Window',
    description: 'The living-room window expands into an enormous ocean trench with illuminated architectural towers and schooling fish.',
    tag: 'Phase 02',
  },
  3: {
    id: 3,
    title: 'The World Enters',
    subtitle: 'Permeable Reality',
    description: 'Marine life crosses into the living room. Bioluminescent fish, rising bubbles, and caustics ripple across the sofa and floor.',
    tag: 'Phase 03',
  },
  4: {
    id: 4,
    title: 'Sound Sculptures',
    subtitle: 'Spatial Music Playground',
    description: 'Floating glass-like sculptures invite effortless acoustic exploration: crystal raindrops, harmonic bells, and vibrating string ribbons.',
    tag: 'Phase 04',
  },
  5: {
    id: 5,
    title: 'Daydreaming',
    subtitle: 'Endless Drift',
    description: 'No tasks. No expectations. An evolving underwater sanctuary where large ocean beings glide past into the tranquil deep.',
    tag: 'Phase 05',
  },
};

export interface AudioState {
  muted: boolean;
  masterVolume: number;
  ambienceVolume: number;
  musicVolume: number;
}

export interface SmartGlassesHUDState {
  active: boolean;
  stressScore: number; // 0 - 100
  heartRate: number; // bpm
  brainwaveMode: 'Beta (Work)' | 'Alpha (Calm)' | 'Theta (Daydream)';
  hudTelemetryVisible: boolean;
}

export type CameraPreset = 'cinematic' | 'orb' | 'window' | 'livingroom' | 'free';

export interface SoundSculptureInteraction {
  id: 'raindrop' | 'harmonic_sphere' | 'string_sculpture';
  noteIndex?: number;
  intensity?: number;
}

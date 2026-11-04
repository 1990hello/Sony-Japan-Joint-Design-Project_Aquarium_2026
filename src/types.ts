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
    title: 'The Miniature Orb',
    subtitle: 'Ordinary Living Room',
    description: 'An ordinary modern living room with an outdoor evening view. The only underwater world exists inside the physical glowing glass orb on the coffee table.',
    tag: 'State 01',
  },
  2: {
    id: 2,
    title: 'World Emergence',
    subtitle: 'Orb Awakens & Expands',
    description: 'The physical orb glows brighter, releasing small particles, tiny bubbles, and miniature fish that gradually emerge into the room.',
    tag: 'State 02',
  },
  3: {
    id: 3,
    title: 'Room Transformation',
    subtitle: 'Metropolis Beyond Window',
    description: 'The ordinary window view transforms into the vast underwater metropolis. Caustics spread across furniture and jellyfish drift in.',
    tag: 'State 03',
  },
  4: {
    id: 4,
    title: 'Interactive World',
    subtitle: 'Autonomous & Sound Sculptures',
    description: 'The underwater realm is fully alive. Autonomous marine creatures swim freely, and floating sound sculptures respond to interaction.',
    tag: 'State 04',
  },
  5: {
    id: 5,
    title: 'Passive Daydreaming',
    subtitle: 'Endless Drift',
    description: 'No interaction required. The environment continues evolving naturally with calm ambient sounds and distant majestic marine beings.',
    tag: 'State 05',
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

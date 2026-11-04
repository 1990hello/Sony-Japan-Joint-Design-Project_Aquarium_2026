/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

/**
 * Procedural texture generators for EXORA.
 * 100% code-driven: no external image dependencies, zero 404s.
 */

// Soft radial particle texture for marine snow, bioluminescence, and bubbles
export function createParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(165, 243, 252, 0.85)');
  gradient.addColorStop(0.5, 'rgba(56, 189, 248, 0.35)');
  gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Procedural high-tech futuristic skyscraper emissive grid
export function createCityFacadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Deep structural blue-slate
  ctx.fillStyle = '#06101e';
  ctx.fillRect(0, 0, 512, 1024);

  // Vertical structural mullions
  ctx.strokeStyle = '#0b1e38';
  ctx.lineWidth = 4;
  for (let x = 0; x < 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }

  // Horizontal floor plates and glowing windows
  for (let y = 0; y < 1024; y += 16) {
    // Floor band
    ctx.fillStyle = '#0f2746';
    ctx.fillRect(0, y, 512, 3);

    // Glowing window strips
    for (let x = 4; x < 508; x += 32) {
      const rand = Math.sin(x * 12.3 + y * 45.6);
      if (rand > -0.2) {
        const brightness = Math.floor(180 + Math.abs(rand) * 75);
        if (rand > 0.6) {
          // Warm golden/cyan bio-light
          ctx.fillStyle = `rgba(56, 189, 248, ${0.4 + Math.abs(rand) * 0.5})`;
        } else if (rand > 0.2) {
          ctx.fillStyle = `rgba(165, 243, 252, ${0.3 + Math.abs(rand) * 0.4})`;
        } else {
          ctx.fillStyle = `rgba(45, 212, 191, ${0.2 + Math.abs(rand) * 0.3})`;
        }
        ctx.fillRect(x, y + 4, 24, 9);
      }
    }
  }

  // Futuristic architectural accent strip
  ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
  ctx.fillRect(250, 0, 12, 1024);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Procedural Terrazzo / Dark Architectural Floor Texture
export function createArchitecturalFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#111722';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle marble / polished stone grain
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = Math.random() * 2 + 1;
    const shade = Math.floor(Math.random() * 40 + 30);
    ctx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 10})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle floor panel tile grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.strokeRect(256, 0, 256, 256);
  ctx.strokeRect(0, 256, 256, 256);
  ctx.strokeRect(256, 256, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Procedural animated caustic texture generator
export class DynamicCausticsTexture {
  public canvas: HTMLCanvasElement;
  public texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private time = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.repeat.set(2, 2);
    this.render(0);
  }

  public update(delta: number) {
    this.time += delta * 1.5;
    // Update every few frames to conserve CPU
    this.render(this.time);
    this.texture.needsUpdate = true;
  }

  private render(t: number) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(2, 10, 24, 0.9)';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(100, 220, 255, 0.45)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    // Intersecting dynamic sine waves producing organic caustic ripples
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      const phase = t + i * 0.45;
      for (let x = 0; x <= 256; x += 16) {
        const y = 18 * i + Math.sin(x * 0.05 + phase) * 14 + Math.cos(x * 0.02 - phase * 0.8) * 8;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Secondary criss-cross
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 2;
    for (let j = 0; j < 12; j++) {
      ctx.beginPath();
      const phase = -t * 0.8 + j * 0.55;
      for (let y = 0; y <= 256; y += 16) {
        const x = 20 * j + Math.cos(y * 0.04 + phase) * 16 + Math.sin(y * 0.03 + phase * 0.7) * 8;
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}

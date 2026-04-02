import * as THREE from 'three';
import { projects } from './projectData.js';

const SCREEN_COLORS = [
  '#00ff66',
  '#ff4488',
  '#44aaff',
  '#ffcc00',
  '#ff6622',
  '#bb44ff',
];

export class ScreenController {
  constructor(screenMeshes) {
    this.hoveredMesh = null;

    this.screens = screenMeshes.map((mesh, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.colorSpace = THREE.SRGBColorSpace;

      this._normalizeUVs(mesh);

      const color = SCREEN_COLORS[i % SCREEN_COLORS.length];
      const project = projects[i] || {};

      mesh.material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        toneMapped: false,
      });

      const entry = {
        mesh, canvas, ctx, texture, color,
        phase: i * 1.2,
        bgImage: null,
        bgLoaded: false,
        showOverlay: !!project.screenOverlay,
        title: project.title || '',
        subtitle: project.subtitle || '',
      };

      if (project.screenImage) {
        const img = new Image();
        img.onload = () => { entry.bgImage = img; entry.bgLoaded = true; };
        img.src = project.screenImage;
      }

      return entry;
    });
  }

  update(elapsed) {
    const hasHover = !!this.hoveredMesh;

    for (const screen of this.screens) {
      const { mesh, ctx, canvas, texture, color, phase } = screen;
      const w = canvas.width;
      const h = canvas.height;

      const isHovered = hasHover && mesh === this.hoveredMesh;

      if (screen.bgLoaded) {
        this._drawImageScreen(screen, elapsed, hasHover, isHovered);
      } else {
        this._drawColorScreen(screen, elapsed, hasHover, isHovered);
      }

      // CRT scanline overlay
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      for (let y = 0; y < h; y += 3) {
        ctx.fillRect(0, y, w, 1);
      }

      texture.needsUpdate = true;
    }
  }

  _drawColorScreen(screen, elapsed, hasHover, isHovered) {
    const { ctx, canvas, color, phase } = screen;
    const w = canvas.width;
    const h = canvas.height;

    if (hasHover && !isHovered) {
      const dimPulse = 0.15 + 0.1 * Math.sin(elapsed * 2.0 + phase);
      ctx.fillStyle = '#020202';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = dimPulse;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1.0;
    } else if (isHovered) {
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
    } else {
      const pulse = 0.6 + 0.4 * Math.sin(elapsed * 2.0 + phase);
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1.0;
    }
  }

  _drawRotatedImage(ctx, img, w, h) {
    ctx.save();
    ctx.translate(w, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0, h, w);
    ctx.restore();
  }

  _drawImageScreen(screen, elapsed, hasHover, isHovered) {
    const { ctx, canvas, bgImage, phase, showOverlay, title, subtitle } = screen;
    const w = canvas.width;
    const h = canvas.height;

    if (hasHover && !isHovered) {
      ctx.fillStyle = '#020202';
      ctx.fillRect(0, 0, w, h);
      const dimPulse = 0.15 + 0.1 * Math.sin(elapsed * 2.0 + phase);
      ctx.globalAlpha = dimPulse;
      this._drawRotatedImage(ctx, bgImage, w, h);
      ctx.globalAlpha = 1.0;
    } else if (isHovered) {
      this._drawRotatedImage(ctx, bgImage, w, h);
    } else {
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, w, h);
      const pulse = 0.7 + 0.3 * Math.sin(elapsed * 1.5 + phase);
      ctx.globalAlpha = pulse;
      this._drawRotatedImage(ctx, bgImage, w, h);
      ctx.globalAlpha = 1.0;
    }

    if (showOverlay) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.rotate(Math.PI / 2);
      this._drawTextOverlay(ctx, h, w, title, subtitle);
      ctx.restore();
    }
  }

  _drawTextOverlay(ctx, rw, rh, title, subtitle) {
    const padding = 12;
    const titleSize = 18;
    const subtitleSize = 11;
    const lineHeight = subtitleSize + 3;

    ctx.font = `bold ${titleSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;

    const wrappedSub = this._wrapLines(ctx, subtitle, `${subtitleSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`, rw - padding * 2);

    const barH = padding + titleSize + 6 + wrappedSub.length * lineHeight + padding;
    const barY = rh - barH;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, barY, rw, barH);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${titleSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.fillText(title, padding, barY + padding + titleSize);

    ctx.font = `${subtitleSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    let ty = barY + padding + titleSize + 6 + subtitleSize;
    for (const line of wrappedSub) {
      ctx.fillText(line, padding, ty);
      ty += lineHeight;
    }
  }

  _normalizeUVs(mesh) {
    const uv = mesh.geometry.getAttribute('uv');
    if (!uv) return;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const rangeU = maxU - minU || 1;
    const rangeV = maxV - minV || 1;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i,
        (uv.getX(i) - minU) / rangeU,
        (uv.getY(i) - minV) / rangeV
      );
    }
    uv.needsUpdate = true;
  }

  _wrapLines(ctx, text, font, maxWidth) {
    ctx.font = font;
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line + (line ? ' ' : '') + word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
}

import * as THREE from 'three';

/**
 * Reference table: a horizontally elongated ellipse (wider than tall — not a
 * circle, not a stadium / rounded rectangle). The padded rail is wider
 * front/back than at the ends, matching the existing felt + gold materials.
 */
export const TABLE_RX = 5.6;
export const TABLE_RZ = 2.45;

// Sleeker, narrower padded gold rail border
export const RAIL_W_X = 0.32;
export const RAIL_W_Z = 0.42;

export const FELT_RX = TABLE_RX - RAIL_W_X;
export const FELT_RZ = TABLE_RZ - RAIL_W_Z;

export const BODY_HEIGHT = 0.4;
export const RAIL_HEIGHT = 0.29;
export const FELT_Y = 0.11;
export const SEAT_Y = 0.46;

/** Screen box aspect of the table in the reference (880 x 256 px). */
export const REFERENCE_TABLE_ASPECT = 3.44;

export function ellipseShape(rx: number, rz: number) {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
  return shape;
}

function ellipseHole(rx: number, rz: number) {
  const path = new THREE.Path();
  path.absellipse(0, 0, rx, rz, 0, Math.PI * 2, true, 0);
  return path;
}

export function ringShape(
  outerRx: number,
  outerRz: number,
  innerRx: number,
  innerRz: number,
) {
  const shape = ellipseShape(outerRx, outerRz);
  shape.holes.push(ellipseHole(innerRx, innerRz));
  return shape;
}

export function railRingShape() {
  return ringShape(TABLE_RX, TABLE_RZ, FELT_RX, FELT_RZ);
}

export function feltLipShape() {
  return ringShape(
    FELT_RX + 0.055,
    FELT_RZ + 0.055,
    FELT_RX + 0.004,
    FELT_RZ + 0.004,
  );
}

export function extrudeShape(shape: THREE.Shape, depth: number, bevel = 0.02, curveSegments = 112) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Point on the ellipse rim. 0° = +X (right), 90° = +Z (near / bottom). */
export function pointOnTableRim(rx: number, rz: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: rx * Math.cos(a), z: rz * Math.sin(a) };
}

/**
 * Parametric angles (degrees) for `count` points equally spaced by arc length
 * around the ellipse, starting at `startDeg` and walking in +θ (0°=+X, 90°=+Z).
 */
export function ellipseEqualArcAngles(
  rx: number,
  rz: number,
  count: number,
  startDeg: number,
): number[] {
  const steps = 4096;
  const dθ = (Math.PI * 2) / steps;
  const seg = new Float64Array(steps);
  let circumference = 0;
  for (let i = 0; i < steps; i++) {
    const θ = i * dθ;
    // ds/dθ = sqrt(rx² sin²θ + rz² cos²θ)
    seg[i] = Math.hypot(rx * Math.sin(θ), rz * Math.cos(θ)) * dθ;
    circumference += seg[i];
  }

  const spacing = circumference / count;
  const startRad = ((startDeg * Math.PI) / 180) % (Math.PI * 2);
  const startIndex = Math.round(((startRad + Math.PI * 2) % (Math.PI * 2)) / dθ) % steps;

  const angles: number[] = new Array(count);
  let i = startIndex;
  let acc = 0;
  angles[0] = startDeg;
  for (let k = 1; k < count; k++) {
    const target = k * spacing;
    while (acc < target) {
      acc += seg[i]!;
      i = (i + 1) % steps;
    }
    angles[k] = (i * dθ * 180) / Math.PI;
  }
  return angles;
}

/** Unit outward normal of the ellipse at `angleDeg` (gradient of x²/rx² + z²/rz²). */
export function ellipseOutwardNormal(rx: number, rz: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  const nx = Math.cos(a) / Math.max(rx, 1e-6);
  const nz = Math.sin(a) / Math.max(rz, 1e-6);
  const len = Math.hypot(nx, nz) || 1;
  return { x: nx / len, z: nz / len };
}

class RimCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private rx: number,
    private rz: number,
    private y: number,
  ) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()) {
    const p = pointOnTableRim(this.rx, this.rz, 90 - t * 360);
    return target.set(p.x, this.y, p.z);
  }
}

export function createRimTube(
  rx: number,
  rz: number,
  y: number,
  radius: number,
  segments = 320,
) {
  const curve = new RimCurve(rx, rz, y);
  curve.arcLengthDivisions = 320;
  const geo = new THREE.TubeGeometry(curve, segments, radius, 14, true);
  geo.computeVertexNormals();
  return geo;
}

export function projectWorldUVs(geo: THREE.BufferGeometry, scaleX: number, scaleZ: number) {
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  if (!uv || !pos) return;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) / scaleX + 1) / 2, (pos.getZ(i) / scaleZ + 1) / 2);
  }
  uv.needsUpdate = true;
}

function makeCanvas(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) paint(ctx, width, height);
  return canvas;
}

function damaskMotif(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.bezierCurveTo(cx + s * 0.7, cy - s * 0.6, cx + s * 0.7, cy + s * 0.6, cx, cy + s);
  ctx.bezierCurveTo(cx - s * 0.7, cy + s * 0.6, cx - s * 0.7, cy - s * 0.6, cx, cy - s);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - s, cy);
  ctx.bezierCurveTo(cx - s * 0.6, cy - s * 0.55, cx + s * 0.6, cy - s * 0.55, cx + s, cy);
  ctx.bezierCurveTo(cx + s * 0.6, cy + s * 0.55, cx - s * 0.6, cy + s * 0.55, cx - s, cy);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Bright red felt with an ornamental damask weave and an inset border line.
 * Border margins are supplied per-axis so the inset reads as a constant width
 * once the texture is projected onto the very wide felt.
 */
export function createFeltCanvas(marginU: number, marginV: number) {
  return makeCanvas(1024, 1024, (ctx, w, h) => {
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.44, w * 0.05, w * 0.5, h * 0.5, w * 0.72);
    glow.addColorStop(0, '#9c1927');
    glow.addColorStop(0.45, '#83121f');
    glow.addColorStop(0.8, '#6a0d18');
    glow.addColorStop(1, '#520913');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.strokeStyle = 'rgba(64, 6, 15, 0.34)';
    ctx.fillStyle = 'rgba(64, 6, 15, 0.26)';
    ctx.lineWidth = 1.6;
    const tile = 74;
    for (let y = 0; y <= h + tile; y += tile) {
      for (let x = 0; x <= w + tile; x += tile) {
        damaskMotif(ctx, x, y, tile * 0.34);
        damaskMotif(ctx, x + tile / 2, y + tile / 2, tile * 0.2);
      }
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(58, 4, 12, 0.72)';
    ctx.lineWidth = 4.5;
    const mx = marginU * w;
    const my = marginV * h;
    ctx.strokeRect(mx, my, w - mx * 2, h - my * 2);
    ctx.strokeStyle = 'rgba(240, 196, 158, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx + 7, my + 7, w - mx * 2 - 14, h - my * 2 - 14);
    ctx.restore();
  });
}

export function createFeltBumpCanvas() {
  return makeCanvas(512, 512, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = 108 + Math.floor(Math.random() * 44);
      img.data[i] = n;
      img.data[i + 1] = n;
      img.data[i + 2] = n;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}

/**
 * Polished gold / brushed brass for the padded rail. Subtle horizontal brush
 * lines create directional highlights that respond to envMap reflections.
 */
export function createRailCanvas() {
  return makeCanvas(512, 512, (ctx, w, h) => {
    // Base gold gradient
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#b8860b');
    base.addColorStop(0.25, '#d4a017');
    base.addColorStop(0.5, '#FFC629');
    base.addColorStop(0.75, '#D9A01B');
    base.addColorStop(1, '#a67c00');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // Brushed-metal horizontal streaks
    for (let y = 0; y < h; y++) {
      const alpha = 0.02 + Math.random() * 0.05;
      const bright = Math.random() > 0.5;
      ctx.fillStyle = bright
        ? `rgba(255, 248, 220, ${alpha})`
        : `rgba(100, 70, 10, ${alpha})`;
      ctx.fillRect(0, y, w, 1);
    }

    // Fine sparkle grain
    for (let i = 0; i < 3200; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 0.6 + Math.random() * 1.4;
      ctx.beginPath();
      ctx.fillStyle = Math.random() > 0.5
        ? 'rgba(255, 250, 210, 0.09)'
        : 'rgba(80, 55, 5, 0.06)';
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function createRailBumpCanvas() {
  return makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);

    // Fine horizontal brush lines for metallic anisotropy
    for (let y = 0; y < h; y++) {
      const v = 128 + Math.floor((Math.random() - 0.5) * 28);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, y, w, 1);
    }

    // Subtle grain dots
    for (let i = 0; i < 1600; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 0.5 + Math.random() * 1.2;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.28)');
      grad.addColorStop(1, 'rgba(128,128,128,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * The reference background is a flat decorative wallpaper rather than a receding
 * floor: the dark red diamond lattice keeps a constant scale top to bottom, with a
 * darker slatted band and warm ambient glow behind the dealer.
 */
export function createRoomCanvas() {
  return makeCanvas(1600, 800, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1c0308');
    g.addColorStop(0.16, '#380712');
    g.addColorStop(0.42, '#520b1b');
    g.addColorStop(0.72, '#420815');
    g.addColorStop(1, '#24040a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Diamond lattice
    const step = 46;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI / 4);
    ctx.translate(-w, -h);
    ctx.strokeStyle = 'rgba(235, 75, 95, 0.28)';
    ctx.lineWidth = 2.4;
    for (let i = 0; i <= (w * 2) / step; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, h * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * step);
      ctx.lineTo(w * 2, i * step);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 115, 135, 0.24)';
    for (let y = 0; y <= (h * 2) / step; y++) {
      for (let x = 0; x <= (w * 2) / step; x++) {
        ctx.save();
        ctx.translate(x * step, y * step);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-5, -5, 10, 10);
        ctx.restore();
      }
    }
    ctx.restore();

    // Slatted upper wall
    const bandH = h * 0.16;
    const band = ctx.createLinearGradient(0, 0, 0, bandH);
    band.addColorStop(0, 'rgba(12, 2, 4, 0.9)');
    band.addColorStop(0.72, 'rgba(24, 4, 8, 0.55)');
    band.addColorStop(1, 'rgba(32, 5, 12, 0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, w, bandH);

    ctx.fillStyle = 'rgba(110, 18, 32, 0.36)';
    for (let x = 0; x < w; x += 30) {
      ctx.fillRect(x, 0, 12, bandH * 0.82);
    }

    // Warm accent glow behind the dealer
    const rubyGlow = ctx.createRadialGradient(w * 0.5, h * 0.2, 10, w * 0.5, h * 0.2, w * 0.26);
    rubyGlow.addColorStop(0, 'rgba(215, 45, 75, 0.35)');
    rubyGlow.addColorStop(0.6, 'rgba(180, 25, 50, 0.15)');
    rubyGlow.addColorStop(1, 'rgba(120, 15, 30, 0)');
    ctx.fillStyle = rubyGlow;
    ctx.fillRect(0, 0, w, h * 0.5);

    // Warm pool of light where the table sits
    const pool = ctx.createRadialGradient(w * 0.5, h * 0.66, 20, w * 0.5, h * 0.66, w * 0.5);
    pool.addColorStop(0, 'rgba(255, 200, 150, 0.12)');
    pool.addColorStop(1, 'rgba(255, 200, 150, 0)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, w, h);

    // Corner falloff
    const vign = ctx.createRadialGradient(w * 0.5, h * 0.55, h * 0.2, w * 0.5, h * 0.55, w * 0.62);
    vign.addColorStop(0, 'rgba(0,0,0,0)');
    vign.addColorStop(1, 'rgba(10, 2, 4, 0.48)');
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, w, h);
  });
}

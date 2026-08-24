import * as THREE from 'three';

/**
 * Reference table: a wide rounded rectangle (large corner radius, long straight
 * top/bottom runs, slightly flattened ends) — not a stadium and not an ellipse.
 * The padded rail is wider front/back than at the ends, matching the reference.
 */
export const TABLE_RX = 5.6;
export const TABLE_RZ = 2.45;
export const TABLE_CORNER = 1.92;

// Reference felt/table ratios: 0.90 across the width, 0.62 across the depth.
export const RAIL_W_X = 0.58;
export const RAIL_W_Z = 0.93;

export const FELT_RX = TABLE_RX - RAIL_W_X;
export const FELT_RZ = TABLE_RZ - RAIL_W_Z;
export const FELT_CORNER = 1.1;

export const BODY_HEIGHT = 0.4;
export const RAIL_HEIGHT = 0.29;
export const FELT_Y = 0.11;
export const SEAT_Y = 0.46;

/** Screen box aspect of the table in the reference (880 x 256 px). */
export const REFERENCE_TABLE_ASPECT = 3.44;

export function roundedRectShape(rx: number, rz: number, corner: number) {
  const r = Math.min(corner, rx - 0.001, rz - 0.001);
  const shape = new THREE.Shape();
  shape.moveTo(-rx + r, rz);
  shape.lineTo(rx - r, rz);
  shape.absarc(rx - r, rz - r, r, Math.PI / 2, 0, true);
  shape.lineTo(rx, -rz + r);
  shape.absarc(rx - r, -rz + r, r, 0, -Math.PI / 2, true);
  shape.lineTo(-rx + r, -rz);
  shape.absarc(-rx + r, -rz + r, r, -Math.PI / 2, Math.PI, true);
  shape.lineTo(-rx, rz - r);
  shape.absarc(-rx + r, rz - r, r, Math.PI, Math.PI / 2, true);
  return shape;
}

function roundedRectHole(rx: number, rz: number, corner: number) {
  const r = Math.min(corner, rx - 0.001, rz - 0.001);
  const path = new THREE.Path();
  path.moveTo(rx - r, rz);
  path.lineTo(-rx + r, rz);
  path.absarc(-rx + r, rz - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(-rx, -rz + r);
  path.absarc(-rx + r, -rz + r, r, Math.PI, Math.PI * 1.5, false);
  path.lineTo(rx - r, -rz);
  path.absarc(rx - r, -rz + r, r, -Math.PI / 2, 0, false);
  path.lineTo(rx, rz - r);
  path.absarc(rx - r, rz - r, r, 0, Math.PI / 2, false);
  return path;
}

export function ringShape(
  outerRx: number,
  outerRz: number,
  outerCorner: number,
  innerRx: number,
  innerRz: number,
  innerCorner: number,
) {
  const shape = roundedRectShape(outerRx, outerRz, outerCorner);
  shape.holes.push(roundedRectHole(innerRx, innerRz, innerCorner));
  return shape;
}

export function railRingShape() {
  return ringShape(TABLE_RX, TABLE_RZ, TABLE_CORNER, FELT_RX, FELT_RZ, FELT_CORNER);
}

export function feltLipShape() {
  return ringShape(
    FELT_RX + 0.055,
    FELT_RZ + 0.055,
    FELT_CORNER + 0.05,
    FELT_RX + 0.004,
    FELT_RZ + 0.004,
    FELT_CORNER,
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

/** Ray-cast from the table centre to the rounded-rect contour. 0° = +X, 90° = +Z (near). */
export function pointOnTableRim(rx: number, rz: number, corner: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const r = Math.min(corner, rx, rz);
  const hx = rx - r;
  const hz = rz - r;

  if (Math.abs(s) > 1e-6) {
    const edgeZ = s > 0 ? rz : -rz;
    const t = edgeZ / s;
    const x = t * c;
    if (t > 0 && Math.abs(x) <= hx + 1e-6) return { x, z: edgeZ };
  }

  if (Math.abs(c) > 1e-6) {
    const edgeX = c > 0 ? rx : -rx;
    const t = edgeX / c;
    const z = t * s;
    if (t > 0 && Math.abs(z) <= hz + 1e-6) return { x: edgeX, z };
  }

  const cx = c >= 0 ? hx : -hx;
  const cz = s >= 0 ? hz : -hz;
  const b = -2 * (c * cx + s * cz);
  const cc = cx * cx + cz * cz - r * r;
  const disc = Math.max(0, b * b - 4 * cc);
  const t = (-b + Math.sqrt(disc)) / 2;
  return { x: t * c, z: t * s };
}

class RimCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private rx: number,
    private rz: number,
    private corner: number,
    private y: number,
  ) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()) {
    const p = pointOnTableRim(this.rx, this.rz, this.corner, 90 - t * 360);
    return target.set(p.x, this.y, p.z);
  }
}

export function createRimTube(
  rx: number,
  rz: number,
  corner: number,
  y: number,
  radius: number,
  segments = 320,
) {
  const curve = new RimCurve(rx, rz, corner, y);
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
    base.addColorStop(0.5, '#ffd700');
    base.addColorStop(0.75, '#c9a227');
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
 * floor: the purple diamond lattice keeps a constant scale top to bottom, with a
 * darker slatted band and a teal glow behind the dealer.
 */
export function createRoomCanvas() {
  return makeCanvas(1600, 800, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#26102f');
    g.addColorStop(0.16, '#4b1a56');
    g.addColorStop(0.42, '#743087');
    g.addColorStop(0.72, '#65267a');
    g.addColorStop(1, '#4a1a5c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Diamond lattice
    const step = 46;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI / 4);
    ctx.translate(-w, -h);
    ctx.strokeStyle = 'rgba(206, 122, 224, 0.34)';
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
    ctx.fillStyle = 'rgba(220, 140, 236, 0.3)';
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
    band.addColorStop(0, 'rgba(10, 4, 18, 0.88)');
    band.addColorStop(0.72, 'rgba(16, 6, 26, 0.5)');
    band.addColorStop(1, 'rgba(20, 8, 30, 0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, w, bandH);

    ctx.fillStyle = 'rgba(96, 44, 118, 0.34)';
    for (let x = 0; x < w; x += 30) {
      ctx.fillRect(x, 0, 12, bandH * 0.82);
    }

    // Teal accent glow behind the dealer
    const teal = ctx.createRadialGradient(w * 0.5, h * 0.2, 10, w * 0.5, h * 0.2, w * 0.24);
    teal.addColorStop(0, 'rgba(30, 130, 138, 0.5)');
    teal.addColorStop(1, 'rgba(30, 130, 138, 0)');
    ctx.fillStyle = teal;
    ctx.fillRect(0, 0, w, h * 0.5);

    // Warm pool of light where the table sits
    const pool = ctx.createRadialGradient(w * 0.5, h * 0.66, 20, w * 0.5, h * 0.66, w * 0.5);
    pool.addColorStop(0, 'rgba(255, 190, 150, 0.14)');
    pool.addColorStop(1, 'rgba(255, 190, 150, 0)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, w, h);

    // Corner falloff
    const vign = ctx.createRadialGradient(w * 0.5, h * 0.55, h * 0.2, w * 0.5, h * 0.55, w * 0.62);
    vign.addColorStop(0, 'rgba(0,0,0,0)');
    vign.addColorStop(1, 'rgba(14, 3, 22, 0.42)');
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, w, h);
  });
}

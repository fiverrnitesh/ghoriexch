import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

const CANVAS_W = 640;
const CANVAS_H = 900;

/**
 * The reference dealer is a photographic character. A full rigged model is out of
 * scope for this scene, so she is painted to a transparent canvas and shown on a
 * vertical plane behind the far rail at the same position and scale.
 */
function paintDealer(ctx: CanvasRenderingContext2D) {
  const cx = CANVAS_W / 2;

  const skin = (a: number, b: number) => {
    const g = ctx.createLinearGradient(cx - 90, a, cx + 110, b);
    g.addColorStop(0, '#8d5433');
    g.addColorStop(0.35, '#c8895c');
    g.addColorStop(0.7, '#e3ab7d');
    g.addColorStop(1, '#a9683f');
    return g;
  };

  const hairDark = '#140b09';
  const hairMid = '#2e1a14';

  ctx.save();

  // Back hair mass
  ctx.fillStyle = hairDark;
  ctx.beginPath();
  ctx.ellipse(cx, 300, 168, 268, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shoulders and upper arms
  ctx.fillStyle = skin(380, 620);
  ctx.beginPath();
  ctx.moveTo(cx - 108, 430);
  ctx.bezierCurveTo(cx - 196, 452, cx - 232, 560, cx - 236, 700);
  ctx.bezierCurveTo(cx - 238, 782, cx - 214, 828, cx - 176, 846);
  ctx.lineTo(cx - 104, 846);
  ctx.bezierCurveTo(cx - 148, 790, cx - 156, 690, cx - 138, 588);
  ctx.lineTo(cx - 108, 430);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + 108, 430);
  ctx.bezierCurveTo(cx + 196, 452, cx + 232, 560, cx + 236, 700);
  ctx.bezierCurveTo(cx + 238, 782, cx + 214, 828, cx + 176, 846);
  ctx.lineTo(cx + 104, 846);
  ctx.bezierCurveTo(cx + 148, 790, cx + 156, 690, cx + 138, 588);
  ctx.lineTo(cx + 108, 430);
  ctx.fill();

  // Chest / décolletage
  ctx.fillStyle = skin(400, 520);
  ctx.beginPath();
  ctx.moveTo(cx - 132, 438);
  ctx.bezierCurveTo(cx - 60, 402, cx + 60, 402, cx + 132, 438);
  ctx.lineTo(cx + 122, 556);
  ctx.bezierCurveTo(cx + 50, 528, cx - 50, 528, cx - 122, 556);
  ctx.closePath();
  ctx.fill();

  // Red dress bodice
  const dress = ctx.createLinearGradient(cx - 170, 500, cx + 170, 880);
  dress.addColorStop(0, '#7d0d1c');
  dress.addColorStop(0.3, '#c01528');
  dress.addColorStop(0.58, '#e0243a');
  dress.addColorStop(0.85, '#a01123');
  dress.addColorStop(1, '#5e0813');
  ctx.fillStyle = dress;
  ctx.beginPath();
  ctx.moveTo(cx - 126, 540);
  ctx.bezierCurveTo(cx - 60, 508, cx + 60, 508, cx + 126, 540);
  ctx.bezierCurveTo(cx + 168, 640, cx + 182, 760, cx + 186, 900);
  ctx.lineTo(cx - 186, 900);
  ctx.bezierCurveTo(cx - 182, 760, cx - 168, 640, cx - 126, 540);
  ctx.closePath();
  ctx.fill();

  // Dress sheen
  const sheen = ctx.createLinearGradient(cx - 40, 540, cx + 40, 900);
  sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.04)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.moveTo(cx - 54, 536);
  ctx.bezierCurveTo(cx - 20, 660, cx - 24, 780, cx - 40, 900);
  ctx.lineTo(cx + 44, 900);
  ctx.bezierCurveTo(cx + 30, 780, cx + 26, 650, cx + 52, 534);
  ctx.closePath();
  ctx.fill();

  // Forearms folded toward the podium
  ctx.fillStyle = skin(700, 860);
  ctx.beginPath();
  ctx.ellipse(cx - 150, 810, 46, 74, -0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 150, 810, 46, 74, 0.32, 0, Math.PI * 2);
  ctx.fill();

  // Neck
  ctx.fillStyle = skin(340, 440);
  ctx.beginPath();
  ctx.moveTo(cx - 44, 350);
  ctx.lineTo(cx + 44, 350);
  ctx.lineTo(cx + 52, 448);
  ctx.bezierCurveTo(cx + 20, 466, cx - 20, 466, cx - 52, 448);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(60, 24, 14, 0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, 372, 50, 22, 0, 0, Math.PI);
  ctx.fill();

  // Head
  ctx.fillStyle = skin(180, 360);
  ctx.beginPath();
  ctx.ellipse(cx, 268, 92, 118, 0, 0, Math.PI * 2);
  ctx.fill();

  // Front hair framing
  ctx.fillStyle = hairMid;
  ctx.beginPath();
  ctx.moveTo(cx - 96, 262);
  ctx.bezierCurveTo(cx - 112, 150, cx - 46, 118, cx, 118);
  ctx.bezierCurveTo(cx + 46, 118, cx + 112, 150, cx + 96, 262);
  ctx.bezierCurveTo(cx + 84, 208, cx + 52, 178, cx, 180);
  ctx.bezierCurveTo(cx - 52, 178, cx - 84, 208, cx - 96, 262);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = hairDark;
  ctx.beginPath();
  ctx.ellipse(cx - 108, 330, 42, 150, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 108, 330, 42, 150, -0.12, 0, Math.PI * 2);
  ctx.fill();

  // Features are deliberately low-contrast; at final scale she reads as a figure,
  // not a face, and hard detail would look like clip art.
  ctx.fillStyle = 'rgba(46, 24, 16, 0.42)';
  ctx.beginPath();
  ctx.ellipse(cx - 32, 266, 11, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 32, 266, 11, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(146, 46, 54, 0.34)';
  ctx.beginPath();
  ctx.ellipse(cx, 316, 17, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(120, 62, 40, 0.16)';
  ctx.beginPath();
  ctx.ellipse(cx, 292, 8, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Soft cheek and jaw shading
  const cheek = ctx.createRadialGradient(cx, 250, 20, cx, 268, 120);
  cheek.addColorStop(0, 'rgba(255, 214, 180, 0.16)');
  cheek.addColorStop(1, 'rgba(90, 44, 26, 0.22)');
  ctx.fillStyle = cheek;
  ctx.beginPath();
  ctx.ellipse(cx, 268, 92, 118, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ambient shading so she sits into the scene rather than reading as a sticker
  const shade = ctx.createLinearGradient(0, 120, 0, CANVAS_H);
  shade.addColorStop(0, 'rgba(24, 8, 24, 0.36)');
  shade.addColorStop(0.45, 'rgba(24, 8, 24, 0.12)');
  shade.addColorStop(1, 'rgba(16, 4, 18, 0.5)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const side = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
  side.addColorStop(0, 'rgba(10, 2, 14, 0.45)');
  side.addColorStop(0.32, 'rgba(10, 2, 14, 0)');
  side.addColorStop(0.7, 'rgba(10, 2, 14, 0)');
  side.addColorStop(1, 'rgba(10, 2, 14, 0.45)');
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();
}

export function Dealer({
  position,
  height,
}: {
  position: [number, number, number];
  height: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (ctx) paintDealer(ctx);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  const width = (height * CANVAS_W) / CANVAS_H;

  return (
    <mesh position={position} renderOrder={2}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.02} toneMapped={false} />
    </mesh>
  );
}

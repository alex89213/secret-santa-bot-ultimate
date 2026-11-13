/**
 * Description:  Snowflake designs for the falling snow. Each new flake picks a design by weighted
 *               random using each design's chance. To add a design, add an entry with its own
 *               chance, size range and draw function.
 * Author:       Alex Wu
 * Dependencies:
 * Usage:
 */
export type SnowColors = { snow: string; edge: string };
export type SnowflakeDesign = {
  id: string;
  /** Relative weight, so chances don't need to add up to 1. */
  chance: number;
  /** Radius range in CSS pixels. */
  size: [number, number];
  draw: (ctx: CanvasRenderingContext2D, radius: number, colors: SnowColors) => void;
};
function strokeFlake(ctx: CanvasRenderingContext2D, colors: SnowColors) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.strokeStyle = colors.snow;
  ctx.lineWidth = 1.3;
  ctx.stroke();
}
export const SNOWFLAKES: SnowflakeDesign[] = [
  {
    id: 'dot',
    chance: 0.7,
    size: [1, 3],
    draw(ctx, r, colors) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = colors.snow;
      ctx.fill();
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = colors.edge;
      ctx.stroke();
    },
  },
  {
    id: 'simple',
    chance: 0.15,
    size: [2.4, 3.6],
    draw(ctx, r, colors) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 2, Math.sin(a) * r * 2);
      }
      strokeFlake(ctx, colors);
    },
  },
  {
    id: 'crystal',
    chance: 0.15,
    size: [2.6, 4.4],
    draw(ctx, r, colors) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3,
          c = Math.cos(a),
          s = Math.sin(a),
          length = r * 2.2,
          branchAt = length * 0.6,
          branch = length * 0.35;
        ctx.moveTo(0, 0);
        ctx.lineTo(c * length, s * length);
        for (const side of [-1, 1]) {
          const b = a + side * 0.7;
          ctx.moveTo(c * branchAt, s * branchAt);
          ctx.lineTo(c * branchAt + Math.cos(b) * branch, s * branchAt + Math.sin(b) * branch);
        }
      }
      strokeFlake(ctx, colors);
    },
  },
];
/** Picks a design by weighted random. `roll` is a number from 0 up to, but not including, 1. */
export function pickDesign(roll: number, designs: SnowflakeDesign[] = SNOWFLAKES): SnowflakeDesign {
  const total = designs.reduce((sum, d) => sum + Math.max(0, d.chance), 0);
  let remaining = roll * total;
  for (const design of designs) {
    remaining -= Math.max(0, design.chance);
    if (remaining < 0) return design;
  }
  return designs[designs.length - 1];
}

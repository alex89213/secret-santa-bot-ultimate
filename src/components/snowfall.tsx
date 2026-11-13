/**
 * Description:  Canvas of falling snow that fills its parent and sits behind the page content.
 * Author:       Alex Wu
 * Dependencies: react, components/snowflakes.ts
 * Usage:        <Snowfall /> inside a positioned element
 */
'use client';
import { useEffect, useRef } from 'react';
import { pickDesign, type SnowColors, type SnowflakeDesign } from './snowflakes';
type Flake = {
  design: SnowflakeDesign;
  r: number;
  x: number;
  y: number;
  speed: number;
  sway: number;
  phase: number;
  rotation: number;
  spin: number;
};
function spawn(width: number, height: number, anywhere: boolean): Flake {
  const design = pickDesign(Math.random()),
    [min, max] = design.size;
  return {
    design,
    r: min + Math.random() * (max - min),
    x: Math.random() * width,
    y: anywhere ? Math.random() * height : -12,
    speed: 10 + Math.random() * 26,
    sway: 6 + Math.random() * 14,
    phase: Math.random() * Math.PI * 2,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.6,
  };
}
/**
 * Draws falling snow behind its parent's content. Pauses when off-screen or in a hidden tab, and
 * holds still for people who prefer reduced motion.
 */
export function Snowfall({ density = 9000 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current,
      host = canvas?.parentElement,
      ctx = canvas?.getContext('2d');
    if (!canvas || !host || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const style = getComputedStyle(host);
    const colors: SnowColors = {
      snow: style.getPropertyValue('--snow').trim() || '#ffffff',
      edge: style.getPropertyValue('--snow-edge').trim() || '#00000055',
    };
    let flakes: Flake[] = [],
      width = 0,
      height = 0,
      visible = true,
      last = 0,
      frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const f of flakes) {
        ctx.save();
        ctx.translate(f.x + Math.sin(f.phase) * f.sway, f.y);
        ctx.rotate(f.rotation);
        f.design.draw(ctx, f.r, colors);
        ctx.restore();
      }
    };
    const resize = () => {
      const box = host.getBoundingClientRect(),
        dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(14, Math.min(90, Math.round((width * height) / density)));
      while (flakes.length < count) flakes.push(spawn(width, height, true));
      flakes = flakes.slice(0, count);
      draw();
    };
    const tick = (time: number) => {
      if (visible && !document.hidden) {
        const dt = last ? Math.min(0.05, (time - last) / 1000) : 0;
        last = time;
        flakes = flakes.map((f) => {
          const next = {
            ...f,
            y: f.y + f.speed * dt,
            phase: f.phase + dt * 0.8,
            rotation: f.rotation + f.spin * dt,
          };
          return next.y > height + 12 ? spawn(width, height, false) : next;
        });
        draw();
      } else last = 0;
      frame = requestAnimationFrame(tick);
    };
    const sizes = new ResizeObserver(resize);
    sizes.observe(host);
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      last = 0;
    });
    seen.observe(host);
    resize();
    if (!still) frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      seen.disconnect();
    };
  }, [density]);
  return <canvas ref={ref} className="snowfall" aria-hidden="true" />;
}

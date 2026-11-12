"use client";

import { useLayoutEffect, useRef } from "react";

/** Site accent, #2ee7ff. Opaque enough to read as blue on near-black. */
const BLUE = "46, 231, 255";

type Dot = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
};

function field(width: number, height: number): Dot[] {
  const count = Math.round(Math.min(84, Math.max(32, (width * height) / 26000)));
  return Array.from({ length: count }, () => {
    const speed = 0.045 + Math.random() * 0.07;
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.85 + Math.random() * 1.15,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      a: 0.55 + Math.random() * 0.35,
    };
  });
}

export function ParticleField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const body = document.body;
    const previousIsolation = body.style.isolation;
    body.style.isolation = "isolate";

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dots: Dot[] = [];
    let frame = 0;
    let alive = true;

    const paint = (still: boolean) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      context.clearRect(0, 0, width, height);
      for (const dot of dots) {
        if (!still) {
          dot.x += dot.vx;
          dot.y += dot.vy;
          if (dot.x < -3) dot.x = width + 3;
          else if (dot.x > width + 3) dot.x = -3;
          if (dot.y < -3) dot.y = height + 3;
          else if (dot.y > height + 3) dot.y = -3;
        }
        context.beginPath();
        context.fillStyle = `rgba(${BLUE}, ${dot.a})`;
        context.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        context.fill();
      }
    };

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = field(width, height);
      paint(true);
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const loop = () => {
      if (!alive) return;
      paint(false);
      frame = requestAnimationFrame(loop);
    };

    const play = () => {
      stop();
      if (motion.matches || document.hidden) {
        paint(true);
        return;
      }
      frame = requestAnimationFrame(loop);
    };

    fit();
    play();
    window.addEventListener("resize", fit);
    document.addEventListener("visibilitychange", play);
    motion.addEventListener("change", play);

    return () => {
      alive = false;
      stop();
      body.style.isolation = previousIsolation;
      window.removeEventListener("resize", fit);
      document.removeEventListener("visibilitychange", play);
      motion.removeEventListener("change", play);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="particle-field"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        display: "block",
      }}
    />
  );
}

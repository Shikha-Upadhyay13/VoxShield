"use client";

import { useEffect, useRef } from "react";

export function Waveform({
  analyser,
  idle = false,
  threat = false,
}: {
  analyser: AnalyserNode | null;
  idle?: boolean;
  threat?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = 0;
    const buffer = analyser ? new Uint8Array(analyser.fftSize) : new Uint8Array(1024);
    const strokeIdle = threat ? "rgba(239,68,68,0.35)" : "rgba(126,224,199,0.28)";
    const strokeLive = threat ? "rgba(239,68,68,0.95)" : "rgba(126,224,199,0.9)";

    const draw = (t: number) => {
      if (t - last < 33) {
        raf = requestAnimationFrame(draw);
        return;
      }
      last = t;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = threat ? "rgba(239,68,68,0.06)" : "rgba(232,237,244,0.025)";
      ctx.fillRect(0, 0, width, height);

      if (analyser && !idle) {
        analyser.getByteTimeDomainData(buffer);
      } else {
        for (let i = 0; i < buffer.length; i += 1) {
          buffer[i] = 128 + Math.sin(i / 18 + t / 900) * 6;
        }
      }

      ctx.beginPath();
      ctx.lineWidth = threat ? 2 : 1.6;
      ctx.strokeStyle = idle ? strokeIdle : strokeLive;
      const points = Math.min(180, buffer.length);
      const stride = Math.max(1, Math.floor(buffer.length / points));
      const step = width / (points - 1);
      let x = 0;
      for (let i = 0, p = 0; i < buffer.length && p < points; i += stride, p += 1) {
        const v = (buffer[i] ?? 128) / 128;
        const y = (v * height) / 2;
        if (p === 0) ctx.moveTo(0, y);
        else ctx.lineTo(x, y);
        x += step;
      }
      ctx.stroke();

      ctx.strokeStyle = "rgba(232,237,244,0.06)";
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, idle, threat]);

  return (
    <canvas
      ref={canvasRef}
      className="h-[160px] w-full rounded-xl"
      aria-label="Live waveform"
    />
  );
}

export function SpectrogramBars({
  analyser,
  idle = false,
  threat = false,
}: {
  analyser: AnalyserNode | null;
  idle?: boolean;
  threat?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = 0;
    const bins = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(128);

    const draw = (t: number) => {
      if (t - last < 33) {
        raf = requestAnimationFrame(draw);
        return;
      }
      last = t;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (analyser && !idle) analyser.getByteFrequencyData(bins);
      else {
        for (let i = 0; i < bins.length; i += 1) {
          bins[i] = 18 + (Math.sin(i / 6 + t / 400) * 8 + 8);
        }
      }

      const bars = 48;
      const gap = 2;
      const bw = (width - gap * bars) / bars;
      for (let i = 0; i < bars; i += 1) {
        const idx = Math.floor((i / bars) * bins.length);
        const mag = (bins[idx] ?? 0) / 255;
        const h = Math.max(3, mag * height);
        ctx.fillStyle = threat
          ? `rgba(239,68,68,${0.22 + mag * 0.7})`
          : `rgba(126,224,199,${0.18 + mag * 0.7})`;
        ctx.fillRect(i * (bw + gap), height - h, bw, h);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, idle, threat]);

  return <canvas ref={canvasRef} className="h-16 w-full rounded-lg" aria-hidden />;
}

export function InputMeter({
  analyser,
  idle = false,
  threat = false,
}: {
  analyser: AnalyserNode | null;
  idle?: boolean;
  threat?: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let raf = 0;
    let last = 0;
    const data = analyser ? new Uint8Array(analyser.fftSize) : null;

    const draw = (t: number) => {
      if (t - last < 50) {
        raf = requestAnimationFrame(draw);
        return;
      }
      last = t;
      let peak = 0;
      if (analyser && !idle && data) {
        analyser.getByteTimeDomainData(data);
        for (let i = 0; i < data.length; i += 8) {
          peak = Math.max(peak, Math.abs(((data[i] ?? 128) - 128) / 128));
        }
      }
      bar.style.width = `${Math.round(Math.min(1, peak * 2.4) * 100)}%`;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, idle]);

  return (
    <div
      ref={barRef}
      className={threat ? "h-full rounded-full bg-[var(--high)]" : "h-full rounded-full bg-[var(--accent)]"}
      style={{ width: "0%" }}
    />
  );
}


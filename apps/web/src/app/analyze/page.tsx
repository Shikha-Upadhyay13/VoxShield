"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertBanner } from "@/components/alert-banner";
import { LayerBars } from "@/components/layer-bars";
import { RiskRing } from "@/components/risk-ring";
import { WhyScore } from "@/components/why-score";
import { bufferToWavBlob, decodeFile, synthesizeCloneLike, synthesizeHumanLike } from "@/lib/audio";
import { clsx } from "@/lib/format";
import { useLiveMonitor } from "@/hooks/use-live-monitor";
import { useSession } from "@/store/session-provider";

export default function AnalyzePage() {
  const { context, preset, applyResult, lastResult, lastLabel } = useSession();
  const live = useLiveMonitor();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  async function runBuffer(buffer: AudioBuffer, source: "upload" | "demo", label: string, preview?: Blob) {
    const result = live.analyzeBuffer(buffer, context, preset);
    applyResult(result, source, label, buffer.duration * 1000);
    if (preview) setAudioUrl(URL.createObjectURL(preview));
  }

  async function onFile(file: File) {
    setWorking("Decoding audio…");
    setFileName(file.name);
    try {
      const buffer = await decodeFile(file);
      await runBuffer(buffer, "upload", file.name, file);
    } catch {
      live.setError("Could not decode that file. Use WAV, MP3, or M4A.");
    } finally {
      setWorking(null);
    }
  }

  async function runDemo(kind: "human" | "clone") {
    setWorking(kind === "human" ? "Synthesizing human-like speech…" : "Synthesizing clone-like speech…");
    const buffer = kind === "human" ? synthesizeHumanLike() : synthesizeCloneLike();
    const blob = bufferToWavBlob(buffer);
    setFileName(kind === "human" ? "demo-human-like.wav" : "demo-clone-like.wav");
    await runBuffer(
      buffer,
      "demo",
      kind === "human" ? "Demo · human-like signal" : "Demo · clone-like signal",
      blob,
    );
    setWorking(null);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const file = e.dataTransfer.files[0];
            if (file) void onFile(file);
          }}
          className={clsx(
            "card flex min-h-[280px] flex-col items-center justify-center p-8 text-center",
            drag && "border-[var(--accent)]",
          )}
        >
          <div className="text-sm font-medium">Upload a voice clip</div>
          <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
            WAV, MP3, or M4A. Same engine as the live monitor. Audio is processed in the browser and
            not stored.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-6 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#06201a]"
          >
            Choose file
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.aac"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
          {fileName ? <p className="mt-4 font-mono text-xs text-[var(--faint)]">{fileName}</p> : null}
          {working ? <p className="mt-2 text-xs text-[var(--accent)]">{working}</p> : null}
          {live.error ? <p className="mt-2 text-xs text-[var(--high)]">{live.error}</p> : null}
        </section>

        <section className="grid gap-4">
          <button
            type="button"
            onClick={() => void runDemo("human")}
            className="card p-5 text-left transition hover:bg-[var(--bg-hover)]"
          >
            <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">Demo signal A</div>
            <div className="mt-2 text-sm font-medium">Human-like reference</div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Irregular pitch, pauses, and breath noise — a stand-in until the teammate recording is
              enrolled.
            </p>
          </button>
          <button
            type="button"
            onClick={() => void runDemo("clone")}
            className="card p-5 text-left transition hover:bg-[var(--bg-hover)]"
          >
            <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">Demo signal B</div>
            <div className="mt-2 text-sm font-medium">Clone-like reference</div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Flat fundamental, harmonic stack, and a vocoder-style high-frequency cutoff.
            </p>
          </button>
        </section>
      </div>

      {lastResult ? (
        <>
          <AlertBanner band={lastResult.band} />
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="card flex flex-col items-center p-6">
              <RiskRing score={lastResult.score} band={lastResult.band} />
              <p className="mt-3 text-center text-xs text-[var(--faint)]">{lastLabel}</p>
              {audioUrl ? (
                <audio controls src={audioUrl} className="mt-4 w-full" />
              ) : null}
            </div>
            <div className="space-y-5">
              <div className="card p-5">
                <LayerBars layers={lastResult.layers} />
              </div>
              <WhyScore result={lastResult} />
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/protect"
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#06201a]"
                >
                  Open Protect playbook
                </Link>
                <Link
                  href="/operations"
                  className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm"
                >
                  Open Operations
                </Link>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

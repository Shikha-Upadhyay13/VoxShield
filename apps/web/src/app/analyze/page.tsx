"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { PageIntro } from "@/components/atmosphere";
import { DetectionReport } from "@/components/detection-report";
import { bufferToWavBlob, decodeFile, synthesizeCloneLike, synthesizeHumanLike } from "@/lib/audio";
import { engineToLegacy, isOk } from "@/lib/engine-client";
import { clsx } from "@/lib/format";
import { useEngine } from "@/hooks/use-engine";
import { useSession } from "@/store/session-provider";
import type { EngineResponse } from "@/lib/types";

const LANGUAGES = [
  { value: "", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
];

export default function AnalyzePage() {
  const { context, preset, applyResult } = useSession();
  const engine = useEngine();
  const inputRef = useRef<HTMLInputElement>(null);

  const [drag, setDrag] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [language, setLanguage] = useState("");
  const [result, setResult] = useState<EngineResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(blob: Blob, name: string, label: string, source: "upload" | "demo") {
    setError(null);
    setNotice(null);
    setResult(null);
    setFileName(name);
    setWorking("Decoding audio…");

    try {
      // Decode locally too, so the fallback scorer has something to work with if the
      // engine is down.
      let decoded: AudioBuffer | undefined;
      try {
        decoded = await decodeFile(blob);
      } catch {
        decoded = undefined;
      }

      setWorking(
        engine.state === "online"
          ? "Analysing — transcribing and running both detectors…"
          : "Analysing…",
      );

      const outcome = await engine.analyzeFile(blob, name, {
        preset,
        context,
        language: language || null,
        decoded,
      });

      setResult(outcome.result);
      setAudioUrl(URL.createObjectURL(blob));
      applyResult(
        engineToLegacy(outcome.result),
        source,
        label,
        (decoded?.duration ?? 0) * 1000 || outcome.result.meta.audio_ms || 0,
      );

      if (outcome.usedFallback) {
        setNotice(
          `${outcome.error ?? "Engine unreachable."} Showing the in-browser fallback, which has no neural models and cannot assess the words at all.`,
        );
      } else if (outcome.result.status === "insufficient_audio") {
        setNotice(outcome.result.reason);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not analyse that file. Use WAV, MP3, M4A, or WebM.",
      );
    } finally {
      setWorking(null);
    }
  }

  async function onFile(file: File) {
    await run(file, file.name, file.name, "upload");
  }

  async function runDemo(kind: "human" | "clone") {
    setWorking("Synthesizing reference signal…");
    const buffer = kind === "human" ? synthesizeHumanLike() : synthesizeCloneLike();
    const blob = bufferToWavBlob(buffer);
    const name = kind === "human" ? "reference-human-like.wav" : "reference-clone-like.wav";
    await run(
      blob,
      name,
      kind === "human" ? "Reference · human-like signal" : "Reference · clone-like signal",
      "demo",
    );
  }

  const health = engine.health;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageIntro
        kicker="Offline / lab path"
        title="Prove it on a clip."
        body="Upload is a demo and calibration safety net — not the product. In production the same engine rides inside a host app's live call stream after the user grants detection permission."
      />

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
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
            "card frame flex min-h-[290px] flex-col items-center justify-center p-8 text-center",
            drag && "border-[var(--accent)]",
          )}
        >
          <div className="font-serif text-2xl">Upload a voice clip</div>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
            WAV, MP3, M4A, or WebM. Audio is analysed and discarded — only the numbers are kept.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary">
              Choose file
            </button>
            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              Language
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1 text-xs"
              >
                {LANGUAGES.map((option) => (
                  <option key={option.value} value={option.value} className="bg-[#0a0e14]">
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.aac,.webm,.flac,.ogg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />

          {fileName ? <p className="mt-4 font-mono text-xs text-[var(--faint)]">{fileName}</p> : null}
          {working ? <p className="mt-2 text-xs text-[var(--accent)]">{working}</p> : null}
          {error ? <p className="mt-2 text-xs text-[var(--high)]">{error}</p> : null}
        </section>

        <section className="space-y-4">
          <div className="card p-5">
            <div className="kicker">Engine status</div>
            {engine.state === "checking" ? (
              <p className="mt-3 text-sm text-[var(--muted)]">Checking…</p>
            ) : engine.state === "online" && health ? (
              <>
                <p className="mt-3 text-sm">
                  <span className="text-[var(--accent)]">Online</span> · profile {health.profile} ·
                  v{health.engine_version}
                </p>
                <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                  {Object.entries(health.models).map(([name, loaded]) => (
                    <li key={name} className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: loaded ? "var(--genuine)" : "var(--high)" }}
                      />
                      {name}
                      <span className="text-[var(--faint)]">{loaded ? "loaded" : "not loaded"}</span>
                    </li>
                  ))}
                </ul>
                {!health.calibrated ? (
                  <p className="mt-3 text-xs leading-5 text-[var(--review)]">
                    Not calibrated yet. Run <code className="font-mono">python calibrate.py</code>{" "}
                    against your own clips before quoting any accuracy number.
                  </p>
                ) : null}
                {health.notes.length > 0 ? (
                  <ul className="mt-3 space-y-1">
                    {health.notes.map((note) => (
                      <li key={note} className="text-[11px] leading-5 text-[var(--review)]">
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-[var(--review)]">Offline</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  Start it from <code className="font-mono">apps/api</code>:
                </p>
                <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-5 text-[var(--muted)]">
                  {"uvicorn main:app --port 8000"}
                </pre>
                <p className="mt-2 text-xs leading-5 text-[var(--faint)]">
                  Uploads still work, but they fall back to the in-browser scorer, which cannot read
                  the words.
                </p>
              </>
            )}
          </div>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => void runDemo("human")}
              className="card p-4 text-left transition hover:-translate-y-0.5 hover:bg-[var(--bg-hover)]"
            >
              <div className="kicker">Reference A</div>
              <div className="mt-2 font-serif text-xl">Human-like signal</div>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Synthetic test tone with irregular pitch and breath noise. A wiring check, not a real
                voice.
              </p>
            </button>
            <button
              type="button"
              onClick={() => void runDemo("clone")}
              className="card p-4 text-left transition hover:-translate-y-0.5 hover:bg-[var(--bg-hover)]"
            >
              <div className="kicker">Reference B</div>
              <div className="mt-2 font-serif text-xl">Clone-like signal</div>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Flat fundamental, harmonic stack, hard high-frequency ceiling.
              </p>
            </button>
          </div>
        </section>
      </div>

      {notice ? (
        <div className="frame rounded-xl border border-[var(--review)]/40 bg-[var(--review)]/10 p-4 text-sm leading-6 text-[var(--review)]">
          {notice}
        </div>
      ) : null}

      {result && isOk(result) ? (
        <>
          {audioUrl ? (
            <div className="card p-4">
              <audio controls src={audioUrl} className="w-full" />
            </div>
          ) : null}
          <DetectionReport result={result} label={fileName ?? undefined} />
          <div className="flex flex-wrap gap-3">
            <Link href="/protect" className="btn-primary">
              Open Protect playbook
            </Link>
            <Link href="/operations" className="btn-ghost">
              Open Operations
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

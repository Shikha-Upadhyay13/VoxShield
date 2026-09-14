"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

export type CaptionStatus = "idle" | "listening" | "unsupported" | "denied" | "error";

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Browser live captions while the engine does the heavier analysis.
 *
 * Chrome's Web Speech API gives word-by-word interim text as you speak. With Whisper
 * unavailable on some Windows builds, this path is the only live fraud transcript.
 */
export function useLiveCaptions(active: boolean) {
  const [liveLine, setLiveLine] = useState("");
  const [finalLines, setFinalLines] = useState<string[]>([]);
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState<CaptionStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const restartTimer = useRef<number | null>(null);

  const stop = useCallback(() => {
    wantRef.current = false;
    if (restartTimer.current != null) {
      window.clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    }
    setStatus("idle");
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setSupported(false);
      setStatus("unsupported");
      setStatusDetail("This browser has no Speech Recognition API. Use Chrome/Edge, or type the transcript below.");
      return;
    }
    setSupported(true);
    stop();
    wantRef.current = true;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    // Prefer Indian English for SIH demos; fall back to device locale.
    recognition.lang =
      typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("hi")
        ? navigator.language
        : "en-IN";

    recognition.onresult = (event) => {
      setStatus("listening");
      setStatusDetail(null);
      let interim = "";
      const newlyFinal: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i];
        if (!piece) continue;
        const text = piece[0]?.transcript?.trim() ?? "";
        if (!text) continue;
        if (piece.isFinal) newlyFinal.push(text);
        else interim = text;
      }
      if (newlyFinal.length) {
        setFinalLines((prev) => [...prev, ...newlyFinal].slice(-48));
      }
      setLiveLine(interim);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setSupported(false);
        setStatus("denied");
        setStatusDetail("Microphone / speech permission denied. Allow mic for this site, or type the words below.");
        wantRef.current = false;
        return;
      }
      if (event.error === "no-speech" || event.error === "aborted") {
        // Chrome ends idle sessions; we restart on onend.
        return;
      }
      setStatus("error");
      setStatusDetail(`Captions paused (${event.error}). Keep speaking or type the transcript below.`);
    };

    recognition.onend = () => {
      if (!wantRef.current) return;
      // Debounce restart — Chrome throws if start() is called too quickly.
      restartTimer.current = window.setTimeout(() => {
        if (!wantRef.current || recognitionRef.current !== recognition) return;
        try {
          recognition.start();
          setStatus("listening");
        } catch {
          setStatus("error");
          setStatusDetail("Captions stopped. Refresh the page or type the transcript below.");
        }
      }, 250);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setStatus("listening");
      setStatusDetail(null);
    } catch {
      setSupported(false);
      setStatus("unsupported");
      setStatusDetail("Could not start captions. Use Chrome/Edge on localhost, or type below.");
    }
  }, [stop]);

  useEffect(() => {
    if (active) {
      setLiveLine("");
      setFinalLines([]);
      start();
    } else {
      stop();
      setLiveLine("");
    }
    return () => stop();
  }, [active, start, stop]);

  const transcript = [...finalLines, liveLine].filter(Boolean).join(" ").trim();

  return {
    transcript,
    liveLine,
    finalText: finalLines.join(" ").trim(),
    supported,
    status,
    statusDetail,
    clear: () => {
      setLiveLine("");
      setFinalLines([]);
    },
  };
}

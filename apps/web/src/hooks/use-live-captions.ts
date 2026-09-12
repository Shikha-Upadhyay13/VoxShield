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
 * Chrome's Web Speech API gives word-by-word interim text as you speak. Language is
 * not pinned here — the Python engine (faster-whisper) auto-detects on every score.
 * Captions follow the device locale so we do not force English on a Hindi call.
 */
export function useLiveCaptions(active: boolean) {
  const [liveLine, setLiveLine] = useState("");
  const [finalLines, setFinalLines] = useState<string[]>([]);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);

  const stop = useCallback(() => {
    wantRef.current = false;
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
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);
    stop();
    wantRef.current = true;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    // Prefer the OS/browser locale; never hard-pin en/hi — Whisper owns detection.
    if (typeof navigator !== "undefined" && navigator.language) {
      recognition.lang = navigator.language;
    }

    recognition.onresult = (event) => {
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
        // Keep a long call window — ransom scripts run past a dozen short finals.
        setFinalLines((prev) => [...prev, ...newlyFinal].slice(-48));
      }
      setLiveLine(interim);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") setSupported(false);
    };

    recognition.onend = () => {
      // Chrome ends recognition periodically; restart while the session is live.
      if (wantRef.current) {
        try {
          recognition.start();
        } catch {
          /* ignore rapid restart races */
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setSupported(false);
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
    clear: () => {
      setLiveLine("");
      setFinalLines([]);
    },
  };
}

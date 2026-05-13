import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Square,
  ArrowLeftRight,
  Volume2,
  Copy,
  X,
  Lock,
  MessageCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
});

const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Mandarin",
  "Portuguese",
  "Arabic",
  "Japanese",
  "Italian",
  "Korean",
];

const LANG_CODES: Record<string, string> = {
  English: "en-US",
  Spanish: "es-MX",
  French: "fr-FR",
  German: "de-DE",
  Mandarin: "zh-CN",
  Portuguese: "pt-BR",
  Arabic: "ar-SA",
  Japanese: "ja-JP",
  Italian: "it-IT",
  Korean: "ko-KR",
};

const SILENCE_TIMEOUT_MS = 20000;
const END_CONFIRM_MS = 3000;

type Status = "ready" | "listening" | "translating";
type Speaker = "A" | "B";

type Message = {
  id: string;
  speaker: Speaker;
  original: string;
  originalLang: string;
  translation: string;
  translationLang: string;
  langCode: string;
};

function StatusIndicator({ status }: { status: Status }) {
  if (status === "listening") {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="h-2.5 w-2.5 rounded-full bg-green-500 dot-pulse" />
        <span>Listening...</span>
        <div className="flex items-end gap-1 h-4 ml-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-1 h-full rounded-full bg-green-500 wave-bar"
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
      </div>
    );
  }
  if (status === "translating") {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="h-3.5 w-3.5 rounded-full border-2 border-teal border-t-transparent animate-spin" />
        <span>Translating...</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/60" />
      <span>Ready</span>
    </div>
  );
}

function Index() {
  const [yourLang, setYourLang] = useState("English");
  const [theirLang, setTheirLang] = useState("Spanish");
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<Status>("ready");
  const [turn, setTurn] = useState<Speaker>("A");
  const [messages, setMessages] = useState<Message[]>([]);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [pauseBanner, setPauseBanner] = useState(false);
  const [copyLabel, setCopyLabel] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const recognizerARef = useRef<any>(null);
  const recognizerBRef = useRef<any>(null);
  const isRaceActiveRef = useRef(false);
  const translationInProgressRef = useRef(false);
  const turnRef = useRef<Speaker>("A");
  const activeRef = useRef(false);
  const yourLangRef = useRef(yourLang);
  const theirLangRef = useRef(theirLang);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingResultARef = useRef<{ transcript: string; confidence: number } | null>(null);
  const pendingResultBRef = useRef<{ transcript: string; confidence: number } | null>(null);

  const sameLang = yourLang === theirLang;

  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    yourLangRef.current = yourLang;
  }, [yourLang]);
  useEffect(() => {
    theirLangRef.current = theirLang;
  }, [theirLang]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, interim]);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const armSilenceTimer = () => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      // Pause session
      activeRef.current = false;
      setActive(false);
      setPaused(true);
      setPauseBanner(true);
      setStatus("ready");
      setInterim("");
      abortBoth();
    }, SILENCE_TIMEOUT_MS);
  };

  const swap = () => {
    if (active) return;
    setYourLang(theirLang);
    setTheirLang(yourLang);
  };

  const speak = (id: string, text: string, langCode: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    // Cancel currently playing
    window.speechSynthesis.cancel();
    if (playingId === id) {
      setPlayingId(null);
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const match =
      voices.find((v) => v.lang === langCode) ||
      voices.find((v) => v.lang.startsWith(langCode.split("-")[0]));
    if (match) utter.voice = match;
    utter.lang = langCode;
    utter.onend = () => setPlayingId((cur) => (cur === id ? null : cur));
    utter.onerror = () => setPlayingId((cur) => (cur === id ? null : cur));
    setPlayingId(id);
    window.speechSynthesis.speak(utter);
  };

  const translate = async (text: string) => {
    const languageA = yourLangRef.current;
    const languageB = theirLangRef.current;
    setStatus("translating");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, languageA, languageB }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        sourceLanguage?: string;
        targetLanguage?: string;
        translation?: string;
      };
      const sourceLang = data.sourceLanguage ?? languageA;
      const targetLanguage = data.targetLanguage ?? languageB;
      const translation = data.translation ?? "";
      const langCode = LANG_CODES[targetLanguage] ?? "en-US";
      const speaker: Speaker = sourceLang === languageA ? "A" : "B";

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          speaker,
          original: text,
          originalLang: sourceLang,
          translation,
          translationLang: targetLanguage,
          langCode,
        },
      ]);

      setTurn(speaker);
      turnRef.current = speaker;
    } catch (err) {
      console.error(err);
      setApiError("Translation failed. Please try again.");
    } finally {
      translationInProgressRef.current = false;
      if (activeRef.current) {
        startRace();
      } else {
        setStatus("ready");
      }
    }
  };

  const createRecognizer = (langCode: string) => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = langCode;

    rec.onstart = () => {
      setStatus("listening");
      if (silenceTimerRef.current === null) {
        armSilenceTimer();
      }
    };

    rec.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const transcript: string = result[0].transcript ?? "";
      const confidence: number = result[0].confidence ?? 0;

      if (
        result.isFinal &&
        isRaceActiveRef.current &&
        !translationInProgressRef.current
      ) {
        if (langCode === LANG_CODES[yourLangRef.current]) {
          pendingResultARef.current = { transcript: transcript.trim(), confidence };
        } else {
          pendingResultBRef.current = { transcript: transcript.trim(), confidence };
        }

        const resultA = pendingResultARef.current;
        const resultB = pendingResultBRef.current;

        if (resultA !== null && resultB !== null) {
          isRaceActiveRef.current = false;
          translationInProgressRef.current = true;
          clearSilenceTimer();
          setInterim("");
          abortBoth();
          const winner = resultA.confidence >= resultB.confidence ? resultA : resultB;
          pendingResultARef.current = null;
          pendingResultBRef.current = null;
          translate(winner.transcript);
        }
      } else if (!result.isFinal) {
        clearSilenceTimer();
        armSilenceTimer();
        setInterim(transcript);
      }
    };

    rec.onerror = (event: any) => {
      const err = event.error;
      if (err === "aborted" || err === "no-speech") return;
      if (err === "not-allowed" || err === "denied") {
        setMicError(
          "Microphone access is required. Please allow access in your browser settings.",
        );
        clearSilenceTimer();
        activeRef.current = false;
        setActive(false);
        setStatus("ready");
        abortBoth();
        return;
      }
      console.error("Speech recognition error:", err);
      if (activeRef.current && !translationInProgressRef.current) {
        setTimeout(() => {
          if (activeRef.current && !translationInProgressRef.current) {
            startRace();
          }
        }, 200);
      }
    };

    rec.onend = () => {
      // If the race is still active and no winner was declared, restart it.
      // continuous=false causes recognizers to end after each utterance/pause,
      // so we must re-arm to keep listening.
      if (
        activeRef.current &&
        isRaceActiveRef.current &&
        !translationInProgressRef.current
      ) {
        // Debounce — both recognizers may end nearly simultaneously
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (
            activeRef.current &&
            !translationInProgressRef.current
          ) {
            startRace();
          }
        }, 150);
      }
    };

    return rec;
  };

  const abortBoth = () => {
    isRaceActiveRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognizerARef.current) {
      try {
        recognizerARef.current.abort();
      } catch {}
    }
    if (recognizerBRef.current) {
      try {
        recognizerBRef.current.abort();
      } catch {}
    }
  };

  const startRace = () => {
    if (typeof window === "undefined") return;
    if (translationInProgressRef.current) return;
    if (!activeRef.current) return;

    // Tear down any prior instances
    abortBoth();

    const codeA = LANG_CODES[yourLangRef.current] ?? "en-US";
    const codeB = LANG_CODES[theirLangRef.current] ?? "en-US";
    const recA = createRecognizer(codeA);
    const recB = createRecognizer(codeB);

    if (!recA || !recB) {
      setMicError(
        "Speech recognition is not supported in this browser. Please use Chrome.",
      );
      return;
    }

    recognizerARef.current = recA;
    recognizerBRef.current = recB;
    isRaceActiveRef.current = true;
    setInterim("");

    try {
      recA.start();
    } catch {}
    try {
      recB.start();
    } catch {}
  };

  const startSession = () => {
    setMicError(null);
    setApiError(null);
    setPauseBanner(false);

    if (paused) {
      setPaused(false);
    } else {
      setMessages([]);
      setTurn("A");
      turnRef.current = "A";
    }
    setActive(true);
    activeRef.current = true;
    translationInProgressRef.current = false;
    setTimeout(() => startRace(), 50);
  };

  const finalizeEnd = () => {
    activeRef.current = false;
    setActive(false);
    setPaused(false);
    abortBoth();
    recognizerARef.current = null;
    recognizerBRef.current = null;
    translationInProgressRef.current = false;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    clearSilenceTimer();
    setPlayingId(null);
    setTurn("A");
    turnRef.current = "A";
    setInterim("");
    setStatus("ready");
  };

  const toggleSession = () => {
    if (active) {
      // Two-step confirm
      if (confirmEnd) {
        if (endConfirmTimerRef.current) clearTimeout(endConfirmTimerRef.current);
        endConfirmTimerRef.current = null;
        setConfirmEnd(false);
        finalizeEnd();
      } else {
        setConfirmEnd(true);
        if (endConfirmTimerRef.current) clearTimeout(endConfirmTimerRef.current);
        endConfirmTimerRef.current = setTimeout(() => {
          setConfirmEnd(false);
          endConfirmTimerRef.current = null;
        }, END_CONFIRM_MS);
      }
    } else {
      startSession();
    }
  };

  const copyTranscript = () => {
    if (messages.length === 0) return;
    const text = messages
      .map((m) => {
        const personLabel = m.speaker === "A" ? "Person A" : "Person B";
        return `[${personLabel} - ${m.originalLang}]: ${m.original}\n[Translation - ${m.translationLang}]: ${m.translation}`;
      })
      .join("\n\n");
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopyLabel(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopyLabel(false), 2000);
  };

  const startDisabled = sameLang;
  const lockInputs = active;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {apiError && (
        <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-red-500/30 bg-[oklch(0.58_0.22_25)] px-4 py-3 text-sm text-white">
          <span>{apiError}</span>
          <button
            onClick={() => setApiError(null)}
            aria-label="Dismiss"
            className="rounded p-1 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {pauseBanner && (
        <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-teal/30 bg-teal/15 px-4 py-3 text-sm text-teal-soft">
          <span>
            Session paused due to inactivity. Tap "Start Conversation" to resume.
          </span>
          <button
            onClick={() => setPauseBanner(false)}
            aria-label="Dismiss"
            className="rounded p-1 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            LinguaFlow
          </h1>
        </header>

        {/* Language selectors */}
        <div className="mb-2 flex items-end gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              Your Language
              {lockInputs && <Lock className="h-3 w-3" />}
            </label>
            <Select
              value={yourLang}
              onValueChange={setYourLang}
              disabled={lockInputs}
            >
              <SelectTrigger className="w-full bg-card border-border disabled:opacity-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <button
            onClick={swap}
            disabled={lockInputs}
            aria-label="Swap languages"
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-teal transition-colors hover:bg-teal hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card disabled:hover:text-teal"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>

          <div className="flex-1 min-w-0">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              Their Language
              {lockInputs && <Lock className="h-3 w-3" />}
            </label>
            <Select
              value={theirLang}
              onValueChange={setTheirLang}
              disabled={lockInputs}
            >
              <SelectTrigger className="w-full bg-card border-border disabled:opacity-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {sameLang && (
          <p className="mb-3 text-xs text-[oklch(0.78_0.14_70)]">
            Please select two different languages.
          </p>
        )}
        {!sameLang && <div className="mb-2" />}

        {/* Session button */}
        <button
          onClick={toggleSession}
          disabled={!active && startDisabled}
          className={`flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-base font-semibold text-white shadow-lg transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
            active
              ? "bg-[oklch(0.58_0.22_25)] hover:bg-[oklch(0.54_0.22_25)]"
              : "bg-teal hover:opacity-90"
          }`}
        >
          {active ? (
            <>
              <Square className="h-5 w-5 fill-white" />
              {confirmEnd ? "Tap again to end" : "End Session"}
            </>
          ) : (
            <>
              <Mic className="h-5 w-5" />
              Start Conversation
            </>
          )}
        </button>

        {micError && (
          <p className="mt-2 text-sm text-[oklch(0.7_0.18_25)]">{micError}</p>
        )}

        {/* Status bar */}
        <div className="mt-3 mb-4 px-1">
          <StatusIndicator status={status} />
        </div>

        {/* Transcript card */}
        <div className="glass flex flex-1 flex-col rounded-2xl p-4 sm:p-5 min-h-[300px]">
          <div className="flex-1 space-y-4 overflow-y-auto">
            {messages.length === 0 && !interim && (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 text-muted-foreground">
                <MessageCircle className="h-10 w-10 opacity-40" />
                <p className="text-sm">Your conversation will appear here.</p>
              </div>
            )}

            {messages.map((m) => {
              const alignRight = m.speaker === "B";
              const isPlaying = playingId === m.id;
              return (
                <div
                  key={m.id}
                  className={`flex ${alignRight ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      alignRight
                        ? "rounded-tr-sm bg-teal/15"
                        : "rounded-tl-sm bg-white/5"
                    }`}
                  >
                    <p className="text-sm text-white">{m.original}</p>
                    <div className="mt-1.5 flex items-start justify-between gap-3">
                      <p className="text-xs italic text-teal-soft">
                        {m.translation}
                      </p>
                      <button
                        aria-label={
                          isPlaying ? "Stop playback" : "Play translation"
                        }
                        onClick={() => speak(m.id, m.translation, m.langCode)}
                        className="shrink-0 text-teal-soft hover:text-teal"
                      >
                        {isPlaying ? (
                          <Square className="h-3.5 w-3.5 fill-current" />
                        ) : (
                          <Volume2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {interim && (
              <div
                className={`flex ${turn === "B" ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-white/[0.03] border border-dashed border-white/10">
                  <p className="text-sm italic text-white/50">{interim}</p>
                </div>
              </div>
            )}

            <div ref={transcriptEndRef} />
          </div>

          {/* Footer */}
          <div className="mt-4 flex justify-center border-t border-white/10 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={copyTranscript}
              disabled={messages.length === 0}
              className="border-border bg-transparent text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              <Copy className="mr-2 h-3.5 w-3.5" />
              {copyLabel ? "Copied!" : "Copy Transcript"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

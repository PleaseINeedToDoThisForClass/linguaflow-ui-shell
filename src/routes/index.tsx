import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, ArrowLeftRight, Volume2, Copy, X } from "lucide-react";
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

type Status = "ready" | "listening" | "translating";
type Speaker = "A" | "B";

type Message = {
  id: string;
  speaker: Speaker;
  original: string;
  translation: string;
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

const PLACEHOLDERS: Message[] = [
  {
    id: "p1",
    speaker: "A",
    original: "Hello, how are you doing today?",
    translation: "Hola, ¿cómo estás hoy?",
    langCode: "es-MX",
  },
  {
    id: "p2",
    speaker: "B",
    original: "Muy bien, gracias. ¿Y tú?",
    translation: "Very well, thanks. And you?",
    langCode: "en-US",
  },
];

function Index() {
  const [yourLang, setYourLang] = useState("English");
  const [theirLang, setTheirLang] = useState("Spanish");
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<Status>("ready");
  const [turn, setTurn] = useState<Speaker>("A");
  const [messages, setMessages] = useState<Message[]>(PLACEHOLDERS);
  const [hasReal, setHasReal] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const turnRef = useRef<Speaker>("A");
  const activeRef = useRef(false);
  const yourLangRef = useRef(yourLang);
  const theirLangRef = useRef(theirLang);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

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

  const swap = () => {
    setYourLang(theirLang);
    setTheirLang(yourLang);
  };

  const speak = (text: string, langCode: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const match =
      voices.find((v) => v.lang === langCode) ||
      voices.find((v) => v.lang.startsWith(langCode.split("-")[0]));
    if (match) utter.voice = match;
    utter.lang = langCode;
    window.speechSynthesis.speak(utter);
  };

  const translate = async (text: string, speaker: Speaker) => {
    const targetLanguage =
      speaker === "A" ? theirLangRef.current : yourLangRef.current;
    setStatus("translating");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLanguage }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { translation?: string };
      const translation = data.translation ?? "";
      const langCode = LANG_CODES[targetLanguage] ?? "en-US";

      setMessages((prev) => {
        const base = hasReal ? prev : [];
        return [
          ...base,
          {
            id: `${Date.now()}-${Math.random()}`,
            speaker,
            original: text,
            translation,
            langCode,
          },
        ];
      });
      setHasReal(true);

      // Flip turn and continue if still active
      const nextTurn: Speaker = speaker === "A" ? "B" : "A";
      setTurn(nextTurn);
      if (activeRef.current) {
        startListening();
      } else {
        setStatus("ready");
      }
    } catch (err) {
      console.error(err);
      setApiError(
        "Translation failed. Please check your API key and try again.",
      );
      if (activeRef.current) {
        startListening();
      } else {
        setStatus("ready");
      }
    }
  };

  const startListening = () => {
    if (typeof window === "undefined") return;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      setMicError(
        "Speech recognition is not supported in this browser. Please use Chrome.",
      );
      return;
    }

    try {
      // Stop any in-flight recognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }

      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = true;
      const speakerNow = turnRef.current;
      const langName =
        speakerNow === "A" ? yourLangRef.current : theirLangRef.current;
      recognition.lang = LANG_CODES[langName] ?? "en-US";

      let finalTranscript = "";

      recognition.onstart = () => {
        setStatus("listening");
        setInterim("");
      };
      recognition.onresult = (event: any) => {
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimText += result[0].transcript;
          }
        }
        setInterim(interimText);
      };
      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "not-allowed" || event.error === "denied") {
          setMicError(
            "Microphone access is required. Please allow access in your browser settings.",
          );
          setActive(false);
          setStatus("ready");
        } else if (event.error === "no-speech" || event.error === "aborted") {
          // Restart silently if still active
          if (activeRef.current) {
            setTimeout(() => startListening(), 200);
          } else {
            setStatus("ready");
          }
        }
      };
      recognition.onend = () => {
        setInterim("");
        const text = finalTranscript.trim();
        if (text) {
          translate(text, speakerNow);
        } else if (activeRef.current && status !== "translating") {
          // Nothing captured — try again
          setTimeout(() => {
            if (activeRef.current) startListening();
          }, 200);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Failed to start recognition:", err);
    }
  };

  const startSession = () => {
    setMicError(null);
    setApiError(null);
    setTurn("A");
    turnRef.current = "A";
    setActive(true);
    activeRef.current = true;
    // Slight delay to ensure refs are committed
    setTimeout(() => startListening(), 50);
  };

  const endSession = () => {
    setActive(false);
    activeRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setTurn("A");
    turnRef.current = "A";
    setInterim("");
    setStatus("ready");
  };

  const toggleSession = () => {
    if (active) endSession();
    else startSession();
  };

  const copyTranscript = () => {
    const real = hasReal ? messages : [];
    const text = real
      .map((m) => `${m.original}\n${m.translation}`)
      .join("\n\n");
    if (text && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

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

      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            LinguaFlow
          </h1>
        </header>

        {/* Language selectors */}
        <div className="mb-4 flex items-end gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Your Language
            </label>
            <Select value={yourLang} onValueChange={setYourLang}>
              <SelectTrigger className="w-full bg-card border-border">
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
            aria-label="Swap languages"
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-teal transition-colors hover:bg-teal hover:text-white"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>

          <div className="flex-1 min-w-0">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Their Language
            </label>
            <Select value={theirLang} onValueChange={setTheirLang}>
              <SelectTrigger className="w-full bg-card border-border">
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

        {/* Session button */}
        <button
          onClick={toggleSession}
          className={`flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-base font-semibold text-white shadow-lg transition-all active:scale-[0.99] ${
            active
              ? "bg-[oklch(0.58_0.22_25)] hover:bg-[oklch(0.54_0.22_25)]"
              : "bg-teal hover:opacity-90"
          }`}
        >
          {active ? (
            <>
              <Square className="h-5 w-5 fill-white" />
              End Session
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
            {messages.map((m) => {
              const alignRight = m.speaker === "B";
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
                        aria-label="Play translation"
                        onClick={() => speak(m.translation, m.langCode)}
                        className="shrink-0 text-teal-soft hover:text-teal"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
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
              className="border-border bg-transparent text-muted-foreground hover:bg-white/5 hover:text-white"
            >
              <Copy className="mr-2 h-3.5 w-3.5" />
              Copy Transcript
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mic, Square, ArrowLeftRight, Volume2, Copy } from "lucide-react";
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

type Status = "ready" | "listening" | "translating";

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
  const status: Status = "ready";

  const swap = () => {
    setYourLang(theirLang);
    setTheirLang(yourLang);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
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
          onClick={() => setActive((a) => !a)}
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

        {/* Status bar */}
        <div className="mt-3 mb-4 px-1">
          <StatusIndicator status={status} />
        </div>

        {/* Transcript card */}
        <div className="glass flex flex-1 flex-col rounded-2xl p-4 sm:p-5 min-h-[300px]">
          <div className="flex-1 space-y-4 overflow-y-auto">
            {/* Left aligned (Person A / Your Language) */}
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/5 px-4 py-3">
                <p className="text-sm text-white">
                  Hello, how are you doing today?
                </p>
                <div className="mt-1.5 flex items-start justify-between gap-3">
                  <p className="text-xs italic text-teal-soft">
                    Hola, ¿cómo estás hoy?
                  </p>
                  <button
                    aria-label="Play translation"
                    className="shrink-0 text-teal-soft hover:text-teal"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right aligned (Person B / Their Language) */}
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-teal/15 px-4 py-3">
                <p className="text-sm text-white">
                  Muy bien, gracias. ¿Y tú?
                </p>
                <div className="mt-1.5 flex items-start justify-between gap-3">
                  <p className="text-xs italic text-teal-soft">
                    Very well, thanks. And you?
                  </p>
                  <button
                    aria-label="Play translation"
                    className="shrink-0 text-teal-soft hover:text-teal"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 flex justify-center border-t border-white/10 pt-4">
            <Button
              variant="outline"
              size="sm"
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

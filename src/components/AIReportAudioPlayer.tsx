import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Square, Loader2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { resolveVoice, subscribeVoiceURI } from "@/lib/ttsVoice";

interface Props {
  /** Markdown or plain text content of the AI report. */
  text: string | null | undefined;
  /** Optional cache key — when it changes, the audio is regenerated. */
  cacheKey?: string;
  /** Optional className for the wrapper. */
  className?: string;
  /** Compact label vs icon-only. */
  compact?: boolean;
  /** BCP-47 language code; defaults to pt-BR. */
  lang?: string;
}

const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;

/**
 * Strip markdown to plain readable text suitable for TTS.
 * Removes headings markers, bold/italics, code fences, list bullets and links.
 */
function markdownToSpeakable(md: string): string {
  return md
    // code blocks / inline code
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    // images
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    // links -> keep label
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // headings
    .replace(/^#{1,6}\s+/gm, "")
    // bold/italic markers
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    // list bullets
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // blockquotes
    .replace(/^>\s?/gm, "")
    // horizontal rules
    .replace(/^---+$/gm, "")
    // collapse whitespace
    .replace(/\s+\n/g, "\n")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Reusable audio playback button for AI reports.
 * Uses the browser's Web Speech API (SpeechSynthesis) — no API key needed,
 * works offline and on PWA. Supports play/pause/stop and speed control.
 */
export function AIReportAudioPlayer({
  text,
  cacheKey,
  className,
  compact = false,
  lang = "pt-BR",
}: Props) {
  const [supported, setSupported] = useState<boolean>(true);
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [rate, setRate] = useState<number>(1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const lastCacheKeyRef = useRef<string | undefined>(cacheKey);

  const speakable = useMemo(() => (text ? markdownToSpeakable(text) : ""), [text]);

  // Detect support
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
    }
  }, []);

  // Pick the user-selected (or best fallback) voice
  const pickVoice = useCallback(() => {
    if (!supported) return;
    voiceRef.current = resolveVoice(lang);
  }, [supported, lang]);

  useEffect(() => {
    if (!supported) return;
    pickVoice();
    const handler = () => pickVoice();
    window.speechSynthesis.addEventListener?.("voiceschanged", handler);
    const unsub = subscribeVoiceURI(() => pickVoice());
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", handler);
      unsub();
    };
  }, [supported, pickVoice]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setStatus("idle");
  }, [supported]);

  // When the report content (or cacheKey) changes, stop & reset so new content is regenerated on next play.
  useEffect(() => {
    if (lastCacheKeyRef.current !== cacheKey) {
      lastCacheKeyRef.current = cacheKey;
      stop();
    }
  }, [cacheKey, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  const play = useCallback(() => {
    if (!supported || !speakable) return;
    try {
      // Resume if paused
      if (status === "paused" && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setStatus("playing");
        return;
      }

      // Fresh playback
      window.speechSynthesis.cancel();
      setStatus("loading");

      const utt = new SpeechSynthesisUtterance(speakable);
      utt.lang = lang;
      utt.rate = rate;
      utt.pitch = 1;
      utt.volume = 1;
      if (voiceRef.current) utt.voice = voiceRef.current;

      utt.onstart = () => setStatus("playing");
      utt.onresume = () => setStatus("playing");
      utt.onpause = () => setStatus("paused");
      utt.onend = () => {
        utteranceRef.current = null;
        setStatus("idle");
      };
      utt.onerror = (e) => {
        utteranceRef.current = null;
        setStatus("idle");
        // "interrupted" / "canceled" are expected when user stops — don't toast
        const err = (e as SpeechSynthesisErrorEvent).error;
        if (err && err !== "canceled" && err !== "interrupted") {
          toast.error("Não foi possível reproduzir o áudio", { description: err });
        }
      };

      utteranceRef.current = utt;
      window.speechSynthesis.speak(utt);
    } catch (e: any) {
      setStatus("idle");
      toast.error("Falha ao iniciar narração", { description: e?.message });
    }
  }, [supported, speakable, status, lang, rate]);

  const pause = useCallback(() => {
    if (!supported) return;
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setStatus("paused");
    }
  }, [supported]);

  // Apply new rate live by restarting the utterance from the beginning.
  // SpeechSynthesisUtterance.rate cannot be changed mid-speech in most browsers.
  const handleRateChange = (r: number) => {
    setRate(r);
    if (status === "playing" || status === "paused") {
      window.speechSynthesis.cancel();
      // small delay to let cancel propagate
      setTimeout(() => {
        const utt = new SpeechSynthesisUtterance(speakable);
        utt.lang = lang;
        utt.rate = r;
        if (voiceRef.current) utt.voice = voiceRef.current;
        utt.onstart = () => setStatus("playing");
        utt.onpause = () => setStatus("paused");
        utt.onresume = () => setStatus("playing");
        utt.onend = () => setStatus("idle");
        utt.onerror = () => setStatus("idle");
        utteranceRef.current = utt;
        window.speechSynthesis.speak(utt);
      }, 60);
    }
  };

  if (!supported || !speakable) return null;

  const isLoading = status === "loading";
  const isPlaying = status === "playing";
  const isPaused = status === "paused";

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={isPlaying || isPaused ? "default" : "outline"}
            onClick={isPlaying ? pause : play}
            disabled={isLoading}
            aria-label={isPlaying ? "Pausar narração" : isPaused ? "Retomar narração" : "Ouvir relatório"}
            className="shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : isPaused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
            {!compact && (
              <span className="hidden sm:inline ml-1 text-xs">
                {isLoading ? "Preparando…" : isPlaying ? "Pausar" : isPaused ? "Retomar" : "Ouvir"}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isPlaying ? "Pausar narração" : isPaused ? "Retomar narração" : "Ouvir relatório (pt-BR)"}
        </TooltipContent>
      </Tooltip>

      {(isPlaying || isPaused) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={stop}
              aria-label="Parar narração"
              className="shrink-0"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Parar narração</TooltipContent>
        </Tooltip>
      )}

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0 h-9 px-2 text-[11px] font-mono"
                aria-label="Velocidade da narração"
              >
                {rate}x
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Velocidade da narração</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          {SPEEDS.map((s) => (
            <DropdownMenuItem
              key={s}
              onClick={() => handleRateChange(s)}
              className={cn("text-xs", rate === s && "font-semibold text-primary")}
            >
              {s}x {rate === s && "✓"}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

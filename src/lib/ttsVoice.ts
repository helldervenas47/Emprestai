// Simple persisted preference for the TTS voice used by AIReportAudioPlayer.
const KEY = "ai-report-tts-voice";
const listeners = new Set<(v: string | null) => void>();

export function getStoredVoiceURI(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setStoredVoiceURI(voiceURI: string | null) {
  try {
    if (voiceURI) localStorage.setItem(KEY, voiceURI);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(voiceURI));
}

export function subscribeVoiceURI(cb: (v: string | null) => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

/** Find voice instance matching stored URI, or fallback. */
export function resolveVoice(lang = "pt-BR"): SpeechSynthesisVoice | null {
  const voices = getVoices();
  if (!voices.length) return null;
  const stored = getStoredVoiceURI();
  if (stored) {
    const match = voices.find((v) => v.voiceURI === stored);
    if (match) return match;
  }
  const lc = lang.toLowerCase();
  return (
    voices.find((v) => v.lang?.toLowerCase() === lc && /natural|google|microsoft|neural/i.test(v.name)) ||
    voices.find((v) => v.lang?.toLowerCase() === lc) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith(lc.split("-")[0])) ||
    null
  );
}

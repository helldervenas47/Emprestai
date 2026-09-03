import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Volume2, Play, Square, Mic } from "lucide-react";
import { getStoredVoiceURI, setStoredVoiceURI, subscribeVoiceURI } from "@/lib/ttsVoice";
import { toast } from "sonner";

const SAMPLE_TEXT =
  "Olá! Esta é uma amostra de como os relatórios de inteligência artificial serão narrados para você.";

const AUTO = "__auto__";

export function AIVoiceSettingsCard() {
  const [supported, setSupported] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selected, setSelected] = useState<string>(getStoredVoiceURI() ?? AUTO);
  const [testing, setTesting] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    const refresh = () => setVoices(window.speechSynthesis.getVoices());
    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", refresh);
  }, []);

  useEffect(() => {
    const unsub = subscribeVoiceURI((v) => setSelected(v ?? AUTO));
    return unsub;
  }, []);

  // Group voices: pt-BR / pt first, then others.
  const sortedVoices = useMemo(() => {
    const pt = voices.filter((v) => v.lang?.toLowerCase().startsWith("pt"));
    const others = voices.filter((v) => !v.lang?.toLowerCase().startsWith("pt"));
    return [...pt, ...others];
  }, [voices]);

  const stop = () => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setTesting(false);
  };

  const test = () => {
    if (!supported) return;
    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(SAMPLE_TEXT);
      utt.lang = "pt-BR";
      utt.rate = 1;
      const voice =
        selected === AUTO
          ? voices.find((v) => v.lang?.toLowerCase() === "pt-br") ||
            voices.find((v) => v.lang?.toLowerCase().startsWith("pt")) ||
            null
          : voices.find((v) => v.voiceURI === selected) || null;
      if (voice) utt.voice = voice;
      utt.onstart = () => setTesting(true);
      utt.onend = () => setTesting(false);
      utt.onerror = (e) => {
        setTesting(false);
        const err = (e as SpeechSynthesisErrorEvent).error;
        if (err && err !== "canceled" && err !== "interrupted") {
          toast.error("Não foi possível testar a voz", { description: err });
        }
      };
      utteranceRef.current = utt;
      window.speechSynthesis.speak(utt);
    } catch (e: any) {
      setTesting(false);
      toast.error("Falha ao testar voz", { description: e?.message });
    }
  };

  const handleChange = (val: string) => {
    setSelected(val);
    setStoredVoiceURI(val === AUTO ? null : val);
    toast.success("Voz atualizada");
  };

  useEffect(() => () => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mic className="h-4 w-4 text-primary" /> Voz dos relatórios por IA
        </CardTitle>
        <CardDescription>
          Escolha a voz usada para narrar os relatórios de inteligência artificial. As vozes disponíveis dependem do seu dispositivo e navegador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            Seu navegador não suporta narração por voz.
          </p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={selected} onValueChange={handleChange}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecionar voz" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={AUTO}>Automática (recomendada — pt-BR)</SelectItem>
                  {sortedVoices.map((v) => (
                    <SelectItem key={v.voiceURI} value={v.voiceURI}>
                      {v.name} <span className="text-muted-foreground">({v.lang})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {testing ? (
                <Button type="button" variant="outline" onClick={stop} className="shrink-0">
                  <Square className="h-4 w-4 mr-1" /> Parar
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={test} className="shrink-0">
                  <Play className="h-4 w-4 mr-1" /> Testar
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Volume2 className="h-3 w-3" /> Dica: vozes com nome "Google", "Microsoft" ou "Natural" costumam soar mais naturais.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

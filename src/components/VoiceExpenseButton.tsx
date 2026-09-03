import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Loader2, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";

export interface VoiceExpenseExtraction {
  description?: string;
  amount?: number;
  category?: string;
  dueDate?: string;
  notes?: string;
  scope?: "business" | "personal";
  transcript?: string;
}

interface Props {
  onExtracted: (data: VoiceExpenseExtraction) => void;
  className?: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const result = fr.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export function VoiceExpenseButton({ onExtracted, className }: Props) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 500) {
          toast.error("Áudio muito curto. Tente novamente.");
          return;
        }
        setBusy(true);
        try {
          const base64 = await blobToBase64(blob);
          const { data, error } = await supabase.functions.invoke("voice-expense-extract", {
            body: { audioBase64: base64, mimeType: rec.mimeType },
          });
          if (error) {
            console.error("voice-expense-extract error", error);
            toast.error("Falha ao processar áudio", {
              description: "Verifique se a função voice-expense-extract está deployada no backend externo.",
            });
            return;
          }
          if ((data as any)?.error) {
            toast.error("Não consegui entender", { description: (data as any).error });
            return;
          }
          onExtracted(data as VoiceExpenseExtraction);
          toast.success("Despesa pré-preenchida", {
            description: (data as any)?.transcript?.slice(0, 120),
          });
        } catch (e: any) {
          toast.error("Falha ao processar áudio", { description: e?.message });
        } finally {
          setBusy(false);
        }
      };
      rec.start();
      mediaRef.current = rec;
      setRecording(true);
    } catch (e: any) {
      toast.error("Microfone indisponível", { description: e?.message });
      stopStream();
    }
  };

  const stop = () => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
    setRecording(false);
  };

  return (
    <Button
      type="button"
      variant={recording ? "destructive" : "outline"}
      size="sm"
      onClick={recording ? stop : start}
      disabled={busy}
      className={className}
      title={recording ? "Parar gravação" : "Ditar despesa"}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : recording ? (
        <Square className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
      <span className="ml-2 hidden sm:inline">
        {busy ? "Processando…" : recording ? "Parar" : "Ditar despesa"}
      </span>
    </Button>
  );
}

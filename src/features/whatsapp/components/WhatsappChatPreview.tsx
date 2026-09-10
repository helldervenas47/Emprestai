import React from "react";
import { CheckCheck, MessageCircle } from "lucide-react";

interface WhatsappChatPreviewProps {
  title?: string;
  recipientName?: string;
  recipientPhone?: string;
  message: string;
  time?: string;
}

export function WhatsappChatPreview({
  title = "Pré-visualização WhatsApp",
  recipientName = "Maria Silva",
  recipientPhone = "+55 (11) 98765-4321",
  message,
  time = "09:00",
}: WhatsappChatPreviewProps) {
  return (
    <div className="w-full rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm flex flex-col">
      {/* Cabeçalho do Chat */}
      <div className="bg-emerald-600 dark:bg-emerald-800 text-white px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
            {recipientName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-xs sm:text-sm truncate leading-tight">{recipientName}</p>
            <p className="text-[10px] text-white/80 truncate">{recipientPhone}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center gap-1 text-[10px] bg-white/15 px-2 py-0.5 rounded-full font-medium">
            <MessageCircle className="h-3 w-3" />
            {title}
          </span>
        </div>
      </div>

      {/* Área de Conversa / Papel de Parede */}
      <div className="flex-1 p-3 sm:p-4 bg-muted/40 dark:bg-zinc-950/60 min-h-[160px] flex flex-col justify-end">
        {/* Balão de Mensagem */}
        <div className="max-w-[88%] self-start sm:max-w-[80%] rounded-2xl rounded-tl-sm bg-white dark:bg-emerald-950/70 border border-emerald-500/20 shadow-xs p-3 space-y-1 text-xs text-foreground leading-relaxed whitespace-pre-wrap">
          <div>{message || <span className="text-muted-foreground italic">Nenhuma mensagem configurada.</span>}</div>
          <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground pt-0.5">
            <span>{time}</span>
            <CheckCheck className="h-3.5 w-3.5 text-sky-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

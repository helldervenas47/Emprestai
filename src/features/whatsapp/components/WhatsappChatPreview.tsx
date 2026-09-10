import React from "react";
import { CheckCheck, MessageCircle } from "lucide-react";

interface WhatsappChatPreviewProps {
  title?: string;
  recipientName?: string;
  recipientPhone?: string;
  message: string;
  time?: string;
  headerBgClass?: string;
}

export function WhatsappChatPreview({
  title = "Pré-visualização WhatsApp",
  recipientName = "Maria Silva",
  recipientPhone = "+55 (11) 98765-4321",
  message,
  time = "09:00",
  headerBgClass = "bg-emerald-600 dark:bg-emerald-800",
}: WhatsappChatPreviewProps) {
  return (
    <div className="w-full rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm flex flex-col">
      {/* Cabeçalho do Chat com a Cor do Status Ativo */}
      <div className={`${headerBgClass} text-white px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3 transition-colors duration-200 shadow-xs`}>
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
          <span className="inline-flex items-center gap-1 text-[10px] bg-black/20 text-white border border-white/20 px-2.5 py-0.5 rounded-full font-medium shadow-2xs">
            <MessageCircle className="h-3 w-3" />
            {title}
          </span>
        </div>
      </div>

      {/* Área de Conversa com Plano de Fundo Exato do WhatsApp (Doodle Wallpaper) */}
      <div
        className="flex-1 p-3 sm:p-4 min-h-[180px] flex flex-col justify-end relative bg-[#efeae2] dark:bg-[#0b141a]"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.2) 0%, transparent 100%), url("data:image/svg+xml,%3Csvg width='200' height='200' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' fill-opacity='0.05' fill-rule='evenodd'%3E%3Ccircle cx='30' cy='30' r='10'/%3E%3Cpath d='M80 20h20v20H80zM140 30l10 15h-20zM30 80l15 10-15 10zM90 85a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm50-5h20v20h-20zM40 140h20v20H40zm80 0a15 15 0 1 0 0-30 15 15 0 0 0 0 30zm40 10l15-10v20zM90 170l-10-15h20z'/%3E%3C/g%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "200px 200px",
        }}
      >
        {/* Balão de Mensagem Estilo WhatsApp Oficial */}
        <div className="max-w-[92%] sm:max-w-[85%] self-start rounded-2xl rounded-tl-xs bg-[#ffffff] dark:bg-[#005c4b] border border-black/5 dark:border-white/10 shadow-[0_1px_1.5px_rgba(0,0,0,0.12)] p-3 space-y-1.5 text-xs text-[#111b21] dark:text-[#e9edef] leading-relaxed whitespace-pre-wrap relative">
          <div>
            {message || <span className="text-muted-foreground italic">Nenhuma mensagem configurada.</span>}
          </div>
          <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground dark:text-emerald-200/70 pt-0.5 font-medium tabular-nums">
            <span>{time}</span>
            <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, ExternalLink, Copy, Check } from "lucide-react";
import { buildWhatsappLink, type BillingMessageStatus } from "@/lib/whatsappBilling";
import { toast } from "sonner";

const STATUS_LABEL: Record<BillingMessageStatus | "very_overdue", { label: string; cls: string }> = {
  upcoming: { label: "A vencer", cls: "bg-muted text-muted-foreground border-border" },
  due_today: { label: "Vence hoje", cls: "bg-warning/10 text-warning border-warning/30" },
  overdue: { label: "Vencido", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  very_overdue: { label: "Muito atrasado", cls: "bg-destructive/20 text-destructive border-destructive/30" },
};

export interface WhatsappPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  message: string;
  status: BillingMessageStatus | null;
  recipientName?: string;
}

/**
 * Dialog showing the rendered WhatsApp message (variables already substituted)
 * before opening WhatsApp. The user can edit the message in-place, copy it,
 * or confirm to open wa.me with the final text.
 */
export function WhatsappPreviewDialog({
  open,
  onOpenChange,
  phone,
  message,
  status,
  recipientName,
}: WhatsappPreviewDialogProps) {
  const [draft, setDraft] = useState(message);
  const [copied, setCopied] = useState(false);

  // Reset draft whenever the dialog is opened with a new message
  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(message);
    setCopied(false);
    onOpenChange(next);
  };

  const statusInfo = status ? STATUS_LABEL[status] : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      toast.success("Mensagem copiada");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const handleSend = () => {
    const url = buildWhatsappLink(phone, draft);
    window.open(url, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-success" />
            Pré-visualizar mensagem
          </DialogTitle>
          <DialogDescription>
            Revise o conteúdo final antes de abrir o WhatsApp. As variáveis já foram substituídas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {statusInfo && (
              <Badge variant="outline" className={statusInfo.cls}>{statusInfo.label}</Badge>
            )}
            {recipientName && (
              <span className="text-muted-foreground">Para: <strong className="text-foreground">{recipientName}</strong></span>
            )}
            {phone && (
              <span className="text-muted-foreground font-mono">{phone}</span>
            )}
          </div>

          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className="text-sm font-mono"
          />

          <p className="text-[11px] text-muted-foreground">
            Você pode editar a mensagem antes de enviar. As alterações aqui não afetam os templates
            salvos.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleCopy} className="gap-1.5">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} className="gap-1.5" disabled={!draft.trim()}>
            <ExternalLink className="h-4 w-4" /> Abrir WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

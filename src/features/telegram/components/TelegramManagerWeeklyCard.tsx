import { useState } from "react";
// Card removed: this component is embedded inside TelegramReportsConnectCard.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Users, Clock, Send, Eye, Sparkles, AlertTriangle, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/userClient";
import { useTelegramManagerWeeklyPrefs } from "@/features/telegram/hooks/useTelegramManagerWeeklyPrefs";
import { useTelegramReportsLink } from "@/features/telegram/hooks/useTelegramReportsLink";


const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

interface PreviewManager {
  client_id: string;
  name: string;
  loans_count: number;
  overdue_count: number;
  week_count: number;
  total_amount: number;
  message: string;
}

export function TelegramManagerWeeklyCard() {
  const { linked } = useTelegramReportsLink();
  const { pref, loading, save } = useTelegramManagerWeeklyPrefs();
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState<string | null>(null); // client_id or "all"
  const [previews, setPreviews] = useState<PreviewManager[] | null>(null);
  const [activePreview, setActivePreview] = useState<PreviewManager | null>(null);
  const [referenceDate, setReferenceDate] = useState<string>(""); // YYYY-MM-DD; "" = hoje
  const [previewWindow, setPreviewWindow] = useState<{ start: string; end: string; ref: string } | null>(null);

  if (loading || !linked) return null;

  const fmtBR = (iso: string) => iso.split("-").reverse().join("/");

  const loadPreviews = async () => {
    setPreviewing(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const body: Record<string, unknown> = { owner_id: userId, preview_only: true };
      if (referenceDate) body.reference_date = referenceDate;
      const { data, error } = await supabase.functions.invoke("telegram-manager-weekly-summary", { body });
      if (error) throw error;
      const result = (data as any)?.result ?? {};
      const list = result.managers ?? [];
      setPreviews(list);
      setPreviewWindow(
        result.week_start && result.week_end
          ? { start: result.week_start, end: result.week_end, ref: result.reference_date }
          : null,
      );
      if (list.length === 0) toast.info("Nenhum gerente ativo encontrado.");
    } catch (e: any) {
      toast.error("Erro ao carregar prévia", { description: e.message });
    } finally {
      setPreviewing(false);
    }
  };

  const sendOne = async (clientId: string) => {
    setSending(clientId);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const body: Record<string, unknown> = { owner_id: userId, manager_client_id: clientId };
      if (referenceDate) body.reference_date = referenceDate;
      const { error } = await supabase.functions.invoke("telegram-manager-weekly-summary", { body });
      if (error) throw error;
      toast.success("Mensagem enviada ao bot de relatórios");
    } catch (e: any) {
      toast.error("Falha no envio", { description: e.message });
    } finally {
      setSending(null);
    }
  };

  const sendAllNow = async () => {
    setSending("all");
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const body: Record<string, unknown> = { owner_id: userId, manual_run: true };
      if (referenceDate) body.reference_date = referenceDate;
      const { error } = await supabase.functions.invoke("telegram-manager-weekly-summary", { body });
      if (error) throw error;
      toast.success("Resumos enviados a todos os gerentes");
    } catch (e: any) {
      toast.error("Falha no envio", { description: e.message });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">Resumo semanal por gerente</p>
              <p className="text-xs text-muted-foreground">
                Envia ao bot de relatórios uma mensagem por gerente, com empréstimos atrasados e vencendo na próxima semana (Seg–Dom).
              </p>
            </div>
          </div>
          <Switch
            checked={pref.enabled}
            onCheckedChange={(v) => save({ enabled: v })}
          />
        </div>

        {!pref.enabled && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                Envio automático desativado
              </p>
              <p className="text-[11px] text-muted-foreground">
                Ative o botão acima para que o resumo semanal seja enviado automaticamente
                ao bot de relatórios no dia e horário configurados. Enquanto desligado,
                nenhuma mensagem será disparada pelo agendamento.
              </p>
            </div>
          </div>
        )}

        {pref.enabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Dia da semana</Label>
                <Select
                  value={String(pref.send_weekday)}
                  onValueChange={(v) => save({ send_weekday: Number(v) })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)} className="text-xs">
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Horário
                </Label>
                <Input
                  type="time"
                  value={pref.send_time}
                  onChange={(e) => save({ send_time: e.target.value || "09:00" })}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Template da mensagem
              </Label>
              <Textarea
                rows={8}
                value={pref.message_template}
                onChange={(e) => save({ message_template: e.target.value })}
                className="text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Variáveis disponíveis: <code>{"{nome_gerente}"}</code>,{" "}
                <code>{"{total_emprestimos_atrasados}"}</code>,{" "}
                <code>{"{total_emprestimos_semana}"}</code>,{" "}
                <code>{"{valor_total}"}</code>, <code>{"{etiquetas}"}</code>,{" "}
                <code>{"{lista_clientes}"}</code>.
                <br />
                Cada item de <code>{"{lista_clientes}"}</code> mostra: nome do cliente,
                valor restante, data de vencimento e etiquetas (quando houver).
                Alterações no template são salvas automaticamente e aplicadas no próximo envio.
              </p>
            </div>

            <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" /> Data de referência (simulação)
              </Label>
              <div className="flex items-center gap-2">
                <DatePickerField value={referenceDate} onChange={setReferenceDate} className="h-9 text-xs w-[180px]" />
                {referenceDate && (
                  <Button size="sm" variant="ghost" onClick={() => { setReferenceDate(""); setPreviewWindow(null); }}>
                    Usar hoje
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Em branco = usa a data atual. Aplica-se à pré-visualização e também aos
                envios manuais (não afeta o agendamento automático).
              </p>
              {previewWindow && (
                <p className="text-[11px] text-foreground">
                  Janela considerada — atrasados até <strong>{fmtBR(previewWindow.ref)}</strong>;
                  próxima semana: <strong>{fmtBR(previewWindow.start)}</strong> a{" "}
                  <strong>{fmtBR(previewWindow.end)}</strong>.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={loadPreviews} disabled={previewing}>
                <Eye className="h-3.5 w-3.5 mr-1" />
                {previewing ? "Carregando…" : "Visualizar por gerente"}
              </Button>
              <Button size="sm" onClick={sendAllNow} disabled={sending !== null}>
                <Send className="h-3.5 w-3.5 mr-1" />
                {sending === "all" ? "Enviando…" : "Enviar agora a todos"}
              </Button>
            </div>

            {previews && previews.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-foreground">Gerentes ativos ({previews.length})</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {previews.map((m) => (
                    <div key={m.client_id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          ⚠️ {m.overdue_count} atrasado(s) · 📅 {m.week_count} próxima semana ·{" "}
                          {m.total_amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => setActivePreview(m)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => sendOne(m.client_id)}
                          disabled={sending !== null}
                        >
                          {sending === m.client_id ? "…" : <Send className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pref.last_sent_date && (
              <p className="text-[10px] text-muted-foreground">
                Último envio automático: {pref.last_sent_date.split("-").reverse().join("/")}
              </p>
            )}
          </>
        )}
      </div>

      <Dialog open={!!activePreview} onOpenChange={(v) => !v && setActivePreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prévia — {activePreview?.name}</DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap text-xs bg-muted/40 rounded-md p-3 max-h-[60vh] overflow-y-auto">
            {activePreview?.message}
          </pre>
          <DialogFooter className="gap-2">
            <Button
              onClick={() => activePreview && sendOne(activePreview.client_id)}
              disabled={sending !== null}
            >
              <Send className="h-3.5 w-3.5 mr-1" /> Enviar para este gerente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

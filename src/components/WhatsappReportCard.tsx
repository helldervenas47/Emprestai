import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/userClient";
import { useDataOwner } from "@/hooks/useDataOwner";
import { useMyProfilePhone } from "@/hooks/useMyProfilePhone";
import { useScheduledReportPrefs } from "@/hooks/useScheduledReportPrefs";
import { useWhatsappBillingSchedule } from "@/hooks/useWhatsappBillingSchedule";
import { toast } from "sonner";
import {
  Loader2,
  MessageCircle,
  Clock,
  Plus,
  X,
  Send,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Zap,
} from "lucide-react";

type ReportType = "daily" | "weekly" | "monthly" | "accountant";
type SlotKey = "send_time_1" | "send_time_2" | "send_time_3";

export function WhatsappReportCard() {
  const ownerId = useDataOwner();
  const { phone: profilePhone } = useMyProfilePhone();
  const { schedule } = useWhatsappBillingSchedule();

  // Preferências do Resumo Operacional
  const { prefs, loading: prefsLoading, save: savePrefs } = useScheduledReportPrefs(
    "telegram_operational_summary_prefs",
    "19:00",
  );

  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [sendingSummary, setSendingSummary] = useState(false);

  // Disparo Rápido de outros relatórios
  const [quickPhone, setQuickPhone] = useState("");
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [quickLoading, setQuickLoading] = useState(false);

  useEffect(() => {
    if (prefs.whatsapp_phone) {
      setWhatsappPhone(prefs.whatsapp_phone);
    }
  }, [prefs.whatsapp_phone]);

  const isWhatsappConfigured = Boolean(schedule.base_url?.trim() && schedule.instance_id?.trim());

  const slots: SlotKey[] = ["send_time_1", "send_time_2", "send_time_3"];
  const activeSlots = slots.filter((s) => Boolean(prefs[s]));
  const canAddMoreSlots = activeSlots.length < 3;

  // Disparo manual do Resumo Operacional via WhatsApp
  const sendOperationalSummaryNow = async () => {
    if (!ownerId) return;
    setSendingSummary(true);
    try {
      const destPhone = whatsappPhone.trim() || profilePhone || undefined;
      const { data, error } = await supabase.functions.invoke("telegram-operational-summary", {
        body: {
          channel: "whatsapp",
          send_whatsapp: true,
          phone: destPhone,
        },
      });

      if (error) throw error;

      if (data?.sent) {
        toast.success("Resumo Operacional enviado para o seu WhatsApp!");
      } else {
        const reason = data?.reason;
        if (reason === "whatsapp_not_configured") {
          toast.error("WhatsApp não configurado", {
            description: "Configure sua API do WhatsApp na aba 'Disparos & Automação'.",
          });
        } else if (reason === "no_phone_configured") {
          toast.error("Nenhum telefone configurado", {
            description: "Informe o telefone de destino para o envio.",
          });
        } else {
          toast.error("Falha no envio do resumo", {
            description: reason || "O provedor de WhatsApp não confirmou o envio.",
          });
        }
      }
    } catch (e: any) {
      toast.error("Erro ao enviar resumo", {
        description: e?.message || String(e),
      });
    } finally {
      setSendingSummary(false);
    }
  };

  // Disparo rápido de relatórios avulsos
  const sendQuickReport = async () => {
    if (!ownerId) return;
    setQuickLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-report", {
        body: {
          owner_id: ownerId,
          phone: quickPhone.trim() || profilePhone || undefined,
          report_type: reportType,
        },
      });

      if (error) throw error;

      if ((data as any)?.ok) {
        toast.success("Relatório enviado", { description: "Confira seu WhatsApp." });
      } else {
        toast.error("Falha no envio", {
          description: (data as any)?.error ?? `Status ${(data as any)?.status}`,
        });
      }
    } catch (e: any) {
      toast.error("Erro ao disparar relatório", {
        description: e?.message || String(e),
      });
    } finally {
      setQuickLoading(false);
    }
  };

  const handlePhoneBlur = () => {
    if (whatsappPhone !== (prefs.whatsapp_phone ?? "")) {
      savePrefs({ whatsapp_phone: whatsappPhone.trim() || null });
    }
  };

  return (
    <div className="space-y-6">
      {/* CARD 1: Resumo Operacional Diário Automático via WhatsApp */}
      <Card no3d className="border-border/60 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shadow-xs shrink-0 ring-1 ring-emerald-500/20">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  Resumo Operacional Diário via WhatsApp
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Receba automaticamente seus números financeiros consolidados direto no seu WhatsApp.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {isWhatsappConfigured ? (
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 text-[10px] font-semibold gap-1.5 py-1 px-2.5 rounded-lg"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  API WhatsApp Conectada
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-semibold gap-1.5 py-1 px-2.5 rounded-lg"
                >
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  API Pendente
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-2 space-y-5">
          {/* Toggle de Ativação */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border/40">
            <div className="space-y-0.5">
              <Label className="text-xs sm:text-sm font-semibold text-foreground cursor-pointer">
                Ativar envio automático no WhatsApp
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Dispara o resumo financeiro diário nos horários programados abaixo.
              </p>
            </div>
            <Switch
              disabled={prefsLoading}
              checked={Boolean(prefs.send_whatsapp)}
              onCheckedChange={(v) => savePrefs({ send_whatsapp: v })}
            />
          </div>

          {/* Configurações de Horários e Telefone */}
          <div className="space-y-4 pt-1">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Telefone de Destino */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Telefone WhatsApp de Destino</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={profilePhone || "Ex.: (11) 99999-8888"}
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    onBlur={handlePhoneBlur}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handlePhoneBlur();
                    }}
                    className="text-xs rounded-xl h-9"
                  />
                  {profilePhone && !whatsappPhone && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setWhatsappPhone(profilePhone);
                        savePrefs({ whatsapp_phone: profilePhone });
                      }}
                      className="text-[11px] h-9 shrink-0 px-2.5 rounded-xl"
                      title="Preencher com o telefone do perfil"
                    >
                      Usar Perfil
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Se em branco, usará o telefone configurado no seu perfil ({profilePhone || "não cadastrado"}).
                </p>
              </div>

              {/* Horários Configurados */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold flex items-center justify-between">
                  <span>Horários de Envio Diário</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    {activeSlots.length}/3 horários
                  </span>
                </Label>

                {activeSlots.length === 0 && (
                  <p className="text-xs text-muted-foreground italic py-1">
                    Nenhum horário cadastrado. Clique abaixo para adicionar.
                  </p>
                )}

                <div className="space-y-2">
                  {activeSlots.map((key, idx) => (
                    <div key={key} className="flex items-center gap-2">
                      <div className="flex-1 relative">
                        <Clock className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                          type="time"
                          value={prefs[key] ?? ""}
                          onChange={(e) => savePrefs({ [key]: e.target.value || null } as any)}
                          className="text-xs rounded-xl h-9 pl-8"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => savePrefs({ [key]: null } as any)}
                        title="Remover horário"
                        className="h-9 w-9 text-destructive hover:bg-destructive/10 rounded-xl shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {canAddMoreSlots && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8 rounded-xl border-dashed"
                    onClick={() => savePrefs({ [slots.find((s) => !prefs[s])!]: "19:00" } as any)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Horário
                  </Button>
                )}
              </div>
            </div>

            {/* O que está incluído no Resumo */}
            <div className="p-3 bg-muted/25 rounded-xl border border-border/30 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                <span>Indicadores incluídos no Resumo Operacional:</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
                <div className="p-2 bg-background/60 rounded-lg border border-border/20">
                  <span className="font-medium text-foreground">Recebido no dia</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Total e juros recebidos hoje</p>
                </div>
                <div className="p-2 bg-background/60 rounded-lg border border-border/20">
                  <span className="font-medium text-foreground">Juros no Mês</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Faturamento acumulado</p>
                </div>
                <div className="p-2 bg-background/60 rounded-lg border border-border/20">
                  <span className="font-medium text-foreground">Comissões & Despesas</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Gerentes e custos pagos</p>
                </div>
                <div className="p-2 bg-background/60 rounded-lg border border-border/20">
                  <span className="font-medium text-foreground">Saldo & Inadimplência</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Fluxo de caixa e % de atraso</p>
                </div>
              </div>
            </div>

            {/* Ações e Botão de Teste */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <p className="text-[11px] text-muted-foreground">
                {!isWhatsappConfigured ? (
                  <span className="text-amber-500 font-medium">
                    Aviso: Conecte sua instância de WhatsApp para que os envios sejam entregues com sucesso.
                  </span>
                ) : (
                  <span>O resumo será enviado automaticamente de acordo com os horários programados.</span>
                )}
              </p>
              <Button
                onClick={sendOperationalSummaryNow}
                disabled={sendingSummary || !isWhatsappConfigured}
                className="w-full sm:w-auto h-9 text-xs font-semibold rounded-xl shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {sendingSummary ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Enviar Resumo Agora no WhatsApp
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CARD 2: Disparo Rápido de Relatórios Avulsos via WhatsApp */}
      <Card no3d className="border-border/60 shadow-xs rounded-2xl">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Disparo Rápido de Relatórios Avulsos
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Envie instantaneamente um relatório específico para você ou para outro número de WhatsApp.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-2 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tipo de relatório a enviar</Label>
              <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                <SelectTrigger className="text-xs rounded-xl h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Resumo Diário Operacional (hoje)</SelectItem>
                  <SelectItem value="weekly">Resumo Semanal (últimos 7 dias)</SelectItem>
                  <SelectItem value="monthly">Fechamento Mensal Consolidado</SelectItem>
                  <SelectItem value="accountant">Relatório Contábil do Mês</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Telefone de destino (opcional)</Label>
              <Input
                placeholder={profilePhone || "Ex.: (11) 99999-8888"}
                value={quickPhone}
                onChange={(e) => setQuickPhone(e.target.value)}
                className="text-xs rounded-xl h-9"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <p className="text-[11px] text-muted-foreground flex-1 min-w-[200px]">
              O relatório avulso será gerado na hora e enviado usando a sua instância ativa.
            </p>
            <Button
              onClick={sendQuickReport}
              disabled={quickLoading || !isWhatsappConfigured}
              variant="outline"
              className="h-9 text-xs font-semibold rounded-xl shrink-0"
            >
              {quickLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <MessageCircle className="h-4 w-4 mr-2 text-emerald-500" />
              )}
              Gerar e Disparar Relatório
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

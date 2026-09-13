import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

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
          owner_id: ownerId,
          channel: "whatsapp",
          send_whatsapp: true,
          phone: destPhone,
          whatsapp_config: {
            provider: schedule.provider || "evolution",
            base_url: schedule.base_url || "",
            instance_id: schedule.instance_id || "",
          },
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

  const handlePhoneBlur = async () => {
    if (whatsappPhone !== (prefs.whatsapp_phone ?? "")) {
      try {
        await savePrefs({ whatsapp_phone: whatsappPhone.trim() || null });
      } catch {
        toast.error("Erro ao salvar telefone.");
      }
    }
  };

  const handleTimeChange = async (key: SlotKey, value: string | null) => {
    try {
      await savePrefs({ [key]: value } as any);
    } catch {
      toast.error("Erro ao salvar horário.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Card 1: Configurações de Telefone e WhatsApp para Envio Automático */}
      <Card no3d className="border-border/60 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shadow-xs shrink-0 ring-1 ring-primary/20">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  Configurações de Envio WhatsApp
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Defina o número de destino e os horários para o envio diário automatizado.
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
              onCheckedChange={async (v) => {
                try {
                  await savePrefs({ send_whatsapp: v });
                } catch (e) {
                  toast.error("Erro ao salvar preferência no banco.", {
                    description: "Execute o SQL de migração no Supabase se as colunas ainda não existirem.",
                  });
                }
              }}
            />
          </div>

          {/* Configurações de Horários e Telefone */}
          <div className="grid gap-4 sm:grid-cols-2 pt-1">
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
                    onClick={async () => {
                      setWhatsappPhone(profilePhone);
                      try {
                        await savePrefs({ whatsapp_phone: profilePhone });
                      } catch {
                        toast.error("Erro ao salvar telefone.");
                      }
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
                {activeSlots.map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <Clock className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <Input
                        type="time"
                        value={prefs[key] ?? ""}
                        onChange={(e) => handleTimeChange(key, e.target.value || null)}
                        className="text-xs rounded-xl h-9 pl-8"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleTimeChange(key, null)}
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
                  onClick={() => handleTimeChange(slots.find((s) => !prefs[s])!, "19:00")}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Horário
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Resumo Operacional Diário & Indicadores */}
      <Card no3d className="border-border/60 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shadow-xs shrink-0 ring-1 ring-emerald-500/20">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                Resumo Operacional Diário
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Consolidado financeiro detalhado com os principais números do seu negócio.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-2 space-y-4">
          {/* Indicadores incluídos no Resumo */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Indicadores incluídos no Resumo Operacional:</span>
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
              <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                <span className="font-semibold text-foreground text-xs">Recebido no dia</span>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">Total e juros recebidos hoje</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                <span className="font-semibold text-foreground text-xs">Juros no Mês</span>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">Faturamento acumulado</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                <span className="font-semibold text-foreground text-xs">Comissões & Despesas</span>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">Gerentes e custos pagos</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-xl border border-border/40">
                <span className="font-semibold text-foreground text-xs">Saldo & Inadimplência</span>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">Fluxo de caixa e % de atraso</p>
              </div>
            </div>
          </div>

          {/* Ações e Botão de Disparo Imediato */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border/40">
            <p className="text-[11px] text-muted-foreground">
              {!isWhatsappConfigured ? (
                <span className="text-amber-500 font-medium">
                  Aviso: Conecte sua API do WhatsApp na aba &quot;Disparos &amp; Automação&quot; para realizar os envios.
                </span>
              ) : (
                <span>O resumo pode ser testado agora ou enviado automaticamente nos horários agendados.</span>
              )}
            </p>
            <Button
              onClick={sendOperationalSummaryNow}
              disabled={sendingSummary || !isWhatsappConfigured}
              className="w-full sm:w-auto h-9 text-xs font-semibold rounded-xl shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-xs"
            >
              {sendingSummary ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar Resumo Agora no WhatsApp
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

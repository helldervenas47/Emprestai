import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  Zap,
  Bot,
  FileText,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Settings2,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import { useWhatsappBillingSchedule } from "@/hooks/useWhatsappBillingSchedule";
import { WhatsappMessageTemplatesCard } from "./WhatsappMessageTemplatesCard";
import { WhatsappAutoBillingCard } from "@/components/WhatsappAutoBillingCard";
import { WhatsappAssistantCard } from "@/components/WhatsappAssistantCard";
import { WhatsappReportCard } from "@/components/WhatsappReportCard";

type WhatsappHubTab = "templates" | "automation" | "assistant" | "reports";

export function WhatsappHub() {
  const [activeTab, setActiveTab] = useState<WhatsappHubTab>("templates");
  const { schedule, logs, runNow } = useWhatsappBillingSchedule();
  const [testing, setTesting] = useState(false);

  const isConfigured = Boolean(schedule.base_url?.trim() && schedule.instance_id?.trim());
  const isAutoEnabled = Boolean(schedule.enabled);

  const recentSuccess = logs.filter((l) => l.success).length;
  const recentFail = logs.filter((l) => !l.success).length;
  const totalRecent = logs.length;
  const successRate = totalRecent > 0 ? Math.round((recentSuccess / totalRecent) * 100) : 100;

  const handleQuickTest = async () => {
    if (!isConfigured) {
      toast.error("Configure a URL base e o Instance ID antes de testar.", {
        description: "Acesse a aba 'Disparos & Automação' para preencher os dados da API.",
      });
      setActiveTab("automation");
      return;
    }
    setTesting(true);
    try {
      const res: any = await runNow();
      const sent = (res?.results ?? []).filter((r: any) => r.success).length;
      const failed = (res?.results ?? []).filter((r: any) => r.success === false).length;
      if (sent === 0 && failed === 0) {
        toast.info("Nenhuma parcela pendente de envio para hoje.");
      } else {
        toast.success(`Disparo concluído: ${sent} enviada(s), ${failed} falha(s).`);
      }
    } catch (e: any) {
      toast.error("Erro no disparo de teste: " + (e?.message ?? String(e)));
    } finally {
      setTesting(false);
    }
  };

  const navTabs = [
    {
      id: "templates" as WhatsappHubTab,
      label: "Mensagens & Templates",
      shortLabel: "Templates",
      icon: MessageCircle,
      desc: "Textos de lembretes e cobrança",
    },
    {
      id: "automation" as WhatsappHubTab,
      label: "Disparos & Automação",
      shortLabel: "Automação",
      icon: Zap,
      desc: "Horários e regras automáticas",
    },
    {
      id: "assistant" as WhatsappHubTab,
      label: "Assistente IA",
      shortLabel: "Assistente IA",
      icon: Bot,
      desc: "Respostas inteligentes via WhatsApp",
    },
    {
      id: "reports" as WhatsappHubTab,
      label: "Envio de Relatórios",
      shortLabel: "Relatórios",
      icon: FileText,
      desc: "Disparo de extratos e resumos",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Banner Superior Principal (Visão Geral & Status) */}
      <Card
        no3d
        className="overflow-hidden border-emerald-500/20 bg-gradient-to-br from-card via-card to-emerald-500/5 rounded-2xl shadow-xs"
      >
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Lado Esquerdo: Título, Ícone e Badges de Status */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shadow-xs shrink-0">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground leading-tight flex items-center gap-2">
                    Cobrança e Mensagens WhatsApp
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Central de automação de cobranças, mensagens personalizadas e inteligência financeira.
                  </p>
                </div>
              </div>

              {/* Status Chips */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {isConfigured ? (
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 text-[11px] font-semibold gap-1 py-0.5"
                  >
                    <Radio className="h-3 w-3 text-emerald-500 animate-pulse" />
                    Provedor Conectado
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[11px] font-semibold gap-1 py-0.5 cursor-pointer hover:bg-amber-500/15"
                    onClick={() => setActiveTab("automation")}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    API Pendente de Configuração
                  </Badge>
                )}

                {isAutoEnabled ? (
                  <Badge
                    variant="outline"
                    className="bg-primary/10 text-primary border-primary/25 text-[11px] font-semibold gap-1 py-0.5"
                  >
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                    Envio Diário Ativo ({schedule.send_time?.slice(0, 5) ?? "09:00"})
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-muted text-muted-foreground border-border text-[11px] font-medium gap-1 py-0.5"
                  >
                    <Clock className="h-3 w-3" />
                    Envio Automático Pausado
                  </Badge>
                )}

                {totalRecent > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-muted/60 text-muted-foreground border-border text-[11px] font-medium tabular-nums py-0.5"
                  >
                    Taxa de Sucesso: {successRate}% ({recentSuccess}/{totalRecent})
                  </Badge>
                )}
              </div>
            </div>

            {/* Lado Direito: Botões de Ação Rápida */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-9 text-xs font-semibold rounded-xl"
                onClick={() => setActiveTab("automation")}
              >
                <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                Configurar API
              </Button>

              <Button
                size="sm"
                className="h-9 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                onClick={handleQuickTest}
                disabled={testing}
              >
                {testing ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                )}
                Executar Teste de Cobrança
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navegação por Sub-Abas do Hub */}
      <div className="flex items-center gap-1.5 p-1.5 bg-muted/40 dark:bg-muted/30 rounded-2xl border border-border/40 overflow-x-auto scrollbar-hide">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all whitespace-nowrap flex-1 min-w-[130px] sm:min-w-0 ${
                active
                  ? "bg-background text-foreground shadow-xs ring-1 ring-border/50 font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-emerald-500" : ""}`} />
              <span className="hidden md:inline">{tab.label}</span>
              <span className="md:hidden">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo da Sub-Aba Ativa */}
      <div className="transition-all duration-200">
        {activeTab === "templates" && <WhatsappMessageTemplatesCard />}

        {activeTab === "automation" && <WhatsappAutoBillingCard />}

        {activeTab === "assistant" && <WhatsappAssistantCard />}

        {activeTab === "reports" && <WhatsappReportCard />}
      </div>
    </div>
  );
}

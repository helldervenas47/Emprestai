import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  Zap,
  Bot,
  FileText,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Radio,
} from "lucide-react";
import { useWhatsappBillingSchedule } from "@/hooks/useWhatsappBillingSchedule";
import { useAuth } from "@/hooks/useAuth";
import { WhatsappMessageTemplatesCard } from "./WhatsappMessageTemplatesCard";
import { WhatsappAutoBillingCard } from "@/components/WhatsappAutoBillingCard";
import { WhatsappAssistantCard } from "@/components/WhatsappAssistantCard";
import { WhatsappReportCard } from "@/components/WhatsappReportCard";
import { BillingCenter } from "./BillingCenter";

type WhatsappHubTab = "central" | "templates" | "automation" | "assistant" | "reports";

export function WhatsappHub() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [activeTab, setActiveTab] = useState<WhatsappHubTab>("central");
  const { schedule } = useWhatsappBillingSchedule();

  useEffect(() => {
    if (!isAdmin && !["central", "templates"].includes(activeTab)) {
      setActiveTab("central");
    }
  }, [isAdmin, activeTab]);

  const isConfigured = Boolean(schedule.base_url?.trim() && schedule.instance_id?.trim());
  const isAutoEnabled = Boolean(schedule.enabled);

  const navTabs = [
    {
      id: "central" as WhatsappHubTab,
      label: "Central de Cobranças",
      shortLabel: "Central",
      icon: Send,
      desc: "Cobranças prioritárias do dia",
      adminOnly: false,
    },
    {
      id: "templates" as WhatsappHubTab,
      label: "Mensagens & Templates",
      shortLabel: "Templates",
      icon: MessageCircle,
      desc: "Textos de lembretes e cobrança",
      adminOnly: false,
    },
    {
      id: "automation" as WhatsappHubTab,
      label: "Disparos & Automação",
      shortLabel: "Automação",
      icon: Zap,
      desc: "Horários e regras automáticas",
      adminOnly: true,
    },
    {
      id: "assistant" as WhatsappHubTab,
      label: "Assistente IA",
      shortLabel: "Assistente IA",
      icon: Bot,
      desc: "Respostas inteligentes via WhatsApp",
      adminOnly: true,
    },
    {
      id: "reports" as WhatsappHubTab,
      label: "Envio de Relatórios",
      shortLabel: "Relatórios",
      icon: FileText,
      desc: "Disparo de extratos e resumos",
      adminOnly: true,
    },
  ].filter((tab) => !tab.adminOnly || isAdmin);

  return (
    <div className="space-y-5">
      {/* Navegação por Sub-Abas do Hub (Aparece se houver mais de 1 aba visível) */}
      {navTabs.length > 1 && (
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
      )}

      {/* Banner Superior Principal (Visão Geral & Status) */}
      {activeTab === "central" && (
        <Card
          no3d
          className="overflow-hidden border-emerald-500/20 bg-gradient-to-br from-card via-card to-emerald-500/5 rounded-2xl shadow-xs"
        >
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              {/* Lado Esquerdo: Título, Ícone e Descrição */}
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shadow-xs shrink-0 ring-1 ring-emerald-500/20">
                  <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm sm:text-base font-bold text-foreground leading-snug tracking-tight">
                    Central de Cobranças WhatsApp
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    Priorize, selecione e acompanhe cobranças automáticas em uma fila segura.
                  </p>
                </div>
              </div>

              {/* Lado Direito: Status Chips */}
              {isAdmin && (
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0 pt-1 sm:pt-0">
                  {isConfigured ? (
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 text-[10px] sm:text-[11px] font-semibold gap-1.5 py-1 px-2.5 rounded-lg"
                    >
                      <Radio className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-emerald-500 animate-pulse" />
                      Provedor Configurado
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] sm:text-[11px] font-semibold gap-1.5 py-1 px-2.5 rounded-lg cursor-pointer hover:bg-amber-500/15 transition-colors"
                      onClick={() => setActiveTab("automation")}
                    >
                      <AlertTriangle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      API Pendente de Configuração
                    </Badge>
                  )}

                  {isAutoEnabled ? (
                    <Badge
                      variant="outline"
                      className="bg-primary/10 text-primary border-primary/25 text-[10px] sm:text-[11px] font-semibold gap-1.5 py-1 px-2.5 rounded-lg"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary" />
                      Envio Diário ({schedule.send_time?.slice(0, 5) ?? "09:00"})
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-muted text-muted-foreground border-border text-[10px] sm:text-[11px] font-medium gap-1.5 py-1 px-2.5 rounded-lg"
                    >
                      <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      Envio Automático Pausado
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conteúdo da Sub-Aba Ativa */}
      <div className="transition-all duration-200">
        {activeTab === "central" && <BillingCenter />}

        {activeTab === "templates" && <WhatsappMessageTemplatesCard />}

        {isAdmin && activeTab === "automation" && <WhatsappAutoBillingCard />}

        {isAdmin && activeTab === "assistant" && <WhatsappAssistantCard />}

        {isAdmin && activeTab === "reports" && <WhatsappReportCard />}
      </div>
    </div>
  );
}

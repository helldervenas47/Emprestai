import React from "react";
import {
  Trophy,
  Clock,
  DollarSign,
  TrendingUp,
  Repeat,
  AlertTriangle,
  Flame,
  Search,
  Calendar,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClientRankingType,
  ClientRankingPeriod,
} from "../../types/clientRanking";
import { NativeDatePicker } from "@/components/ui/native-date-picker";

interface ClientRankingFiltersProps {
  rankingType: ClientRankingType;
  onRankingTypeChange: (type: ClientRankingType) => void;
  period: ClientRankingPeriod;
  onPeriodChange: (period: ClientRankingPeriod) => void;
  search: string;
  onSearchChange: (search: string) => void;
  startDate?: string;
  onStartDateChange: (date: string | undefined) => void;
  endDate?: string;
  onEndDateChange: (date: string | undefined) => void;
}

const rankingTabs: { id: ClientRankingType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "best", label: "Melhores clientes", icon: Trophy },
  { id: "on_time", label: "Mais pontuais", icon: Clock },
  { id: "revenue", label: "Juros recebidos", icon: DollarSign },
  { id: "volume", label: "Maior volume", icon: TrendingUp },
  { id: "frequent", label: "Mais frequentes", icon: Repeat },
  { id: "risk", label: "Maior risco", icon: AlertTriangle },
  { id: "late", label: "Maiores atrasos", icon: Flame },
];

export function ClientRankingFilters({
  rankingType,
  onRankingTypeChange,
  period,
  onPeriodChange,
  search,
  onSearchChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
}: ClientRankingFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Abas dos rankings: "Melhores clientes" full width e os demais em grid 3x3 no mobile; linha flex no desktop */}
      <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5 sm:gap-1.5">
        {rankingTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = rankingType === tab.id;
          const isBest = tab.id === "best";
          return (
            <button
              key={tab.id}
              onClick={() => onRankingTypeChange(tab.id)}
              className={`flex ${
                isBest
                  ? "col-span-3 flex-row py-2.5 font-semibold text-xs sm:text-sm"
                  : "col-span-1 flex-col py-2 text-[11px] font-medium"
              } sm:flex-row sm:col-auto items-center justify-center text-center sm:text-left gap-1 sm:gap-1.5 px-2.5 sm:px-3 sm:py-2 sm:text-sm rounded-lg transition-all sm:shrink-0 ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
              <span className="truncate max-w-full">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Barra de Filtro de Período e Busca */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por nome, CPF ou telefone..."
            className="pl-9 h-9 text-xs sm:text-sm w-full"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={period} onValueChange={(v) => onPeriodChange(v as ClientRankingPeriod)}>
              <SelectTrigger className="h-9 w-full sm:w-[160px] text-xs sm:text-sm bg-card">
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">Este mês</SelectItem>
                <SelectItem value="last_month">Último mês</SelectItem>
                <SelectItem value="last_3_months">Últimos 3 meses</SelectItem>
                <SelectItem value="last_6_months">Últimos 6 meses</SelectItem>
                <SelectItem value="this_year">Este ano</SelectItem>
                <SelectItem value="all">Todo o período</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {period === "custom" && (
            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-start">
              <NativeDatePicker
                value={startDate || ""}
                onChange={(v) => onStartDateChange(v || undefined)}
                placeholder="Início"
                className="h-9 text-xs flex-1 sm:w-[120px]"
              />
              <span className="text-xs text-muted-foreground shrink-0">até</span>
              <NativeDatePicker
                value={endDate || ""}
                onChange={(v) => onEndDateChange(v || undefined)}
                placeholder="Fim"
                className="h-9 text-xs flex-1 sm:w-[120px]"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

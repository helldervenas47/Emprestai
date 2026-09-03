import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RowActions } from "@/components/ui/row-actions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  User, Phone, Mail, MapPin, Pencil, Trash2, ToggleLeft, ToggleRight,
  Wallet, ShieldCheck, FileText,
} from "lucide-react";
import type { Client } from "@/types/loan";
import { formatCpfOrCnpj } from "@/lib/brDocuments";
import { computeAvailableLimit, formatBRL } from "@/features/creditCards/lib/creditLimit";
import type { CreditLimit } from "@/features/creditCards/hooks/useCreditLimits";

export interface ClientCardCreditScore {
  score: number;
  label: string;
  color: string;
  bgColor: string;
}

interface Props {
  client: Client;
  score: ClientCardCreditScore;
  docCount: number;
  usedLimit: number;
  creditLimit: CreditLimit | null | undefined;
  readOnly?: boolean;
  onOpenDocs: () => void;
  onOpenLimit: () => void;
  onOpenAnalysis: () => void;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const DocsQuickButton = memo(function DocsQuickButton({
  count,
  onOpen,
}: { count: number; onOpen: () => void }) {
  const hasDocs = count > 0;
  const btn = (
    <button
      type="button"
      onClick={hasDocs ? onOpen : undefined}
      disabled={!hasDocs}
      aria-label={hasDocs ? `Abrir documentos (${count})` : "Nenhum documento anexado"}
      className={`relative inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors active:scale-95 ${
        hasDocs
          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
          : "border-border/50 bg-muted/30 text-muted-foreground/50 opacity-60 cursor-not-allowed"
      }`}
    >
      <FileText className="h-3.5 w-3.5" />
      {hasDocs && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center leading-none">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="top">
          {hasDocs ? `${count} documento${count > 1 ? "s" : ""} anexado${count > 1 ? "s" : ""}` : "Nenhum documento anexado"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

export const ClientCardView = memo(function ClientCardView({
  client, score, docCount, usedLimit, creditLimit, readOnly,
  onOpenDocs, onOpenLimit, onOpenAnalysis, onToggleActive, onEdit, onDelete,
}: Props) {
  const total = creditLimit?.currentLimit ?? 0;
  const available = computeAvailableLimit(total, usedLimit);

  return (
    <Card className={`hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] transition-all duration-200 ease-out overflow-hidden ${!client.active ? "opacity-60" : ""}`}>
      <CardContent className="p-3 sm:p-5">
        <div className="mb-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-10 w-10 shrink-0 rounded-full gradient-primary flex items-center justify-center">
                <User className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-foreground break-words">{client.name}</h3>
                  <Badge variant="outline" className={client.active ? "bg-success/10 text-success border-success/20 text-xs" : "bg-muted text-muted-foreground border-border text-xs"}>
                    {client.active ? "Ativo" : "Inativo"}
                  </Badge>
                  <DocsQuickButton count={docCount} onOpen={onOpenDocs} />
                </div>
                {client.cpf && <p className="text-xs text-muted-foreground break-words">CPF: {formatCpfOrCnpj(client.cpf)}</p>}
                {client.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{client.phone}</span>
                  </div>
                )}
              </div>
            </div>
            {!readOnly && (
              <div className="flex gap-0.5 shrink-0">
                <Button size="icon" variant="ghost" className="h-8 w-8 active:scale-95" onClick={onOpenLimit} title="Limite de crédito">
                  <Wallet className="h-4 w-4 text-primary" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 active:scale-95" onClick={onOpenAnalysis} title="Análise financeira">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-border/30 px-3 py-1.5">
              <span className={`h-2 w-2 rounded-full ${score.bgColor}`} />
              <span className="text-xs text-muted-foreground">Score</span>
              <span className={`text-sm font-bold ${score.color}`}>{score.score}</span>
            </div>
            {!readOnly && (
              <div className="flex gap-0.5 sm:gap-1 items-center">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 active:scale-95"
                  onClick={onToggleActive}
                  title={client.active ? "Desativar" : "Ativar"}
                >
                  {client.active ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                </Button>
                <RowActions
                  size="md"
                  actions={[
                    { label: "Editar", icon: <Pencil className="h-4 w-4" />, onClick: onEdit },
                    { label: "Excluir", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: onDelete },
                  ]}
                />
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenLimit}
          className="w-full rounded-xl border border-border/30 p-3 mb-3 text-left hover:bg-accent/30 transition-colors active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Limite de Crédito</span>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {creditLimit?.mode === "manual" ? "Manual" : "Auto"}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-[10px] text-muted-foreground">Total</p>
              <p className="font-semibold">{formatBRL(total)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Utilizado</p>
              <p className="font-semibold text-warning">{formatBRL(usedLimit)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Disponível</p>
              <p className={`font-semibold ${available < 0 ? "text-destructive" : "text-success"}`}>{formatBRL(available)}</p>
            </div>
          </div>
        </button>

        <div className="space-y-1.5 text-sm text-muted-foreground">
          {client.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /><span>{client.email}</span></div>}
          {client.address && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /><span>{client.address}</span></div>}
        </div>
        {client.notes && <p className="text-xs text-muted-foreground mt-2 italic">"{client.notes}"</p>}
      </CardContent>
    </Card>
  );
});

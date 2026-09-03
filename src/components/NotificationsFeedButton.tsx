import { useState } from "react";
import { Bell, AlertTriangle, Clock, CheckCircle2, CheckCheck, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useNotificationsFeed, type FeedItem, type DueFeedItem } from "@/hooks/useNotificationsFeed";
import type { Loan, Payment, InstallmentSchedule, Client } from "@/types/loan";
import { useWhatsappBillingMessages } from "@/hooks/useWhatsappBillingMessages";
import { buildBillingWhatsappLink } from "@/lib/whatsappBilling";
import { WhatsappPreviewDialog } from "@/components/WhatsappPreviewDialog";
import { toast } from "sonner";

interface Props {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  clients: Client[];
  onSelectLoan?: (loanId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

const formatBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

function formatDateBr(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function daysFromToday(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getTime();
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / (24 * 3600 * 1000));
}

export function NotificationsFeedButton({
  loans,
  payments,
  installmentSchedules,
  clients,
  onSelectLoan,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const { overdue, dueSoon, recentPayments, unreadCount, markAllRead } = useNotificationsFeed(
    loans,
    payments,
    installmentSchedules,
    clients,
  );
  const { messages } = useWhatsappBillingMessages();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    phone: string;
    message: string;
    status: ReturnType<typeof buildBillingWhatsappLink>["status"];
    name: string;
  } | null>(null);

  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) markAllRead();
  };

  const handleClickItem = (item: FeedItem) => {
    if (onSelectLoan) onSelectLoan(item.loanId);
    setOpen(false);
  };

  const handleWhatsapp = (e: React.MouseEvent, item: DueFeedItem) => {
    e.stopPropagation();
    const loan = loans.find((l) => l.id === item.loanId);
    if (!loan) return;
    const client =
      (item.clientId && clients.find((c) => c.id === item.clientId)) ||
      clients.find(
        (c) => c.name.trim().toLowerCase() === (loan.borrowerName || "").trim().toLowerCase(),
      ) ||
      null;
    const phone = client?.phone || "";
    if (!phone) {
      toast.error("Cliente sem telefone cadastrado");
      return;
    }
    const built = buildBillingWhatsappLink({
      client,
      loan,
      schedules: installmentSchedules,
      payments,
      messages,
    });
    setPreviewData({
      phone: built.phone,
      message: built.message,
      status: built.status,
      name: client?.name ?? loan.borrowerName,
    });
    setPreviewOpen(true);
  };

  const totalAll = overdue.length + dueSoon.length + recentPayments.length;

  return (
    <>
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {!hideTrigger && (
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9"
            title="Notificações"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        </SheetTrigger>
      )}
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" /> Notificações
            </SheetTitle>
            {totalAll > 0 && (
              <Button size="sm" variant="ghost" onClick={markAllRead} className="h-7 text-xs">
                <CheckCheck className="h-3.5 w-3.5 mr-1" /> Marcar tudo lido
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          {/* Vencidas hoje / em atraso */}
          <Section
            title="Vencidas"
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            count={overdue.length}
            color="destructive"
            empty="Nenhuma parcela vencida."
          >
            {overdue.map((it) => (
              <FeedCard key={it.key} onClick={() => handleClickItem(it)} accent="destructive">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{it.clientName}</p>
                    <p className="text-xs text-muted-foreground">
                      Parcela {it.installmentNumber}/{it.totalInstallments} · venceu em {formatDateBr(it.dueDate)}
                    </p>
                    <p className="text-sm font-semibold text-destructive mt-1">{formatBRL(it.amount)}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-success hover:text-success hover:bg-success/10"
                    onClick={(e) => handleWhatsapp(e, it)}
                    title="Cobrar via WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                </div>
              </FeedCard>
            ))}
          </Section>

          {/* Próximos 3 dias */}
          <Section
            title="Vencendo em até 3 dias"
            icon={<Clock className="h-4 w-4 text-warning" />}
            count={dueSoon.length}
            color="warning"
            empty="Sem parcelas vencendo nos próximos 3 dias."
          >
            {dueSoon.map((it) => {
              const d = daysFromToday(it.dueDate);
              const label =
                d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : `vence em ${d} dias`;
              return (
                <FeedCard key={it.key} onClick={() => handleClickItem(it)} accent="warning">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{it.clientName}</p>
                      <p className="text-xs text-muted-foreground">
                        Parcela {it.installmentNumber}/{it.totalInstallments} · {label} ({formatDateBr(it.dueDate)})
                      </p>
                      <p className="text-sm font-semibold text-warning mt-1">{formatBRL(it.amount)}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 text-success hover:text-success hover:bg-success/10"
                      onClick={(e) => handleWhatsapp(e, it)}
                      title="Enviar lembrete via WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </FeedCard>
              );
            })}
          </Section>

          {/* Pagamentos recentes */}
          <Section
            title="Pagamentos recebidos (24h)"
            icon={<CheckCircle2 className="h-4 w-4 text-success" />}
            count={recentPayments.length}
            color="success"
            empty="Nenhum pagamento recebido nas últimas 24h."
          >
            {recentPayments.map((it) => (
              <FeedCard key={it.key} onClick={() => handleClickItem(it)} accent="success">
                <p className="text-sm font-medium text-foreground">{it.clientName}</p>
                <p className="text-xs text-muted-foreground">
                  Parcela {it.installmentNumber}
                  {it.totalInstallments ? `/${it.totalInstallments}` : ""} ·{" "}
                  {it.kind === "payment" ? formatDateTime(it.paidAt) : ""}
                </p>
                <p className="text-sm font-semibold text-success mt-1">{formatBRL(it.amount)}</p>
              </FeedCard>
            ))}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
    {previewData && (
      <WhatsappPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        phone={previewData.phone}
        message={previewData.message}
        status={previewData.status}
        recipientName={previewData.name}
      />
    )}
    </>
  );
}

function Section({
  title,
  icon,
  count,
  color,
  empty,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  color: "destructive" | "warning" | "success";
  empty: string;
  children: React.ReactNode;
}) {
  const badgeClass =
    color === "destructive"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : color === "warning"
        ? "bg-warning/10 text-warning border-warning/30"
        : "bg-success/10 text-success border-success/30";

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {title}
        </h3>
        <Badge variant="outline" className={badgeClass}>
          {count}
        </Badge>
      </div>
      <div className="space-y-2">
        {count === 0 ? (
          <Card>
            <CardContent className="py-4 text-center text-xs text-muted-foreground">{empty}</CardContent>
          </Card>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function FeedCard({
  onClick,
  accent,
  children,
}: {
  onClick: () => void;
  accent: "destructive" | "warning" | "success";
  children: React.ReactNode;
}) {
  const border =
    accent === "destructive"
      ? "border-l-destructive"
      : accent === "warning"
        ? "border-l-warning"
        : "border-l-success";
  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer hover:bg-accent/50 transition-colors border-l-4 ${border}`}
    >
      <CardContent className="p-3">{children}</CardContent>
    </Card>
  );
}

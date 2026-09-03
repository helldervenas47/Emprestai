import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loan, Payment, InstallmentSchedule, Client } from "@/types/loan";
import { useWhatsappBillingMessages } from "@/hooks/useWhatsappBillingMessages";
import { buildBillingWhatsappLink } from "@/lib/whatsappBilling";
import { WhatsappPreviewDialog } from "@/components/WhatsappPreviewDialog";

export function WhatsappBillButton({
  loan,
  clients,
  payments,
  installmentSchedules,
  variant = "icon",
}: {
  loan: Loan;
  clients: Client[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  variant?: "icon" | "compact";
}) {
  const { messages } = useWhatsappBillingMessages();
  const client = clients.find(
    (c) => c.name.trim().toLowerCase() === loan.borrowerName.trim().toLowerCase(),
  );
  const phone = client?.phone || "";
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    phone: string;
    message: string;
    status: ReturnType<typeof buildBillingWhatsappLink>["status"];
    name: string;
  } | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const buttonNode = variant === "compact" ? (
    <Button
      variant="ghost"
      className="flex-1 h-9 text-xs gap-1.5 text-success hover:text-success"
      onClick={handleClick}
      title={phone ? "Cobrar via WhatsApp" : "Cliente sem telefone"}
      disabled={!phone}
    >
      <MessageCircle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">WhatsApp</span>
    </Button>
  ) : (
    <Button
      size="icon"
      variant="ghost"
      className="h-8 w-8 text-success hover:text-success"
      onClick={handleClick}
      title={phone ? "Cobrar via WhatsApp" : "Cliente sem telefone"}
      disabled={!phone}
    >
      <MessageCircle className="h-4 w-4" />
    </Button>
  );

  return (
    <>
      {buttonNode}
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

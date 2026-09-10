import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/userClient";
import { useDataOwner } from "@/hooks/useDataOwner";
import { useMyProfilePhone } from "@/hooks/useMyProfilePhone";
import { toast } from "@/hooks/use-toast";
import { Loader2, MessageCircle } from "lucide-react";

type ReportType = "daily" | "weekly" | "monthly" | "accountant";

export function WhatsappReportCard() {
  const ownerId = useDataOwner();
  const { phone: profilePhone } = useMyProfilePhone();
  const [phone, setPhone] = useState("");
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-report", {
        body: {
          owner_id: ownerId,
          phone: phone || profilePhone || undefined,
          report_type: reportType,
        },
      });
      if (error) throw error;
      if ((data as any)?.ok) {
        toast({ title: "Relatório enviado", description: "Confira seu WhatsApp." });
      } else {
        toast({
          title: "Falha no envio",
          description: (data as any)?.error ?? `status ${(data as any)?.status}`,
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card no3d className="border-border/60 shadow-xs rounded-2xl">
      <CardHeader className="p-4 sm:p-5 pb-3">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-emerald-500" />
          Disparo Rápido de Relatórios via WhatsApp
        </CardTitle>
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
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="text-xs rounded-xl h-9"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
          <p className="text-[11px] text-muted-foreground flex-1 min-w-[200px]">
            O relatório será gerado e enviado para o WhatsApp configurado usando a sua instância ativa.
          </p>
          <Button onClick={send} disabled={loading} className="h-9 text-xs font-semibold rounded-xl shrink-0">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2" />}
            Gerar e Disparar Relatório
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


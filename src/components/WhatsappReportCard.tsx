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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" /> Enviar relatório no WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Tipo de relatório</Label>
            <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diário (hoje)</SelectItem>
                <SelectItem value="weekly">Semanal (últimos 7 dias)</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="accountant">Contábil do mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Telefone destino (opcional)</Label>
            <Input
              placeholder={profilePhone || "Ex.: 11999998888"}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        <Button onClick={send} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2" />}
          Enviar agora
        </Button>
        <p className="text-xs text-muted-foreground">
          Usa a instância do WhatsApp já configurada em &quot;Cobrança WhatsApp&quot;. Se nenhum telefone for
          informado, envia para o telefone do seu perfil ou para o número autorizado do assistente.
        </p>
      </CardContent>
    </Card>
  );
}

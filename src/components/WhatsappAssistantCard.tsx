import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Bot, Copy, Trash2, MessageCircle } from "lucide-react";
import { useWhatsappAssistant } from "@/hooks/useWhatsappAssistant";
import { toast } from "@/hooks/use-toast";

export function WhatsappAssistantCard() {
  const { numbers, loading, addNumber, toggleNumber, removeNumber, webhookUrl } = useWhatsappAssistant();
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      toast({ title: "Telefone inválido", description: "Informe DDD + número.", variant: "destructive" });
      return;
    }
    setAdding(true);
    const { error } = await addNumber(phone, label);
    setAdding(false);
    if (error) {
      toast({ title: "Erro ao adicionar", description: String((error as any).message ?? error), variant: "destructive" });
    } else {
      setPhone(""); setLabel("");
      toast({ title: "Número autorizado", description: "Agora pode conversar com o assistente." });
    }
  };

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    toast({ title: "URL copiada", description: "Cole no painel da Whatsmiau como Webhook." });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          Assistente Financeiro WhatsApp
        </CardTitle>
        <CardDescription>
          Converse com a IA pelo WhatsApp e receba respostas baseadas nos seus dados (contratos, vencimentos, lucro do mês).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <Label className="text-xs uppercase text-muted-foreground">URL do Webhook (configure na Whatsmiau)</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background px-2 py-1.5 text-xs">{webhookUrl}</code>
            <Button size="sm" variant="outline" onClick={copyWebhook}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            No painel da Whatsmiau/Evolution API, configure o webhook desta instância para esta URL e ative o evento <strong>messages.upsert</strong>.
          </p>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-semibold">Adicionar número autorizado</Label>
          <div className="grid gap-2 sm:grid-cols-[1fr,1fr,auto]">
            <Input
              placeholder="Telefone com DDD (ex: 11999999999)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              placeholder="Apelido (opcional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Button onClick={handleAdd} disabled={adding}>Autorizar</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            ⚠️ Apenas números autorizados podem conversar com a IA. Mantenha essa lista pequena por segurança.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Números autorizados ({numbers.length})</Label>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : numbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum número autorizado ainda.</p>
          ) : (
            <div className="space-y-2">
              {numbers.map((n) => (
                <div key={n.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">+{n.phone}</p>
                      {n.label && <p className="text-xs text-muted-foreground truncate">{n.label}</p>}
                    </div>
                    {n.enabled ? (
                      <Badge variant="default" className="ml-2">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary" className="ml-2">Pausado</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={n.enabled}
                      onCheckedChange={(v) => toggleNumber(n.id, v)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeNumber(n.id)}
                      aria-label="Remover"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-3 space-y-1">
          <p className="text-xs font-semibold">💡 Exemplos de perguntas:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5 ml-4 list-disc">
            <li>"Quanto tenho a receber esse mês?"</li>
            <li>"Quais contratos estão vencidos?"</li>
            <li>"Qual meu lucro de hoje?"</li>
            <li>"Mostra os 5 maiores devedores"</li>
            <li>"Quanto gastei com despesas?"</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

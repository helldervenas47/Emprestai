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
    <Card no3d className="border-border/60 shadow-xs rounded-2xl">
      <CardHeader className="p-4 sm:p-5 pb-3">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Bot className="h-5 w-5 text-emerald-500" />
          Assistente Financeiro WhatsApp (IA)
        </CardTitle>
        <CardDescription className="text-xs">
          Converse com a IA pelo WhatsApp e receba respostas instantâneas sobre contratos, vencimentos e lucros.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-2 space-y-5">
        {/* URL do Webhook */}
        <div className="space-y-2 rounded-2xl border border-border/40 bg-muted/20 p-3.5 sm:p-4">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            URL do Webhook (Configure na Whatsmiau / Evolution)
          </Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-xl bg-background border border-border/50 px-3 py-2 text-xs font-mono text-foreground select-all">
              {webhookUrl}
            </code>
            <Button size="sm" variant="outline" onClick={copyWebhook} className="h-9 px-3 rounded-xl shrink-0">
              <Copy className="h-4 w-4 mr-1" />
              Copiar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            No painel do provedor, aponte o Webhook para esta URL e ative os eventos de mensagens recebidas (<code className="font-mono text-primary">messages.upsert</code>).
          </p>
        </div>

        {/* Adicionar número autorizado */}
        <div className="space-y-3 bg-muted/20 p-3.5 sm:p-4 rounded-2xl border border-border/40">
          <Label className="text-xs font-semibold text-foreground">Autorizar Novo Número WhatsApp</Label>
          <div className="grid gap-2 sm:grid-cols-[1.5fr,1.5fr,auto]">
            <Input
              placeholder="Telefone com DDD (ex: 11999999999)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="text-xs rounded-xl h-9"
            />
            <Input
              placeholder="Nome / Apelido (ex: Gerente Carlos)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="text-xs rounded-xl h-9"
            />
            <Button onClick={handleAdd} disabled={adding} className="h-9 text-xs font-semibold rounded-xl">
              Autorizar Número
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            🔒 Apenas números cadastrados têm permissão para consultar dados confidenciais do sistema via IA.
          </p>
        </div>

        {/* Lista de números autorizados */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
            <span>Números Autorizados ({numbers.length})</span>
          </Label>

          {loading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Carregando permissões...</p>
          ) : numbers.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center rounded-2xl border border-dashed border-border/60 bg-muted/10">
              Nenhum número autorizado ainda. Adicione um número acima para começar.
            </div>
          ) : (
            <div className="space-y-2">
              {numbers.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card p-3 shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <MessageCircle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate font-mono">+{n.phone}</p>
                      {n.label && <p className="text-[11px] text-muted-foreground truncate">{n.label}</p>}
                    </div>
                    {n.enabled ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 text-[10px] ml-1">
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] ml-1">
                        Pausado
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={n.enabled} onCheckedChange={(v) => toggleNumber(n.id, v)} />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeNumber(n.id)}
                      aria-label="Remover número autorizado"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dicas e Exemplos */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 space-y-1.5">
          <p className="text-xs font-semibold text-primary">💡 Exemplos de perguntas que a IA responde no WhatsApp:</p>
          <ul className="text-[11px] text-muted-foreground space-y-1 ml-4 list-disc">
            <li>"Quanto tenho a receber neste mês?"</li>
            <li>"Quais contratos estão em atraso hoje?"</li>
            <li>"Qual o lucro e faturamento de hoje?"</li>
            <li>"Quem são os maiores devedores da carteira?"</li>
            <li>"Qual o total gasto em despesas este mês?"</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

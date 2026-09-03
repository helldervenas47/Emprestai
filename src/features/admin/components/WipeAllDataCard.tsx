import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const CONFIRMATION_PHRASE = "EXCLUIR TODOS OS DADOS";

export function WipeAllDataCard() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [step1Open, setStep1Open] = useState(false);
  const [step2Open, setStep2Open] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!step2Open) {
      setCountdown(0);
      return;
    }
    setCountdown(5);
    const id = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [step2Open]);

  

  const phraseValid = confirmText === CONFIRMATION_PHRASE;
  const canContinue = phraseValid && understood && !running;

  function reset() {
    setStep1Open(false);
    setStep2Open(false);
    setConfirmText("");
    setUnderstood(false);
    setResult(null);
  }

  async function executeWipe() {
    if (!phraseValid) {
      toast.error(`Digite exatamente: ${CONFIRMATION_PHRASE}`);
      return;
    }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("wipe-all-data", {
        body: { confirmation: CONFIRMATION_PHRASE },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data);
      toast.success("Todos os dados foram excluídos.");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao excluir dados");
      setRunning(false);
    }
  }

  async function finishAndLogout() {
    await signOut();
    setTimeout(() => navigate("/auth", { replace: true }), 300);
  }

  return (
    <>
      <Card className="border-destructive/60 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <AlertTriangle className="h-4 w-4" /> Zona de perigo · Excluir todos os dados
          </CardTitle>
          <CardDescription>
            Remove permanentemente todos os registros, anexos, backups e logs associados à sua conta.
            Sua identidade de login (e-mail/senha) e assinatura não são afetadas. Esta ação é irreversível.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" onClick={() => setStep1Open(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> Excluir todos os dados
          </Button>
        </CardContent>
      </Card>

      {/* Etapa 1 — entendimento + frase */}
      <Dialog open={step1Open} onOpenChange={(v) => { if (!v) reset(); else setStep1Open(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Excluir todos os dados — etapa 1 de 2
            </DialogTitle>
            <DialogDescription>
              Esta operação apaga todos os empréstimos, clientes, vendas, despesas, receitas, metas,
              configurações, anexos de boletos, histórico de backups e logs. Não há como desfazer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Ação irreversível</AlertTitle>
              <AlertDescription>
                Recomendamos baixar um backup completo antes de prosseguir.
              </AlertDescription>
            </Alert>

            <div className="flex items-start gap-2">
              <Checkbox id="wipe-understood" checked={understood} onCheckedChange={(v) => setUnderstood(Boolean(v))} />
              <Label htmlFor="wipe-understood" className="text-sm font-normal cursor-pointer leading-tight">
                Compreendo que esta ação é permanente e que não será possível recuperar os dados depois.
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wipe-phrase" className="text-sm">
                Para confirmar, digite a frase exatamente como aparece abaixo:
              </Label>
              <div className="rounded-md bg-muted px-3 py-2 font-mono text-sm select-all">
                {CONFIRMATION_PHRASE}
              </div>
              <Input
                id="wipe-phrase"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Digite aqui"
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={reset}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!canContinue}
              onClick={() => { setStep1Open(false); setStep2Open(true); }}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Etapa 2 — confirmação final com contagem regressiva */}
      <Dialog open={step2Open} onOpenChange={(v) => { if (!v && !running) reset(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Última confirmação — etapa 2 de 2
            </DialogTitle>
            <DialogDescription>
              Tem certeza absoluta? Ao clicar em "Excluir definitivamente", todos os dados serão removidos imediatamente.
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="space-y-3">
              <Alert>
                <AlertDescription>Dados excluídos com sucesso. Você será deslogado agora.</AlertDescription>
              </Alert>
              <div className="rounded-md border border-border/40 max-h-64 overflow-auto text-xs">
                <table className="w-full">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr><th className="text-left p-2">Recurso</th><th className="text-right p-2">Removidos</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.deleted_counts || {}).map(([k, v]: any) => (
                      <tr key={k} className="border-t border-border/30">
                        <td className="p-2">{k}</td>
                        <td className="p-2 text-right">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter>
                <Button onClick={finishAndLogout}>Sair da conta</Button>
              </DialogFooter>
            </div>
          ) : (
            <DialogFooter>
              <Button variant="outline" disabled={running} onClick={reset}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={countdown > 0 || running}
                onClick={executeWipe}
              >
                {running ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Excluindo…</>
                ) : countdown > 0 ? (
                  <>Aguarde {countdown}s…</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-2" /> Excluir definitivamente</>
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

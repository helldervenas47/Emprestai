import { useMemo, useState, useEffect } from "react";
import { Barcode, Search, Copy, AlertTriangle, CheckCircle2, Building2, Calendar, DollarSign, Receipt, History, Trash2, Smartphone, QrCode, ChevronDown } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLinhaDigitavel, formatLinhaDigitavel, type ParsedBoleto } from "@/features/boletos/lib/boleto/parseLinhaDigitavel";
import { ExpenseForm } from "@/features/financial/components/ExpenseForm";
import { useExpenses } from "@/features/financial/hooks/useExpenses";
import { useBoletoHistory } from "@/features/boletos/hooks/useBoletoHistory";
import { hasBankAppLink, openBankApp, isMobileDevice } from "@/features/boletos/lib/boleto/bankDeepLinks";
import { parsePixBrCode } from "@/features/boletos/lib/boleto/pixBrCode";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props { readOnly?: boolean }

export function BoletoSearchTab({ readOnly }: Props) {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<ParsedBoleto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [pixRaw, setPixRaw] = useState("");
  const [showPixField, setShowPixField] = useState(false);
  const { addExpense } = useExpenses(false);
  const { items: history, addItem, clear: clearHistory } = useBoletoHistory();
  const isMobile = useMemo(() => isMobileDevice(), []);

  const pixInfo = useMemo(() => (pixRaw.trim() ? parsePixBrCode(pixRaw) : null), [pixRaw]);

  // Auto-carrega PIX salvo do histórico ao decodificar o mesmo boleto
  useEffect(() => {
    if (!result) { setPixRaw(""); setShowPixField(false); return; }
    const prev = history.find((h) => h.digits === result.digits);
    if (prev?.pix_brcode) {
      setPixRaw(prev.pix_brcode);
      setShowPixField(true);
    }
  }, [result?.digits]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleParse = (text: string) => {
    setError(null);
    setResult(null);
    if (!text.trim()) return;
    const out = parseLinhaDigitavel(text);
    if ("error" in out) {
      setError(out.error);
      return;
    }
    setResult(out);
    const label = out.kind === "bancario"
      ? `${out.bankName ?? "Boleto"} · ${BRL(out.amount)}`
      : `${out.segmentLabel ?? "Arrecadação"} · ${BRL(out.amount)}`;
    addItem({
      digits: out.digits,
      barcode: out.barcode,
      kind: out.kind,
      bank_code: out.bankCode ?? null,
      bank_name: out.bankName ?? null,
      segment: out.segment ?? null,
      segment_label: out.segmentLabel ?? null,
      amount: out.amount,
      due_date: out.dueDate,
      label,
    });
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRaw(text);
      handleParse(text);
    } catch {
      toast.error("Não foi possível ler a área de transferência.");
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado");
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  const handleSaveExpense = () => {
    if (!result) return;
    setExpenseOpen(true);
  };

  const expenseDefaults = useMemo(() => {
    if (!result) return undefined;
    const description = result.kind === "bancario"
      ? `Boleto ${result.bankName ?? ""}`.trim()
      : `Conta ${result.segmentLabel ?? "Arrecadação"}`;
    return {
      description,
      amount: result.amount > 0 ? String(result.amount) : "",
      category: "Outros",
      dueDate: result.dueDate ?? undefined,
      notes: `Linha digitável: ${formatLinhaDigitavel(result.digits)}\nCódigo de barras: ${result.barcode}`,
    };
  }, [result]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Barcode className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Consultar boleto</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Cole a linha digitável (47 dígitos) ou o código de barras (44 dígitos) abaixo.
            O app decodifica banco, vencimento, valor e valida os dígitos verificadores — tudo offline.
          </p>
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Ex.: 23793.38128 60082.012345 67890.123456 1 12345678901234"
            className="font-mono text-sm min-h-[80px]"
            inputMode="numeric"
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text) {
                setRaw(text);
                setTimeout(() => handleParse(text), 0);
              }
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => handleParse(raw)}><Search className="h-4 w-4" /> Consultar</Button>
            <Button variant="outline" onClick={handlePaste}>Colar da área de transferência</Button>
            {raw && <Button variant="ghost" onClick={() => { setRaw(""); setResult(null); setError(null); }}>Limpar</Button>}
          </div>
          {error && (
            <div className="rounded-lg bg-destructive/10 text-destructive p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Boleto decodificado</h3>
                <Badge variant="outline" className="capitalize text-[10px]">{result.kind === "bancario" ? "Cobrança bancária" : "Arrecadação"}</Badge>
              </div>
              {result.validDigits && result.validBarcode ? (
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]" variant="outline">
                  <CheckCircle2 className="h-3 w-3" /> Dígitos válidos
                </Badge>
              ) : (
                <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[10px]" variant="outline">
                  <AlertTriangle className="h-3 w-3" /> Dígitos inválidos
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {result.kind === "bancario" && (
                <InfoTile icon={<Building2 className="h-4 w-4" />} label="Banco emissor"
                  value={`${result.bankCode} · ${result.bankName}`} />
              )}
              {result.kind === "arrecadacao" && (
                <InfoTile icon={<Building2 className="h-4 w-4" />} label="Segmento"
                  value={`${result.segment} · ${result.segmentLabel}`} />
              )}
              <InfoTile icon={<Calendar className="h-4 w-4" />} label="Vencimento"
                value={result.dueDate ? format(parseISO(result.dueDate), "dd/MM/yyyy", { locale: ptBR }) : "Não informado"} />
              <InfoTile icon={<DollarSign className="h-4 w-4" />} label="Valor"
                value={result.amount > 0 ? BRL(result.amount) : "A calcular"} />
            </div>

            <div className="space-y-2">
              <Field label="Linha digitável" value={formatLinhaDigitavel(result.digits)} onCopy={() => handleCopy(result.digits)} />
              <Field label="Código de barras (44 dígitos)" value={result.barcode} onCopy={() => handleCopy(result.barcode)} mono />
            </div>

            {result.warnings.length > 0 && (
              <div className="rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3 text-xs space-y-1">
                {result.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /><span>{w}</span></div>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">Pagar este boleto</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {isMobile && hasBankAppLink(result.bankCode) && (
                  <Button
                    onClick={async () => {
                      await navigator.clipboard.writeText(result.digits).catch(() => {});
                      toast.success(`Linha copiada · abrindo ${result.bankName ?? "app do banco"}…`);
                      openBankApp(result.bankCode);
                    }}
                  >
                    <Smartphone className="h-4 w-4" /> Pagar no app {result.bankName ?? "do banco"}
                  </Button>
                )}
                <Button
                  variant={isMobile && hasBankAppLink(result.bankCode) ? "outline" : "default"}
                  onClick={() => handleCopy(result.digits)}
                >
                  <Copy className="h-4 w-4" /> Copiar linha digitável
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowPixField((v) => !v)}
                  className={showPixField ? "sm:col-span-2" : ""}
                >
                  <QrCode className="h-4 w-4" />
                  {showPixField ? "Ocultar campo PIX" : "Tenho PIX Copia e Cola"}
                  <ChevronDown className={`h-3 w-3 transition-transform ${showPixField ? "rotate-180" : ""}`} />
                </Button>
              </div>

              {showPixField && (
                <div className="space-y-3 pt-2 border-t border-primary/10">
                  <p className="text-[11px] text-muted-foreground">
                    A linha digitável de 47 dígitos <strong>não</strong> contém o PIX. Se o boleto trouxer um QR Code ou
                    código PIX impresso, cole abaixo para gerar o QR Code e pagar de outro dispositivo.
                  </p>
                  <Textarea
                    value={pixRaw}
                    onChange={(e) => setPixRaw(e.target.value)}
                    placeholder="00020101021226…6304ABCD"
                    className="font-mono text-xs min-h-[64px]"
                    onBlur={() => {
                      if (!pixRaw.trim() || !result) return;
                      const info = parsePixBrCode(pixRaw);
                      if (!info.valid) return;
                      // re-salva no histórico com o PIX
                      const label = result.kind === "bancario"
                        ? `${result.bankName ?? "Boleto"} · ${BRL(result.amount)}`
                        : `${result.segmentLabel ?? "Arrecadação"} · ${BRL(result.amount)}`;
                      addItem({
                        digits: result.digits,
                        barcode: result.barcode,
                        kind: result.kind,
                        bank_code: result.bankCode ?? null,
                        bank_name: result.bankName ?? null,
                        segment: result.segment ?? null,
                        segment_label: result.segmentLabel ?? null,
                        amount: result.amount,
                        due_date: result.dueDate,
                        label,
                        pix_brcode: pixRaw.trim(),
                      });
                    }}
                  />
                  {pixInfo && !pixInfo.valid && (
                    <div className="text-xs text-rose-600 flex items-start gap-1.5">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /><span>{pixInfo.reason}</span>
                    </div>
                  )}
                  {pixInfo && pixInfo.valid && (
                    <div className="rounded-lg bg-background border p-4 flex flex-col items-center gap-3">
                      <div className="bg-white p-3 rounded-md">
                        <QRCodeSVG value={pixRaw.trim()} size={208} level="M" includeMargin={false} />
                      </div>
                      <div className="text-center space-y-0.5">
                        {pixInfo.merchantName && (
                          <div className="text-xs font-medium">{pixInfo.merchantName}</div>
                        )}
                        {pixInfo.amount !== undefined && (
                          <div className="text-sm font-semibold">{BRL(pixInfo.amount)}</div>
                        )}
                        <div className="text-[10px] text-muted-foreground">
                          Escaneie com a câmera do app do seu banco
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleCopy(pixRaw.trim())} className="w-full">
                        <Copy className="h-3 w-3" /> Copiar PIX Copia e Cola
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!readOnly && (
              <Button onClick={handleSaveExpense} variant="outline" className="w-full">
                <Receipt className="h-4 w-4" /> Salvar como despesa
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Consultas recentes</h3>
              </div>
              <Button size="sm" variant="ghost" onClick={() => clearHistory()}>
                <Trash2 className="h-3 w-3" /> Limpar
              </Button>
            </div>
            <div className="space-y-1">
              {history.map((h) => (
                <button type="button"
                  key={h.id}
                  onClick={() => { setRaw(h.digits); handleParse(h.digits); }}
                  className="w-full text-left rounded-lg bg-muted/40 hover:bg-muted px-3 py-2 text-sm flex items-center justify-between gap-2"
                >
                  <span className="truncate">{h.label}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {format(parseISO(h.parsed_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-dashed">
        <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">Buscar boletos a pagar em uma plataforma externa</p>
          <p>
            Para listar automaticamente boletos pendentes (Asaas, Cora, Iugu, Banco Inter PJ, BB API, etc.)
            é preciso conectar uma plataforma específica — não existe API única que retorne qualquer boleto do Brasil.
          </p>
          <p>Me diga qual plataforma você usa e eu habilito a importação automática.</p>
        </CardContent>
      </Card>

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Salvar boleto como despesa</DialogTitle></DialogHeader>
          <ExpenseForm
            defaults={expenseDefaults}
            onAdd={async (e) => {
              await addExpense(e as any);
              toast.success("Despesa criada a partir do boleto");
              setExpenseOpen(false);
            }}
            onClose={() => setExpenseOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <div className="mt-1 font-semibold text-sm break-words">{value}</div>
    </div>
  );
}

function Field({ label, value, onCopy, mono }: { label: string; value: string; onCopy: () => void; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <Button size="sm" variant="ghost" onClick={onCopy} className="h-6 px-2"><Copy className="h-3 w-3" /></Button>
      </div>
      <div className={`text-xs break-all ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

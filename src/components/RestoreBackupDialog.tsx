import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, FileJson, Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";

interface BackupHistoryItem {
  id: string;
  created_at: string;
  drive_url: string | null;
  drive_file_id?: string | null;
  filename: string | null;
  size_bytes: number | null;
  status: string;
  triggered_by: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: BackupHistoryItem[];
  onRestored?: () => void;
  defaultSource?: "drive" | "upload";
}

export function RestoreBackupDialog({ open, onOpenChange, history, onRestored, defaultSource = "drive" }: Props) {
  const [source, setSource] = useState<"drive" | "upload">(defaultSource);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [uploadContent, setUploadContent] = useState<string>("");
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const successHistory = history.filter((h) => h.status === "success" && h.drive_file_id);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUploadContent(String(reader.result || ""));
    reader.readAsText(file);
  }

  async function run() {
    if (mode === "replace" && confirmText !== "RESTAURAR") {
      toast.error('Digite "RESTAURAR" para confirmar');
      return;
    }
    if (source === "drive" && !selectedFileId) { toast.error("Selecione um backup"); return; }
    if (source === "upload" && !uploadContent) { toast.error("Selecione um arquivo JSON"); return; }

    setRunning(true);
    setResult(null);
    try {
      const payload: any = { source, mode };
      if (source === "drive") payload.driveFileId = selectedFileId;
      else payload.jsonContent = uploadContent;

      const { data, error } = await supabase.functions.invoke("restore-backup", { body: payload });
      if (error) throw error;
      if ((data as any)?.ok === false || (data as any)?.error) {
        throw new Error((data as any).error || "Falha");
      }
      setResult(data);
      toast.success("Backup restaurado!");
      onRestored?.();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao restaurar");
    } finally {
      setRunning(false);
    }
  }

  function close() {
    setResult(null);
    setConfirmText("");
    setUploadContent("");
    setSelectedFileId("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5" /> Restaurar backup</DialogTitle>
          <DialogDescription>
            Recupera dados a partir de um backup gerado anteriormente.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <Alert>
              <AlertDescription>Restauração concluída com sucesso.</AlertDescription>
            </Alert>
            <div className="rounded-md border border-border/40 max-h-72 overflow-auto text-xs">
              <table className="w-full">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Tabela</th>
                    <th className="text-right p-2">Esperado</th>
                    <th className="text-right p-2">Inseridos</th>
                    <th className="text-right p-2">Ignorados</th>
                    {result.mode === "replace" && <th className="text-right p-2">Apagados</th>}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.summary || {}).map(([tbl, s]: any) => {
                    const divergent = s.expected != null && s.expected !== s.inserted && s.inserted < s.expected;
                    return (
                      <tr key={tbl} className={`border-t border-border/30 ${divergent ? "text-destructive" : ""}`}>
                        <td className="p-2">{tbl}{s.errors?.length > 0 && <span className="text-destructive"> ⚠</span>}</td>
                        <td className="p-2 text-right">{s.expected ?? "—"}</td>
                        <td className="p-2 text-right">{s.inserted}</td>
                        <td className="p-2 text-right">{s.skipped}</td>
                        {result.mode === "replace" && <td className="p-2 text-right">{s.deleted ?? 0}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button onClick={close}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Origem do backup</Label>
              <RadioGroup value={source} onValueChange={(v) => setSource(v as any)} className="mt-2 space-y-2">
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="drive" id="src-drive" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="src-drive" className="font-normal cursor-pointer">Selecionar do histórico (Google Drive)</Label>
                    {source === "drive" && (
                      <select
                        className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        value={selectedFileId}
                        onChange={(e) => setSelectedFileId(e.target.value)}
                      >
                        <option value="">— Escolha um backup —</option>
                        {successHistory.map((h) => (
                          <option key={h.id} value={h.drive_file_id!}>
                            {h.filename || h.id} · {new Date(h.created_at).toLocaleString("pt-BR")}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="upload" id="src-upload" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="src-upload" className="font-normal cursor-pointer">Enviar arquivo JSON</Label>
                    {source === "upload" && (
                      <div className="mt-2">
                        <Input type="file" accept=".json,application/json" onChange={handleFile} />
                        {uploadContent && (
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <FileJson className="h-3 w-3" /> {(uploadContent.length / 1024).toFixed(1)} KB carregados
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label className="text-sm">Modo de restauração</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="mt-2 space-y-2">
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="merge" id="mode-merge" className="mt-1" />
                  <div>
                    <Label htmlFor="mode-merge" className="font-normal cursor-pointer">Mesclar (recomendado)</Label>
                    <p className="text-xs text-muted-foreground">Insere apenas o que está faltando. Não altera nem apaga nada do que existe hoje.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="replace" id="mode-replace" className="mt-1" />
                  <div>
                    <Label htmlFor="mode-replace" className="font-normal cursor-pointer text-destructive">Substituir tudo</Label>
                    <p className="text-xs text-muted-foreground">Apaga todos os seus dados atuais e reinsere os do backup. Esta ação é irreversível.</p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {mode === "replace" && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <p className="mb-2">Você vai apagar todos os dados atuais. Para confirmar, digite <strong>RESTAURAR</strong>:</p>
                  <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTAURAR" />
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={running}>Cancelar</Button>
              <Button onClick={run} disabled={running} className="gap-1">
                {running && <Loader2 className="h-4 w-4 animate-spin" />} Restaurar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

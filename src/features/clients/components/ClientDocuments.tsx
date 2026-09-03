import { useMemo, useRef, useState } from "react";
import {
  CLIENT_DOCUMENT_CATEGORIES,
  ClientDocument,
  useClientDocuments,
} from "@/features/clients/hooks/useClientDocuments";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  ImageIcon,
  Download,
  Eye,
  Trash2,
  RefreshCw,
  Upload,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  clientId: string | null | undefined;
  /** Quando true, mostra um aviso de que documentos serão habilitados após salvar. */
  disabledHint?: string;
}

function formatSize(bytes: number | null | undefined) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleString("pt-BR");
  } catch {
    return s;
  }
}

function isImage(mime: string | null, name: string) {
  if (mime?.startsWith("image/")) return true;
  return /\.(jpe?g|png)$/i.test(name);
}

export function ClientDocuments({ clientId, disabledHint }: Props) {
  const {
    documents,
    loading,
    uploadProgress,
    upload,
    replace,
    remove,
    getSignedUrl,
  } = useClientDocuments(clientId);

  const [category, setCategory] = useState<string>(CLIENT_DOCUMENT_CATEGORIES[0]);
  const [filter, setFilter] = useState<string>("all");
  const [toDelete, setToDelete] = useState<ClientDocument | null>(null);
  const [preview, setPreview] = useState<{ url: string; doc: ClientDocument } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingDoc, setReplacingDoc] = useState<ClientDocument | null>(null);

  const filtered = useMemo(
    () => (filter === "all" ? documents : documents.filter((d) => d.category === filter)),
    [documents, filter],
  );

  const handleUploadClick = () => {
    if (!clientId) {
      toast.error(disabledHint || "Salve o cliente antes de anexar documentos.");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        await upload(file, category);
        toast.success(`${file.name} enviado.`);
      } catch (e: any) {
        toast.error(e?.message || "Erro ao enviar arquivo.");
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleReplaceFile = async (files: FileList | null) => {
    if (!files || !files[0] || !replacingDoc) return;
    try {
      await replace(replacingDoc, files[0]);
      toast.success("Documento substituído.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao substituir.");
    } finally {
      setReplacingDoc(null);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  };

  const handlePreview = async (doc: ClientDocument) => {
    try {
      const url = await getSignedUrl(doc, false);
      setPreview({ url, doc });
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível abrir.");
    }
  };

  const handleDownload = async (doc: ClientDocument) => {
    try {
      const url = await getSignedUrl(doc, true);
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível baixar.");
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await remove(toDelete);
      toast.success("Documento excluído.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir.");
    } finally {
      setToDelete(null);
    }
  };

  return (
    <div className="border border-border rounded-lg p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">Documentos</Label>
          <Badge variant="outline" className="text-[10px]">
            {documents.length}
          </Badge>
        </div>
      </div>

      {!clientId && (
        <p className="text-[11px] text-muted-foreground">
          {disabledHint || "Salve o cliente para começar a anexar documentos."}
        </p>
      )}

      {clientId && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Categoria do upload</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_DOCUMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={handleUploadClick}
              className="self-end h-9"
              disabled={uploadProgress !== null}
            >
              <Upload className="h-4 w-4 mr-1.5" /> Adicionar
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <input
            ref={replaceInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => handleReplaceFile(e.target.files)}
          />

          {uploadProgress !== null && (
            <div className="space-y-1">
              <Progress value={uploadProgress} />
              <p className="text-[10px] text-muted-foreground">Enviando… {uploadProgress}%</p>
            </div>
          )}

          <div>
            <Label className="text-[11px] text-muted-foreground">Filtrar por categoria</Label>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-9 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {CLIENT_DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {loading && (
              <p className="text-[11px] text-muted-foreground">Carregando…</p>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Nenhum documento.</p>
            )}
            {filtered.map((doc) => (
              <div
                key={doc.id}
                className="flex items-start gap-2 p-2 rounded-md border border-border/60 bg-muted/30"
              >
                <div className="h-8 w-8 shrink-0 rounded bg-primary/10 flex items-center justify-center">
                  {isImage(doc.mimeType, doc.originalName) ? (
                    <ImageIcon className="h-4 w-4 text-primary" />
                  ) : (
                    <FileText className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium break-words leading-tight">
                    {doc.originalName}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {doc.category}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {formatSize(doc.sizeBytes)} · {formatDate(doc.createdAt)}
                    </span>
                  </div>
                  {doc.uploadedByName && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Por: {doc.uploadedByName}
                    </p>
                  )}
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => handlePreview(doc)}
                    title="Visualizar"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => handleDownload(doc)}
                    title="Baixar"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => {
                      setReplacingDoc(doc);
                      setTimeout(() => replaceInputRef.current?.click(), 0);
                    }}
                    title="Substituir"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setToDelete(doc)}
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.originalName} será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] p-3 sm:p-4">
          <DialogHeader>
            <DialogTitle className="text-sm break-words pr-6">
              {preview?.doc.originalName}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="w-full h-[70vh] overflow-auto bg-muted/30 rounded">
              {isImage(preview.doc.mimeType, preview.doc.originalName) ? (
                <img
                  src={preview.url}
                  alt={preview.doc.originalName}
                  className="w-full h-full object-contain"
                />
              ) : (
                <iframe
                  src={preview.url}
                  title={preview.doc.originalName}
                  className="w-full h-full"
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

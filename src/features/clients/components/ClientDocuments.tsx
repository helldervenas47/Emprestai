import { useMemo, useRef, useState, DragEvent } from "react";
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
  UploadCloud,
  FolderOpen,
  Calendar,
  ExternalLink,
  Plus,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
    const d = new Date(s);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function isImage(mime: string | null, name: string) {
  if (mime?.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(name);
}

function isPdf(mime: string | null, name: string) {
  if (mime?.includes("pdf")) return true;
  return /\.pdf$/i.test(name);
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
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [toDelete, setToDelete] = useState<ClientDocument | null>(null);
  const [preview, setPreview] = useState<{ url: string; doc: ClientDocument } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingDoc, setReplacingDoc] = useState<ClientDocument | null>(null);

  // Contagem de documentos por categoria para os chips
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    documents.forEach((d) => {
      map.set(d.category, (map.get(d.category) || 0) + 1);
    });
    return map;
  }, [documents]);

  const filtered = useMemo(() => {
    if (activeFilter === "all") return documents;
    return documents.filter((d) => d.category === activeFilter);
  }, [documents, activeFilter]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!clientId) {
      toast.error(disabledHint || "Salve o cliente antes de anexar documentos.");
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    try {
      for (const file of Array.from(files)) {
        try {
          await upload(file, category);
          successCount++;
        } catch (e: any) {
          toast.error(`Erro em ${file.name}: ` + (e?.message || "falha ao enviar"));
        }
      }
      if (successCount > 0) {
        toast.success(
          successCount === 1
            ? "1 documento anexado com sucesso!"
            : `${successCount} documentos anexados com sucesso!`
        );
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReplaceFile = async (files: FileList | null) => {
    if (!files || !files[0] || !replacingDoc) return;
    try {
      await replace(replacingDoc, files[0]);
      toast.success("Documento substituído com sucesso.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao substituir arquivo.");
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
      toast.error(e?.message || "Não foi possível abrir o documento.");
    }
  };

  const handleDownload = async (doc: ClientDocument) => {
    try {
      const url = await getSignedUrl(doc, true);
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível realizar o download.");
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await remove(toDelete);
      toast.success("Documento excluído permanentemente.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir documento.");
    } finally {
      setToDelete(null);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-4">
      {/* Aviso de cliente novo não salvo */}
      {!clientId ? (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 text-center space-y-2">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
          <h4 className="text-sm font-semibold text-foreground">Documentos Indisponíveis</h4>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {disabledHint || "Salve os dados cadastrais do cliente primeiro para poder anexar fotos, CNH, comprovantes e contratos."}
          </p>
        </div>
      ) : (
        <>
          {/* Zona de Upload & Drag and Drop */}
          <div className="bg-card/70 dark:bg-white/[0.02] border border-border/70 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <FileCheck2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Anexar Novo Documento</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Formatos aceitos: PDF, JPEG, PNG (máx. 10MB por arquivo)
                  </p>
                </div>
              </div>

              {/* Seletor de Categoria */}
              <div className="flex items-center gap-2 shrink-0">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Categoria:</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 text-xs font-medium bg-background/80 min-w-[170px] rounded-xl border-border/80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 rounded-xl">
                    {CLIENT_DOCUMENT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dropzone Interativa */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "group relative border-2 border-dashed rounded-2xl p-5 sm:p-6 text-center cursor-pointer transition-all duration-200",
                "bg-muted/20 hover:bg-muted/40 hover:border-primary/60",
                isDragging
                  ? "border-primary bg-primary/10 scale-[0.99]"
                  : "border-border/80"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />

              <div className="flex flex-col items-center justify-center gap-2">
                <div className={cn(
                  "p-3 rounded-2xl transition-transform duration-200 group-hover:scale-110",
                  isDragging ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                )}>
                  <UploadCloud className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-foreground">
                    Clique para selecionar ou arraste arquivos aqui
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Será salvo automaticamente como <span className="font-semibold text-primary">{category}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Barra de Progresso durante upload */}
            {(uploadProgress !== null || isUploading) && (
              <div className="bg-background/80 border border-border/60 rounded-xl p-3 space-y-2 animate-fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                    Enviando arquivo...
                  </span>
                  <span className="font-bold text-primary">{uploadProgress || 0}%</span>
                </div>
                <Progress value={uploadProgress || 0} className="h-2 rounded-full" />
              </div>
            )}
          </div>

          {/* Hidden Replace Input */}
          <input
            ref={replaceInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => handleReplaceFile(e.target.files)}
          />

          {/* Barra de Filtros por Categoria (Chips Rápidos) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Documentos Anexados ({documents.length})
                </Label>
              </div>
            </div>

            {/* Chips de filtro */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border",
                  activeFilter === "all"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                    : "bg-card hover:bg-muted text-muted-foreground border-border/60"
                )}
              >
                Todas
                <Badge
                  variant={activeFilter === "all" ? "secondary" : "outline"}
                  className="text-[10px] px-1.5 py-0 h-4 min-w-[18px] justify-center"
                >
                  {documents.length}
                </Badge>
              </button>

              {CLIENT_DOCUMENT_CATEGORIES.map((cat) => {
                const count = categoryCounts.get(cat) || 0;
                if (count === 0 && activeFilter !== cat) return null;
                const isSelected = activeFilter === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveFilter(cat)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                        : "bg-card hover:bg-muted text-muted-foreground border-border/60"
                    )}
                  >
                    {cat}
                    <Badge
                      variant={isSelected ? "secondary" : "outline"}
                      className="text-[10px] px-1.5 py-0 h-4 min-w-[18px] justify-center"
                    >
                      {count}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista de Documentos */}
          <div className="space-y-2.5">
            {loading ? (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto text-primary" />
                <p>Carregando documentos...</p>
              </div>
            ) : filtered.length === 0 ? (
              /* Empty State */
              <div className="bg-card/40 dark:bg-white/[0.01] border border-dashed border-border/80 rounded-2xl p-8 text-center space-y-3">
                <div className="h-12 w-12 rounded-2xl bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
                  <FolderOpen className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {activeFilter === "all"
                      ? "Nenhum documento anexado"
                      : `Nenhum documento na categoria "${activeFilter}"`}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Faça upload de fotos da CNH, comprovante de residência ou contratos para manter o dossiê do cliente atualizado.
                  </p>
                </div>
              </div>
            ) : (
              /* Grid de Cards de Documentos */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.map((doc) => {
                  const isImg = isImage(doc.mimeType, doc.originalName);
                  const isPdfFile = isPdf(doc.mimeType, doc.originalName);

                  return (
                    <div
                      key={doc.id}
                      className="group bg-card/80 hover:bg-card dark:bg-white/[0.02] dark:hover:bg-white/[0.04] border border-border/70 hover:border-primary/40 rounded-2xl p-3.5 transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start gap-3">
                        {/* Ícone Estilizado */}
                        <div
                          onClick={() => handlePreview(doc)}
                          className={cn(
                            "h-11 w-11 shrink-0 rounded-xl flex items-center justify-center cursor-pointer transition-transform group-hover:scale-105 shadow-sm",
                            isPdfFile
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                              : isImg
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          )}
                          title="Clique para visualizar"
                        >
                          {isPdfFile ? (
                            <FileText className="h-5 w-5" />
                          ) : isImg ? (
                            <ImageIcon className="h-5 w-5" />
                          ) : (
                            <FileSpreadsheet className="h-5 w-5" />
                          )}
                        </div>

                        {/* Dados do Documento */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <p
                            onClick={() => handlePreview(doc)}
                            className="text-xs sm:text-sm font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-colors"
                            title={doc.originalName}
                          >
                            {doc.originalName}
                          </p>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-medium bg-muted/80 text-foreground px-2 py-0.5 rounded-lg"
                            >
                              {doc.category}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {formatSize(doc.sizeBytes)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-0.5">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(doc.createdAt)}</span>
                            {doc.uploadedByName && (
                              <span>• por {doc.uploadedByName}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Ações Rápidas */}
                      <div className="flex items-center justify-end gap-1 pt-2 border-t border-border/40">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl gap-1"
                          onClick={() => handlePreview(doc)}
                          title="Visualizar documento"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Visualizar</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl gap-1"
                          onClick={() => handleDownload(doc)}
                          title="Baixar arquivo"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Baixar</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl"
                          onClick={() => {
                            setReplacingDoc(doc);
                            setTimeout(() => replaceInputRef.current?.click(), 0);
                          }}
                          title="Substituir arquivo por outra versão"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 rounded-xl"
                          onClick={() => setToDelete(doc)}
                          title="Excluir documento"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Confirmação de Exclusão */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <div className="h-10 w-10 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-1">
              <Trash2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-base font-bold">Excluir documento permanentemente?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              O arquivo <span className="font-semibold text-foreground">{toDelete?.originalName}</span> será removido da nuvem e não poderá ser recuperado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl text-xs font-semibold">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl text-xs font-semibold"
            >
              Excluir Documento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Pré-visualização com Visualizador de PDF e Imagens */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] p-0 overflow-hidden rounded-2xl border-border/80 shadow-2xl">
          {preview && (
            <div className="flex flex-col h-[85vh]">
              {/* Header do Preview */}
              <div className="px-5 py-3.5 bg-card/95 backdrop-blur-md border-b border-border/60 flex items-center justify-between gap-3 shrink-0">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-sm font-bold text-foreground truncate">
                    {preview.doc.originalName}
                  </DialogTitle>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {preview.doc.category}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {formatSize(preview.doc.sizeBytes)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 pr-6">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs font-semibold rounded-xl gap-1.5"
                    onClick={() => window.open(preview.url, "_blank")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir em nova aba
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs font-semibold rounded-xl gap-1.5 bg-primary text-primary-foreground"
                    onClick={() => handleDownload(preview.doc)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Baixar
                  </Button>
                </div>
              </div>

              {/* Conteúdo do Preview */}
              <div className="flex-1 bg-muted/30 overflow-auto flex items-center justify-center p-2 sm:p-4">
                {isImage(preview.doc.mimeType, preview.doc.originalName) ? (
                  <img
                    src={preview.url}
                    alt={preview.doc.originalName}
                    className="max-h-full max-w-full object-contain rounded-xl shadow-sm"
                  />
                ) : (
                  <iframe
                    src={preview.url}
                    title={preview.doc.originalName}
                    className="w-full h-full rounded-xl border border-border/60 bg-white"
                  />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

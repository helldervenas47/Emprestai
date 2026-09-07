import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Video,
  Image as ImageIcon,
  Sparkles,
  UploadCloud,
  Link2,
  FileVideo,
  CheckCircle2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/userClient";
import { useToast } from "@/hooks/use-toast";
import type { VideoLesson, VideoLessonFormData, VideoLessonStatus } from "../types/videoLesson";
import { parseVideoUrl } from "../lib/videoUrlParser";

interface VideoLessonFormModalProps {
  lessonToEdit: VideoLesson | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: VideoLessonFormData) => Promise<any>;
  isSaving: boolean;
  existingCategories?: string[];
}

const DEFAULT_CATEGORIES = [
  "Primeiros Passos",
  "Empréstimos",
  "Clientes",
  "Financeiro",
  "Vendas",
  "Veículos",
  "Relatórios & Telegram",
  "Configurações",
  "Geral",
];

const STORAGE_BUCKET = "video-lessons";

export function VideoLessonFormModal({
  lessonToEdit,
  isOpen,
  onClose,
  onSave,
  isSaving,
  existingCategories = [],
}: VideoLessonFormModalProps) {
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [category, setCategory] = useState("Primeiros Passos");
  const [customCategory, setCustomCategory] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [status, setStatus] = useState<VideoLessonStatus>("published");

  // Modos de entrada (upload ou link externo)
  const [videoSourceMode, setVideoSourceMode] = useState<"upload" | "url">("upload");
  const [thumbSourceMode, setThumbSourceMode] = useState<"upload" | "url">("upload");

  // Estados de Upload
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoFileName, setVideoFileName] = useState("");
  const [isUploadingThumb, setIsUploadingThumb] = useState(false);
  const [thumbFileName, setThumbFileName] = useState("");

  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (lessonToEdit) {
      setTitle(lessonToEdit.title || "");
      setDescription(lessonToEdit.description || "");
      const vUrl = lessonToEdit.video_url || "";
      setVideoUrl(vUrl);
      const tUrl = lessonToEdit.thumbnail_url || "";
      setThumbnailUrl(tUrl);

      // Detectar se a URL é do storage ou externa
      if (vUrl.includes("/video-lessons/") || /\.(mp4|webm|ogg|mov)$/i.test(vUrl)) {
        setVideoSourceMode("upload");
      } else {
        setVideoSourceMode("url");
      }

      if (tUrl.includes("/video-lessons/")) {
        setThumbSourceMode("upload");
      } else {
        setThumbSourceMode("url");
      }

      if (DEFAULT_CATEGORIES.includes(lessonToEdit.category)) {
        setCategory(lessonToEdit.category);
        setCustomCategory("");
      } else {
        setCategory("outro");
        setCustomCategory(lessonToEdit.category || "");
      }
      setDisplayOrder(lessonToEdit.display_order || 0);
      setStatus(lessonToEdit.status || "published");
      setVideoFileName("");
      setThumbFileName("");
    } else {
      setTitle("");
      setDescription("");
      setVideoUrl("");
      setThumbnailUrl("");
      setCategory("Primeiros Passos");
      setCustomCategory("");
      setDisplayOrder(0);
      setStatus("published");
      setVideoSourceMode("upload");
      setThumbSourceMode("upload");
      setVideoFileName("");
      setThumbFileName("");
    }
  }, [lessonToEdit, isOpen]);

  const parsedVideo = parseVideoUrl(videoUrl);
  const autoThumbnail = parsedVideo.autoThumbnailUrl;
  const effectiveThumbnail = thumbnailUrl.trim() || autoThumbnail;

  // Upload de arquivo de vídeo para o Supabase Storage
  const handleVideoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validações
    const maxSizeBytes = 500 * 1024 * 1024; // 500 MB
    if (file.size > maxSizeBytes) {
      toast({
        title: "Arquivo muito grande",
        description: "O vídeo deve ter no máximo 500 MB. Para vídeos maiores, use um link do YouTube ou Loom.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingVideo(true);
    setVideoFileName(file.name);

    try {
      const sanitizedName = file.name
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, "_")
        .replace(/_{2,}/g, "_");
      const filePath = `videos/${Date.now()}_${sanitizedName}`;

      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type || "video/mp4",
        });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filePath);

      setVideoUrl(publicUrlData.publicUrl);
      toast({
        title: "Vídeo carregado com sucesso!",
        description: `Arquivo "${file.name}" importado para a plataforma.`,
      });
    } catch (err: any) {
      console.error("Erro no upload do vídeo:", err);
      toast({
        title: "Erro ao enviar vídeo",
        description:
          err.message ||
          "Não foi possível enviar o vídeo. Verifique se o bucket 'video-lessons' está configurado no Supabase Storage.",
        variant: "destructive",
      });
      setVideoFileName("");
    } finally {
      setIsUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  // Upload de arquivo de capa/imagem para o Supabase Storage
  const handleThumbFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validações (max 15MB)
    const maxSizeBytes = 15 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast({
        title: "Imagem muito grande",
        description: "A imagem de capa deve ter no máximo 15 MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingThumb(true);
    setThumbFileName(file.name);

    try {
      const sanitizedName = file.name
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, "_")
        .replace(/_{2,}/g, "_");
      const filePath = `thumbnails/${Date.now()}_${sanitizedName}`;

      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type || "image/jpeg",
        });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filePath);

      setThumbnailUrl(publicUrlData.publicUrl);
      toast({
        title: "Capa carregada com sucesso!",
        description: "A imagem de capa foi importada.",
      });
    } catch (err: any) {
      console.error("Erro no upload da capa:", err);
      toast({
        title: "Erro ao enviar capa",
        description: err.message || "Não foi possível enviar a imagem de capa.",
        variant: "destructive",
      });
      setThumbFileName("");
    } finally {
      setIsUploadingThumb(false);
      if (thumbInputRef.current) thumbInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !videoUrl.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Informe o título e selecione ou insira a URL do vídeo.",
        variant: "destructive",
      });
      return;
    }

    const finalCategory =
      category === "outro" ? customCategory.trim() || "Geral" : category;

    await onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      video_url: videoUrl.trim(),
      thumbnail_url: thumbnailUrl.trim() || undefined,
      category: finalCategory,
      display_order: Number(displayOrder) || 0,
      status,
    });

    onClose();
  };

  const allCategoryOptions = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...existingCategories])
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isUploadingVideo && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-full max-w-xl p-4 sm:p-6 bg-card border-border/80 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2 text-foreground">
            <Video className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">{lessonToEdit ? "Editar Vídeo Aula" : "Publicar Nova Vídeo Aula"}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Envie vídeos diretamente do seu dispositivo ou informe links externos.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2 w-full min-w-0">
          {/* Título */}
          <div className="space-y-1.5">
            <Label htmlFor="lesson-title" className="text-xs font-semibold">
              Título da Aula <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lesson-title"
              placeholder="Ex: Como criar e gerenciar um empréstimo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="h-10 text-sm bg-muted/20 w-full"
            />
          </div>

          {/* VÍDEO (UPLOAD OU LINK) */}
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/10 p-3 w-full min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5 shrink-0">
                <FileVideo className="h-4 w-4 text-primary" />
                Vídeo da Aula <span className="text-destructive">*</span>
              </Label>

              {/* Botões de alternância Upload / Link */}
              <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg text-[11px] shrink-0">
                <button
                  type="button"
                  onClick={() => setVideoSourceMode("upload")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                    videoSourceMode === "upload"
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <UploadCloud className="h-3 w-3" />
                  Upload Direto
                </button>
                <button
                  type="button"
                  onClick={() => setVideoSourceMode("url")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                    videoSourceMode === "url"
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Link2 className="h-3 w-3" />
                  Link Externo
                </button>
              </div>
            </div>

            {videoSourceMode === "upload" ? (
              <div className="space-y-2 w-full min-w-0">
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.mov,.ogg"
                  onChange={handleVideoFileUpload}
                  className="hidden"
                />

                {videoUrl ? (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-2 sm:gap-3 w-full min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div className="text-xs min-w-0 flex-1 overflow-hidden">
                        <p className="font-semibold text-emerald-800 dark:text-emerald-300 truncate">
                          {videoFileName || "Arquivo de vídeo pronto para reprodução"}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate" title={videoUrl}>
                          {videoUrl}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => videoInputRef.current?.click()}
                        disabled={isUploadingVideo}
                        className="h-8 text-xs rounded-lg px-2 sm:px-3"
                      >
                        Trocar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setVideoUrl("");
                          setVideoFileName("");
                        }}
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                        title="Remover vídeo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => !isUploadingVideo && videoInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 w-full ${
                      isUploadingVideo
                        ? "bg-muted/40 border-primary/40 cursor-not-allowed"
                        : "border-border hover:border-primary hover:bg-primary/5"
                    }`}
                  >
                    {isUploadingVideo ? (
                      <>
                        <Loader2 className="h-7 w-7 animate-spin text-primary" />
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-foreground">
                            Enviando vídeo para a nuvem...
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Aguarde o processamento do arquivo.
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <UploadCloud className="h-5 w-5" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-foreground">
                            Clique para selecionar o vídeo do seu dispositivo
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Formatos: MP4, WebM, MOV, OGG (Até 500 MB)
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5 w-full">
                <Input
                  id="lesson-url"
                  placeholder="https://www.youtube.com/watch?v=... ou Vimeo / Loom"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="h-10 text-sm bg-muted/20 w-full"
                />
                {parsedVideo.type !== "generic" && videoUrl && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span className="truncate">Plataforma identificada: {parsedVideo.type.toUpperCase()}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="lesson-desc" className="text-xs font-semibold">
              Descrição Curta (opcional)
            </Label>
            <Textarea
              id="lesson-desc"
              placeholder="Explique resumidamente o que o usuário aprenderá nesta aula..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="text-xs sm:text-sm bg-muted/20 resize-none w-full"
            />
          </div>

          {/* Categoria e Ordem */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-10 text-xs bg-muted/20 w-full">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {allCategoryOptions.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-xs">
                      {cat}
                    </SelectItem>
                  ))}
                  <SelectItem value="outro" className="text-xs">
                    + Outra categoria...
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lesson-order" className="text-xs font-semibold">
                Ordem de Exibição
              </Label>
              <Input
                id="lesson-order"
                type="number"
                min={0}
                placeholder="0"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(Number(e.target.value))}
                className="h-10 text-sm bg-muted/20 w-full"
              />
            </div>
          </div>

          {category === "outro" && (
            <div className="space-y-1.5 animate-in fade-in-50">
              <Label htmlFor="custom-category" className="text-xs font-semibold">
                Nome da Nova Categoria
              </Label>
              <Input
                id="custom-category"
                placeholder="Ex: Recursos Avançados"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className="h-10 text-xs bg-muted/20 w-full"
              />
            </div>
          )}

          {/* CAPA / THUMBNAIL (UPLOAD OU URL) */}
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/10 p-3 w-full min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5 shrink-0">
                <ImageIcon className="h-4 w-4 text-primary" />
                Capa / Thumbnail (opcional)
              </Label>

              <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg text-[11px] shrink-0">
                <button
                  type="button"
                  onClick={() => setThumbSourceMode("upload")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                    thumbSourceMode === "upload"
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <UploadCloud className="h-3 w-3" />
                  Upload Imagem
                </button>
                <button
                  type="button"
                  onClick={() => setThumbSourceMode("url")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                    thumbSourceMode === "url"
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Link2 className="h-3 w-3" />
                  URL Externa
                </button>
              </div>
            </div>

            {thumbSourceMode === "upload" ? (
              <div className="space-y-2 w-full min-w-0">
                <input
                  ref={thumbInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp"
                  onChange={handleThumbFileUpload}
                  className="hidden"
                />

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => thumbInputRef.current?.click()}
                    disabled={isUploadingThumb}
                    className="h-9 text-xs rounded-xl gap-1.5"
                  >
                    {isUploadingThumb ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        Enviando imagem...
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-3.5 w-3.5 text-primary" />
                        {thumbnailUrl ? "Trocar Imagem de Capa" : "Selecionar Imagem de Capa"}
                      </>
                    )}
                  </Button>

                  {thumbnailUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setThumbnailUrl("");
                        setThumbFileName("");
                      }}
                      className="h-9 text-xs text-destructive hover:bg-destructive/10 rounded-xl"
                    >
                      Remover Capa
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <Input
                id="lesson-thumb"
                placeholder="https://exemplo.com/capa.jpg"
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                className="h-10 text-xs bg-muted/20 w-full"
              />
            )}

            {/* Prévia da capa se existir */}
            {effectiveThumbnail && (
              <div className="mt-2 flex items-center gap-3 p-2 bg-muted/30 rounded-xl border border-border/40 w-full min-w-0 overflow-hidden">
                <div className="relative w-24 sm:w-28 aspect-video rounded-lg overflow-hidden border border-border/60 bg-muted shrink-0">
                  <img
                    src={effectiveThumbnail}
                    alt="Prévia da capa"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="text-[11px] text-muted-foreground min-w-0 flex-1 overflow-hidden">
                  <p className="font-semibold text-foreground truncate">Prévia da Capa</p>
                  <p className="truncate" title={effectiveThumbnail}>
                    {autoThumbnail && !thumbnailUrl ? "Capa automática gerada pela plataforma" : effectiveThumbnail}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Status (Publicado / Rascunho) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Status de Publicação</Label>
            <Select
              value={status}
              onValueChange={(val: VideoLessonStatus) => setStatus(val)}
            >
              <SelectTrigger className="h-10 text-xs bg-muted/20 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="published" className="text-xs">
                  🟢 Publicado (visível para todos os usuários)
                </SelectItem>
                <SelectItem value="draft" className="text-xs">
                  🟡 Rascunho (visível apenas para administradores)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Ações */}
          <DialogFooter className="pt-3 flex flex-col-reverse sm:flex-row gap-2 sm:gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving || isUploadingVideo || isUploadingThumb}
              className="h-10 text-xs rounded-xl w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                isSaving ||
                isUploadingVideo ||
                isUploadingThumb ||
                !title.trim() ||
                !videoUrl.trim()
              }
              className="h-10 text-xs rounded-xl font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Video className="h-3.5 w-3.5" />
                  {lessonToEdit ? "Salvar Alterações" : "Publicar Vídeo Aula"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
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
import { Loader2, Video, Image as ImageIcon, Sparkles } from "lucide-react";
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

export function VideoLessonFormModal({
  lessonToEdit,
  isOpen,
  onClose,
  onSave,
  isSaving,
  existingCategories = [],
}: VideoLessonFormModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [category, setCategory] = useState("Primeiros Passos");
  const [customCategory, setCustomCategory] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [status, setStatus] = useState<VideoLessonStatus>("published");

  useEffect(() => {
    if (lessonToEdit) {
      setTitle(lessonToEdit.title || "");
      setDescription(lessonToEdit.description || "");
      setVideoUrl(lessonToEdit.video_url || "");
      setThumbnailUrl(lessonToEdit.thumbnail_url || "");
      if (DEFAULT_CATEGORIES.includes(lessonToEdit.category)) {
        setCategory(lessonToEdit.category);
        setCustomCategory("");
      } else {
        setCategory("outro");
        setCustomCategory(lessonToEdit.category || "");
      }
      setDisplayOrder(lessonToEdit.display_order || 0);
      setStatus(lessonToEdit.status || "published");
    } else {
      setTitle("");
      setDescription("");
      setVideoUrl("");
      setThumbnailUrl("");
      setCategory("Primeiros Passos");
      setCustomCategory("");
      setDisplayOrder(0);
      setStatus("published");
    }
  }, [lessonToEdit, isOpen]);

  const parsedVideo = parseVideoUrl(videoUrl);
  const autoThumbnail = parsedVideo.autoThumbnailUrl;
  const effectiveThumbnail = thumbnailUrl.trim() || autoThumbnail;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !videoUrl.trim()) return;

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl p-5 sm:p-6 bg-card border-border/80 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
            <Video className="h-5 w-5 text-primary" />
            {lessonToEdit ? "Editar Vídeo Aula" : "Publicar Nova Vídeo Aula"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Preencha as informações para disponibilizar o conteúdo em vídeo para os usuários.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
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
              className="h-10 text-sm bg-muted/20"
            />
          </div>

          {/* URL do Vídeo */}
          <div className="space-y-1.5">
            <Label htmlFor="lesson-url" className="text-xs font-semibold">
              URL do Vídeo (YouTube, Vimeo, Loom ou MP4) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lesson-url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              required
              className="h-10 text-sm bg-muted/20"
            />
            {parsedVideo.type !== "generic" && videoUrl && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <Sparkles className="h-3 w-3" />
                Plataforma identificada: {parsedVideo.type.toUpperCase()}
              </p>
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
              rows={3}
              className="text-xs sm:text-sm bg-muted/20 resize-none"
            />
          </div>

          {/* Categoria e Ordem */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-10 text-xs bg-muted/20">
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
                className="h-10 text-sm bg-muted/20"
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
                className="h-10 text-xs bg-muted/20"
              />
            </div>
          )}

          {/* Thumbnail / Capa */}
          <div className="space-y-1.5">
            <Label htmlFor="lesson-thumb" className="text-xs font-semibold">
              URL da Capa / Thumbnail (opcional)
            </Label>
            <Input
              id="lesson-thumb"
              placeholder="https://exemplo.com/capa.jpg (ou gerada automaticamente no YouTube)"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              className="h-10 text-xs bg-muted/20"
            />
            {effectiveThumbnail && (
              <div className="mt-2 relative w-32 aspect-video rounded-lg overflow-hidden border border-border/60 bg-muted">
                <img
                  src={effectiveThumbnail}
                  alt="Prévia da capa"
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white text-center py-0.5">
                  Prévia da capa
                </span>
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
              <SelectTrigger className="h-10 text-xs bg-muted/20">
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
          <DialogFooter className="pt-3 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="h-10 text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !title.trim() || !videoUrl.trim()}
              className="h-10 text-xs rounded-xl font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
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

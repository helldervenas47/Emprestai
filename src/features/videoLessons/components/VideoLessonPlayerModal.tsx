import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, Tag, ExternalLink } from "lucide-react";
import type { VideoLesson } from "../types/videoLesson";
import { parseVideoUrl } from "../lib/videoUrlParser";

interface VideoLessonPlayerModalProps {
  lesson: VideoLesson | null;
  isOpen: boolean;
  onClose: () => void;
}

export function VideoLessonPlayerModal({
  lesson,
  isOpen,
  onClose,
}: VideoLessonPlayerModalProps) {
  if (!lesson) return null;

  const parsed = parseVideoUrl(lesson.video_url);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-full max-w-4xl p-0 overflow-hidden bg-card border-border/80 rounded-2xl shadow-2xl gap-0">
        <DialogHeader className="p-4 sm:p-5 border-b border-border/40 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {lesson.category && (
              <Badge variant="secondary" className="text-xs px-2.5 py-0.5 font-medium">
                <Tag className="h-3 w-3 mr-1 text-primary" />
                {lesson.category}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(lesson.created_at)}
            </span>
          </div>
          <DialogTitle className="text-lg sm:text-xl font-bold text-foreground leading-tight">
            {lesson.title}
          </DialogTitle>
        </DialogHeader>

        {/* Container do Player com Aspect Ratio 16:9 */}
        <div className="relative w-full aspect-video bg-black flex items-center justify-center">
          {parsed.isIframe ? (
            <iframe
              src={parsed.embedUrl}
              title={lesson.title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <video
              src={parsed.embedUrl}
              controls
              playsInline
              autoPlay
              className="w-full h-full object-contain"
            >
              Seu navegador não suporta a reprodução direta deste vídeo.
            </video>
          )}
        </div>

        {/* Descrição e Detalhes da Aula */}
        {lesson.description && (
          <div className="p-4 sm:p-5 bg-muted/20 border-t border-border/40 max-h-48 overflow-y-auto">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Sobre esta aula
            </h4>
            <p className="text-xs sm:text-sm text-foreground whitespace-pre-line leading-relaxed">
              {lesson.description}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

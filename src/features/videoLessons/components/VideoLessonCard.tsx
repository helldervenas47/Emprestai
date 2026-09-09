import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Calendar, Video, Edit2, Trash2, Clock } from "lucide-react";
import type { VideoLesson } from "../types/videoLesson";
import { parseVideoUrl } from "../lib/videoUrlParser";

interface VideoLessonCardProps {
  lesson: VideoLesson;
  onWatch: (lesson: VideoLesson) => void;
  isAdmin?: boolean;
  onEdit?: (lesson: VideoLesson) => void;
  onDelete?: (lesson: VideoLesson) => void;
}

export function VideoLessonCard({
  lesson,
  onWatch,
  isAdmin = false,
  onEdit,
  onDelete,
}: VideoLessonCardProps) {
  const [imageError, setImageError] = useState(false);
  const parsed = parseVideoUrl(lesson.video_url);
  const thumbnail = !imageError ? lesson.thumbnail_url || parsed.autoThumbnailUrl : null;

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
    <Card className="group overflow-hidden border-border/60 bg-card hover:border-primary/40 transition-all duration-300 shadow-xs hover:shadow-md flex flex-col h-full rounded-2xl">
      {/* Container da Thumbnail com Aspect Ratio 16:9 */}
      <div
        className="relative w-full aspect-video bg-muted/40 overflow-hidden cursor-pointer flex items-center justify-center"
        onClick={() => onWatch(lesson)}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={lesson.title}
            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30 p-4 text-center">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-1 shadow-xs">
              <Video className="h-6 w-6" />
            </div>
          </div>
        )}
      </div>

      {/* Conteúdo do Card */}
      <CardContent className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(lesson.created_at)}
            </span>
            {lesson.duration && (
              <span className="text-[11px] bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-md flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {lesson.duration}
              </span>
            )}
          </div>

          <h3
            onClick={() => onWatch(lesson)}
            className="font-semibold text-base text-foreground leading-snug line-clamp-2 hover:text-primary transition-colors cursor-pointer"
          >
            {lesson.title}
          </h3>

          {lesson.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {lesson.description}
            </p>
          )}
        </div>

        {/* Botão de Assistir e Ações de Administrador */}
        <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
          <Button
            size="sm"
            onClick={() => onWatch(lesson)}
            className="flex-1 rounded-xl font-semibold gap-1.5 h-9 text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs transition-all flex items-center justify-center"
          >
            <Play className="h-3.5 w-3.5 fill-current shrink-0" />
            <span>Assistir aula</span>
          </Button>

          {isAdmin && (onEdit || onDelete) && (
            <div className="flex items-center gap-1 shrink-0">
              {onEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
                  onClick={() => onEdit(lesson)}
                  title="Editar aula"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              )}
              {onDelete && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-lg"
                  onClick={() => onDelete(lesson)}
                  title="Excluir aula"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

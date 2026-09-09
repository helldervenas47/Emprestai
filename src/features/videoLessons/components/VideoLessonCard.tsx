import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Calendar, Tag, Video, Edit2, Trash2, Clock } from "lucide-react";
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
    <Card className="group overflow-hidden border-border/60 bg-card/80 hover:bg-card hover:border-primary/40 transition-all duration-300 shadow-sm hover:shadow-md flex flex-col h-full rounded-2xl">
      {/* Container da Thumbnail com Aspect Ratio 16:9 */}
      <div
        className="relative w-full aspect-video bg-muted/50 overflow-hidden cursor-pointer flex items-center justify-center"
        onClick={() => onWatch(lesson)}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={lesson.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-background to-primary/5 p-4 text-center">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-2 shadow-xs">
              <Video className="h-6 w-6" />
            </div>
            <span className="text-xs font-medium text-muted-foreground truncate max-w-[80%]">
              {lesson.category || "Vídeo Aula"}
            </span>
          </div>
        )}

        {/* Overlay com Botão de Play */}
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          <div className="h-12 w-12 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-primary transition-all duration-300">
            <Play className="h-5 w-5 fill-current ml-0.5" />
          </div>
        </div>

        {/* Badges superiores na Capa */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5 z-10">
          {lesson.category && (
            <Badge className="bg-background/90 text-foreground backdrop-blur-xs text-[11px] font-medium border border-border/40 shadow-xs">
              <Tag className="h-3 w-3 mr-1 text-primary" />
              {lesson.category}
            </Badge>
          )}
          {lesson.status === "draft" && (
            <Badge variant="secondary" className="bg-amber-500/90 text-white font-semibold text-[10px]">
              Rascunho
            </Badge>
          )}
        </div>
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
            className="flex-1 rounded-xl font-medium gap-1.5 h-9 text-xs bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground transition-all"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Assistir aula
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

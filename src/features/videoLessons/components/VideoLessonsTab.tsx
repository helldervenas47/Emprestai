import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  GraduationCap,
  Search,
  Settings,
  Loader2,
  Clock,
  Play,
} from "lucide-react";
import { useVideoLessons } from "../hooks/useVideoLessons";
import { VideoLessonCard } from "./VideoLessonCard";
import { VideoLessonPlayerModal } from "./VideoLessonPlayerModal";
import { VideoLessonAdminManager } from "./VideoLessonAdminManager";
import type { VideoLesson } from "../types/videoLesson";

export function VideoLessonsTab() {
  const {
    publishedLessons,
    lessons,
    categories,
    isLoading,
    isError,
    isAdmin,
    createLesson,
    updateLesson,
    deleteLesson,
    isCreating,
    isUpdating,
    isDeleting,
  } = useVideoLessons();

  const [activeView, setActiveView] = useState<"catalog" | "admin">("catalog");
  const [searchTerm, setSearchTerm] = useState("");
  const [watchingLesson, setWatchingLesson] = useState<VideoLesson | null>(null);

  // Filtra as aulas publicadas pelo termo de busca (descrição ou título)
  const filteredLessons = publishedLessons.filter((lesson) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      lesson.title.toLowerCase().includes(term) ||
      (lesson.description || "").toLowerCase().includes(term) ||
      (lesson.category || "").toLowerCase().includes(term)
    );
  });

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-muted-foreground animate-in fade-in-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs font-medium">Carregando vídeo aulas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-300">
      {/* Botões de Alternância de Visão para Administradores */}
      {isAdmin && (
        <div className="flex items-center justify-between gap-3 pb-1">
          <div className="inline-flex rounded-xl bg-muted/60 p-1 border border-border/50 w-full sm:w-auto">
            <Button
              size="sm"
              variant={activeView === "catalog" ? "default" : "ghost"}
              onClick={() => setActiveView("catalog")}
              className="h-8 text-xs font-semibold rounded-lg gap-1.5 flex-1 sm:flex-none"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Aulas ({publishedLessons.length})
            </Button>
            <Button
              size="sm"
              variant={activeView === "admin" ? "default" : "ghost"}
              onClick={() => setActiveView("admin")}
              className="h-8 text-xs font-semibold rounded-lg gap-1.5 flex-1 sm:flex-none"
            >
              <Settings className="h-3.5 w-3.5" />
              Gerenciar Vídeo Aulas
            </Button>
          </div>
        </div>
      )}

      {/* Visualização: Painel de Administração do Admin */}
      {isAdmin && activeView === "admin" ? (
        <VideoLessonAdminManager
          lessons={lessons}
          categories={categories}
          onCreateLesson={createLesson}
          onUpdateLesson={updateLesson}
          onDeleteLesson={deleteLesson}
          onWatchLesson={(lesson) => setWatchingLesson(lesson)}
          isCreating={isCreating}
          isUpdating={isUpdating}
          isDeleting={isDeleting}
        />
      ) : publishedLessons.length === 0 ? (
        /* Estado Vazio: Quando NÃO existem vídeos publicados */
        <div className="py-12 sm:py-16 px-4 flex flex-col items-center justify-center text-center animate-in fade-in-50 duration-500">
          <Card className="max-w-lg w-full p-8 sm:p-10 border-border/60 bg-card/60 backdrop-blur-sm shadow-xl rounded-3xl space-y-6 text-center">
            <div className="mx-auto w-20 h-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shadow-inner animate-in zoom-in-75 duration-300">
              <GraduationCap className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20 text-xs px-3 py-1 font-semibold border border-primary/20">
                <Clock className="w-3.5 h-3.5 mr-1" />
                Em Breve
              </Badge>
              <h2 className="text-2xl font-bold text-foreground">
                Conteúdo em desenvolvimento
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed pt-1">
                Estamos preparando aulas para ajudar você a aproveitar ainda mais todos os recursos do aplicativo.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-muted/40 border border-border/60">
              <p className="text-xs font-semibold text-primary">
                As vídeo aulas estarão disponíveis em breve.
              </p>
            </div>

            {isAdmin && (
              <div className="pt-2">
                <Button
                  onClick={() => setActiveView("admin")}
                  className="rounded-xl text-xs font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Publicar Primeira Aula (Admin)
                </Button>
              </div>
            )}
          </Card>
        </div>
      ) : (
        /* Visualização do Catálogo: Quando EXISTEM vídeos publicados */
        <div className="space-y-4">
          {/* Campo Único de Pesquisa por Descrição/Título */}
          <div className="bg-card p-3 sm:p-4 rounded-2xl border border-border/60 shadow-xs">
            <div className="relative w-full">
              <Input
                placeholder="Pesquisar por descrição ou assunto da aula..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 pl-9 text-xs sm:text-sm bg-muted/20 rounded-xl w-full"
              />
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          {/* Grid Responsivo de Vídeos */}
          {filteredLessons.length === 0 ? (
            <Card className="border-border/60 bg-card text-center p-8 rounded-2xl">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Nenhuma aula encontrada para o termo pesquisado.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
              {filteredLessons.map((lesson) => (
                <VideoLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  onWatch={(l) => setWatchingLesson(l)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de Reprodução de Vídeo */}
      <VideoLessonPlayerModal
        lesson={watchingLesson}
        isOpen={!!watchingLesson}
        onClose={() => setWatchingLesson(null)}
      />
    </div>
  );
}

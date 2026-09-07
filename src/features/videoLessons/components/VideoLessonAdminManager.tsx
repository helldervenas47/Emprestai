import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Plus,
  Edit2,
  Trash2,
  Search,
  Play,
  ArrowUpDown,
  Tag,
  Video,
  Eye,
  FileEdit,
  CheckCircle2,
} from "lucide-react";
import type { VideoLesson, VideoLessonFormData } from "../types/videoLesson";
import { VideoLessonFormModal } from "./VideoLessonFormModal";

interface VideoLessonAdminManagerProps {
  lessons: VideoLesson[];
  categories: string[];
  onCreateLesson: (data: VideoLessonFormData) => Promise<any>;
  onUpdateLesson: (args: { id: string; formData: Partial<VideoLessonFormData> }) => Promise<any>;
  onDeleteLesson: (id: string) => Promise<any>;
  onWatchLesson: (lesson: VideoLesson) => void;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
}

export function VideoLessonAdminManager({
  lessons,
  categories,
  onCreateLesson,
  onUpdateLesson,
  onDeleteLesson,
  onWatchLesson,
  isCreating,
  isUpdating,
  isDeleting,
}: VideoLessonAdminManagerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [lessonToEdit, setLessonToEdit] = useState<VideoLesson | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<VideoLesson | null>(null);

  const filteredLessons = lessons.filter((lesson) => {
    const matchesSearch =
      lesson.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lesson.description || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || lesson.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleOpenCreate = () => {
    setLessonToEdit(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (lesson: VideoLesson) => {
    setLessonToEdit(lesson);
    setIsFormOpen(true);
  };

  const handleSave = async (data: VideoLessonFormData) => {
    if (lessonToEdit) {
      await onUpdateLesson({ id: lessonToEdit.id, formData: data });
    } else {
      await onCreateLesson(data);
    }
  };

  const handleConfirmDelete = async () => {
    if (!lessonToDelete) return;
    await onDeleteLesson(lessonToDelete.id);
    setLessonToDelete(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      {/* Barra Superior com Controles e Botão Nova Aula */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border/60 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto flex-1 max-w-lg">
          <div className="relative flex-1">
            <Input
              placeholder="Buscar por título ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 pl-9 text-xs bg-muted/20 rounded-xl"
            />
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1">
            <Button
              size="sm"
              variant={selectedCategory === "all" ? "default" : "outline"}
              onClick={() => setSelectedCategory("all")}
              className="h-9 text-xs rounded-xl whitespace-nowrap"
            >
              Todas ({lessons.length})
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat}
                size="sm"
                variant={selectedCategory === cat ? "default" : "outline"}
                onClick={() => setSelectedCategory(cat)}
                className="h-9 text-xs rounded-xl whitespace-nowrap"
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>

        <Button
          onClick={handleOpenCreate}
          className="h-10 px-4 rounded-xl text-xs font-semibold gap-1.5 shadow-sm w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
          Adicionar Vídeo Aula
        </Button>
      </div>

      {/* Tabela / Grid de Gerenciamento */}
      {filteredLessons.length === 0 ? (
        <Card className="border-border/60 bg-card text-center p-8 rounded-2xl">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3 text-muted-foreground">
            <Video className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-foreground text-sm">
            Nenhuma vídeo aula encontrada
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            {searchTerm || selectedCategory !== "all"
              ? "Tente ajustar os filtros de busca para localizar o conteúdo."
              : "Clique no botão acima para cadastrar a primeira aula em vídeo."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredLessons.map((lesson) => (
            <Card
              key={lesson.id}
              className="border-border/60 bg-card hover:border-border transition-colors p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                {/* Miniatura ou Ícone */}
                <div
                  className="relative h-14 w-24 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center cursor-pointer border border-border/40 group"
                  onClick={() => onWatchLesson(lesson)}
                >
                  {lesson.thumbnail_url ? (
                    <img
                      src={lesson.thumbnail_url}
                      alt={lesson.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <Video className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                    <Play className="h-4 w-4 text-white fill-current" />
                  </div>
                </div>

                {/* Dados da Aula */}
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={lesson.status === "published" ? "default" : "secondary"}
                      className={`text-[10px] font-semibold px-2 py-0.5 ${
                        lesson.status === "published"
                          ? "bg-emerald-600 text-white"
                          : "bg-amber-500 text-white"
                      }`}
                    >
                      {lesson.status === "published" ? "Publicado" : "Rascunho"}
                    </Badge>
                    {lesson.category && (
                      <Badge variant="outline" className="text-[10px] font-medium border-border/60">
                        <Tag className="h-2.5 w-2.5 mr-1 text-primary" />
                        {lesson.category}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.5 rounded">
                      Ordem: #{lesson.display_order}
                    </span>
                  </div>

                  <h4
                    className="font-semibold text-sm text-foreground truncate cursor-pointer hover:text-primary transition-colors"
                    onClick={() => onWatchLesson(lesson)}
                  >
                    {lesson.title}
                  </h4>

                  {lesson.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {lesson.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onWatchLesson(lesson)}
                  className="h-8 text-xs rounded-xl gap-1.5"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Visualizar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenEdit(lesson)}
                  className="h-8 text-xs rounded-xl gap-1.5"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLessonToDelete(lesson)}
                  className="h-8 text-xs rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Formulário (Criar / Editar) */}
      <VideoLessonFormModal
        lessonToEdit={lessonToEdit}
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setLessonToEdit(null);
        }}
        onSave={handleSave}
        isSaving={isCreating || isUpdating}
        existingCategories={categories}
      />

      {/* Diálogo de Confirmação de Exclusão */}
      <AlertDialog
        open={!!lessonToDelete}
        onOpenChange={(open) => !open && setLessonToDelete(null)}
      >
        <AlertDialogContent className="max-w-md rounded-2xl bg-card border-border/80 p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-foreground">
              Excluir esta vídeo aula?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Essa ação removerá o conteúdo da área de Vídeo Aulas para todos os usuários.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-3 gap-2">
            <AlertDialogCancel
              disabled={isDeleting}
              className="h-10 text-xs rounded-xl"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="h-10 text-xs rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

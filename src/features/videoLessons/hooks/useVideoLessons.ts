import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { VideoLesson, VideoLessonFormData } from "../types/videoLesson";

export function useVideoLessons() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const isAdmin = role === "admin";

  const {
    data: lessons = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<VideoLesson[]>({
    queryKey: ["video_lessons", user?.id, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from("video_lessons" as any)
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (!isAdmin) {
        query = query.eq("status", "published");
      }

      const { data, error } = await query;
      if (error) {
        throw error;
      }
      return (data as unknown as VideoLesson[]) || [];
    },
    enabled: !!user,
  });

  // Mutação: Criar nova vídeo aula
  const createMutation = useMutation({
    mutationFn: async (formData: VideoLessonFormData) => {
      const payload = {
        title: formData.title.trim(),
        description: formData.description?.trim() || null,
        video_url: formData.video_url.trim(),
        thumbnail_url: formData.thumbnail_url?.trim() || null,
        category: formData.category?.trim() || "Geral",
        display_order: Number(formData.display_order) || 0,
        status: formData.status || "published",
        created_by: user?.id || null,
      };

      const { data, error } = await supabase
        .from("video_lessons" as any)
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as VideoLesson;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video_lessons"] });
      toast.success("Vídeo aula cadastrada com sucesso!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao cadastrar vídeo aula.");
    },
  });

  // Mutação: Atualizar vídeo aula existente
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      formData,
    }: {
      id: string;
      formData: Partial<VideoLessonFormData>;
    }) => {
      const payload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (formData.title !== undefined) payload.title = formData.title.trim();
      if (formData.description !== undefined) payload.description = formData.description.trim() || null;
      if (formData.video_url !== undefined) payload.video_url = formData.video_url.trim();
      if (formData.thumbnail_url !== undefined) payload.thumbnail_url = formData.thumbnail_url.trim() || null;
      if (formData.category !== undefined) payload.category = formData.category.trim() || "Geral";
      if (formData.display_order !== undefined) payload.display_order = Number(formData.display_order) || 0;
      if (formData.status !== undefined) payload.status = formData.status;

      const { data, error } = await supabase
        .from("video_lessons" as any)
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as VideoLesson;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video_lessons"] });
      toast.success("Vídeo aula atualizada com sucesso!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao atualizar vídeo aula.");
    },
  });

  // Mutação: Excluir vídeo aula
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("video_lessons" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video_lessons"] });
      toast.success("Vídeo aula removida com sucesso.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao excluir vídeo aula.");
    },
  });

  // Aulas publicadas (visíveis para todos)
  const publishedLessons = lessons.filter((l) => l.status === "published");
  // Aulas em rascunho (visíveis apenas para admin)
  const draftLessons = lessons.filter((l) => l.status === "draft");

  // Lista de categorias únicas existentes
  const categories = Array.from(
    new Set(lessons.map((l) => l.category || "Geral"))
  ).filter(Boolean);

  return {
    lessons,
    publishedLessons,
    draftLessons,
    categories,
    isLoading,
    isError,
    error,
    isAdmin,
    refetch,
    createLesson: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateLesson: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteLesson: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

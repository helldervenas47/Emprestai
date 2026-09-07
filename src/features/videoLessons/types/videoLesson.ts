export type VideoLessonStatus = "published" | "draft";

export interface VideoLesson {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  category: string;
  display_order: number;
  status: VideoLessonStatus;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoLessonFormData {
  title: string;
  description?: string;
  video_url: string;
  thumbnail_url?: string;
  category?: string;
  display_order?: number;
  status?: VideoLessonStatus;
}

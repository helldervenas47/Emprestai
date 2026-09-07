import { describe, it, expect } from "vitest";
import { parseVideoUrl } from "@/features/videoLessons/lib/videoUrlParser";
import type { VideoLesson } from "@/features/videoLessons/types/videoLesson";

describe("Video Lessons URL Parser & Utilities", () => {
  it("correctly parses standard YouTube watch URLs", () => {
    const parsed = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(parsed.type).toBe("youtube");
    expect(parsed.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0");
    expect(parsed.autoThumbnailUrl).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(parsed.isIframe).toBe(true);
  });

  it("correctly parses short youtu.be URLs", () => {
    const parsed = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ?t=10");
    expect(parsed.type).toBe("youtube");
    expect(parsed.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0");
    expect(parsed.autoThumbnailUrl).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });

  it("correctly parses YouTube shorts URLs", () => {
    const parsed = parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ");
    expect(parsed.type).toBe("youtube");
    expect(parsed.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0");
  });

  it("correctly parses Vimeo video URLs", () => {
    const parsed = parseVideoUrl("https://vimeo.com/76979871");
    expect(parsed.type).toBe("vimeo");
    expect(parsed.embedUrl).toBe("https://player.vimeo.com/video/76979871?autoplay=1");
    expect(parsed.isIframe).toBe(true);
  });

  it("correctly parses Loom video URLs", () => {
    const parsed = parseVideoUrl("https://www.loom.com/share/a1b2c3d4e5f6");
    expect(parsed.type).toBe("loom");
    expect(parsed.embedUrl).toBe("https://www.loom.com/embed/a1b2c3d4e5f6?autoplay=1");
    expect(parsed.isIframe).toBe(true);
  });

  it("identifies direct video file URLs (mp4, webm)", () => {
    const parsedMp4 = parseVideoUrl("https://example.com/videos/tutorial.mp4");
    expect(parsedMp4.type).toBe("direct");
    expect(parsedMp4.embedUrl).toBe("https://example.com/videos/tutorial.mp4");
    expect(parsedMp4.isIframe).toBe(false);
  });

  it("handles empty or invalid URLs gracefully", () => {
    const parsed = parseVideoUrl("");
    expect(parsed.type).toBe("generic");
    expect(parsed.embedUrl).toBe("");
  });

  it("sorts video lessons by display_order ascending", () => {
    const lessons: Partial<VideoLesson>[] = [
      { id: "1", title: "Aula 3", display_order: 3, status: "published" },
      { id: "2", title: "Aula 1", display_order: 1, status: "published" },
      { id: "3", title: "Aula 2", display_order: 2, status: "published" },
    ];

    const sorted = [...lessons].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    expect(sorted[0].title).toBe("Aula 1");
    expect(sorted[1].title).toBe("Aula 2");
    expect(sorted[2].title).toBe("Aula 3");
  });
});

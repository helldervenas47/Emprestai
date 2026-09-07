export interface ParsedVideoInfo {
  type: "youtube" | "vimeo" | "loom" | "direct" | "generic";
  embedUrl: string;
  autoThumbnailUrl?: string;
  isIframe: boolean;
}

/**
 * Extrai ID e gera URL de embed compatível e responsiva para diferentes plataformas de vídeo.
 */
export function parseVideoUrl(rawUrl: string): ParsedVideoInfo {
  if (!rawUrl || typeof rawUrl !== "string") {
    return {
      type: "generic",
      embedUrl: "",
      isIframe: false,
    };
  }

  const url = rawUrl.trim();

  // 1. YouTube
  // Formatos:
  // - https://www.youtube.com/watch?v=VIDEO_ID
  // - https://youtu.be/VIDEO_ID
  // - https://www.youtube.com/embed/VIDEO_ID
  // - https://www.youtube.com/shorts/VIDEO_ID
  const youtubeRegex =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const ytMatch = url.match(youtubeRegex);

  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    return {
      type: "youtube",
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`,
      autoThumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      isIframe: true,
    };
  }

  // 2. Vimeo
  // Formatos: https://vimeo.com/VIDEO_ID ou https://player.vimeo.com/video/VIDEO_ID
  const vimeoRegex = /(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d+)/i;
  const vimeoMatch = url.match(vimeoRegex);

  if (vimeoMatch && vimeoMatch[1]) {
    const videoId = vimeoMatch[1];
    return {
      type: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${videoId}?autoplay=1`,
      isIframe: true,
    };
  }

  // 3. Loom
  // Formatos: https://www.loom.com/share/VIDEO_ID ou https://www.loom.com/embed/VIDEO_ID
  const loomRegex = /loom\.com\/(?:share|embed)\/([a-f0-9]+)/i;
  const loomMatch = url.match(loomRegex);

  if (loomMatch && loomMatch[1]) {
    const videoId = loomMatch[1];
    return {
      type: "loom",
      embedUrl: `https://www.loom.com/embed/${videoId}?autoplay=1`,
      isIframe: true,
    };
  }

  // 4. Arquivo de vídeo direto (MP4, WebM, OGG, M3U8, MOV, MKV ou Supabase Storage)
  const isDirect =
    /\.(mp4|webm|ogg|m3u8|mov|mkv)($|\?)/i.test(url) ||
    url.includes("/storage/v1/object/public/video-lessons/");
  if (isDirect) {
    return {
      type: "direct",
      embedUrl: url,
      isIframe: false,
    };
  }

  // 5. Genérico (se já for uma URL de iframe/embed válida)
  return {
    type: "generic",
    embedUrl: url,
    isIframe: true,
  };
}

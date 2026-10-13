// Форматы кадра и площадки выдачи.
//
// Безопасные зоны 9:16 — общий запас под интерфейс Reels, TikTok и Shorts (подпись и кнопки снизу,
// кнопки справа, ник сверху); 16:9 — title safe 5 %. Значения — отступы от краёв, px.

export type FormatKey = "16x9" | "16x9-4k" | "9x16" | "4x5" | "1x1";

export const FORMATS: Record<FormatKey, { width: number; height: number; safe: [number, number, number, number]; note: string }> = {
  "16x9": { width: 1920, height: 1080, safe: [96, 54, 96, 54], note: "уроки, YouTube" },
  "16x9-4k": { width: 3840, height: 2160, safe: [192, 108, 192, 108], note: "YouTube 4K — исходник должен быть 4K, иначе апскейл" },
  "9x16": { width: 1080, height: 1920, safe: [60, 220, 140, 420], note: "Reels, TikTok, Shorts" },
  "4x5": { width: 1080, height: 1350, safe: [60, 80, 60, 120], note: "лента Instagram" },
  "1x1": { width: 1080, height: 1080, safe: [60, 60, 60, 60], note: "квадрат" },
};

export type PlatformKey = "youtube" | "social" | "archive";

/**
 * Выдача из мастера. Громкость — двухпроходный loudnorm: −14 LUFS, true peak −1 dBTP (YouTube,
 * Instagram, TikTok нормализуют к ~−14, тише — звучит тише конкурентов, громче — площадка убавит).
 */
export const PLATFORMS: Record<PlatformKey, { video: string[]; audio: string[]; ext: string; note: string }> = {
  youtube: {
    // CRF 16 + slow: запас качества, YouTube всё равно перекодирует; GOP ½ с, как советует YouTube.
    video: ["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-bf", "2", "-g", "GOP_HALF_SECOND", "-pix_fmt", "yuv420p"],
    audio: ["-c:a", "aac", "-b:a", "320k", "-ar", "48000"],
    ext: "mp4",
    note: "H.264 High, CRF 16, AAC 320k, −14 LUFS",
  },
  social: {
    // Instagram/TikTok режут битрейт сами; потолок 20 Мбит/с, чтобы файл не отклонили по размеру.
    video: ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-maxrate", "20M", "-bufsize", "40M", "-profile:v", "high", "-g", "GOP_HALF_SECOND", "-pix_fmt", "yuv420p"],
    audio: ["-c:a", "aac", "-b:a", "256k", "-ar", "48000"],
    ext: "mp4",
    note: "H.264 High, CRF 18 ≤ 20 Мбит/с, AAC 256k, −14 LUFS",
  },
  archive: {
    // Мастер без потерь качества для монтажа (Premiere) — копия видео, звук нормализуется.
    video: ["-c:v", "copy"],
    audio: ["-c:a", "pcm_s24le", "-ar", "48000"],
    ext: "mov",
    note: "видео без перекодирования, PCM 24 бит, −14 LUFS",
  },
};

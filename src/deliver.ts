// Выдача для площадок из мастер-файла: ffmpeg, двухпроходная нормализация громкости, теги BT.709.

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { PLATFORMS, type PlatformKey } from "./formats.js";

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) =>
      err ? reject(new Error(`${cmd}: ${stderr.slice(-2000) || err.message}`)) : resolve({ stdout, stderr }),
    ),
  );
}

type Probe = { fps: number; width: number; height: number; hasAudio: boolean; duration: number };

async function probe(file: string): Promise<Probe> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]);
  const j = JSON.parse(stdout);
  const v = j.streams.find((s: any) => s.codec_type === "video");
  if (!v) throw new Error(`В ${file} нет видео`);
  const [n, d] = String(v.r_frame_rate).split("/").map(Number);
  return { fps: n / (d || 1), width: v.width, height: v.height, hasAudio: j.streams.some((s: any) => s.codec_type === "audio"), duration: Number(j.format.duration) };
}

const LOUDNESS = { I: -14, TP: -1, LRA: 11 };

/** Первый проход loudnorm: замер громкости. */
async function measureLoudness(file: string) {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:print_format=json`, "-f", "null", "-"]);
  const json = stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1);
  return JSON.parse(json) as { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string };
}

export async function deliver(master: string, platform: PlatformKey, outFile?: string) {
  const spec = PLATFORMS[platform];
  if (!spec) throw new Error(`Нет площадки ${platform}. Есть: ${Object.keys(PLATFORMS).join(", ")}`);
  const info = await probe(master);
  const out = outFile ?? master.replace(/(-master)?\.[^.]+$/, `-${platform}.${spec.ext}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const gop = String(Math.max(1, Math.round(info.fps / 2)));
  const video = spec.video.map((a) => (a === "GOP_HALF_SECOND" ? gop : a));
  // Только видео и звук: дорожку таймкода ProRes (tmcd) в выдачу не берём.
  const args = ["-hide_banner", "-y", "-i", master, "-map", "0:v:0", "-map", "0:a:0?", "-dn"];
  if (spec.video[1] !== "copy") {
    // ProRes 4:2:2 10 бит → 4:2:0 8 бит с честной матрицей BT.709 и точным округлением.
    args.push("-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int");
  }
  args.push(...video, "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709");

  let loudness: Record<string, number> | undefined;
  if (info.hasAudio) {
    const m = await measureLoudness(master);
    if (Number(m.input_i) > -70) {
      args.push(
        "-af",
        `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
        ...spec.audio,
      );
      loudness = { inputLufs: Number(m.input_i), inputTruePeak: Number(m.input_tp) };
    } else {
      args.push(...spec.audio); // тишина — нормализовать нечего
    }
  } else {
    args.push("-an");
  }
  if (spec.ext === "mp4") args.push("-movflags", "+faststart", "-write_tmcd", "0");
  args.push(out);

  const started = Date.now();
  await run("ffmpeg", args);
  const result = await probe(out);
  return {
    file: out,
    platform,
    spec: spec.note,
    size: `${result.width}×${result.height}`,
    fps: Math.round(result.fps * 1000) / 1000,
    duration: Math.round(result.duration * 100) / 100,
    megabytes: Math.round(fs.statSync(out).size / 1024 / 102.4) / 10,
    audio: info.hasAudio ? (loudness ?? "тишина") : "нет звука",
    seconds: Math.round((Date.now() - started) / 100) / 10,
  };
}

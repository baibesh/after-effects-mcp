// Кадры для модели: save_frames в AE → правка яркости 32 бит → один кадр или лист → base64.

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { OUT_DIR, runInAE, type RunResult } from "./runner.js";

const FRAMES_DIR = path.join(OUT_DIR, "frames", "mcp");

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile("ffmpeg", ["-loglevel", "error", "-y", ...args], (err, _o, stderr) =>
      err ? reject(new Error(`ffmpeg: ${stderr || err.message}`)) : resolve(),
    ),
  );
}

/** Есть ли в кадрах пиксели с альфой < 1: сырые RGBA 16 бит (уменьшенные без сглаживания), каждый 4-й канал. */
async function hasTransparency(files: string[]): Promise<boolean> {
  for (const f of files) {
    const raw = await new Promise<Buffer>((resolve, reject) =>
      execFile(
        "ffmpeg",
        ["-v", "error", "-i", f, "-vf", "scale=480:-1:flags=neighbor,format=rgba64le", "-f", "rawvideo", "-"],
        { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
        (err, so, se) => (err ? reject(new Error(String(se) || err.message)) : resolve(so)),
      ),
    );
    for (let i = 6; i < raw.length; i += 8) if (raw.readUInt16LE(i) < 65535) return true;
  }
  return false;
}

export type Frames = { image: string; mimeType: "image/png"; info: Record<string, unknown> };

/**
 * @param width ширина одного кадра в ответе (px); лист — до 4 кадров в ряд
 */
export async function grabFrames(comp: string, times: number[], width: number): Promise<{ ok: true; frames: Frames } | { ok: false; error: string }> {
  const prefix = `f${Date.now()}`;
  let res: RunResult = await runInAE("save_frames", { comp, times, dir: FRAMES_DIR, prefix });
  if (!res.ok) return res;
  // 32 бита + прозрачность: цвет полупрозрачных пикселей не восстановить — переснимаем с подложкой.
  if (res.result.bitsPerChannel === 32 && !res.result.missingFiles?.length && (await hasTransparency(res.result.pendingFiles))) {
    res = await runInAE("save_frames", { comp, times, dir: FRAMES_DIR, prefix, flatten: true });
    const dropped = await runInAE("drop_flat", {});
    if (!res.ok) return res;
    if (!dropped.ok) return { ok: false, error: `Кадры сняты, но временная композиция __mcp_flat не удалена: ${dropped.error}` };
  }
  const r = res.result as { pendingFiles: string[]; missingFiles: string[]; bitsPerChannel: number; bgColor: number[]; width: number; height: number; comp: string };
  if (r.missingFiles?.length) return { ok: false, error: `AE не дописал кадры: ${r.missingFiles.join(", ")}` };

  // В 32-битном проекте saveFrameToPng пишет PNG с яркостью, делённой ровно на 10; рендер при этом верный.
  // Фон композиции в PNG не попадает (там альфа) — кладём кадр на bgColor, как при рендере без альфы.
  // Умножаем в 16 битах: иначе ffmpeg сначала сводит кадр к 8 битам и цвет плывёт (6225/257 → 24 → ×10 = 240).
  const times10 = "lutrgb=r='min(val*10,maxval)':g='min(val*10,maxval)':b='min(val*10,maxval)',";
  const levels = "format=rgba64le," + (r.bitsPerChannel === 32 ? times10 : "");
  const hex = r.bgColor.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0")).join("");
  const w = Math.min(width, r.width);
  const flat: string[] = [];
  for (const [i, src] of r.pendingFiles.entries()) {
    const dst = path.join(FRAMES_DIR, `${prefix}-flat-${i}.png`);
    await ffmpeg([
      "-f", "lavfi", "-i", `color=c=0x${hex}:s=${r.width}x${r.height}`, "-i", src,
      "-filter_complex", `[0:v]format=rgba64le[b];[1:v]${levels}format=rgba64le[f];[b][f]overlay=format=auto,scale=${w}:-2:flags=lanczos,format=rgb24`,
      "-frames:v", "1", dst,
    ]);
    flat.push(dst);
  }
  const out = path.join(FRAMES_DIR, `${prefix}-view.png`);
  if (flat.length === 1) {
    fs.renameSync(flat[0], out);
  } else {
    const cols = Math.min(4, flat.length);
    const rows = Math.ceil(flat.length / cols);
    await ffmpeg([
      "-framerate", "1", "-i", path.join(FRAMES_DIR, `${prefix}-flat-%d.png`),
      "-vf", `tile=${cols}x${rows}:padding=8:color=0x808080,format=rgb24`,
      "-frames:v", "1", out,
    ]);
  }
  for (const f of flat) fs.rmSync(f, { force: true });
  const image = fs.readFileSync(out).toString("base64");
  // Держим 30 последних листов для просмотра человеком, остальные удаляем.
  const views = fs.readdirSync(FRAMES_DIR).filter((f) => f.endsWith("-view.png")).sort();
  for (const old of views.slice(0, -30)) fs.rmSync(path.join(FRAMES_DIR, old), { force: true });
  for (const f of [...r.pendingFiles]) fs.rmSync(f, { force: true });
  return {
    ok: true,
    frames: {
      image,
      mimeType: "image/png",
      info: { comp: r.comp, size: `${r.width}×${r.height}`, times, layout: times.length > 1 ? "лист слева направо, сверху вниз" : "один кадр", file: out },
    },
  };
}

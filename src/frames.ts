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

export type Frames = { image: string; mimeType: "image/png"; info: Record<string, unknown> };

/**
 * @param width ширина одного кадра в ответе (px); лист — до 4 кадров в ряд
 */
export async function grabFrames(comp: string, times: number[], width: number): Promise<{ ok: true; frames: Frames } | { ok: false; error: string }> {
  const prefix = `f${Date.now()}`;
  const res: RunResult = await runInAE("save_frames", { comp, times, dir: FRAMES_DIR, prefix });
  if (!res.ok) return res;
  const r = res.result as { pendingFiles: string[]; missingFiles: string[]; bitsPerChannel: number; width: number; height: number; comp: string };
  if (r.missingFiles?.length) return { ok: false, error: `AE не дописал кадры: ${r.missingFiles.join(", ")}` };

  // В 32-битном проекте saveFrameToPng пишет PNG с яркостью, делённой ровно на 10; рендер при этом верный.
  const filters: string[] = [];
  if (r.bitsPerChannel === 32) filters.push("colorlevels=rimax=0.1:gimax=0.1:bimax=0.1");
  filters.push(`scale=${Math.min(width, r.width)}:-2`);
  const out = path.join(FRAMES_DIR, `${prefix}-view.png`);
  if (r.pendingFiles.length === 1) {
    await ffmpeg(["-i", r.pendingFiles[0], "-vf", [...filters, "format=rgb24"].join(","), out]);
  } else {
    const cols = Math.min(4, r.pendingFiles.length);
    const rows = Math.ceil(r.pendingFiles.length / cols);
    await ffmpeg([
      "-framerate", "1", "-i", path.join(FRAMES_DIR, `${prefix}-%d.png`),
      "-vf", [...filters, `tile=${cols}x${rows}:padding=8:color=0x808080`, "format=rgb24"].join(","),
      "-frames:v", "1", out,
    ]);
  }
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

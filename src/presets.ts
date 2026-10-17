// Пресеты: свои (presets/*.json — данные, presets/**/*.ffx — из AE) и штатные Adobe (adobe:<путь> в папке Presets AE).

import * as fs from "node:fs";
import * as path from "node:path";
import { REPO_ROOT } from "./runner.js";

export const PRESETS_DIR = path.join(REPO_ROOT, "presets");

function adobeDir(): string | null {
  const app = fs.readdirSync("/Applications").filter((n) => /^Adobe After Effects \d+$/.test(n)).sort().pop();
  const dir = app && path.join("/Applications", app, "Presets");
  return dir && fs.existsSync(dir) ? dir : null;
}

function walk(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, ext) : e.name.endsWith(ext) ? [p] : [];
  });
}

export type PresetInfo = { name: string; kind: "json" | "ffx"; description?: string; use?: string; frames24?: number };

export function listPresets(source: "local" | "adobe", query?: string): PresetInfo[] {
  const q = query?.toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);
  if (source === "adobe") {
    const dir = adobeDir();
    if (!dir) return [];
    return walk(dir, ".ffx")
      .map((f) => `adobe:${path.relative(dir, f).replace(/\.ffx$/, "")}`)
      .filter(match)
      .sort()
      .map((name) => ({ name, kind: "ffx" as const }));
  }
  const json = walk(PRESETS_DIR, ".json").map((f) => {
    const p = JSON.parse(fs.readFileSync(f, "utf8"));
    const frames = Math.max(0, ...(p.tracks ?? []).flatMap((t: any) => (t.keys ?? []).map((k: any) => k[0])));
    return { name: path.relative(PRESETS_DIR, f).replace(/\.json$/, ""), kind: "json" as const, description: p.description, use: p.use, frames24: frames || undefined };
  });
  const ffx = walk(PRESETS_DIR, ".ffx").map((f) => {
    const note = f.replace(/\.ffx$/, ".md");
    return { name: path.relative(PRESETS_DIR, f).replace(/\.ffx$/, ""), kind: "ffx" as const, description: fs.existsSync(note) ? fs.readFileSync(note, "utf8").trim().split("\n")[0] : undefined };
  });
  return ([...json, ...ffx] as PresetInfo[]).filter((p) => match(`${p.name} ${p.description ?? ""} ${p.use ?? ""}`)).sort((a, b) => a.name.localeCompare(b.name));
}

/** Аргументы для apply_preset в AE: объект JSON-пресета или путь к .ffx. Имя не выходит за свою папку. */
export function resolvePreset(name: string): { preset: unknown } | { ffx: string } {
  if (name.startsWith("adobe:")) {
    const dir = adobeDir();
    if (!dir) throw new Error("Папка Presets After Effects не найдена");
    const file = path.resolve(dir, name.slice(6) + ".ffx");
    if (!file.startsWith(dir + path.sep) || !fs.existsSync(file)) {
      throw new Error(`Нет штатного пресета ${name}. Похожие: ${nearest(name, listPresets("adobe").map((p) => p.name), 8).join(", ")} (list_presets source=adobe)`);
    }
    return { ffx: file };
  }
  const base = path.resolve(PRESETS_DIR, name);
  if (!base.startsWith(PRESETS_DIR + path.sep)) throw new Error(`Пресет ${name} вне папки presets/`);
  if (fs.existsSync(base + ".json")) return { preset: JSON.parse(fs.readFileSync(base + ".json", "utf8")) };
  if (fs.existsSync(base + ".ffx")) return { ffx: base + ".ffx" };
  const local = listPresets("local").map((p) => p.name);
  throw new Error(`Нет пресета ${name}. Похожие: ${nearest(name, local, 8).join(", ")} (всего ${local.length} — list_presets; движения кита — "move:<имя>", list_motions)`);
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length];
}

/** Ближайшие имена для подсказки: сначала с подстрокой (по последнему звену пути), потом по расстоянию правки. */
export function nearest(name: string, names: string[], max: number): string[] {
  const q = name.toLowerCase();
  const leaf = (s: string) => s.toLowerCase().split("/").pop() ?? s;
  const score = (n: string) => {
    const l = leaf(n);
    const ql = leaf(q);
    return Math.min(editDistance(q, n.toLowerCase()), editDistance(ql, l)) - (n.toLowerCase().includes(ql) || ql.includes(l) ? 100 : 0);
  };
  return names.map((n) => ({ n, d: score(n) })).sort((a, b) => a.d - b.d || a.n.localeCompare(b.n)).slice(0, max).map((r) => r.n);
}

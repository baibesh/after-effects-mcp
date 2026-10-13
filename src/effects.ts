// Эффекты по словарям с живого AE 26.5 (tools/data): matchName, имя, категория, битность, параметры.

import * as fs from "node:fs";
import * as path from "node:path";
import { REPO_ROOT } from "./runner.js";

type EffectInfo = { matchName: string; name: string; category: string; bpc: number | null; params?: string[] };

let cache: EffectInfo[] | null = null;

function effects(): EffectInfo[] {
  if (cache) return cache;
  const dir = path.join(REPO_ROOT, "tools", "data");
  const names = JSON.parse(fs.readFileSync(path.join(dir, "matchnames.json"), "utf8")).effects as Record<string, { name: string; category: string; bpc: number | null }>;
  const paramsFile = path.join(dir, "effect-params-names.json");
  const params = fs.existsSync(paramsFile) ? (JSON.parse(fs.readFileSync(paramsFile, "utf8")) as Record<string, { params: Record<string, [string, string]> }>) : {};
  cache = Object.entries(names).map(([matchName, e]) => ({
    matchName,
    name: e.name,
    category: e.category,
    bpc: e.bpc,
    params: params[matchName]
      ? Object.entries(params[matchName].params)
          .filter(([, [n, type]]) => n && type !== "group")
          .map(([m, [n]]) => `${n} (${m})`)
      : undefined,
  }));
  return cache;
}

export function listEffects(query?: string) {
  const q = query?.toLowerCase();
  return effects()
    .filter((e) => e.category !== "Obsolete")
    .filter((e) => !q || `${e.name} ${e.category} ${e.matchName}`.toLowerCase().includes(q))
    .slice(0, 60);
}

/** matchName по имени («Gaussian Blur»), matchName или подстроке; устаревшие (Obsolete) — только по точному matchName. */
export function resolveEffect(query: string): EffectInfo {
  const all = effects();
  const exact = all.find((e) => e.matchName === query) ?? all.find((e) => e.category !== "Obsolete" && e.name.toLowerCase() === query.toLowerCase());
  if (exact) return exact;
  const similar = listEffects(query).slice(0, 8);
  if (similar.length === 1) return similar[0];
  throw new Error(
    similar.length ? `Эффект «${query}» неоднозначен: ${similar.map((e) => `${e.name} (${e.matchName})`).join(", ")}` : `Нет эффекта «${query}» — list_effects для поиска`,
  );
}

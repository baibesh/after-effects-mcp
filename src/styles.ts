// Стили серии (kit/styles/*.json) и кривые (kit/library/ease.json) на стороне сервера.
// Слияние и extends — тот же код, что в AE: чистые функции kit/style.jsx выполняются здесь в песочнице vm.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { nearest } from "./presets.js";
import { REPO_ROOT } from "./runner.js";

export const KIT_DIR = path.join(REPO_ROOT, "kit");
const STYLE_DIR = path.join(KIT_DIR, "styles");

type Kit = {
  JSON: JSON;
  kbStyleResolve(id: string, read: (id: string) => unknown): any;
  kbCurveSegment(bezier: number[], delta: number[], duration: number): any;
  kbCurvePoints(curve: unknown, amp: number): number[][];
};

let kit: Kit | null = null;

/** Чистые функции kit/style.jsx: обращения к File и API AE в них только внутри функций, которые здесь не вызываются. */
export function styleKit(): Kit {
  if (!kit) {
    const ctx = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(KIT_DIR, "style.jsx"), "utf8"), ctx, { filename: "kit/style.jsx" });
    ctx.JSON = vm.runInContext("JSON", ctx);
    kit = ctx as unknown as Kit;
  }
  return kit;
}

/** Папки поиска: стили проекта (ae/styles) первыми, потом кита. */
function styleDirs(projectAeDir?: string): string[] {
  return projectAeDir ? [path.join(projectAeDir, "styles"), STYLE_DIR] : [STYLE_DIR];
}

/** Данные стиля: JSON разбирается внутри песочницы — kit/style.jsx проверяет `instanceof Array` её собственного Array. */
function readStyle(id: string, dirs: string[]): unknown {
  if (!/^[a-z0-9_][a-z0-9_-]*$/.test(id)) throw new Error(`Имя стиля «${id}»: строчные латинские буквы, цифры, - и _`);
  for (const dir of dirs) {
    const file = path.join(dir, `${id}.json`);
    if (fs.existsSync(file)) {
      try {
        return styleKit().JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (e) {
        throw new Error(`Не разобрать JSON ${file}: ${(e as Error).message}`);
      }
    }
  }
  return null;
}

export function resolveStyle(id: string, projectAeDir?: string): any {
  const dirs = styleDirs(projectAeDir);
  // Объект из песочницы vm — через JSON, чтобы прототипы были обычными.
  return JSON.parse(JSON.stringify(styleKit().kbStyleResolve(id, (s) => readStyle(s, dirs))));
}

export type StyleInfo = { id: string; extends?: unknown; description?: string; source: string; swatch?: Record<string, string>; fonts?: unknown };

/** Стили без служебных (_base): id, от чего наследует, описание, ключевые цвета и шрифты итогового стиля. */
export function listStyles(projectAeDir?: string): StyleInfo[] {
  const seen = new Set<string>();
  const out: StyleInfo[] = [];
  for (const dir of styleDirs(projectAeDir)) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
      const id = f.replace(/\.json$/, "");
      if (seen.has(id) || id.startsWith("_")) continue;
      seen.add(id);
      const raw = readStyle(id, [dir]) as any;
      const info: StyleInfo = { id, extends: raw?.extends, description: raw?.description, source: path.relative(REPO_ROOT, path.join(dir, f)) };
      try {
        const s = resolveStyle(id, projectAeDir);
        info.swatch = { bg: s.color?.bg, ink: s.color?.ink, accent: s.color?.accent, brand: s.color?.brand };
        info.fonts = s.type?.font;
      } catch (e) {
        info.description = `ОШИБКА: ${(e as Error).message}`;
      }
      out.push(info);
    }
  }
  return out;
}

export function listCurves(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(KIT_DIR, "library", "ease.json"), "utf8")).curves;
}

const LIB_FILES = ["motion", "text", "lines", "images", "backgrounds", "blocks", "transitions"];

function libraryItems(): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of LIB_FILES) {
    const items = JSON.parse(fs.readFileSync(path.join(KIT_DIR, "library", `${f}.json`), "utf8")).items;
    for (const [id, item] of Object.entries(items)) out[id] = { ...(item as object), id, folder: f };
  }
  return out;
}

export type LibraryInfo = { id: string; folder: string; kind: string; description?: string; dur?: unknown; target?: string; params?: unknown };

export function listLibrary(folder?: string): LibraryInfo[] {
  return Object.values(libraryItems())
    .filter((i) => !folder || i.folder === folder)
    .map((i) => ({ id: i.id, folder: i.folder, kind: i.kind, description: i.description, dur: i.dur, target: i.target ?? (i.basedOn ? "text" : "layer"), params: i.params }));
}

/** Примитив по id; ошибка с ближайшими именами. */
export function resolveLibraryItem(id: string): any {
  const items = libraryItems();
  if (items[id]) return items[id];
  const names = Object.keys(items);
  throw new Error(`Нет примитива «${id}». Похожие: ${nearest(id, names, 5).join(", ")} (все — list_library)`);
}

/** Все переходы библиотеки с id — сервер передаёт их в AE вместе с уроком. */
export function libraryFolder(folder: string): Record<string, any> {
  return Object.fromEntries(Object.entries(libraryItems()).filter(([, i]) => i.folder === folder));
}

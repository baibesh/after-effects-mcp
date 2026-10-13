#!/usr/bin/env node
// MCP-сервер After Effects: высокоуровневые инструменты поверх ExtendScript (mcp/*.jsx).
// Транспорт — osascript DoScriptFile (src/runner.ts), панель в AE не нужна. Только macOS.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "node:path";
import { deliver } from "./deliver.js";
import { FORMATS, PLATFORMS, type FormatKey, type PlatformKey } from "./formats.js";
import { grabFrames } from "./frames.js";
import { listPresets, PRESETS_DIR, resolvePreset } from "./presets.js";
import { config, runInAE } from "./runner.js";

const server = new McpServer({ name: "after-effects", version: "0.1.0" });

type ToolResponse = { content: { type: "text"; text: string }[]; isError?: boolean };

async function call(tool: string, args: Record<string, unknown>, timeoutSec?: number): Promise<ToolResponse> {
  const res = await runInAE(tool, args, timeoutSec);
  if (!res.ok) return { content: [{ type: "text", text: `Ошибка: ${res.error}` }], isError: true };
  return { content: [{ type: "text", text: JSON.stringify(res.result, null, 2) }] };
}

const compName = z.string().describe('Имя композиции или путь с папками "Папка/Имя", если имена повторяются');
const layerName = z.string().describe("Точное имя слоя в композиции");

// ---------- чтение ----------

server.registerTool(
  "ae_status",
  {
    description: "Состояние After Effects: версия, открытый проект, его битность, активная композиция. Вызывать первым, чтобы понять, с чем работаем.",
    inputSchema: {},
  },
  () => call("ae_status", {}),
);

server.registerTool(
  "list_comps",
  {
    description: "Список всех композиций проекта: имя, путь в папках, размер, fps, длительность, число слоёв.",
    inputSchema: {},
  },
  () => call("list_comps", {}),
);

server.tool(
  "list_layers",
  "Слои композиции сверху вниз: имя, тип (text/shape/precomp/image/video/audio/null/adjustment/camera/light/solid), in/out, родитель, эффекты, 3D, трек-мат.",
  { comp: compName },
  (a) => call("list_layers", a),
);

server.registerTool(
  "get_layer",
  {
    description: "Подробно про один слой: трансформации со значениями и ключами (время, значение, интерполяция, ease), выражения, текст, эффекты с изменёнными параметрами, содержимое shape-слоя. Свойства идентифицируются matchName.",
    inputSchema: {
    comp: compName,
    layer: layerName,
    all: z.boolean().optional().describe("Показывать и нетронутые параметры эффектов/shape (по умолчанию только изменённые)"),
    depth: z.number().int().min(0).max(8).optional().describe("Глубина обхода содержимого shape-слоя, по умолчанию 3"),
  },
  },
  (a) => call("get_layer", a),
);

server.registerTool(
  "get_frames",
  {
    description:
      "Посмотреть композицию глазами: кадры в указанные секунды (один кадр или лист до 4 в ряд). Проект не меняется. Использовать после каждой правки, чтобы проверить результат, и перед правкой, чтобы понять сцену.",
    inputSchema: {
      comp: compName,
      times: z.array(z.number().min(0)).min(1).max(16).describe("Секунды от начала композиции"),
      width: z.number().int().min(160).max(1920).optional().describe("Ширина одного кадра в ответе, px (по умолчанию 960 для одного кадра, 480 для листа)"),
    },
  },
  async ({ comp, times, width }) => {
    const res = await grabFrames(comp, times, width ?? (times.length > 1 ? 480 : 960));
    if (!res.ok) return { content: [{ type: "text", text: `Ошибка: ${res.error}` }], isError: true };
    return {
      content: [
        { type: "image", data: res.frames.image, mimeType: res.frames.mimeType },
        { type: "text", text: JSON.stringify(res.frames.info) },
      ],
    };
  },
);

// ---------- проект ----------

server.registerTool(
  "open_test_project",
  {
    description: `Открыть (или создать) тестовый проект в ${config.projectRoots[0]}. Менять можно только проекты из разрешённых папок. Сохранённый проект без правок закрывает; если в AE есть несохранённые правки вне тестовой папки — откажется, чтобы не потерять работу.`,
    inputSchema: {
    name: z.string().optional().describe("Имя файла без .aep, по умолчанию mcp-test"),
    recreate: z.boolean().optional().describe("Создать заново, даже если файл есть (старый перезапишется)"),
  },
  },
  (a) => call("open_test_project", a),
);

server.registerTool(
  "create_comp",
  {
    description: "Создать композицию. Имя должно быть уникальным. По умолчанию 1920×1080, 30 fps, 10 с.",
    inputSchema: {
    name: z.string(),
    width: z.number().int().min(4).max(30000).optional(),
    height: z.number().int().min(4).max(30000).optional(),
    fps: z.number().min(1).max(120).optional(),
    duration: z.number().min(0.04).max(10800).optional().describe("Секунды"),
    background: z.array(z.number().min(0).max(1)).length(3).optional().describe("Цвет фона [r,g,b] 0..1"),
    folder: z.string().optional().describe("Папка в панели Project (создаётся, если нет)"),
  },
  },
  (a) => call("create_comp", a),
);

server.registerTool(
  "save_project",
  {
    description: "Сохранить открытый проект (только из разрешённых папок).",
    inputSchema: {},
  },
  () => call("save_project", {}),
);

// ---------- рендер и форматы ----------

const formatKey = z.enum(Object.keys(FORMATS) as [FormatKey, ...FormatKey[]]);
const platformKey = z.enum(Object.keys(PLATFORMS) as [PlatformKey, ...PlatformKey[]]);
const slug = (s: string) => s.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
const masterPath = (comp: string) => path.join(config.renderDir, slug(comp), `${slug(comp)}-master.mov`);
const text = (v: unknown, isError = false): ToolResponse => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }], isError });

/** Композиция под формат: своя раскладка «<comp> <формат>», сама композиция того же размера или переразметка. */
async function formatComp(comp: string, format: FormatKey, opts: { mode?: string; focus?: number[]; background?: unknown }) {
  const f = FORMATS[format];
  return runInAE("make_format_comp", { comp, format, width: f.width, height: f.height, safe: f.safe, ...opts });
}

server.registerTool(
  "list_render_templates",
  {
    description: "Шаблоны рендера и вывода, которые есть в AE (только в тестовом проекте). Мастер берёт «MCP ProRes 422 HQ» / «MCP ProRes 4444», если вы их создали, иначе штатные «High Quality».",
    inputSchema: {},
  },
  () => call("list_render_templates", {}),
);

server.registerTool(
  "make_format_comp",
  {
    description:
      `Композиция под формат кадра. Порядок: (1) своя раскладка «<comp> <формат>» — берётся как есть (правильный путь: отдельная компоновка под формат); (2) сама композиция, если размер совпадает; (3) иначе переразметка «<comp> <формат> (reframe)»: сцена слоем, cover — заполнить кадр с обрезкой, contain — вписать, поля размытой копией или цветом. В ответе — тексты, вылезшие за безопасные зоны (outside) и непроверенные (с родителем, поворотом, 3D). Форматы: ${Object.entries(FORMATS).map(([k, v]) => `${k} ${v.width}×${v.height} (${v.note})`).join("; ")}.`,
    inputSchema: {
      comp: compName,
      format: formatKey,
      mode: z.enum(["cover", "contain"]).optional().describe("По умолчанию cover"),
      focus: z.array(z.number()).length(2).optional().describe("Точка исходного кадра [x, y] px, которая встанет в центр (по умолчанию центр)"),
      background: z.union([z.literal("blur"), z.array(z.number().min(0).max(1)).length(3)]).optional().describe("Поля при contain: blur (по умолчанию) или цвет [r,g,b]"),
    },
  },
  async ({ comp, format, ...opts }) => {
    const res = await formatComp(comp, format, opts);
    return res.ok ? text(res.result) : text(`Ошибка: ${res.error}`, true);
  },
);

server.registerTool(
  "render_master",
  {
    description: `Мастер-файл композиции: QuickTime ProRes (422 HQ / 4444 с альфой при наличии шаблонов «MCP …», иначе штатные «High Quality»). Пишет в ${config.renderDir}/<comp>/<comp>-master.mov. Блокирует AE до конца рендера; очередь рендера пользователя не трогает.`,
    inputSchema: {
      comp: compName,
      alpha: z.boolean().optional().describe("С прозрачностью (ProRes 4444)"),
      start: z.number().min(0).optional().describe("Начало отрезка, с"),
      duration: z.number().positive().optional().describe("Длина отрезка, с"),
    },
  },
  ({ comp, ...rest }) => call("render_master", { comp, file: masterPath(comp), ...rest }, 3600),
);

server.registerTool(
  "deliver",
  {
    description: `Файл для площадки из мастера (ffmpeg): ${Object.entries(PLATFORMS).map(([k, v]) => `${k} — ${v.note}`).join("; ")}. Громкость двумя проходами loudnorm, теги цвета BT.709.`,
    inputSchema: {
      master: z.string().describe(`Путь к мастеру внутри ${config.renderDir}`),
      platform: platformKey,
    },
  },
  async ({ master, platform }) => {
    const file = path.resolve(master);
    if (!file.startsWith(config.renderDir + path.sep)) return text(`Ошибка: мастер должен лежать в ${config.renderDir}`, true);
    try {
      return text(await deliver(file, platform));
    } catch (e) {
      return text(`Ошибка: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
);

server.registerTool(
  "render_formats",
  {
    description:
      "Весь путь для нескольких форматов: композиция под формат (make_format_comp) → мастер ProRes → файлы для площадок. По умолчанию 16x9 → youtube, остальные → social. Если переразметка вывела текст за безопасные зоны — формат не рендерится (вернётся список слоёв), пока не передан force: лучше сделать свою раскладку «<comp> <формат>» или сдвинуть focus.",
    inputSchema: {
      comp: compName,
      formats: z.array(formatKey).min(1),
      platforms: z.array(platformKey).optional().describe("Площадки для всех форматов вместо значений по умолчанию"),
      mode: z.enum(["cover", "contain"]).optional(),
      focus: z.array(z.number()).length(2).optional(),
      force: z.boolean().optional().describe("Рендерить, даже если текст вне безопасных зон"),
    },
  },
  async ({ comp, formats, platforms, mode, focus, force }) => {
    const report: Record<string, unknown> = {};
    let failed = false;
    for (const format of formats) {
      const fc = await formatComp(comp, format, { mode, focus });
      if (!fc.ok) {
        report[format] = { error: fc.error };
        failed = true;
        continue;
      }
      const target = fc.result as { comp: string; kind: string; outside: unknown[]; unchecked: string[] };
      if (target.outside.length && !force) {
        report[format] = { skipped: "текст за безопасными зонами", ...target };
        failed = true;
        continue;
      }
      const m = await runInAE("render_master", { comp: target.comp, file: masterPath(target.comp) }, 3600);
      if (!m.ok) {
        report[format] = { comp: target, error: m.error };
        failed = true;
        continue;
      }
      const outputs = [];
      for (const p of platforms ?? [format.startsWith("16x9") ? "youtube" : "social"] as PlatformKey[]) {
        try {
          outputs.push(await deliver(m.result.file, p));
        } catch (e) {
          outputs.push({ platform: p, error: e instanceof Error ? e.message : String(e) });
          failed = true;
        }
      }
      report[format] = { comp: target, master: m.result, outputs };
    }
    return text(report, failed);
  },
);

// ---------- пресеты ----------

server.registerTool(
  "list_presets",
  {
    description: `Пресеты анимации. local — свои из ${PRESETS_DIR}: JSON-данные (ключи в кадрах при 24 fps, числа по Уильямсу: антиципация, перелёт, ease, микродвижение) и .ffx, сохранённые из AE. adobe — штатные пресеты AE (их ~600, задавайте query: "Behaviors", "Text", "Transitions").`,
    inputSchema: {
      source: z.enum(["local", "adobe"]).optional().describe("По умолчанию local"),
      query: z.string().optional().describe("Подстрока в имени или описании"),
    },
  },
  ({ source, query }) => text(listPresets(source ?? "local", query)),
);

server.registerTool(
  "apply_preset",
  {
    description:
      "Применить пресет к слою по имени. JSON-пресет ставит ключи от start (секунды, по умолчанию начало слоя) с ease по отрезкам: offset/factor — относительно текущего значения, поэтому слой сначала ставят в конечное положение. speed растягивает время (1.5 — в полтора раза медленнее; кадры при 24 fps пересчитываются под fps композиции). .ffx (свой или adobe:…) применяется штатно от start. Одна отмена на вызов.",
    inputSchema: {
      comp: compName,
      layer: layerName,
      preset: z.string().describe('Имя из list_presets: "fade-up", "мои/zoom" или "adobe:Behaviors/…"'),
      start: z.number().min(0).optional(),
      speed: z.number().min(0.25).max(4).optional(),
    },
  },
  async ({ comp, layer, preset, start, speed }) => {
    let resolved;
    try {
      resolved = resolvePreset(preset);
    } catch (e) {
      return text(`Ошибка: ${e instanceof Error ? e.message : String(e)}`, true);
    }
    return call("apply_preset", { comp, layer, name: preset, start, speed, ...resolved });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

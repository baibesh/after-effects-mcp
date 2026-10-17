#!/usr/bin/env node
// MCP-сервер After Effects: высокоуровневые инструменты поверх ExtendScript (mcp/*.jsx).
// Транспорт — osascript DoScriptFile (src/runner.ts), панель в AE не нужна. Только macOS.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "node:path";
import { deliver } from "./deliver.js";
import { FORMATS, PLATFORMS, type FormatKey, type PlatformKey } from "./formats.js";
import { listEffects, resolveEffect } from "./effects.js";
import { grabFrames } from "./frames.js";
import { listPresets, PRESETS_DIR, resolvePreset } from "./presets.js";
import { listCurves, listLibrary, listStyles, resolveLibraryItem, resolveStyle } from "./styles.js";
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
  "Слои композиции сверху вниз: имя, тип (text/shape/precomp/image/video/audio/null/adjustment/camera/light/solid), in/out, родитель, эффекты, 3D, трек-мат; markers — маркеры композиции (sfx:…, с источником kb-sfx-src в params).",
  { comp: compName },
  (a) => call("list_layers", a),
);

server.registerTool(
  "get_layer",
  {
    description: "Подробно про один слой: трансформации со значениями и ключами (время, значение, интерполяция, ease), выражения, текст, эффекты с изменёнными параметрами, содержимое shape-слоя, текстовые аниматоры (имя, свойства с ключами и выражениями, селекторы) и маркеры слоя. Свойства идентифицируются matchName.",
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
  "open_project",
  {
    description:
      "Открыть проект .aep по пути. Текущий закрывается, только если ничего не потеряется (сохранён без правок или тестовый). writable в ответе — можно ли его менять (папка из AE_MCP_PROJECT_ROOTS); читать, смотреть кадры, проверять и рендерить можно любой.",
    inputSchema: { path: z.string().describe("Абсолютный путь к .aep") },
  },
  (a) => call("open_project", a, 300),
);

server.registerTool(
  "create_comp",
  {
    description: "Создать композицию. Имя должно быть уникальным. По умолчанию 1920×1080, 30 fps, 10 с. Новая композиция открывается во вьюере и становится активной (open: false — не открывать).",
    inputSchema: {
    name: z.string(),
    width: z.number().int().min(4).max(30000).optional(),
    height: z.number().int().min(4).max(30000).optional(),
    fps: z.number().min(1).max(120).optional(),
    duration: z.number().min(0.04).max(10800).optional().describe("Секунды"),
    background: z.array(z.number().min(0).max(1)).length(3).optional().describe("Цвет фона [r,g,b] 0..1"),
    folder: z.string().optional().describe("Папка в панели Project (создаётся, если нет)"),
    open: z.boolean().optional().describe("Открыть во вьюере и сделать активной (по умолчанию да)"),
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

// ---------- слои ----------

const xy = z.array(z.number()).min(2).max(3);
const rgb = z.array(z.number().min(0).max(1)).length(3).describe("Цвет [r,g,b] 0..1");
const timing = {
  start: z.number().min(0).optional().describe("Появление слоя, с"),
  end: z.number().min(0).optional().describe("Исчезновение слоя, с"),
};

server.registerTool(
  "add_text",
  {
    description:
      "Текстовый слой. Якорь — в центре текста (масштаб и пресеты идут от середины). font — ключ шрифта проекта (black, bold, regular… из kit.config.jsx) или PostScript-имя установленного шрифта; если шрифта нет — ошибка со списком шрифтов проекта. Перенос строки — \\n.",
    inputSchema: {
      comp: compName,
      text: z.string(),
      name: z.string().optional().describe("Имя слоя (по умолчанию начало текста); уникально в композиции"),
      font: z.string().optional(),
      size: z.number().positive().optional().describe("Кегль, px (по умолчанию 80)"),
      color: rgb.optional(),
      position: xy.optional().describe("Центр текста [x, y], по умолчанию центр кадра"),
      justify: z.enum(["left", "center", "right"]).optional(),
      tracking: z.number().optional(),
      leading: z.number().positive().optional(),
      ...timing,
    },
  },
  (a) => call("add_text", a),
);

server.registerTool(
  "add_shape",
  {
    description: "Фигура: прямоугольник (со скруглением) или эллипс, заливка и/или обводка. Якорь и позиция — центр фигуры.",
    inputSchema: {
      comp: compName,
      name: z.string(),
      shape: z.enum(["rect", "ellipse"]),
      size: z.array(z.number().positive()).length(2).describe("[ширина, высота] px"),
      position: xy.optional(),
      fill: rgb.nullable().optional().describe("Заливка; null — без заливки"),
      stroke: z.object({ color: rgb, width: z.number().positive().optional() }).optional(),
      radius: z.number().min(0).optional().describe("Скругление углов прямоугольника, px"),
      ...timing,
    },
  },
  (a) => call("add_shape", a),
);

server.registerTool(
  "add_text_plate",
  {
    description:
      "Плашка под текстом, которая сама подстраивается под его размер: прямоугольник (скругление radius, заливка, обводка) с отступами padding [x, y] от текста. Ребёнок текстового слоя — двигается, масштабируется и поворачивается вместе с ним (пресеты на тексте качают и плашку), прозрачность повторяет текст; размер — выражение от sourceRectAtTime, поэтому set_text или смена кегля пересчитывают плашку сами. Ставится сразу под текстом.",
    inputSchema: {
      comp: compName,
      text: z.string().describe("Имя текстового слоя"),
      name: z.string().optional().describe("По умолчанию «<текст> plate»"),
      padding: z.array(z.number().min(0)).length(2).optional().describe("Отступы [по бокам, сверху/снизу], px; по умолчанию [36, 18]"),
      radius: z.number().min(0).optional(),
      fill: rgb.nullable().optional(),
      stroke: z.object({ color: rgb, width: z.number().positive().optional() }).optional(),
      minWidth: z.number().min(0).optional(),
    },
  },
  (a) => call("add_text_plate", a),
);

server.registerTool(
  "add_solid",
  {
    description: "Заливка (solid) на весь кадр или заданного размера; adjustment: true — корректирующий слой для эффектов на всё, что ниже.",
    inputSchema: {
      comp: compName,
      name: z.string(),
      color: rgb.optional(),
      size: z.array(z.number().int().positive()).length(2).optional(),
      position: xy.optional(),
      adjustment: z.boolean().optional(),
      moveTo: z.enum(["top", "bottom"]).optional().describe("bottom — фон под всеми слоями"),
      ...timing,
    },
  },
  (a) => call("add_solid", a),
);

server.registerTool(
  "add_null",
  {
    description: "Null-объект — невидимый родитель: двигать, масштабировать и вращать группу слоёв (set_layer parent).",
    inputSchema: { comp: compName, name: z.string(), position: xy.optional(), ...timing },
  },
  (a) => call("add_null", a),
);

server.registerTool(
  "add_footage",
  {
    description: "Картинка, видео или звук из файла слоем. Уже импортированный файл переиспользуется. fit: none (1:1), contain, cover или число — ширина на экране, px. blend multiply — рисунок на белом без альфы ложится на бумагу.",
    inputSchema: {
      comp: compName,
      file: z.string().describe("Абсолютный путь к файлу (PNG/JPG/PSD/MOV/MP4/WAV…; WebP AE не импортирует)"),
      name: z.string().optional(),
      position: xy.optional(),
      fit: z.union([z.enum(["none", "contain", "cover"]), z.number().positive()]).optional(),
      blend: z.string().optional(),
      ...timing,
    },
  },
  (a) => call("add_footage", a),
);

server.registerTool(
  "set_layer",
  {
    description:
      "Изменить слой: имя, трансформ (position, scale — число или [x,y] в %, rotation, opacity, anchor), время (start/end), родитель (имя слоя или null), режим наложения, видимость, порядок (moveTo: top, bottom, {above: имя}, {below: имя}). Меняет статичные значения; для анимации — apply_preset.",
    inputSchema: {
      comp: compName,
      layer: layerName,
      name: z.string().optional().describe("Новое имя"),
      position: xy.optional(),
      scale: z.union([z.number(), z.array(z.number()).min(2).max(3)]).optional(),
      rotation: z.number().optional(),
      opacity: z.number().min(0).max(100).optional(),
      anchor: xy.optional(),
      parent: z.string().nullable().optional(),
      blend: z.string().optional().describe("normal, multiply, screen, overlay, add, softLight, hardLight, darken, lighten, colorBurn, colorDodge, difference, color, luminosity"),
      enabled: z.boolean().optional(),
      moveTo: z.union([z.enum(["top", "bottom"]), z.object({ above: z.string() }), z.object({ below: z.string() })]).optional(),
      ...timing,
    },
  },
  (a) => call("set_layer", a),
);

server.registerTool(
  "delete_layer",
  {
    description: "Удалить слой по имени (отменяется Cmd+Z в AE). Вместе со слоем снимаются sfx-метки композиции, которые поставили его движения (apply_motion, move:…) — в ответе sfxRemoved.",
    inputSchema: { comp: compName, layer: layerName },
  },
  (a) => call("delete_layer", a),
);

// ---------- проверка ----------

server.registerTool(
  "audit_animation",
  {
    description:
      "Проверка анимации по правилам /animation-craft, проект не меняется. linear — линейные ключи движения (ease нужен); hold — у персонажа ничего не меняется дольше maxHold кадров (учитываются ключи, выражения, анимация внутри прекомпа — моргание, дыхание); accent — пик движения к ударному слогу должен быть на 1–6 кадров раньше (лучше 2–4); entrance — несколько новых элементов входят в пределах 4 кадров; expression — ошибки выражений. Кадры — при 24 fps. Звать после сборки сцены и перед рендером; исправлять warning/error.",
    inputSchema: {
      comp: compName,
      start: z.number().min(0).optional().describe("Начало проверяемого отрезка, с"),
      end: z.number().min(0).optional(),
      characters: z.array(z.string()).optional().describe("Слои-персонажи для проверки холдов; по умолчанию — по шаблону имени"),
      characterPattern: z.string().optional().describe('Регулярное выражение для имён персонажей (по умолчанию "char|hero|персонаж|герой")'),
      maxHold: z.number().min(1).max(48).optional().describe("Допустимая статика, кадров при 24 fps (по умолчанию 6)"),
      beats: z.array(z.union([z.number(), z.object({ time: z.number(), label: z.string().optional() })])).optional().describe("Ударные слоги / удары звука, секунды"),
      beatLayer: z.string().optional().describe("Взять удары из маркеров этого слоя (например, озвучки)"),
      useCompMarkers: z.boolean().optional().describe("Взять удары из маркеров композиции"),
      voiceBeats: z.boolean().optional().describe("По умолчанию (без beats/beatLayer/useCompMarkers) удары — опорные слова озвучки: маркеры «!имя» звуковых слоёв (ставит кит) здесь или в родительских композициях; false — не проверять акценты"),
      accentLayers: z.array(z.string()).optional().describe("Где искать акценты (по умолчанию — все слои с ключами движения)"),
      depth: z.number().int().min(0).max(6).optional().describe("Глубина захода в прекомпы для холдов (по умолчанию 3)"),
      limit: z.number().int().min(1).max(500).optional(),
    },
  },
  (a) => call("audit_animation", a, 300),
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
    description: `Мастер-файл композиции: QuickTime ProRes (422 HQ / 4444 с альфой при наличии шаблонов «MCP …», иначе штатные «High Quality»). Пишет в ${config.renderDir}/<comp>/<comp>-master.mov. Блокирует AE до конца рендера; очередь рендера пользователя не трогает. В ответе duration/frames — длина ролика, renderSeconds — сколько шёл рендер.`,
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

// ---------- правка готового ----------

const easeArg = z
  .union([z.enum(["snap", "soft", "punch", "linear", "hold"]), z.object({ in: z.number().min(0.1).max(100).optional(), out: z.number().min(0.1).max(100).optional() })])
  .describe("snap {out 20, in 90} · soft {60, 60} · punch {10, 95} · linear · hold · {in, out} — влияние ease, %");

server.registerTool(
  "edit_keys",
  {
    description:
      "Правка существующих ключей слоя на отрезке from–to (секунды; без них — все ключи). Действия: shift — сдвинуть на seconds или frames (кадры композиции); stretch — растянуть/сжать в factor раз от pivot (по умолчанию from); ease — поставить ease; delete — удалить; set — поставить ключ value в time (с ease). Ключи переносятся со всеми свойствами (ease, касательные, hold), встают на кадр; столкновение с чужим ключом — ошибка без изменений. prop: position, scale, rotation, opacity, anchor, x, y, timeRemap, sourceText, «*» — весь трансформ, или путь [\"Effects\", \"Gaussian Blur\", \"Blurriness\"] (имена или matchName). Удобно исправлять находки audit_animation.",
    inputSchema: {
      comp: compName,
      layer: layerName,
      prop: z.union([z.string(), z.array(z.string()).min(1)]),
      action: z.enum(["shift", "stretch", "ease", "delete", "set"]),
      from: z.number().optional(),
      to: z.number().optional(),
      seconds: z.number().optional().describe("shift: на сколько секунд (минус — раньше)"),
      frames: z.number().optional().describe("shift: на сколько кадров композиции"),
      factor: z.number().positive().optional().describe("stretch: 2 — вдвое длиннее, 0.5 — вдвое короче"),
      pivot: z.number().optional().describe("stretch: неподвижная точка, с"),
      ease: easeArg.optional(),
      time: z.number().min(0).optional().describe("set: время ключа, с"),
      value: z.union([z.number(), z.array(z.number())]).optional().describe("set: значение"),
    },
  },
  (a) => call("edit_keys", a),
);

server.registerTool(
  "set_text",
  {
    description:
      "Изменить текстовый слой: текст и/или стиль (font — ключ шрифта проекта или PostScript-имя, size, color, tracking, leading, justify). Якорь, стоявший в центре текста, остаётся в центре. Если текст меняется по ключам — стиль ставится на все ключи, новый текст — в момент time.",
    inputSchema: {
      comp: compName,
      layer: layerName,
      text: z.string().optional().describe("Новый текст, перенос — \\n"),
      font: z.string().optional(),
      size: z.number().positive().optional(),
      color: rgb.optional(),
      tracking: z.number().optional(),
      leading: z.number().positive().optional(),
      justify: z.enum(["left", "center", "right"]).optional(),
      time: z.number().min(0).optional(),
    },
  },
  (a) => call("set_text", a),
);

server.registerTool(
  "replace_footage",
  {
    description:
      "Заменить картинку/видео/звук в слое на другой файл. По умолчанию только в этом слое и с той же шириной на экране (keepSize: false — оставить масштаб); everywhere: true — заменить сам элемент проекта во всех слоях.",
    inputSchema: {
      comp: compName,
      layer: layerName,
      file: z.string().describe("Абсолютный путь к новому файлу"),
      keepSize: z.boolean().optional(),
      everywhere: z.boolean().optional(),
    },
  },
  (a) => call("replace_footage", a),
);

server.registerTool(
  "set_color",
  {
    description: "Цвет слоя: у текста — заливка или обводка букв, у фигуры — все заливки или обводки (свойства с ключами не трогает), у заливки (solid) — её цвет (общий для всех слоёв с этим solid).",
    inputSchema: {
      comp: compName,
      layer: layerName,
      color: rgb,
      target: z.enum(["fill", "stroke"]).optional(),
    },
  },
  (a) => call("set_color", a),
);

// ---------- эффекты ----------

server.registerTool(
  "list_effects",
  {
    description: "Поиск эффектов AE по имени, категории или matchName (словарь с живого AE 26.5): имя, matchName, категория, битность (8/16/32), параметры — где известны.",
    inputSchema: { query: z.string().optional().describe('Например "blur", "Stylize", "glow"') },
  },
  ({ query }) => text(listEffects(query)),
);

server.registerTool(
  "add_effect",
  {
    description:
      "Добавить эффект на слой по имени («Gaussian Blur») или matchName, сразу с параметрами {«Blurriness»: 20} (имя параметра или matchName; цвет — [r,g,b]; выпадающий список — номер пункта с 1). Эффект 8/16 бит в 32-битном проекте обрезает яркости выше 1.0 — в ответе warning (ставить только там, где их нет).",
    inputSchema: {
      comp: compName,
      layer: layerName,
      effect: z.string(),
      name: z.string().optional().describe("Своё имя эффекта на слое (уникальное)"),
      params: z.record(z.string(), z.union([z.number(), z.array(z.number()), z.boolean()])).optional(),
    },
  },
  async ({ effect, ...rest }) => {
    let info;
    try {
      info = resolveEffect(effect);
    } catch (e) {
      return text(`Ошибка: ${e instanceof Error ? e.message : String(e)}`, true);
    }
    const res = await runInAE("add_effect", { ...rest, matchName: info.matchName });
    if (!res.ok) return text(`Ошибка: ${res.error}`, true);
    const out = res.result as Record<string, unknown>;
    if (info.bpc && typeof out.projectBits === "number" && info.bpc < out.projectBits) {
      out.warning = `«${info.name}» считается в ${info.bpc} битах, проект ${out.projectBits}: яркости выше 1.0 обрежутся — только на слоях без них (маски, маты, до свечения).`;
    }
    return text(out);
  },
);

server.registerTool(
  "set_effect",
  {
    description: "Эффект на слое по его имени: параметры, enabled, rename, index (порядок, с 1), remove. Параметры с ключами — через edit_keys.",
    inputSchema: {
      comp: compName,
      layer: layerName,
      effect: z.string().describe("Имя эффекта на слое (из list_layers / get_layer)"),
      params: z.record(z.string(), z.union([z.number(), z.array(z.number()), z.boolean()])).optional(),
      enabled: z.boolean().optional(),
      rename: z.string().optional(),
      index: z.number().int().min(1).optional(),
      remove: z.boolean().optional(),
    },
  },
  (a) => call("set_effect", a),
);

// ---------- время ----------

server.registerTool(
  "shift_layers",
  {
    description:
      "Сдвинуть слои по времени вместе с их ключами. Кого: layers (имена) или after — все слои, что начинаются не раньше этого момента. На сколько: seconds, frames или alignTo — первый из выбранных встанет на начало/конец другого слоя ({layer, edge: in|out, offset}), маркер композиции ({marker}) или момент ({time}). ripple (с after): вставить паузу (плюс) или убрать (минус) — слои, идущие через момент after (фон, персонаж), удлиняются/укорачиваются, их ключи после after сдвигаются, маркеры композиции и её длина подстраиваются. Всё встаёт на кадр.",
    inputSchema: {
      comp: compName,
      layers: z.array(z.string()).min(1).optional(),
      after: z.number().min(0).optional(),
      seconds: z.number().optional(),
      frames: z.number().optional(),
      alignTo: z
        .object({
          layer: z.string().optional(),
          edge: z.enum(["in", "out"]).optional(),
          marker: z.string().optional().describe("Маркер композиции или опорное слово озвучки (маркер «!имя» звукового слоя)"),
          time: z.number().optional(),
          offset: z.number().optional().describe("Секунды после цели (минус — раньше)"),
        })
        .optional(),
      ripple: z.boolean().optional(),
    },
  },
  (a) => call("shift_layers", a),
);

server.registerTool(
  "set_comp",
  {
    description: "Свойства композиции: имя, длительность, fps, цвет фона, рабочая область [начало, конец] (с).",
    inputSchema: {
      comp: compName,
      name: z.string().optional(),
      duration: z.number().positive().optional(),
      fps: z.number().min(1).max(120).optional(),
      background: rgb.optional(),
      workArea: z.array(z.number().min(0)).length(2).optional(),
    },
  },
  (a) => call("set_comp", a),
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

const styleProject = z.string().optional().describe("Папка ae/ проекта: его стили (ae/styles/*.json) ищутся раньше стилей кита");

server.registerTool(
  "list_styles",
  {
    description:
      "Стили серии (дизайн-система ролика, не стиль движения set_motion_style): id, от чего наследует, описание, ключевые цвета и шрифты. Стиль — токены color, type, shape, motion в kit/styles/*.json; блоки урока берут из него всё оформление. curves: true — ещё и кривые движения из kit/library/ease.json (имена годятся как ease в JSON-пресетах).",
    inputSchema: {
      project: styleProject,
      curves: z.boolean().optional(),
    },
  },
  ({ project, curves }) => text(curves ? { styles: listStyles(project), curves: listCurves() } : listStyles(project)),
);

server.registerTool(
  "get_style",
  {
    description:
      "Итоговые токены стиля после extends (from — порядок источников) или один токен по пути: \"color.accent\", \"type.size.h1\", \"motion.dur\". Длительности в мс до умножения на motion.tempo.",
    inputSchema: {
      id: z.string().describe('Имя из list_styles, например "editorial-dark"'),
      path: z.string().optional().describe("Путь токена через точку"),
      project: styleProject,
    },
  },
  ({ id, path: tokenPath, project }) => {
    try {
      const style = resolveStyle(id, project);
      if (!tokenPath) return text(style);
      let node: any = style;
      for (const part of tokenPath.split(".")) {
        if (node === null || typeof node !== "object" || !(part in node)) {
          throw new Error(`Стиль «${id}»: нет токена «${tokenPath}»${node && typeof node === "object" ? ` (есть: ${Object.keys(node).join(", ")})` : ""}`);
        }
        node = node[part];
      }
      return text({ id, path: tokenPath, value: node });
    } catch (e) {
      const known = listStyles(project).map((s) => s.id);
      return text(`Ошибка: ${(e as Error).message}. Стили: ${known.join(", ")}`, true);
    }
  },
);

const point = z.union([z.string(), z.tuple([z.number(), z.number()])]).describe("Слой (имя) или точка [x, y] в композиции");

server.registerTool(
  "list_library",
  {
    description:
      "Примитивы библиотеки (kit/library/*.json) — движение, текст, линии, оформленные стилем серии: id, папка (motion/text/lines), вид (enter/exit/emphasis/idle/draw…), описание, длительность (мс или токен motion.dur стиля), цель (layer — слой, text — текстовый слой, points — from/to, others — список слоёв), параметры с умолчаниями. Проект не меняется.",
    inputSchema: { folder: z.enum(["motion", "text", "lines"]).optional() },
  },
  ({ folder }) => text(listLibrary(folder)),
);

server.registerTool(
  "apply_library",
  {
    description:
      "Применить примитив библиотеки в стиле серии: длительность, кривая, перелёт, толщины, цвета, кегли — из стиля. motion/text — на слой (layer) от start; линии по слою (draw.underline/marker/circle/strike, undraw — на слой линии) или по точкам (draw.arrow/connector/callout: from, to — слой или [x, y]); emphasis.dimOthers/undim — others. Ответ: start/end (секунды) и созданные/затронутые слои — end ставит следующий шаг. Одна отмена на вызов.",
    inputSchema: {
      comp: compName,
      id: z.string().describe('Примитив из list_library: "text.letters", "enter.pop", "draw.arrow"…'),
      style: z.string().describe('Стиль серии из list_styles: "editorial-dark", "swiss-light", "color-blocks"'),
      layer: layerName.optional(),
      start: z.number().min(0).optional().describe("Секунды; по умолчанию начало слоя"),
      dur: z.number().positive().optional().describe("Длительность, мс — вместо длительности примитива (× tempo стиля)"),
      params: z.record(z.string(), z.any()).optional().describe('Параметры примитива: {"word": "apple"}, {"bend": 0.3}, {"text": "roof — шатыр"}'),
      from: point.optional(),
      to: point.optional(),
      others: z.array(z.string()).optional().describe("Слои для emphasis.dimOthers/undim"),
      index: z.number().int().min(0).optional().describe("Номер объекта для фазы idle (чтобы соседи не дышали в такт)"),
      name: z.string().optional().describe("Имя нового слоя линии"),
      project: styleProject,
    },
  },
  (a) => {
    let style, item;
    try {
      style = resolveStyle(a.style, a.project);
      item = resolveLibraryItem(a.id);
    } catch (e) {
      return text(`Ошибка: ${(e as Error).message}`, true);
    }
    const { project: _project, id: _id, ...rest } = a;
    return call("apply_library", { ...rest, style, item });
  },
);

server.registerTool(
  "apply_preset",
  {
    description:
      "Применить пресет к слою по имени. JSON-пресет ставит ключи от start (секунды, по умолчанию начало слоя) с ease по отрезкам (snap/soft/punch/linear/hold или кривая из list_styles curves: expoOut, quintOut, quartInOut… — с настоящей скоростью на ключах): offset/factor — относительно текущего значения, поэтому слой сначала ставят в конечное положение. speed растягивает время (1.5 — в полтора раза медленнее; кадры при 24 fps пересчитываются под fps композиции). .ffx (свой или adobe:…) применяется штатно от start. Одна отмена на вызов.",
    inputSchema: {
      comp: compName,
      layer: layerName,
      preset: z.string().describe('Имя из list_presets: "fade-up", "мои/zoom", "adobe:Behaviors/…" или "move:<движение>" — движение кита, как apply_motion (start → opts.start, speed не действует)'),
      start: z.number().min(0).optional(),
      speed: z.number().min(0.25).max(4).optional(),
    },
  },
  async ({ comp, layer, preset, start, speed }) => {
    // «move:<имя>» — движение кита (apply_motion): одна точка входа для агентов, которые знают apply_preset
    if (preset.startsWith("move:")) {
      return call("apply_motion", { comp, layer, name: preset.slice(5), opts: start !== undefined ? { start } : {} });
    }
    let resolved;
    try {
      resolved = resolvePreset(preset);
    } catch (e) {
      return text(`Ошибка: ${e instanceof Error ? e.message : String(e)}`, true);
    }
    return call("apply_preset", { comp, layer, name: preset, start, speed, ...resolved });
  },
);

// ---------- движения кита (kit/move.jsx) ----------

const motionStyle = z.enum(["hand", "brisk", "lesson", "magazine"]);
const layerRef = z.union([z.string(), z.number().int().min(1)]).describe("Слой: номер (1 — верхний) или точное имя");

server.registerTool(
  "list_motions",
  {
    description:
      "Каталог движений кита (41, kit/README.md «Пресеты движения»): имя, группа A–H (A текст-вход, B текст-выход, C цикл, D акцент слова, E субтитры, F плашки, G камера, H реакции героя), слот (in/loop/out/accent), единицы, параметры с умолчаниями, что видит зритель и на чём работает (needs: text — любой текстовый слой; pair — нужен второй слой; plate/cam/actor/voice — собираются китом в скрипте). activeStyle — действующий стиль: style вызова → композиции (comp или активная) → проекта → hand, со scope; swappedTo — во что движение подменяется в нём. Проект не меняется.",
    inputSchema: {
      group: z.string().optional().describe('Буква группы A–H или группа реестра ("text-in", "text-accent", "actor"…)'),
      comp: compName.optional().describe("Композиция, чей стиль показать; по умолчанию активная"),
      style: motionStyle.optional().describe("Показать подмены этого стиля вместо действующего"),
    },
  },
  (a) => call("list_motions", a),
);

server.registerTool(
  "apply_motion",
  {
    description:
      'Применить движение кита к слою (layer — номер или имя) или к каждому выделенному слою (selection: true; выделение — get_selection). Стиль — из вызова, иначе композиции, иначе проекта (set_motion_style), иначе hand; подмена по стилю — в ответе (swappedFrom). Время: at — секунды удара (движение приходит на 2 к. раньше), или anchor — маркер слоя ({"layer":"voice","marker":"!er"}), или opts.start — первый кадр движения; без них — от начала слоя. opts — параметры движения из list_motions (строка "@Имя" — слой этой композиции). Ответ — план на каждый слой: start/hit/end (секунды и кадры) и sfx — все метки, которые движение фактически поставило в маркеры композиции (вид, время, кадр, сила, inComp — сверено с композицией). Одна отмена на вызов. Реакции героя (группа H) через MCP не применяются: актёр собирается скриптом кита (kbActor).',
    inputSchema: {
      comp: compName.optional().describe("По умолчанию — активная композиция"),
      layer: layerRef.optional(),
      selection: z.boolean().optional().describe("Применить к выделенным слоям активной (или указанной) композиции; выделить — select_layers"),
      name: z.string().describe('Имя движения: "land", "rise", "punch", "marker-swipe"…'),
      at: z.number().min(0).optional().describe("Секунды удара (опорный слог)"),
      anchor: z.object({ layer: layerRef, marker: z.string() }).optional().describe("Взять at из маркера слоя"),
      opts: z.record(z.string(), z.any()).optional().describe('Параметры движения: {"unit":"char","strength":1.2}, {"amount":"strong"}, {"next":"@BIGGER"}'),
      style: motionStyle.optional().describe("Стиль только для этого вызова"),
    },
  },
  (a) => call("apply_motion", a),
);

server.registerTool(
  "set_motion_style",
  {
    description:
      "Стиль движения: hand (по умолчанию, рилсы), brisk (бодрый, ×0,7 длительности), lesson (спокойный урок: без перелёта, рисующиеся линии заменены), magazine (журнал, ×1,6). С comp — для композиции (тег в её комментарии), без comp — для всего проекта. style: null снимает. Ответ — множители и таблица подмен.",
    inputSchema: {
      style: motionStyle.nullable().describe("Имя стиля или null — снять"),
      comp: compName.optional().describe("Композиция; без неё — стиль проекта"),
    },
  },
  (a) => call("set_motion_style", a),
);

server.registerTool(
  "get_selection",
  {
    description:
      "Выделенные слои активной композиции (или comp): номер, имя, тип, in/out, время головки и действующий стиль движения — чтобы «примени к этому» работало без имён. Активной нет — open_comp; выделить — select_layers. Проект не меняется.",
    inputSchema: { comp: compName.optional().describe("По умолчанию — активная композиция") },
  },
  (a) => call("get_selection", a),
);

server.registerTool(
  "open_comp",
  {
    description: "Открыть композицию во вьюере AE и сделать её активной (для get_selection, select_layers, apply_motion без comp). time — поставить головку. Проект не меняется.",
    inputSchema: { comp: compName, time: z.number().min(0).optional().describe("Секунды — куда поставить головку") },
  },
  (a) => call("open_comp", a),
);

server.registerTool(
  "select_layers",
  {
    description:
      "Выделить слои композиции (номер или имя), с остальных выделение снять; add: true — добавить к текущему. layers: [] — снять всё. Композиция открывается во вьюере и становится активной (open: false — нет). Потом apply_motion {selection: true}. Проект не меняется.",
    inputSchema: {
      comp: compName.optional().describe("По умолчанию — активная композиция"),
      layers: z.array(layerRef).describe("Слои: номер (1 — верхний) или точное имя"),
      add: z.boolean().optional().describe("Не снимать текущее выделение"),
      open: z.boolean().optional().describe("Открыть композицию во вьюере (по умолчанию да)"),
    },
  },
  (a) => call("select_layers", a),
);

const transport = new StdioServerTransport();
await server.connect(transport);

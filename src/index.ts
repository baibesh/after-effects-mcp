#!/usr/bin/env node
// MCP-сервер After Effects: высокоуровневые инструменты поверх ExtendScript (mcp/*.jsx).
// Транспорт — osascript DoScriptFile (src/runner.ts), панель в AE не нужна. Только macOS.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { grabFrames } from "./frames.js";
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

const transport = new StdioServerTransport();
await server.connect(transport);

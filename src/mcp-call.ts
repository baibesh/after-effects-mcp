// Вызов инструмента через настоящий MCP (stdio), как это делает Claude:
//   node build/mcp-call.js render_formats '{"comp":"Test 16x9","formats":["9x16"]}'
// Картинки из ответа сохраняются в out/frames/mcp-call-<n>.png.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [tool, json = "{}"] = process.argv.slice(2);
const client = new Client({ name: "mcp-call", version: "0.1.0" });
await client.connect(new StdioClientTransport({ command: "node", args: [path.join(here, "index.js")], env: process.env as Record<string, string> }));
if (!tool) {
  console.log((await client.listTools()).tools.map((t) => t.name).join("\n"));
} else {
  const res = await client.callTool({ name: tool, arguments: JSON.parse(json) }, undefined, { timeout: 3_600_000 });
  let n = 0;
  for (const c of res.content as any[]) {
    if (c.type === "text") console.log(c.text);
    if (c.type === "image") {
      const f = path.join(here, "..", "out", "frames", `mcp-call-${n++}.png`);
      fs.writeFileSync(f, Buffer.from(c.data, "base64"));
      console.log(`[image] ${f}`);
    }
  }
  if (res.isError) process.exitCode = 1;
}
await client.close();

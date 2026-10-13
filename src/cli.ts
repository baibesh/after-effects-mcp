// Ручная проверка инструмента без Claude:
//   node build/cli.js list_layers '{"comp":"Main"}'
//   node build/cli.js get_frames '{"comp":"Main","times":[0,1,2]}'   — путь к PNG вместо base64
import { grabFrames } from "./frames.js";
import { runInAE } from "./runner.js";

const [tool, json = "{}", timeout] = process.argv.slice(2);
if (!tool) {
  console.error("usage: node build/cli.js <tool> ['{json args}'] [timeoutSec]");
  process.exit(2);
}
const args = JSON.parse(json);
if (tool === "get_frames") {
  const res = await grabFrames(args.comp, args.times, args.width ?? (args.times.length > 1 ? 480 : 960));
  console.log(JSON.stringify(res.ok ? res.frames.info : res, null, 2));
  process.exit(res.ok ? 0 : 1);
}
const res = await runInAE(tool, args, timeout ? Number(timeout) : undefined);
console.log(JSON.stringify(res, null, 2));
process.exit(res.ok ? 0 : 1);

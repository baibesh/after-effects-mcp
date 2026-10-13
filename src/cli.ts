// Ручная проверка инструмента без Claude:  node build/cli.js list_layers '{"comp":"Main"}'
import { runInAE } from "./runner.js";

const [tool, json = "{}", timeout] = process.argv.slice(2);
if (!tool) {
  console.error("usage: node build/cli.js <tool> ['{json args}'] [timeoutSec]");
  process.exit(2);
}
const res = await runInAE(tool, JSON.parse(json), timeout ? Number(timeout) : undefined);
console.log(JSON.stringify(res, null, 2));
process.exit(res.ok ? 0 : 1);

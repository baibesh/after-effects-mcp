// Запуск инструмента в After Effects без панели: файл запроса → osascript DoScriptFile → файл ответа.
//
// DoScriptFile в osascript блокирует, пока скрипт не закончит, поэтому ответ синхронный:
// не нужно «поставить в очередь и потом спросить get-results». AE один на всех, поэтому
// запуск идёт под замком out/.ae-lock — тем же, что у tools/run.sh кита.

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OUT_DIR = path.join(REPO_ROOT, "out");
const REQ_DIR = path.join(OUT_DIR, "mcp");
const LOG_PATH = path.join(OUT_DIR, "ae.log");
const LOCK_DIR = path.join(OUT_DIR, ".ae-lock");
const MAIN_JSX = path.join(REPO_ROOT, "mcp", "main.jsx");

function listEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(/[,:]/).map((s) => s.trim()).filter(Boolean).map((s) => path.resolve(s.replace(/^~/, process.env.HOME ?? "~")));
}

export const config = {
  /** Папки, проекты из которых разрешено менять. Первая — для тестового проекта. */
  projectRoots: listEnv("AE_MCP_PROJECT_ROOTS", [path.join(REPO_ROOT, "test")]),
  /** Замки других конвейеров (out/.ae-lock китов в проектах): пока они есть, AE занят. */
  foreignLocks: listEnv("AE_MCP_FOREIGN_LOCKS", []),
  /** Разрешить run_script — выполнение .jsx-файлов из scriptRoots. По умолчанию выключено. */
  allowScripts: process.env.AE_MCP_ALLOW_SCRIPTS === "1",
  scriptRoots: listEnv("AE_MCP_SCRIPT_ROOTS", [path.join(REPO_ROOT, "scripts")]),
  minFreeGb: Number(process.env.AE_MCP_MIN_FREE_GB ?? "1.5"),
};

export type RunResult = { ok: true; result: any } | { ok: false; error: string };

function findApp(): string {
  if (process.env.AE_MCP_APP) return process.env.AE_MCP_APP;
  const apps = fs.readdirSync("/Applications").filter((n) => /^Adobe After Effects \d+$/.test(n)).sort();
  if (!apps.length) throw new Error("After Effects не найден в /Applications (можно указать AE_MCP_APP)");
  return apps[apps.length - 1];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Последний запуск в журнале без OK/ERR — AE ещё выполняет его (например, после таймаута). */
function openRun(): string | null {
  if (!fs.existsSync(LOG_PATH)) return null;
  let open: string | null = null;
  for (const line of fs.readFileSync(LOG_PATH, "utf8").split("\n")) {
    if (line.includes("  ▶ ")) open = line;
    else if (/  (OK|ERR) /.test(line)) open = null;
  }
  return open;
}

async function acquireLock(waitMs: number): Promise<() => void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const deadline = Date.now() + waitMs;
  for (;;) {
    const busyForeign = config.foreignLocks.find((l) => fs.existsSync(path.join(l)));
    if (!busyForeign) {
      try {
        fs.mkdirSync(LOCK_DIR);
        fs.writeFileSync(path.join(LOCK_DIR, "pid"), String(process.pid));
        return () => fs.rmSync(LOCK_DIR, { recursive: true, force: true });
      } catch {
        let pid = 0;
        try {
          pid = Number(fs.readFileSync(path.join(LOCK_DIR, "pid"), "utf8").trim());
        } catch {
          // замок только что создан, pid ещё не записан
        }
        if (pid && !pidAlive(pid)) {
          fs.rmSync(LOCK_DIR, { recursive: true, force: true });
          continue;
        }
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`AE занят другим запуском (${busyForeign ?? LOCK_DIR}) дольше ${Math.round(waitMs / 1000)} с`);
    }
    await sleep(500);
  }
}

function checkDisk() {
  const s = fs.statfsSync("/");
  const freeGb = (s.bavail * s.bsize) / 1024 ** 3;
  if (freeGb < config.minFreeGb) {
    throw new Error(`На диске свободно ${freeGb.toFixed(1)} ГБ (< ${config.minFreeGb}). AE на полном диске показывает модальный диалог и скрипты виснут — очистите кэш: Edit → Purge → All Memory & Disk Cache.`);
  }
}

/** JSON как литерал ES3: всё вне ASCII — через \uXXXX, чтобы кодировка файла не имела значения. */
function es3Literal(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

/** Ждать, пока файлы появятся и перестанут расти. Возвращает те, что не дописались. */
async function waitForFiles(files: string[], waitMs: number): Promise<string[]> {
  const deadline = Date.now() + waitMs;
  const size = (f: string) => (fs.existsSync(f) ? fs.statSync(f).size : 0);
  let pending = files;
  while (pending.length && Date.now() < deadline) {
    const before = pending.map(size);
    await sleep(300);
    pending = pending.filter((f, i) => before[i] === 0 || size(f) !== before[i]);
  }
  return pending;
}

function logTail(lines: number): string {
  if (!fs.existsSync(LOG_PATH)) return "";
  return fs.readFileSync(LOG_PATH, "utf8").trimEnd().split("\n").slice(-lines).join("\n");
}

/**
 * Выполнить инструмент из mcp/tools/*.jsx в AE.
 * @param timeoutSec сколько ждать AE (рендеру — больше)
 */
export async function runInAE(tool: string, args: Record<string, unknown>, timeoutSec = 120): Promise<RunResult> {
  checkDisk();
  const release = await acquireLock(10 * 60 * 1000);
  const id = `${Date.now()}-${process.pid}`;
  const reqPath = path.join(REQ_DIR, `req-${id}.jsx`);
  const resPath = path.join(REQ_DIR, `res-${id}.json`);
  try {
    for (let i = 0; i < 60 && openRun(); i++) await sleep(1000);
    const stuck = openRun();
    if (stuck) {
      return { ok: false, error: `AE ещё выполняет прошлый запуск: «${stuck.trim()}». Возможно, в AE открыт диалог — нажмите OK и повторите.` };
    }

    fs.mkdirSync(REQ_DIR, { recursive: true });
    const request = { id, tool, args, resultPath: resPath, logPath: LOG_PATH, projectRoots: config.projectRoots };
    fs.writeFileSync(
      reqPath,
      `var MCP_REQUEST = ${es3Literal(request)};\n//@include "${MAIN_JSX}"\nmcpDispatch();\n`,
      "utf8",
    );

    const app = findApp();
    await new Promise<void>((resolve, reject) => {
      execFile(
        "osascript",
        ["-e", `with timeout of ${timeoutSec} seconds`, "-e", `tell application "${app}" to DoScriptFile "${reqPath}"`, "-e", "end timeout"],
        { timeout: (timeoutSec + 15) * 1000 },
        (err, _stdout, stderr) => {
          if (err) reject(new Error(`osascript: ${stderr || err.message}`));
          else resolve();
        },
      );
    });

    if (!fs.existsSync(resPath)) {
      return { ok: false, error: `AE не записал ответ. Последние строки out/ae.log:\n${logTail(5)}` };
    }
    const res = JSON.parse(fs.readFileSync(resPath, "utf8")) as RunResult;
    // saveFrameToPng и подобные пишут асинхронно: держим замок, пока файлы не допишутся,
    // иначе следующий запуск может закрыть проект раньше.
    if (res.ok && Array.isArray(res.result?.pendingFiles)) {
      res.result.missingFiles = await waitForFiles(res.result.pendingFiles, 120_000);
    }
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint = /timed out|-1712|SIGTERM/i.test(msg) ? "\nAE не ответил вовремя — скорее всего, в AE открыт модальный диалог. Нажмите в нём OK." : "";
    return { ok: false, error: msg + hint };
  } finally {
    fs.rmSync(reqPath, { force: true });
    fs.rmSync(resPath, { force: true });
    release();
  }
}

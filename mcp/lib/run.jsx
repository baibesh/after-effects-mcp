// Обёртка одного вызова инструмента MCP внутри AE.
// Файл запроса (его пишет сервер, src/runner.ts) задаёт MCP_REQUEST и вызывает mcpDispatch().
// Результат — JSON в MCP_REQUEST.resultPath: DoScriptFile ничего не возвращает в osascript.
//
// MCP_REQUEST = {
//   id, tool, args,
//   resultPath,       — куда писать ответ
//   logPath,          — журнал запусков (общий с китом формат: ▶ / OK / ERR)
//   projectRoots[]    — папки, в которых лежат проекты, которые разрешено менять
// }

/** Запрос задаёт файл out/mcp/req-*.jsx до подключения библиотеки; объявление без значения его не затирает. */
/** @type {any} */
var MCP_REQUEST;

/** Реестр инструментов: MCP_TOOLS.<имя> = {write: bool, run: function(args) → any} */
var MCP_TOOLS = {};

/** @param {string} message */
function mcpLog(message) {
  var log = new File(MCP_REQUEST.logPath);
  if (!log.parent.exists) log.parent.create();
  log.encoding = "UTF-8";
  log.lineFeed = "Unix";
  log.open("a");
  log.writeln(new Date().toTimeString().substr(0, 8) + "  " + message);
  log.close();
}

/**
 * Менять можно только проект, сохранённый в одной из разрешённых папок.
 * Несохранённый проект — тоже нет: непонятно, тестовый он или рабочий.
 */
function mcpCheckWritable() {
  var file = app.project.file;
  if (!file) {
    throw new Error("Открыт несохранённый проект. Меняю только проекты из разрешённых папок: " +
      MCP_REQUEST.projectRoots.join(", ") + " — откройте тестовый проект (open_test_project).");
  }
  var path = file.fsName;
  for (var i = 0; i < MCP_REQUEST.projectRoots.length; i++) {
    var root = MCP_REQUEST.projectRoots[i];
    if (path.indexOf(root + "/") === 0) return;
  }
  throw new Error("Проект «" + path + "» вне разрешённых папок (" + MCP_REQUEST.projectRoots.join(", ") +
    "). Менять его не буду; чтение работает.");
}

/** @param {string} text */
function mcpWriteResult(text) {
  var out = new File(MCP_REQUEST.resultPath);
  out.encoding = "UTF-8";
  out.lineFeed = "Unix";
  out.open("w");
  out.write(text);
  out.close();
}

function mcpDispatch() {
  var name = MCP_REQUEST.tool;
  var tool = MCP_TOOLS[name];
  var response;
  var undoOpen = false;
  mcpLog("▶ mcp " + name);
  try {
    if (!tool) throw new Error("Неизвестный инструмент «" + name + "»");
    if (tool.write) {
      mcpCheckWritable();
      app.beginUndoGroup("MCP: " + name);
      undoOpen = true;
    }
    response = {ok: true, result: tool.run(MCP_REQUEST.args || {})};
  } catch (e) {
    var where = e.fileName ? " (" + new File(e.fileName).name + ":" + e.line + ")" : "";
    response = {ok: false, error: String(e.message || e) + where};
  } finally {
    if (undoOpen) app.endUndoGroup();
  }
  mcpLog((response.ok ? "OK mcp " : "ERR mcp ") + name + (response.ok ? "" : ": " + response.error));
  mcpWriteResult(mcpStringify(response));
}

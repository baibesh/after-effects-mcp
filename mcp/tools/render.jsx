// Рендер: шаблоны вывода, мастер-файл композиции через очередь рендера.
// Очередь пользователя не трогаем: чужие элементы на время рендера снимаем с галочки и возвращаем,
// добавленный нами элемент удаляем после рендера.

MCP_TOOLS.list_render_templates = {
  write: true, // создаёт и удаляет временную композицию — только в тестовом проекте
  run: function () {
    var queue = app.project.renderQueue;
    var comp = app.project.items.addComp("__mcp_probe", 16, 16, 1, 1, 30);
    try {
      var item = queue.items.add(comp);
      var result = {renderSettings: item.templates, outputModules: item.outputModule(1).templates};
      item.remove();
      return result;
    } finally {
      comp.remove();
    }
  }
};

/**
 * Шаблоны вывода мастера по убыванию качества. Кодек и глубину из скрипта не выставить (getSettings
 * STRING_SETTABLE их не содержит), поэтому лучший вариант — свой шаблон, один раз созданный в AE (README):
 * QuickTime, Apple ProRes 422 HQ / 4444, Trillions of Colors. Запасные — штатные «High Quality»
 * (ProRes 422 Standard, 8 бит на входе) и «High Quality with Alpha».
 */
var MCP_MASTER_TEMPLATES = {
  opaque: ["MCP ProRes 422 HQ", "High Quality"],
  alpha: ["MCP ProRes 4444", "High Quality with Alpha"]
};

/**
 * @param {OutputModule} output
 * @param {boolean} alpha
 * @returns {string} применённый шаблон
 */
function mcpApplyMasterTemplate(output, alpha) {
  var wanted = alpha ? MCP_MASTER_TEMPLATES.alpha : MCP_MASTER_TEMPLATES.opaque;
  var have = "|" + output.templates.join("|") + "|";
  for (var i = 0; i < wanted.length; i++) {
    if (have.indexOf("|" + wanted[i] + "|") >= 0) {
      output.applyTemplate(wanted[i]);
      return wanted[i];
    }
  }
  throw new Error("Нет ни одного шаблона вывода из: " + wanted.join(", "));
}

/**
 * Мастер-файл композиции (QuickTime ProRes): «High Quality» = ProRes 422 HQ, с альфой — ProRes 4444.
 * Путь файла задаёт сервер (out/renders/…). Блокирует AE до конца рендера.
 */
MCP_TOOLS.render_master = {
  write: false, // проект не меняется: элемент очереди добавляется и удаляется
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var queue = app.project.renderQueue;
    if (queue.rendering) throw new Error("AE уже рендерит — дождитесь конца");

    var file = new File(args.file);
    if (!file.parent.exists) file.parent.create();
    if (file.exists) file.remove();

    // Чужие элементы очереди на время рендера выключаем, иначе queue.render() отрендерит и их.
    var paused = [];
    for (var i = 1; i <= queue.numItems; i++) {
      var other = queue.item(i);
      if (other.status === RQItemStatus.QUEUED) {
        other.render = false;
        paused.push(other);
      }
    }
    var item = queue.items.add(comp);
    var started = new Date().getTime();
    try {
      item.applyTemplate("Best Settings");
      if (args.start !== undefined) item.timeSpanStart = args.start;
      if (args.duration !== undefined) item.timeSpanDuration = args.duration;
      var output = item.outputModule(1);
      var template = mcpApplyMasterTemplate(output, args.alpha === true);
      output.file = file;
      queue.render();
      if (item.status !== RQItemStatus.DONE) {
        throw new Error("Рендер не завершился (статус " + item.status + ")");
      }
    } finally {
      try { item.remove(); } catch (e) { /* элемент уже удалён */ }
      for (var p = 0; p < paused.length; p++) paused[p].render = true;
    }
    return {
      comp: mcpItemPath(comp),
      file: file.fsName,
      template: template,
      note: template.indexOf("MCP ") === 0 ? undefined :
        "Взят штатный шаблон «" + template + "» (ProRes 422/4444, 8 бит на входе). Для мастера 422 HQ, 16 бит создайте шаблон «MCP ProRes 422 HQ» (README).",
      width: comp.width,
      height: comp.height,
      fps: comp.frameRate,
      seconds: Math.round((new Date().getTime() - started) / 100) / 10
    };
  }
};

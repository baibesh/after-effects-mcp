// Кадры композиции в PNG — чтобы модель видела результат без рендера ролика.
//
// В 32-битном проекте saveFrameToPng делит цвет на 10 только у непрозрачных пикселей; у полупрозрачных
// значения не восстановить (альфа 0,7: 0,351 вместо 0,095). Поэтому при прозрачности (flatten) снимаем
// кадр с временной композиции «подложка цвета фона + сцена» — она непрозрачна — и сразу её удаляем.
// saveFrameToPng пишет файл асинхронно: сервер ждёт, пока файлы из pendingFiles допишутся,
// и только потом снимает замок (src/runner.ts). Проект не меняется — работает в любом проекте.

var MCP_FLAT = "__mcp_flat";

/** Удалить временную композицию-подложку и её заливку. saveFrameToPng пишет асинхронно — звать после записи файлов. */
function mcpDropFlat() {
  var i;
  for (i = app.project.numItems; i >= 1; i--) {
    if (app.project.item(i).name === MCP_FLAT && app.project.item(i) instanceof CompItem) app.project.item(i).remove();
  }
  for (i = app.project.numItems; i >= 1; i--) {
    if (app.project.item(i).name === MCP_FLAT) app.project.item(i).remove();
  }
}

MCP_TOOLS.drop_flat = {
  write: false,
  run: function () {
    mcpDropFlat();
    return {};
  }
};

MCP_TOOLS.save_frames = {
  write: false,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var times = args.times;
    if (!(times instanceof Array) || !times.length) throw new Error("Не указаны времена кадров (секунды)");
    var dir = new Folder(args.dir);
    if (!dir.exists) dir.create();
    var files = [];
    var shot = comp;
    if (args.flatten) {
      mcpDropFlat();
      shot = app.project.items.addComp(MCP_FLAT, comp.width, comp.height, comp.pixelAspect, comp.duration, comp.frameRate);
      shot.layers.addSolid(comp.bgColor, MCP_FLAT, comp.width, comp.height, comp.pixelAspect);
      shot.layers.add(comp);
    }
    for (var i = 0; i < times.length; i++) {
      var t = Number(times[i]);
      if (t < 0 || t > comp.duration) {
        mcpDropFlat();
        throw new Error("Время " + t + " с вне композиции «" + comp.name + "» (0–" + comp.duration + " с)");
      }
      var file = new File(dir.fsName + "/" + args.prefix + "-" + i + ".png");
      if (file.exists) file.remove();
      /** @type {any} */ (shot).saveFrameToPng(t, file);
      files.push(file.fsName);
    }
    return {
      comp: mcpItemPath(comp),
      width: comp.width,
      height: comp.height,
      bitsPerChannel: app.project.bitsPerChannel,
      bgColor: comp.bgColor,
      flattened: args.flatten === true,
      writable: mcpIsWritable(),
      pendingFiles: files
    };
  }
};

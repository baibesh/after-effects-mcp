// Кадры композиции в PNG — чтобы модель видела результат без рендера ролика.
// saveFrameToPng пишет файл асинхронно: сервер ждёт, пока файлы из pendingFiles допишутся,
// и только потом снимает замок (src/runner.ts). Проект не меняется — работает в любом проекте.

MCP_TOOLS.save_frames = {
  write: false,
  run: function (args) {
    var comp = mcpFindComp(args.comp);
    var times = args.times;
    if (!(times instanceof Array) || !times.length) throw new Error("Не указаны времена кадров (секунды)");
    var dir = new Folder(args.dir);
    if (!dir.exists) dir.create();
    var files = [];
    for (var i = 0; i < times.length; i++) {
      var t = Number(times[i]);
      if (t < 0 || t > comp.duration) {
        throw new Error("Время " + t + " с вне композиции «" + comp.name + "» (0–" + comp.duration + " с)");
      }
      var file = new File(dir.fsName + "/" + args.prefix + "-" + i + ".png");
      if (file.exists) file.remove();
      /** @type {any} */ (comp).saveFrameToPng(t, file);
      files.push(file.fsName);
    }
    return {
      comp: mcpItemPath(comp),
      width: comp.width,
      height: comp.height,
      bitsPerChannel: app.project.bitsPerChannel,
      pendingFiles: files
    };
  }
};

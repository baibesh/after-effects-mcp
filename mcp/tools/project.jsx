// Проект и композиции: тестовый проект, новая композиция, сохранение.

/**
 * @param {string} name
 * @returns {File}
 */
function mcpTestProjectFile(name) {
  var safe = String(name || "mcp-test").replace(/[^A-Za-z0-9_\-]/g, "-");
  return new File(MCP_REQUEST.projectRoots[0] + "/" + safe + ".aep");
}

/** Закрыть текущий проект, только если это не чужая работа. */
function mcpCloseCurrentSafely() {
  var file = app.project.file;
  if (!file) {
    if (app.project.numItems > 0) {
      throw new Error("В AE открыт несохранённый проект (" + app.project.numItems +
        " элементов). Сохраните или закройте его сами — закрывать чужую работу не буду.");
    }
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    return;
  }
  mcpCheckWritable(); // рабочий проект не закрываем: AE спросит про сохранение диалогом и скрипт повиснет
  app.project.save();
  app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
}

MCP_TOOLS.open_test_project = {
  write: false, // сам проверяет, что закрывает; undo-группа на смену проекта не нужна
  run: function (args) {
    var target = mcpTestProjectFile(args.name);
    if (app.project.file && app.project.file.fsName === target.fsName) {
      return {project: target.fsName, created: false, note: "уже открыт"};
    }
    mcpCloseCurrentSafely();
    if (target.exists && !args.recreate) {
      app.open(target);
      return {project: target.fsName, created: false};
    }
    if (!target.parent.exists) target.parent.create();
    app.newProject();
    app.project.bitsPerChannel = 32;
    app.project.linearBlending = true;
    app.project.save(target);
    return {project: target.fsName, created: true, bitsPerChannel: 32};
  }
};

MCP_TOOLS.create_comp = {
  write: true,
  run: function (args) {
    var name = String(args.name || "");
    if (!name) throw new Error("Не указано имя композиции");
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === name) throw new Error("Композиция «" + name + "» уже есть");
    }
    var width = args.width || 1920;
    var height = args.height || 1080;
    var fps = args.fps || 30;
    var duration = args.duration || 10;
    var comp = app.project.items.addComp(name, width, height, 1, duration, fps);
    if (args.background) comp.bgColor = args.background;
    if (args.folder) {
      var folder = null;
      for (var f = 1; f <= app.project.numItems; f++) {
        var it = app.project.item(f);
        if (it instanceof FolderItem && it.name === args.folder) { folder = it; break; }
      }
      if (!folder) folder = app.project.items.addFolder(args.folder);
      comp.parentFolder = folder;
    }
    return {name: comp.name, path: mcpItemPath(comp), width: width, height: height, fps: fps, duration: duration};
  }
};

MCP_TOOLS.save_project = {
  write: true,
  run: function () {
    app.project.save();
    return {project: app.project.file.fsName};
  }
};

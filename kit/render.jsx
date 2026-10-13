// Контрольные кадры: PNG в out/frames/, чтобы смотреть результат без рендера ролика.

//@include "core.jsx"

/**
 * @param {CompItem} comp
 * @param {number[]} times секунды
 * @param {string} prefix имя файла без номера
 */
function kbSaveFrames(comp, times, prefix) {
  var dir = new Folder(KB_ROOT.fsName + "/out/frames");
  if (!dir.exists) dir.create();

  for (var i = 0; i < times.length; i++) {
    var label = String(Math.round(times[i] * 100));
    while (label.length < 4) label = "0" + label;
    var file = new File(dir.fsName + "/" + prefix + "-" + label + ".png");
    if (file.exists) file.remove();
    // saveFrameToPng в документации нет, но метод есть у CompItem; пишет файл асинхронно.
    /** @type {any} */ (comp).saveFrameToPng(times[i], file);
    kbLog("frame " + file.name);
  }
}

/**
 * Превью сцены в mp4 через очередь рендера (H.264, 15 Мбит/с). Блокирует AE до конца рендера.
 * @param {CompItem} comp
 * @param {string} relativePath путь от папки ae/, например "out/preview/s1.mp4"
 */
function kbRenderPreview(comp, relativePath) {
  var file = new File(KB_ROOT.fsName + "/" + relativePath);
  if (!file.parent.exists) file.parent.create();
  if (file.exists) file.remove();

  var queue = app.project.renderQueue;
  while (queue.numItems > 0) queue.item(1).remove();

  var item = queue.items.add(comp);
  item.applyTemplate("Best Settings");
  var output = item.outputModule(1);
  output.applyTemplate("H.264 - Match Render Settings - 15 Mbps");
  output.file = file;

  var started = new Date().getTime();
  queue.render();
  kbLog("render " + file.name + " — " + Math.round((new Date().getTime() - started) / 1000) + " с");
}

// Картинки: импорт и постановка в кадр.
// Дудлы лежат на белом фоне без альфы — на бумагу кладём умножением: белое исчезает, тушь и охра остаются.

//@include "core.jsx"
//@include "motion.jsx"

// Сначала свои копии в ae/assets/doodle (с ними проект переносится на другую машину),
// потом папки из KB_CONFIG.doodleDirs (абсолютные пути со слешем на конце, например библиотека студии).
var KB_DOODLE_DIRS = [KB_ROOT.fsName + "/assets/doodle/"].concat(kbConfig("doodleDirs", []));

/**
 * @param {string} name файл без расширения
 * @returns {string} абсолютный путь
 */
function kbDoodlePath(name) {
  for (var i = 0; i < KB_DOODLE_DIRS.length; i++) {
    var path = KB_DOODLE_DIRS[i] + name + ".png";
    if (new File(path).exists) return path;
  }
  throw new Error("Нет дудла «" + name + "» — положить png в одну из папок: " + KB_DOODLE_DIRS.join(", "));
}

/**
 * @param {string} path абсолютный путь
 * @returns {FootageItem}
 */
function kbImport(path) {
  var file = new File(path);
  if (!file.exists) throw new Error("Нет файла: " + path);
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof FootageItem && item.file && item.file.fsName === file.fsName) return item;
  }
  return /** @type {FootageItem} */ (app.project.importFile(new ImportOptions(file)));
}

/**
 * Дудл на бумаге.
 * @param {CompItem} comp
 * @param {{name: string, x: number, y: number, height: number}} opts name — файл дудла без расширения; height — высота в кадре, px
 * @returns {AVLayer}
 */
function kbDoodle(comp, opts) {
  var item = kbImport(kbDoodlePath(opts.name));
  var layer = comp.layers.add(item);
  layer.name = opts.name;
  layer.blendingMode = BlendingMode.MULTIPLY;
  layer.motionBlur = true;

  var scale = (opts.height / item.height) * 100;
  // Якорь — в подошвы: сжатие и растяжение идут от пола.
  kbProp(layer, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([item.width / 2, item.height * 0.94]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]).setValue([scale, scale]);
  kbProp(layer, ["ADBE Transform Group", "ADBE Position"]).setValue([opts.x, opts.y]);
  return layer;
}

/**
 * Выпрыгивание снизу со сжатием при посадке: объём сохраняется (шире ↔ ниже).
 * @param {AVLayer} layer
 * @param {number} start
 */
function kbPopIn(layer, start) {
  var scaleProp = kbProp(layer, ["ADBE Transform Group", "ADBE Scale"]);
  var s = scaleProp.value[0];
  kbKeys(scaleProp,
    [start, start + 0.2, start + 0.33, start + 0.5],
    [[s * 0.6, 0], [s * 0.9, s * 1.14], [s * 1.08, s * 0.92], [s, s]],
    KB_EASE.snap);
}

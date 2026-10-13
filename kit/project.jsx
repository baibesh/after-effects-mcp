// Проект и композиции: 32 бита, смешивание в линейном свете, честный motion blur.

//@include "core.jsx"

/** @type {{[name: string]: [number, number, number]}} */
var KB_COLOR = {
  paper: [0.957, 0.945, 0.918], // #F4F1EA
  ink: [0.067, 0.067, 0.067], // #111111
  inkSoft: [0.42, 0.404, 0.369], // #6B675E — приглушённая строка рядом с главной
  ochre: [0.722, 0.463, 0.165], // #B8762A
  blue: [0.184, 0.427, 0.71], // #2F6DB5
  plum: [0.557, 0.29, 0.478], // #8E4A7A
  grey: [0.788, 0.769, 0.722], // #C9C4B8
  marker: [0.961, 0.784, 0.294], // #F5C84B — только движение
  // Тот же жёлтый для слоя в режиме умножения: смешивание идёт в линейном свете поверх бумаги,
  // и без поправки #F5C84B выходит горчичным.
  markerInk: [1, 0.83, 0.32],
  coral: [0.894, 0.341, 0.18], // #E4572E — ошибка, удар
  teal: [0.165, 0.616, 0.561], // #2A9D8F — верно
  tealInk: [0.17, 0.65, 0.61] // бирюза для слоя в режиме умножения (та же поправка, что у markerInk)
};

var KB_FRAME = { width: 1080, height: 1920, fps: 30, safeTop: 200, safeBottom: 320 };

/** Новый проект; открытый закрывается без сохранения — всё собирается заново из скриптов. */
function kbNewProject() {
  if (app.project) app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  app.newProject();
  app.project.bitsPerChannel = 32;
  app.project.linearBlending = true;
}

/**
 * @param {string} name
 * @param {number} seconds
 * @returns {CompItem}
 */
function kbComp(name, seconds) {
  var comp = app.project.items.addComp(name, KB_FRAME.width, KB_FRAME.height, 1, seconds, KB_FRAME.fps);
  comp.bgColor = KB_COLOR.paper;
  comp.motionBlur = true;
  comp.shutterAngle = 270;
  comp.shutterPhase = -135;
  comp.motionBlurSamplesPerFrame = 32;
  comp.motionBlurAdaptiveSampleLimit = 64;
  return comp;
}

/**
 * Заливка на весь кадр.
 * @param {CompItem} comp
 * @param {[number, number, number]} color
 * @param {string} name
 * @returns {AVLayer}
 */
function kbFill(comp, color, name) {
  return comp.layers.addSolid(color, name, comp.width, comp.height, 1, comp.duration);
}

/**
 * @param {string} relativePath путь от папки ae/
 */
function kbSaveProject(relativePath) {
  var file = new File(KB_ROOT.fsName + "/" + relativePath);
  if (!file.parent.exists) file.parent.create();
  app.project.save(file);
}

/**
 * Сцена в общей композиции: слой-прекомпозиция с началом в заданную секунду.
 * @param {CompItem} master
 * @param {CompItem} scene
 * @param {number} start
 * @returns {AVLayer}
 */
function kbPlace(master, scene, start) {
  var layer = master.layers.add(scene);
  layer.startTime = start;
  layer.motionBlur = true;
  return layer;
}

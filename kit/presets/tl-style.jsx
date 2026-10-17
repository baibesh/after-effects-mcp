// Стили движения по умолчанию (данные): hand | brisk | lesson | magazine — множители и подмены лежат в TL_STYLES (tl-move.jsx),
// здесь — то, что ролик раньше копировал в свой style.jsx: палитра ролей, шрифты, текст, карта мягких звуков.
// Папка звуков — настройка проекта: KB_CONFIG.sfxDir в ae/kit.config.jsx (путь от ae/, по умолчанию "assets/sfx-soft/").
// Файлы звуков в кит не копируются. ES3. Подключать после tl-move.jsx.

//@include "../core.jsx"
//@include "../project.jsx"
//@include "../text.jsx"

/**
 * Карта мягких звуков: вид удара → файл и уровень, дБ (уровни — замер пиков витрины type-lab-15, поток 7).
 * kbSfxFromMarkers ставит level − 6 дБ × (1 − сила).
 * @type {{[kind: string]: {file: string, level: number}}}
 */
var TL_SFX_SOFT = {
  tick: { file: "tick.wav", level: 8.5 },
  pop: { file: "pop.wav", level: -4 },
  thud: { file: "thud.wav", level: -14 },
  whoosh: { file: "whoosh.wav", level: -18 },
  marker: { file: "marker.wav", level: -14 },
  ding: { file: "ding.wav", level: -2 }
};

/**
 * Папка звуков в виде, который понимает kbAudioPath (путь от родителя ae/): "ae/" + KB_CONFIG.sfxDir.
 * @returns {string}
 */
function tlSfxDir() {
  var dir = String(kbConfig("sfxDir", "assets/sfx-soft/"));
  if (dir.charAt(dir.length - 1) !== "/") dir += "/";
  return KB_ROOT.name + "/" + dir;
}

/**
 * Полный стиль ролика по имени (то, что раньше писали в style.jsx руками). over — поля поверх (палитра, sfx, множители).
 * @param {string=} name hand (по умолчанию) | brisk | lesson | magazine
 * @param {any=} over
 * @returns {any}
 */
function kbMoveStyleDefaults(name, over) {
  var n = name || "hand";
  if (!TL_STYLES[n]) throw new Error("kbMoveStyleDefaults: нет стиля «" + n + "» (hand, brisk, lesson, magazine)");
  var map = {};
  for (var k in TL_SFX_SOFT) map[k] = { file: TL_SFX_SOFT[k].file, level: TL_SFX_SOFT[k].level };
  var s = {
    name: n, twos: 15, swap: {},
    palette: { paper: KB_COLOR.paper, ink: KB_COLOR.ink, soft: KB_COLOR.inkSoft, kk: KB_COLOR.ochre,
               en: KB_COLOR.blue, marker: KB_COLOR.markerInk, error: KB_COLOR.coral, ok: KB_COLOR.teal,
               note: /** @type {[number, number, number]} */ ([0.306, 0.294, 0.271]) },
    fonts: { word: KB_FONT.black, card: KB_FONT.bold, hand: KB_FONT.handBold || KB_FONT.bold, handLight: KB_FONT.hand || KB_FONT.regular },
    text: { caps: true, tracking: 0, cap: 0.72 },
    sfx: { dir: tlSfxDir(), map: map }
  };
  for (var key in (over || {})) s[key] = over[key];
  return s;
}

/**
 * Включить стиль по имени с умолчаниями кита (палитра, шрифты, мягкие звуки): kbMoveStyle(kbMoveStyleDefaults(name, over)).
 * @param {string=} name
 * @param {any=} over
 * @returns {any} TL_S после переключения
 */
function kbMoveStyleUse(name, over) {
  kbMoveStyle(kbMoveStyleDefaults(name, over));
  return TL_S;
}

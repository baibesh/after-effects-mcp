// Время урока: порядок клипов, зазоры и времена по реальным длительностям озвучки.
// Данные: KB_ON/KB_OFF/KB_MOUTH (reels/<unit>/voice.jsx ← tools/bake-voice.mjs) — глобальные, в файле не объявлены; kbOn/kbOff/kbMouthSegs без подключённого voice.jsx не работают и порядок KB_ORDER из reels/<unit>/data.jsx.
// Каталог — kit/README.md «Урок: персонаж и голос». ES3. Времена — секунды общей композиции.

//@include "core.jsx"
//@include "audio.jsx"
//@include "project.jsx"

/** Старт клипа в общей композиции по id порядка. */
var KB_S = {};
/** Конец файла клипа. */
var KB_E = {};
/** id порядка → файл (id озвучки): повтор клипа = другой id порядка, тот же файл. */
var KB_FILE = {};
/** id порядка → голос из манифеста. */
var KB_SPEAKER = {};
/** id порядка по времени. */
var KB_IDS = [];
/** Опорные слова клипов: файл → {имя: секунды от начала файла}. Заполняет data.jsx присваиванием после замера. */
var KB_ANCHORS = {};

/**
 * Собрать таблицы времени из порядка клипов. Зазор первого клипа — абсолютный старт, остальных — пауза после предыдущего;
 * старты кратны 1/15 с, чтобы окна рта (на двойках) совпадали с сеткой кадров.
 * @param {{id: string, file?: string, gap: number, voice?: string}[]} order file по умолчанию = id; dur — KB_DUR[file] из voice.jsx
 * @param {{[file: string]: number}} dur
 */
function kbTimeline(order, dur) {
  var prev = 0;
  KB_S = {};
  KB_E = {};
  KB_FILE = {};
  KB_SPEAKER = {};
  KB_IDS = [];
  for (var i = 0; i < order.length; i++) {
    var o = order[i];
    var file = o.file || o.id;
    if (dur[file] === undefined) throw new Error("Нет длительности клипа «" + file + "» — node tools/bake-voice.mjs <unit>");
    var s = i === 0 ? o.gap : prev + o.gap;
    s = Math.round(s * 15) / 15;
    KB_S[o.id] = s;
    KB_E[o.id] = s + dur[file];
    KB_FILE[o.id] = file;
    KB_SPEAKER[o.id] = o.voice || "";
    KB_IDS.push(o.id);
    prev = KB_E[o.id];
  }
}

/**
 * Старт клипа.
 * @param {string} id
 * @returns {number}
 */
function kbS(id) { return KB_S[id]; }

/**
 * Конец файла клипа.
 * @param {string} id
 * @returns {number}
 */
function kbE(id) { return KB_E[id]; }

/**
 * Начало звучания (первый слышимый звук).
 * @param {string} id
 * @returns {number}
 */
function kbOn(id) { return KB_S[id] + KB_ON[KB_FILE[id]]; } // ae-ok: types

/**
 * Конец звучания.
 * @param {string} id
 * @returns {number}
 */
function kbOff(id) { return KB_S[id] + KB_OFF[KB_FILE[id]]; } // ae-ok: types

/**
 * Опорное слово клипа (секунды от начала файла хранит KB_ANCHORS).
 * @param {string} id
 * @param {string} key
 * @returns {number}
 */
function kbAt(id, key) {
  var a = KB_ANCHORS[KB_FILE[id]];
  if (!a || a[key] === undefined) throw new Error("Нет опорного слова «" + key + "» у клипа «" + id + "»");
  return KB_S[id] + a[key];
}

/**
 * Рот клипа по огибающей: отрезки [от, до, уровень 1|2|3] в общем времени.
 * @param {string} id
 * @returns {number[][]}
 */
function kbMouthSegs(id) {
  var src = KB_MOUTH[KB_FILE[id]]; // ae-ok: types
  var out = [];
  for (var i = 0; i < src.length; i++) out.push([KB_S[id] + src[i][0], KB_S[id] + src[i][1], src[i][2]]);
  return out;
}

/**
 * Рот нескольких клипов одного говорящего — один список для kbCharComp (cfg.mouth).
 * @param {string[]} ids
 * @returns {number[][]}
 */
function kbMouthOf(ids) {
  var out = [];
  for (var i = 0; i < ids.length; i++) out = out.concat(kbMouthSegs(ids[i]));
  return out;
}

/**
 * Озвучка: по слою на клип порядка (повтор — тот же файл), в паузах тишина.
 * @param {CompItem} master
 * @param {string} dir KB_AUDIO_DIR
 * @param {{[file: string]: number}} gain KB_GAIN
 */
function kbVoiceTrack(master, dir, gain) {
  for (var i = 0; i < KB_IDS.length; i++) {
    var id = KB_IDS[i];
    var al = kbAudio(master, { file: dir + KB_FILE[id] + ".wav", start: KB_S[id], name: "vo-" + id, level: gain[KB_FILE[id]] });
    al.moveToEnd();
  }
}

/**
 * Клипы, в которых в кадре говорит один персонаж (поле voice порядка).
 * @param {string} who ключ персонажа в KB_RIG; "o" — закадровый диктор
 * @returns {string[]}
 */
function kbIdsBy(who) {
  var out = [];
  for (var i = 0; i < KB_IDS.length; i++) if (KB_SPEAKER[KB_IDS[i]] === who) out.push(KB_IDS[i]);
  return out;
}

/** Кадр урока: 1920×1080, 30 к/с. Звать внутри функции сборки (повторный include сбрасывает KB_FRAME). */
function kbLessonFrame() {
  KB_FRAME.width = 1920;
  KB_FRAME.height = 1080;
  KB_FRAME.fps = 30;
}

/**
 * Композиция урока 1920×1080: бумага, motion blur 180° (персонаж «на двойках» — у слоя персонажа он выключен).
 * @param {string} name
 * @param {number} seconds
 * @returns {CompItem}
 */
function kbLessonComp(name, seconds) {
  kbLessonFrame();
  var comp = kbComp(name, seconds);
  comp.shutterAngle = 180;
  comp.shutterPhase = -90;
  comp.motionBlurSamplesPerFrame = 10;
  comp.motionBlurAdaptiveSampleLimit = 24;
  return comp;
}

// Звук: импорт wav, слой без видео, громкость в дБ.
// Дорожки обычно лежат не в ae/, а рядом с ним (kemel-bilim: соседний репозиторий kemel-bilim-docs/…/audio-mastered/;
// dilyolu: video/<ролик>/tts/ того же репозитория) — путь начинается с "../" и считается от папки ae/ проекта.

//@include "core.jsx"
//@include "footage.jsx"

/**
 * Абсолютный путь к wav.
 * @param {string} file путь относительно ae/ (обычно REEL.audioDir + id + ".wav" из reels/say-simple/data.jsx)
 * @returns {string} абсолютный путь
 */
function kbAudioPath(file) {
  return KB_ROOT.parent.fsName + "/" + file;
}

/**
 * Имя файла без папок и расширения — запасное имя слоя, когда `name` не задан.
 * @param {string} file
 * @returns {string}
 */
function kbAudioBaseName(file) {
  var parts = file.split("/");
  return parts[parts.length - 1].replace(/\.wav$/i, "");
}

/**
 * Аудиослой: импорт wav с переиспользованием (kbImport), старт в композиции, видео выключено —
 * источник без картинки, звук идёт один.
 * @param {CompItem} comp
 * @param {{file: string, start: number, name?: string, level?: number}} opts file — путь к wav
 *   относительно ae/ (см. kbAudioPath); name — имя слоя, по умолчанию имя файла без расширения;
 *   level — громкость в дБ, ставится одинаково на оба канала (`ADBE Audio Group` → `ADBE Audio Levels`)
 * @returns {AVLayer}
 */
function kbAudio(comp, opts) {
  var item = kbImport(kbAudioPath(opts.file));
  var layer = comp.layers.add(item);
  layer.name = opts.name || kbAudioBaseName(opts.file);
  layer.startTime = opts.start;
  layer.enabled = false; // видео выключено: у wav картинки нет, свитч дёргать не для чего
  layer.audioEnabled = true;
  if (opts.level !== undefined) {
    kbProp(layer, ["ADBE Audio Group", "ADBE Audio Levels"]).setValue([opts.level, opts.level]);
  }
  return layer;
}

/**
 * Дорожка реплик на композицию — по слою на запись из REEL.clips, старт из `clip.start`.
 * @param {CompItem} comp
 * @param {Array<{id: string, start: number, seconds?: number}>} clips как REEL.clips в reels/say-simple/data.jsx
 * @param {string} dir папка со звуком относительно ae/ (REEL.audioDir), со слэшем на конце
 * @param {{level?: number}} [opts]
 * @returns {AVLayer[]}
 */
function kbAudioClips(comp, clips, dir, opts) {
  opts = opts || {};
  var layers = [];
  for (var i = 0; i < clips.length; i++) {
    var clip = clips[i];
    layers.push(kbAudio(comp, { file: dir + clip.id + ".wav", start: clip.start, name: clip.id, level: opts.level }));
  }
  return layers;
}

/**
 * Один и тот же звук на несколько отметок — отдельный слой на каждую (повтор SFX).
 * @param {CompItem} comp
 * @param {{file: string, times: number[], level?: number}} opts file — путь к wav относительно ae/
 * @returns {AVLayer[]}
 */
function kbSfx(comp, opts) {
  var base = kbAudioBaseName(opts.file);
  var layers = [];
  for (var i = 0; i < opts.times.length; i++) {
    layers.push(kbAudio(comp, { file: opts.file, start: opts.times[i], name: base + "-" + (i + 1), level: opts.level }));
  }
  return layers;
}

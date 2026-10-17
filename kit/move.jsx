// Пресеты движения — одна точка подключения: реестр TL_MOVES (41 движение, 8 групп), раннер kbMove/kbMovePlan/kbSlot,
// стили hand/brisk/lesson/magazine (kbMoveStyle, kbMoveStyleUse), плашки kbPlate, актёр kbActor, звук kbSfxFromMarkers.
// Код пресетов — kit/presets/tl-*.jsx (имена tl… сохранены с прототипа kemel-bilim type-lab-15), паспорта героев — kit/heroes/.
// Каталог и API — kit/README.md «Пресеты движения». ES3, свойства только по matchName.
//
// Порядок подключения (зависимости): tl-ease → tl-move → tl-accent → tl-hand → tl-type → tl-voice → tl-mark → tl-caption →
// tl-plate → tl-camera → tl-actor → tl-style; heroes.measured → heroes. Повторный //@include tl-move.jsx в том же запуске
// реестр не обнуляет (guard в tl-move.jsx), новый запуск начинает с чистого.

//@include "core.jsx"
//@include "project.jsx"
//@include "motion.jsx"
//@include "text.jsx"
//@include "shape.jsx"
//@include "look.jsx"
//@include "footage.jsx"
//@include "hero.jsx"
//@include "show-hand.jsx"
//@include "show-a.jsx"
//@include "show-e.jsx"
//@include "show-final.jsx"
//@include "render.jsx"
//@include "audio.jsx"
//@include "lesson.jsx"
//@include "presets/tl-ease.jsx"
//@include "presets/tl-move.jsx"
//@include "presets/tl-accent.jsx"
//@include "presets/tl-hand.jsx"
//@include "presets/tl-type.jsx"
//@include "presets/tl-voice.jsx"
//@include "presets/tl-mark.jsx"
//@include "presets/tl-caption.jsx"
//@include "presets/tl-plate.jsx"
//@include "presets/tl-camera.jsx"
//@include "presets/tl-actor.jsx"
//@include "presets/tl-style.jsx"
//@include "heroes/heroes.measured.jsx"
//@include "heroes/heroes.jsx"

/**
 * Паспорт движения для людей и MCP: группа каталога (A…H), что видит зритель, ключевые параметры, на чём работает.
 * needs: text — любой текстовый слой; pair — нужен второй слой (опция-слой); plate — слой плашки kbPlate; cam — риг камеры tlCamRig;
 * actor — актёр kbActor в том же запуске (MCP между вызовами актёра не хранит); voice — заглушка/маркеры голоса; comp — композиция-ячейка.
 * @type {{[name: string]: {cat: string, what: string, opts: string, needs: string}}}
 */
var KB_MOVE_INFO = {
  "rise": { cat: "A", what: "слово всплывает снизу и проявляется; ровный вход; out:true — зеркальный уход вверх", opts: "unit, stagger, stagger_ease, strength, out", needs: "text" },
  "land": { cat: "A", what: "слово падает и приземляется со сплющиванием, дрожь затухает; главный сочный вход", opts: "unit, stagger, strength (0,6 мягко · 1,2 тяжело), from (em)", needs: "text" },
  "slam": { cat: "A", what: "слово падает на бумагу из крупного размытия и садится (хук)", opts: "phase, stagger, strength", needs: "text" },
  "cascade": { cat: "A", what: "буквы или строки поднимаются на место слева направо", opts: "unit, order, stagger_ms, stagger_ease", needs: "text" },
  "voice-in": { cat: "A", what: "слово проявляется в такт голосу: последняя буква основы до ударного окончания", opts: "clip, onsets, off, anchors", needs: "voice" },
  "baseline-reveal": { cat: "A", what: "буквы выезжают из-за невидимой базовой линии (маска, не прозрачность)", opts: "unit, stagger, out, seed", needs: "text" },
  "sink-out": { cat: "B", what: "буквы гаснут и опускаются по одной; выход ≤ 8 к.", opts: "unit, order", needs: "text" },
  "paper-fade": { cat: "B", what: "текст бледнеет к бумаге без движения; rest 0,35 — остаётся тенью", opts: "rest, from, duration", needs: "text" },
  "hold-alive": { cat: "C", what: "слово или предмет живёт на холде: качание рукой на двойках в окне [from, to]", opts: "kind (text · paper), from, to, strength", needs: "text" },
  "slot-pulse": { cat: "C", what: "пустой слот медленно дышит — ждёт ответа", opts: "from, to (или t0, t1), amount", needs: "text" },
  "punch": { cat: "D", what: "слово коротко отбивает такт масштабом", opts: "amount (soft · medium · strong), anchor (center · junction)", needs: "text" },
  "suffix-beat": { cat: "D", what: "окончание отбивает удар на своём слоге, основа стоит (dip — с замахом)", opts: "dip, echo, strength", needs: "text" },
  "marker-swipe": { cat: "D", what: "жёлтый маркер проводится рукой под словом и гаснет", opts: "thin, color, seed, out", needs: "text" },
  "circle-marker": { cat: "D", what: "окончание или слог обводится незамкнутым овалом от руки", opts: "stem, gap, color, seed, out", needs: "text" },
  "recolor-swipe": { cat: "D", what: "слово перекрашивается мазком слева направо; mode step — ступенькой", opts: "range, color, mode (swipe · step), font", needs: "text" },
  "word-swap": { cat: "D", what: "меняется только слово-переменная, контекст стоит («am → are»)", opts: "next (слой), error, in (land · rise)", needs: "pair" },
  "hole-letter": { cat: "D", what: "в слове дырка с маркерным «?»; буква врывается, слово читается целиком", opts: "hole, markStart, strength", needs: "text" },
  "syllable-split": { cat: "D", what: "между слогами проступают маркерные чёрточки, ударный слог крупнее", opts: "parts, stress, gap, back", needs: "text" },
  "letter-wave": { cat: "D", what: "по буквам или строкам пробегает волна вверх-вниз", opts: "unit, stagger, strength", needs: "text" },
  "strike-out": { cat: "D", what: "неверная форма перечёркивается маркером и гаснет (shake — с дрожью)", opts: "shake, color, rest, drop", needs: "text" },
  "caption-words": { cat: "E", what: "субтитры тушью без подложки: слова встают в такт речи, активное подчёркнуто или перекрашено", opts: "words, onsets, off, active (marker · recolor), dim, settle", needs: "voice" },
  "headline-sub": { cat: "E", what: "заголовок и подпись вдвое мельче на 5–6 к. позже, без плашек", opts: "sub, delay, head_in, onsets, off", needs: "voice" },
  "plate-in": { cat: "F", what: "плашка вырастает из точки (grow) или опускается и ложится (drop)", opts: "plate, mode (grow · drop), from, strength", needs: "plate" },
  "plate-out": { cat: "F", what: "плашка тает (melt), схлопывается (out) или отрывается и улетает (peel)", opts: "mode (melt · out · peel), to", needs: "plate" },
  "stamp-in": { cat: "F", what: "штамп с размаху ставится на бумагу", opts: "blots, strength", needs: "plate" },
  "tag-peel": { cat: "F", what: "с окончания слова отклеивается ярлык, тень растёт", opts: "strength", needs: "plate" },
  "arc-fly": { cat: "F", what: "предмет летит по дуге; flip — переворот другой стороной", opts: "from, to, apex, ballistic, flip", needs: "plate" },
  "suffix-dock": { cat: "F", what: "окончание прилипает к основе, основа отскакивает", opts: "strength", needs: "plate" },
  "word-to-card": { cat: "F", what: "крупное слово уменьшается и уезжает в свою строку карточки", opts: "target (слой строки)", needs: "plate" },
  "cam-push": { cat: "G", what: "кадр медленно наезжает на точку (micro — короткий акцент, cut — смена плана)", opts: "zoom, roll, micro, mode (push · micro · cut)", needs: "cam" },
  "shake-hit": { cat: "G", what: "кадр вздрагивает на ударе (в lesson/magazine выключен)", opts: "amount", needs: "cam" },
  "whip-paper": { cat: "G", what: "две сцены едут как одна панорама со смазом", opts: "dir, axis", needs: "cam" },
  "iris-hand": { cat: "G", what: "вокруг слова рисуется круг, фон уходит в бумагу, круг сжимается в точку", opts: "word, wordIn, color, seed, out", needs: "cam" },
  "nod": { cat: "H", what: "кивок в такт слову; tilt — наклон головы к слову без возврата", opts: "tilt, second, cause, to", needs: "actor" },
  "lean-to": { cat: "H", what: "корпус тянется к предмету; point — со сменой позы на указывающую", opts: "point, to, back", needs: "actor" },
  "take": { cat: "H", what: "удивление-озарение; cheer — радость, light — лёгкий", opts: "cheer, light, pose", needs: "actor" },
  "catch": { cat: "H", what: "ловит летящий предмет на ладонь", opts: "item, palmU", needs: "actor" },
  "throw": { cat: "H", what: "замах и бросок с доводкой", opts: "item, to", needs: "actor" },
  "sparks": { cat: "H", what: "три маркерных штриха веером над головой", opts: "seed", needs: "actor" },
  "listen": { cat: "H", what: "«я тебя слушаю» — ждёт ответа зрителя", opts: "t0, t1, back", needs: "actor" },
  "wave": { cat: "H", what: "машет на прощание", opts: "at, cause", needs: "actor" }
};

/** Группы каталога: буква → название. */
var KB_MOVE_GROUPS = { A: "текст — вход", B: "текст — выход", C: "цикл", D: "акцент слова", E: "субтитры", F: "плашки", G: "камера и переходы", H: "реакции героя" };

/**
 * Плашка-предмет (тег, слот, штамп, выноска, карточка, голая подпись).
 * @param {CompItem} comp
 * @param {any} o {kind: tag|slot|badge|callout|card|bare, text|lines, x, y, side?, anchor?, tilt?, seed?, name?}
 * @returns {any} {root, body, edge, shadow, text[], …} — см. tlPlate
 */
function kbPlate(comp, o) {
  return tlPlate(comp, o);
}

/**
 * Паспорт героя по id или объекту; без hero — KB_CONFIG.hero проекта, без него — KB_HERO_DEFAULT кита (\"arlan\").
 * @param {any=} hero
 * @returns {any}
 */
function kbHero(hero) {
  var h = hero === undefined || hero === null ? kbConfig("hero", typeof KB_HERO_DEFAULT !== "undefined" ? KB_HERO_DEFAULT : null) : hero;
  if (h === null) throw new Error("kbHero: герой не задан — hero в опциях или KB_CONFIG.hero в kit.config.jsx (есть: " + kbHeroIds().join(", ") + ")");
  if (typeof h === "string") {
    if (!TL_HEROES[h]) throw new Error("kbHero: нет героя «" + h + "» в kit/heroes (есть: " + kbHeroIds().join(", ") + ")");
    return TL_HEROES[h];
  }
  return h;
}

/** @returns {string[]} id героев kit/heroes */
function kbHeroIds() {
  var ids = [];
  for (var k in TL_HEROES) ids.push(k);
  return ids;
}

/**
 * Актёр: герой на бумаге с дыханием, разрезом, изгибом и позами. Реакции — kbMove(actor.layer, "take", {…}); в конце — kbActorDone(actor).
 * @param {CompItem} comp
 * @param {any} o {hero?: id|паспорт (по умолчанию KB_CONFIG.hero, иначе Арлан), feet: [x, y], h: высота px, pose?: роль, name?}
 * @returns {any} актёр (A.layer — слой в композиции)
 */
function kbActor(comp, o) {
  /** @type {any} */
  var opts = {};
  for (var k in o) opts[k] = o[k];
  opts.hero = kbHero(o.hero);
  return tlActor(comp, opts);
}

/**
 * Записать каналы актёра (ключи и выражения) после всех реакций.
 * @param {any} actor
 */
function kbActorDone(actor) {
  tlActorDone(actor);
}

/**
 * Каталог движений из реестра (для README и MCP list_motions).
 * @param {{group?: string, style?: string}=} f group — буква A…H или group реестра (text-in, actor…); style — показать подмену
 * @returns {any[]}
 */
function kbMoveList(f) {
  f = f || {};
  var names = [];
  var name;
  for (name in TL_MOVES) names.push(name);
  names.sort();
  var swap = {};
  if (f.style) {
    if (!TL_STYLES[f.style]) throw new Error("kbMoveList: нет стиля «" + f.style + "» (hand, brisk, lesson, magazine)");
    swap = TL_STYLES[f.style].swap || {};
  }
  var out = [];
  for (var i = 0; i < names.length; i++) {
    name = names[i];
    var d = TL_MOVES[name];
    var info = KB_MOVE_INFO[name] || { cat: "?", what: "", opts: "", needs: "" };
    if (f.group && f.group !== info.cat && f.group !== d.group) continue;
    var params = {};
    for (var p in (d.params || {})) if (d.params[p] !== undefined) params[p] = d.params[p];
    var row = { name: name, cat: info.cat, catName: KB_MOVE_GROUPS[info.cat] || "", group: d.group, slot: d.slot, units: d.units || [],
      unit: d.unit || "", what: info.what, opts: info.opts, needs: info.needs, params: params, lead: d.lead === undefined ? null : d.lead,
      sfx: d.sfx ? d.sfx.kind : null };
    if (f.style) row.swappedTo = swap[name] || null;
    out.push(row);
  }
  return out;
}

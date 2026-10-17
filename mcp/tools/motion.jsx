// Пресеты движения кита (kit/move.jsx) через MCP: каталог, применение к слою или выделению, стиль, выделенные слои.
// Движение = kbMove кита; раннер, подмены стиля и звуковые маркеры — те же, что у сборок скриптами.
// Стиль хранится в проекте: тег «kb-motion-style:<имя>» в комментарии композиции; стиль проекта — в настройках AE
// по пути .aep (app.settings, раздел ae-mcp-motion-style). Порядок: style вызова → композиция → проект → hand.

//@include "../../kit/move.jsx"

var MCP_MOTION_TAG = "kb-motion-style:";
var MCP_MOTION_SECTION = "ae-mcp-motion-style";
var MCP_MOTION_STYLES = { hand: true, brisk: true, lesson: true, magazine: true };

/**
 * Композиция по имени или активная.
 * @param {string=} name
 * @returns {CompItem}
 */
function mcpMotionComp(name) {
  if (name) return mcpFindComp(name);
  var item = app.project.activeItem;
  if (item instanceof CompItem) return item;
  throw new Error("Нет активной композиции: откройте композицию в AE или укажите comp");
}

/**
 * Слой по номеру (1 — верхний) или точному имени.
 * @param {CompItem} comp
 * @param {any} ref
 * @returns {Layer}
 */
function mcpMotionLayer(comp, ref) {
  if (typeof ref === "number") {
    if (ref < 1 || ref > comp.numLayers || Math.floor(ref) !== ref) throw new Error("Нет слоя №" + ref + " (в «" + comp.name + "» слоёв " + comp.numLayers + ")");
    return comp.layer(ref);
  }
  return mcpFindLayer(comp, String(ref));
}

/** @returns {string} ключ проекта для стиля */
function mcpMotionProjectKey() {
  return app.project.file ? app.project.file.fsName : "(несохранённый)";
}

/**
 * Стиль композиции из тега в комментарии ("" — тега нет).
 * @param {CompItem} comp
 * @returns {string}
 */
function mcpMotionCompTag(comp) {
  var lines = String(comp.comment || "").split("\n");
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf(MCP_MOTION_TAG) === 0) return lines[i].substring(MCP_MOTION_TAG.length).replace(/\s+/g, "");
  }
  return "";
}

/**
 * Записать (name) или снять (null) тег стиля в комментарии композиции, остальной текст комментария не трогать.
 * @param {CompItem} comp
 * @param {string|null} name
 */
function mcpMotionSetCompTag(comp, name) {
  var lines = String(comp.comment || "").split("\n");
  var keep = [];
  for (var i = 0; i < lines.length; i++) if (lines[i].indexOf(MCP_MOTION_TAG) !== 0 && lines[i] !== "") keep.push(lines[i]);
  if (name) keep.push(MCP_MOTION_TAG + name);
  comp.comment = keep.join("\n");
}

/** @returns {string} стиль проекта ("" — не задан) */
function mcpMotionProjectStyle() {
  var key = mcpMotionProjectKey();
  if (!app.settings.haveSetting(MCP_MOTION_SECTION, key)) return "";
  return String(app.settings.getSetting(MCP_MOTION_SECTION, key));
}

/**
 * Какой стиль действует для композиции и откуда он взят.
 * @param {CompItem|null} comp
 * @param {string=} explicit
 * @returns {{name: string, scope: string}}
 */
function mcpMotionStyleFor(comp, explicit) {
  if (explicit) return { name: explicit, scope: "call" };
  var tag = comp ? mcpMotionCompTag(comp) : "";
  if (tag) return { name: tag, scope: "comp" };
  var proj = mcpMotionProjectStyle();
  if (proj) return { name: proj, scope: "project" };
  return { name: "hand", scope: "default" };
}

/** @param {string} name */
function mcpMotionCheckStyle(name) {
  if (!MCP_MOTION_STYLES[name]) throw new Error("Нет стиля «" + name + "»: hand, brisk, lesson, magazine");
}

/**
 * Таблица стиля для ответа.
 * @param {string} name
 * @returns {any}
 */
function mcpMotionStyleInfo(name) {
  var s = TL_STYLES[name];
  return { name: name, dur: s.dur, strength: s.strength, overCap: s.overCap, hitCap: s.hitCap, swap: s.swap || {}, swapOpts: s.swapOpts || {} };
}

/**
 * Опции вызова: строки «@имя» — слой этой композиции (next, target, item…), остальное как есть.
 * @param {CompItem} comp
 * @param {any} opts
 * @returns {any}
 */
function mcpMotionOpts(comp, opts) {
  var o = {};
  for (var k in (opts || {})) {
    var v = opts[k];
    if (typeof v === "string" && v.charAt(0) === "@") v = mcpFindLayer(comp, v.substring(1));
    o[k] = v;
  }
  return o;
}

/**
 * Время маркера на слое: комментарий равен marker (или начинается с него).
 * @param {CompItem} comp
 * @param {{layer: any, marker: string}} a
 * @returns {number}
 */
function mcpMotionAnchor(comp, a) {
  var layer = mcpMotionLayer(comp, a.layer);
  var markers = kbProp(layer, ["ADBE Marker"]);
  var names = [];
  for (var i = 1; i <= markers.numKeys; i++) {
    var c = markers.keyValue(i).comment;
    names.push(c);
    if (c === a.marker) return markers.keyTime(i);
  }
  throw new Error("На слое «" + layer.name + "» нет маркера «" + a.marker + "»" + (names.length ? " (есть: " + names.slice(0, 20).join(", ") + ")" : ""));
}

/** @param {number} t */
function mcpMotionR(t) {
  return Math.round(t * 1000) / 1000;
}

MCP_TOOLS.list_motions = {
  write: false,
  run: function (args) {
    if (args.style) mcpMotionCheckStyle(args.style);
    var rows = kbMoveList({ group: args.group, style: args.style });
    var styles = {};
    for (var n in MCP_MOTION_STYLES) styles[n] = mcpMotionStyleInfo(n);
    var active = null;
    try { active = mcpMotionStyleFor(app.project.activeItem instanceof CompItem ? /** @type {CompItem} */ (app.project.activeItem) : null); } catch (e) { active = null; }
    return { count: rows.length, groups: KB_MOVE_GROUPS, motions: rows, styles: styles, activeStyle: active, heroes: kbHeroIds(), defaultHero: kbConfig("hero", KB_HERO_DEFAULT) };
  }
};

MCP_TOOLS.apply_motion = {
  write: true,
  run: function (args) {
    var comp = mcpMotionComp(args.comp);
    if (!args.name) throw new Error("Не указано движение (name): list_motions покажет 41 имя");
    if (!TL_MOVES[args.name]) throw new Error("Нет движения «" + args.name + "». Есть: " + kbMoveList({}).length + " — list_motions");
    if (args.style) mcpMotionCheckStyle(args.style);
    var st = mcpMotionStyleFor(comp, args.style);
    mcpMotionCheckStyle(st.name);
    kbMoveStyleUse(st.name);
    var info = KB_MOVE_INFO[args.name];
    var target = TL_S.swap[args.name] || args.name;
    var tinfo = KB_MOVE_INFO[target] || info;
    if (tinfo && tinfo.needs === "actor") {
      throw new Error("«" + target + "» — реакция героя: актёр собирается китом в том же скрипте (kbActor → kbMove → kbActorDone), между вызовами MCP его нет");
    }
    var layers = [];
    if (args.selection) {
      var sel = comp.selectedLayers;
      if (!sel.length) throw new Error("В «" + comp.name + "» ничего не выделено (get_selection)");
      for (var s = 0; s < sel.length; s++) layers.push(sel[s]);
    } else {
      if (args.layer === undefined || args.layer === null) throw new Error("Нужен layer (номер или имя) или selection: true");
      layers.push(mcpMotionLayer(comp, args.layer));
    }
    var fps = comp.frameRate;
    var out = [];
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var o = mcpMotionOpts(comp, args.opts);
      if (args.at !== undefined) o.at = args.at;
      else if (args.anchor) o.at = mcpMotionAnchor(comp, args.anchor);
      if (o.at === undefined && o.start === undefined && o.from === undefined && o.t0 === undefined) o.start = layer.inPoint;
      var r = kbMove(layer, args.name, o);
      var row = { layer: layer.name, index: layer.index, name: r.name, start: mcpMotionR(r.start), hit: mcpMotionR(r.hit), end: mcpMotionR(r.end),
        frames: { start: Math.round(r.start * fps), hit: Math.round(r.hit * fps), end: Math.round(r.end * fps) }, units: r.units || 0, sfx: [] };
      if (r.from !== r.name) row.swappedFrom = r.from;
      for (var j = 0; j < r.sfx.length; j++) row.sfx.push({ kind: r.sfx[j].kind, t: mcpMotionR(r.sfx[j].t), strength: r.sfx[j].strength });
      out.push(row);
    }
    return { comp: mcpItemPath(comp), style: st, applied: out };
  }
};

MCP_TOOLS.set_motion_style = {
  write: true,
  run: function (args) {
    var name = args.style;
    if (name !== null && name !== "") mcpMotionCheckStyle(name);
    /** @type {any} */
    var res;
    if (args.comp) {
      var comp = mcpFindComp(args.comp);
      mcpMotionSetCompTag(comp, name || null);
      res = { scope: "comp", comp: mcpItemPath(comp) };
    } else {
      var key = mcpMotionProjectKey();
      app.settings.saveSetting(MCP_MOTION_SECTION, key, name || "");
      res = { scope: "project", project: key };
    }
    res.style = name ? mcpMotionStyleInfo(name) : null;
    res.note = name ? "apply_motion берёт стиль: вызов → композиция → проект → hand" : "стиль снят";
    return res;
  }
};

MCP_TOOLS.get_selection = {
  write: false,
  run: function (args) {
    var comp = mcpMotionComp(args.comp);
    var sel = comp.selectedLayers;
    var layers = [];
    for (var i = 0; i < sel.length; i++) {
      var l = sel[i];
      layers.push({ index: l.index, name: l.name, type: mcpLayerKind(l), "in": mcpMotionR(l.inPoint), out: mcpMotionR(l.outPoint) });
    }
    return { comp: mcpItemPath(comp), time: mcpMotionR(comp.time), count: layers.length, layers: layers, style: mcpMotionStyleFor(comp) };
  }
};

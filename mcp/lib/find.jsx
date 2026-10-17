// Поиск композиций, слоёв и элементов проекта по имени, не по индексу.
// Ни одного совпадения или несколько — ошибка с подсказкой, а не «первый попавшийся».

/**
 * Путь элемента в панели Project: "Папка/Подпапка/Имя".
 * @param {Item} item
 * @returns {string}
 */
function mcpItemPath(item) {
  var parts = [item.name];
  var folder = item.parentFolder;
  while (folder && folder !== app.project.rootFolder) {
    parts.unshift(folder.name);
    folder = folder.parentFolder;
  }
  return parts.join("/");
}

/**
 * Композиция по имени или пути "Папка/Имя".
 * @param {string} name
 * @returns {CompItem}
 */
function mcpFindComp(name) {
  if (!name) throw mcpNoChange(new Error("Не указано имя композиции"));
  var byPath = name.indexOf("/") >= 0;
  var found = [];
  var all = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    all.push(mcpItemPath(item));
    if ((byPath ? mcpItemPath(item) : item.name) === name) found.push(item);
  }
  if (found.length === 1) return found[0];
  if (found.length > 1) {
    var paths = [];
    for (var j = 0; j < found.length; j++) paths.push(mcpItemPath(found[j]));
    throw mcpNoChange(new Error("Композиций «" + name + "» несколько: " + paths.join(", ") + ". Укажите путь с папкой или переименуйте."));
  }
  throw mcpNoChange(new Error("Нет композиции «" + name + "». Есть: " + (all.length ? all.slice(0, 30).join(", ") : "ни одной")));
}

/**
 * Слой по имени внутри композиции.
 * @param {CompItem} comp
 * @param {string} name
 * @returns {Layer}
 */
function mcpFindLayer(comp, name) {
  if (!name) throw mcpNoChange(new Error("Не указано имя слоя"));
  var found = [];
  var all = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    var layer = comp.layer(i);
    all.push(layer.name);
    if (layer.name === name) found.push(layer);
  }
  if (found.length === 1) return found[0];
  if (found.length > 1) {
    throw mcpNoChange(new Error("В «" + comp.name + "» слоёв «" + name + "» несколько (" + found.length + "). Переименуйте их, чтобы различать."));
  }
  throw mcpNoChange(new Error("В «" + comp.name + "» нет слоя «" + name + "». Есть: " + (all.length ? all.slice(0, 40).join(", ") : "ни одного")));
}

/**
 * Ближайшие имена для подсказки в ошибке: сначала с подстрокой, потом по расстоянию правки.
 * @param {string} name
 * @param {string[]} names
 * @param {number} max
 * @returns {string[]}
 */
function mcpNearest(name, names, max) {
  var q = String(name).toLowerCase();
  var rows = [];
  for (var i = 0; i < names.length; i++) {
    var n = String(names[i]).toLowerCase();
    var d = mcpEditDistance(q, n);
    if (n.indexOf(q) >= 0 || q.indexOf(n) >= 0) d -= 100;
    rows.push({ name: names[i], d: d });
  }
  rows.sort(function (a, b) { return a.d - b.d || (a.name < b.name ? -1 : 1); });
  var out = [];
  for (var j = 0; j < rows.length && j < max; j++) out.push(rows[j].name);
  return out;
}

/**
 * Расстояние Левенштейна.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function mcpEditDistance(a, b) {
  var prev = [];
  var j;
  for (j = 0; j <= b.length; j++) prev.push(j);
  for (var i = 1; i <= a.length; i++) {
    var cur = [i];
    for (j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[b.length];
}

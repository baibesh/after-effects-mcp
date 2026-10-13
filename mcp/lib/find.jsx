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
  if (!name) throw new Error("Не указано имя композиции");
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
    throw new Error("Композиций «" + name + "» несколько: " + paths.join(", ") + ". Укажите путь с папкой или переименуйте.");
  }
  throw new Error("Нет композиции «" + name + "». Есть: " + (all.length ? all.slice(0, 30).join(", ") : "ни одной"));
}

/**
 * Слой по имени внутри композиции.
 * @param {CompItem} comp
 * @param {string} name
 * @returns {Layer}
 */
function mcpFindLayer(comp, name) {
  if (!name) throw new Error("Не указано имя слоя");
  var found = [];
  var all = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    var layer = comp.layer(i);
    all.push(layer.name);
    if (layer.name === name) found.push(layer);
  }
  if (found.length === 1) return found[0];
  if (found.length > 1) {
    throw new Error("В «" + comp.name + "» слоёв «" + name + "» несколько (" + found.length + "). Переименуйте их, чтобы различать.");
  }
  throw new Error("В «" + comp.name + "» нет слоя «" + name + "». Есть: " + (all.length ? all.slice(0, 40).join(", ") : "ни одного"));
}

// Ядро кита: журнал, доступ к свойствам по matchName, обёртка запуска, настройки проекта.
// Остальные файлы кита подключают его первым: //@include "core.jsx"
//
// Кит общий: источник — ae-plugin/kit, в проекте ae/kit — его копия (tools/kit-sync.mjs в ae-plugin).
// KB_ROOT — папка ae/ проекта: журнал, кадры и ассеты остаются у проекта.
//
// Свойства берём только через kbProp/kbGroup: при опечатке в пути AE отвечает
// «undefined is not an object» без адреса, а здесь — какое звено какого пути не нашлось.
// Заодно это даёт валидатору типы (tools/validate.mjs, правило types).

var KB_ROOT = new File($.fileName).parent.parent;
var KB_LOG = new File(KB_ROOT.fsName + "/out/ae.log");

// Настройки проекта — ae/kit.config.jsx: дописывает поля в KB_CONFIG (шрифты, папки картинок).
// Нет файла — значения кита по умолчанию. Образец — kit/README.md «Настройки проекта».
/** @type {any} */
var KB_CONFIG = {};
var KB_CONFIG_FILE = new File(KB_ROOT.fsName + "/kit.config.jsx"); // ae-ok: asset — файл необязательный
if (KB_CONFIG_FILE.exists) $.evalFile(KB_CONFIG_FILE);

/**
 * Значение из настроек проекта или значение по умолчанию.
 * @param {string} key
 * @param {any} fallback
 * @returns {any}
 */
function kbConfig(key, fallback) {
  return KB_CONFIG[key] === undefined ? fallback : KB_CONFIG[key];
}

/** @param {string} message */
function kbLog(message) {
  if (!KB_LOG.parent.exists) KB_LOG.parent.create();
  KB_LOG.encoding = "UTF-8";
  KB_LOG.lineFeed = "Unix";
  KB_LOG.open("a");
  KB_LOG.writeln(new Date().toTimeString().substr(0, 8) + "  " + message);
  KB_LOG.close();
}

/**
 * @param {any} owner слой или группа свойств
 * @param {string[]} path цепочка matchName
 * @returns {any}
 */
function kbResolve(owner, path) {
  var node = owner;
  for (var i = 0; i < path.length; i++) {
    var next = node.property(path[i]);
    if (!next) {
      throw new Error("Нет свойства «" + path[i] + "» у «" + node.name + "» (путь: " + path.join(" → ") + ")");
    }
    node = next;
  }
  return node;
}

/**
 * Свойство со значением и ключами.
 * @param {any} owner
 * @param {string[]} path
 * @returns {Property}
 */
function kbProp(owner, path) {
  return kbResolve(owner, path);
}

/**
 * Группа свойств (в неё можно добавлять).
 * @param {any} owner
 * @param {string[]} path
 * @returns {PropertyGroup}
 */
function kbGroup(owner, path) {
  return kbResolve(owner, path);
}

/**
 * Добавить в группу свойство-группу: эффект, аниматор текста, содержимое shape-слоя.
 * @param {PropertyGroup} group
 * @param {string} matchName
 * @returns {PropertyGroup}
 */
function kbAdd(group, matchName) {
  if (!group.canAddProperty(matchName)) {
    throw new Error("В «" + group.name + "» нельзя добавить «" + matchName + "»");
  }
  return /** @type {PropertyGroup} */ (group.addProperty(matchName));
}

/**
 * @param {Layer} layer
 * @param {string} matchName
 * @returns {PropertyGroup}
 */
function kbEffect(layer, matchName) {
  return kbAdd(kbGroup(layer, ["ADBE Effect Parade"]), matchName);
}

/**
 * Запуск сборки: одна отмена на всё, ошибка — в журнал с файлом и строкой.
 * Возвращаемая строка уходит в stdout osascript.
 * @param {string} name
 * @param {function(): void} build
 * @returns {string}
 */
function kbRun(name, build) {
  var result;
  kbLog("▶ " + name);
  app.beginUndoGroup(name);
  try {
    build();
    result = "OK " + name;
  } catch (e) {
    result = "ERR " + name + ": " + e.message + " (" + new File(e.fileName).name + ":" + e.line + ")";
  } finally {
    app.endUndoGroup();
  }
  kbLog(result);
  return result;
}

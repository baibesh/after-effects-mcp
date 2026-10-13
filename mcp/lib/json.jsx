// JSON.stringify для ExtendScript (ES3, встроенного JSON нет).
// Разбор (parse) в AE не нужен: сервер передаёт аргументы готовым литералом в файле запроса,
// поэтому eval чужого текста здесь нет вовсе.

/**
 * @param {string} s
 * @returns {string}
 */
function mcpQuote(s) {
  var out = '"';
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    var code = s.charCodeAt(i);
    if (c === '"') out += '\\"';
    else if (c === "\\") out += "\\\\";
    else if (c === "\n") out += "\\n";
    else if (c === "\r") out += "\\r";
    else if (c === "\t") out += "\\t";
    else if (code < 0x20 || code === 0x2028 || code === 0x2029) {
      var hex = code.toString(16);
      while (hex.length < 4) hex = "0" + hex;
      out += "\\u" + hex;
    } else out += c;
  }
  return out + '"';
}

/**
 * @param {any} value
 * @returns {string}
 */
function mcpStringify(value) {
  if (value === null || value === undefined) return "null";
  var type = typeof value;
  if (type === "number") return isFinite(value) ? String(value) : "null";
  if (type === "boolean") return value ? "true" : "false";
  if (type === "string") return mcpQuote(value);
  if (type === "function") return "null";
  if (value instanceof Array) {
    var items = [];
    for (var i = 0; i < value.length; i++) items.push(mcpStringify(value[i]));
    return "[" + items.join(",") + "]";
  }
  var parts = [];
  for (var key in value) {
    if (!value.hasOwnProperty(key)) continue;
    var v = value[key];
    if (v === undefined || typeof v === "function") continue;
    parts.push(mcpQuote(key) + ":" + mcpStringify(v));
  }
  return "{" + parts.join(",") + "}";
}

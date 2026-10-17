#!/usr/bin/env bash
# Установка и обновление MCP-сервера After Effects на этом Mac — одна команда, можно запускать повторно.
#
#   ./install.sh                 обновить клон (git pull --ff-only), собрать, проверить, зарегистрировать в Claude Code
#   ./install.sh --sync          ещё и обновить копии кита в проектах (kit-sync)
#   ./install.sh --desktop       ещё и прописать сервер в Claude Desktop (с резервной копией конфига)
#   ./install.sh --brew          поставить недостающие node и ffmpeg через Homebrew
#   ./install.sh --no-pull --no-test --smoke
#
# Новый Mac:  git clone git@github.com:baibesh/after-effects-mcp.git ~/Projects/ae-plugin && ~/Projects/ae-plugin/install.sh
#
# Настройки этой машины — ~/.config/ae-mcp/config.sh (создаётся при первом запуске, папки проектов находятся сами):
#   AE_MCP_PROJECTS        папки ae/ проектов с копией кита (через пробел) — для kit-sync и замков
#   AE_MCP_PROJECT_ROOTS   папки, проекты из которых сервер может менять (по умолчанию <repo>/test)
#   AE_MCP_RENDER_DIR      куда писать мастера (по умолчанию <repo>/out/renders)
# Замки чужих конвейеров (AE_MCP_FOREIGN_LOCKS) собираются из AE_MCP_PROJECTS: <ae>/out/.ae-lock.
#
# Скрипт ничего не меняет в After Effects и системе: настройки AE и шрифты только проверяет и подсказывает.

set -euo pipefail
export npm_config_update_notifier=false

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$HOME/.config/ae-mcp"
CONFIG="$CONFIG_DIR/config.sh"
SERVER_NAME="after-effects"

PULL=1 TEST=1 SYNC=0 DESKTOP=0 BREW=0 SMOKE=0
for a in "$@"; do
  case "$a" in
    --no-pull) PULL=0 ;;
    --no-test) TEST=0 ;;
    --sync) SYNC=1 ;;
    --desktop) DESKTOP=1 ;;
    --brew) BREW=1 ;;
    --smoke) SMOKE=1 ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Неизвестный флаг: $a (--help)"; exit 2 ;;
  esac
done

ok=() warn=()
step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
good() { printf '  ✓ %s\n' "$1"; ok+=("$1"); }
note() { printf '  ! %s\n' "$1"; warn+=("$1"); }
die() { printf '\n  ✗ %s\n' "$1"; exit 1; }
# Строка в файле настроек AE (переводы строк — CR). Не grep -q: он выходит на первом совпадении,
# tr получает SIGPIPE, и с pipefail конвейер считается неудачным.
prefs_has() { tr '\r' '\n' < "$1" | grep -F -- "$2" >/dev/null; }

# ---------- окружение ----------

step "Окружение"
[ "$(uname -s)" = "Darwin" ] || die "Только macOS: сервер управляет AE через osascript"
[ -f "$REPO/package.json" ] && grep -q '"name": "ae-mcp"' "$REPO/package.json" || die "install.sh должен лежать в корне ae-plugin"
command -v git >/dev/null || die "Нет git: xcode-select --install"

need_brew() {
  if [ "$BREW" = 1 ] && command -v brew >/dev/null; then brew install "$1"; else return 1; fi
}

if ! command -v node >/dev/null; then
  need_brew node || die "Нет Node 20+: brew install node (или ./install.sh --brew)"
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 20 ] || die "Node $(node -v) — нужен 20+: brew upgrade node"
good "Node $(node -v)"

if command -v ffmpeg >/dev/null || need_brew ffmpeg; then
  good "ffmpeg"
else
  note "нет ffmpeg — не будут работать deliver и превью: brew install ffmpeg (или --brew)"
fi

AE_APP="${AE_MCP_APP:-$(ls /Applications 2>/dev/null | grep -E '^Adobe After Effects [0-9]+$' | sort | tail -1 || true)}"
if [ -n "$AE_APP" ]; then good "$AE_APP"; else note "After Effects не найден в /Applications — сервер соберётся, но работать будет только после установки AE"; fi

# ---------- обновление и сборка ----------

step "Код"
cd "$REPO"
if [ "$PULL" = 1 ] && git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  if [ -n "$(git status --porcelain)" ]; then
    note "в клоне незакоммиченные правки — git pull пропущен"
  else
    before="$(git rev-parse --short HEAD)"
    if git pull --ff-only --quiet; then
      after="$(git rev-parse --short HEAD)"
      [ "$before" = "$after" ] && good "ветка $(git branch --show-current) @ $after — уже свежая" || good "обновлено $before → $after"
    else
      note "git pull --ff-only не прошёл (ветка разошлась с origin) — собираю то, что есть"
    fi
  fi
else
  good "ветка $(git branch --show-current) @ $(git rev-parse --short HEAD) (без pull)"
fi

if [ -f package-lock.json ]; then npm ci --no-audit --no-fund --loglevel=error; else npm install --no-audit --no-fund --loglevel=error; fi
good "зависимости"
npm run -s build >/dev/null 2>&1 || die "сборка не прошла: npm run build"
[ -f build/index.js ] || die "сборка не создала build/index.js"
good "сборка build/index.js"

if [ "$TEST" = 1 ]; then
  npm run -s typecheck >/dev/null || die "typecheck не прошёл: npm run typecheck"
  out="$(npm test 2>&1)" || { echo "$out" | tail -20; die "тесты не прошли: npm test"; }
  good "тесты: $(echo "$out" | sed -n 's/^ℹ pass //p') прошли"
  vout="$(npm run -s validate 2>&1)" || { echo "$vout" | tail -15; die "валидатор ExtendScript нашёл ошибки: npm run validate"; }
  good "валидатор: $(echo "$vout" | tail -1)"
fi

# ---------- настройки машины ----------

step "Настройки машины"
if [ ! -f "$CONFIG" ]; then
  mkdir -p "$CONFIG_DIR"
  # find возвращает ошибку на папках без доступа (а с pipefail это выход из скрипта) — отсюда || true.
  found="$(find "$HOME" -maxdepth 6 -path "$HOME/Library" -prune -o -path '*/node_modules' -prune -o -path '*/ae/kit/.kit-source' -print 2>/dev/null | sed 's|/kit/.kit-source$||' | sort | tr '\n' ' ' | sed 's/ $//' || true)"
  cat > "$CONFIG" <<EOF
# Настройки ae-mcp на этой машине (install.sh). Правьте и перезапустите ./install.sh.
# Папки ae/ проектов с копией кита — kit-sync и замки чужих конвейеров.
AE_MCP_PROJECTS="$found"
# Папки, проекты из которых сервер может менять (через запятую); пусто — <repo>/test.
AE_MCP_PROJECT_ROOTS=""
# Куда писать мастера; пусто — <repo>/out/renders.
AE_MCP_RENDER_DIR=""
EOF
  good "создан $CONFIG (найдено проектов: $(echo "$found" | wc -w | tr -d ' '))"
else
  good "настройки: $CONFIG"
fi
# shellcheck disable=SC1090
source "$CONFIG"

locks=""
for p in ${AE_MCP_PROJECTS:-}; do
  if [ -d "$p" ]; then locks="${locks:+$locks,}$p/out/.ae-lock"; else note "проект из настроек не найден: $p"; fi
done

env_flags=()
[ -n "$locks" ] && env_flags+=(-e "AE_MCP_FOREIGN_LOCKS=$locks")
[ -n "${AE_MCP_PROJECT_ROOTS:-}" ] && env_flags+=(-e "AE_MCP_PROJECT_ROOTS=$AE_MCP_PROJECT_ROOTS")
[ -n "${AE_MCP_RENDER_DIR:-}" ] && env_flags+=(-e "AE_MCP_RENDER_DIR=$AE_MCP_RENDER_DIR")

# ---------- Claude ----------

step "Claude"
if command -v claude >/dev/null; then
  claude mcp remove "$SERVER_NAME" -s user >/dev/null 2>&1 || true
  claude mcp add "$SERVER_NAME" --scope user ${env_flags[@]+"${env_flags[@]}"} -- node "$REPO/build/index.js" >/dev/null
  good "Claude Code: сервер «$SERVER_NAME» в user scope (доступен из любой папки) — новые инструменты появятся в новых сессиях"
else
  note "нет команды claude — Claude Code не зарегистрирован (поставить Claude Code и перезапустить install.sh)"
fi

if [ "$DESKTOP" = 1 ]; then
  desk="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
  mkdir -p "$(dirname "$desk")"
  [ -f "$desk" ] && cp "$desk" "$desk.bak-$(date +%Y%m%d-%H%M%S)"
  DESK="$desk" SERVER="$SERVER_NAME" ENTRY="$REPO/build/index.js" LOCKS="$locks" ROOTS="${AE_MCP_PROJECT_ROOTS:-}" RENDER="${AE_MCP_RENDER_DIR:-}" node -e '
    const fs = require("fs");
    const f = process.env.DESK;
    const cfg = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
    const env = {};
    if (process.env.LOCKS) env.AE_MCP_FOREIGN_LOCKS = process.env.LOCKS;
    if (process.env.ROOTS) env.AE_MCP_PROJECT_ROOTS = process.env.ROOTS;
    if (process.env.RENDER) env.AE_MCP_RENDER_DIR = process.env.RENDER;
    cfg.mcpServers = { ...(cfg.mcpServers || {}), [process.env.SERVER]: { command: "node", args: [process.env.ENTRY], env } };
    fs.writeFileSync(f, JSON.stringify(cfg, null, 2) + "\n");
  '
  good "Claude Desktop: $desk (перезапустить Claude Desktop)"
fi

# ---------- кит в проектах ----------

step "Кит в проектах"
if [ -z "${AE_MCP_PROJECTS:-}" ]; then
  good "проектов с копией кита нет (AE_MCP_PROJECTS в $CONFIG)"
fi
for p in ${AE_MCP_PROJECTS:-}; do
  [ -d "$p" ] || continue
  if node tools/kit-sync.mjs "$p" --check >/dev/null 2>&1; then
    good "$p — кит актуален"
  elif [ "$SYNC" = 1 ]; then
    if node tools/kit-sync.mjs "$p"; then good "$p — кит обновлён"; else note "$p — kit-sync отказался (правки кита прямо в проекте?) — см. вывод выше"; fi
  else
    note "$p — кит отстаёт от ae-plugin: ./install.sh --sync (или node tools/kit-sync.mjs \"$p\")"
  fi
done

# ---------- After Effects и шрифты ----------

step "After Effects"
if [ -n "$AE_APP" ]; then
  prefs_dir="$(ls -d "$HOME/Library/Preferences/Adobe/After Effects/"*/ 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$prefs_dir" ]; then
    main_prefs="$(ls "$prefs_dir"*" Prefs.txt" 2>/dev/null | head -1 || true)"
    if [ -n "$main_prefs" ] && prefs_has "$main_prefs" '"Pref_SCRIPTING_FILE_NETWORK_SECURITY" = "1"'; then
      good "скриптам разрешено писать файлы"
    else
      note "Settings → Scripting & Expressions → Allow Scripts to Write Files and Access Network — включить (без этого AE не ответит)"
    fi
    out_prefs="$(ls "$prefs_dir"*Prefs-indep-output.txt 2>/dev/null | head -1 || true)"
    if [ -n "$out_prefs" ] && prefs_has "$out_prefs" 'MCP ProRes 422 HQ'; then
      good "шаблоны вывода «MCP ProRes …»"
    else
      note "нет шаблонов вывода «MCP ProRes 422 HQ / 4444» — мастера пойдут штатным High Quality (README «Настройка After Effects», п. 2)"
    fi
  else
    note "настроек AE ещё нет — запустить AE один раз и включить Allow Scripts to Write Files and Access Network"
  fi
fi

missing=()
for w in Black Bold SemiBold Medium Regular; do
  have=0
  for d in "$HOME/Library/Fonts" /Library/Fonts; do compgen -G "$d/Inter-$w.*" >/dev/null && have=1; done
  [ "$have" = 1 ] || missing+=("Inter-$w")
done
if [ ${#missing[@]} -eq 0 ]; then good "шрифты Inter (кит и стили серии)"; else note "нет шрифтов: ${missing[*]} — поставить Inter (rsms.me/inter) в ~/Library/Fonts"; fi

if [ "$SMOKE" = 1 ] || pgrep -qf "$AE_APP.app" 2>/dev/null; then
  if [ -n "$AE_APP" ] && status="$(node build/cli.js ae_status 2>&1)"; then
    good "AE отвечает: $(echo "$status" | sed -n 's/.*"version": "\([^"]*\)".*/\1/p')"
  elif [ -n "$AE_APP" ]; then
    note "AE не ответил: $(echo "$status" | sed -n 's/.*"error": "\([^"]*\)".*/\1/p' | head -1)"
  fi
fi

# ---------- итог ----------

printf '\n\033[1mГотово:\033[0m %d ✓, %d замечаний\n' "${#ok[@]}" "${#warn[@]}"
for w in ${warn[@]+"${warn[@]}"}; do printf '  ! %s\n' "$w"; done
exit 0

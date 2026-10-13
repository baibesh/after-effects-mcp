# ae-mcp — After Effects для Claude

MCP-сервер, через который Claude управляет Adobe After Effects высокоуровневыми инструментами: смотрит проект и кадры,
собирает слои, применяет пресеты анимации, рендерит мастер-файлы и выдачу под площадки в нескольких форматах.
В этом же репозитории — **общий AE-кит** (`kit/`) проектов kemel-bilim и dilyolu, на котором стоят инструменты.

Форк [Dakkshin/after-effects-mcp](https://github.com/Dakkshin/after-effects-mcp) (MIT), переписанный: панель ScriptUI убрана,
команды идут в AE через `osascript DoScriptFile`, ответ приходит сразу.

- [Как устроено](#как-устроено)
- [Установка](#установка)
- [Настройка After Effects](#настройка-after-effects)
- [Подключение к Claude](#подключение-к-claude)
- [Безопасность](#безопасность)
- [Инструменты](#инструменты)
- [Типовой порядок работы](#типовой-порядок-работы)
- [Разработка](#разработка)
- [Если что-то не так](#если-что-то-не-так)

## Как устроено

```
Claude ──MCP (stdio)──▶ build/index.js ──▶ out/mcp/req-<id>.jsx ──osascript DoScriptFile──▶ After Effects
                             ▲                                                                  │
                             └──────────────── out/mcp/res-<id>.json ◀── mcpDispatch() ◀────────┘
```

1. Сервер (`src/runner.ts`) пишет файл запроса: `var MCP_REQUEST = {…}` — аргументы готовым литералом ES3 (в AE нет
   `JSON.parse`, и `eval` чужого текста не нужен) — и `//@include "mcp/main.jsx"`.
2. `osascript … DoScriptFile` блокирует, пока скрипт не закончит, — поэтому ответ синхронный.
3. `mcp/lib/run.jsx` находит инструмент в `MCP_TOOLS`, оборачивает изменяющие в `app.beginUndoGroup`/`endUndoGroup`
   (одна отмена на вызов), ловит ошибку с файлом и строкой и пишет JSON-ответ в файл.
4. Запуски идут под замком `out/.ae-lock` (AE один на всех), журнал — `out/ae.log` (`▶ / OK / ERR`, как у кита).

```
src/        сервер MCP (TypeScript): index.ts — инструменты, runner.ts — запуск в AE, frames/formats/deliver/presets
mcp/        ES3-часть в AE: lib/ (json, поиск по имени, dispatch), tools/*.jsx — по файлу на группу инструментов
kit/        общий AE-кит (каталог — kit/README.md); в проектах — копия через tools/kit-sync.mjs
presets/    библиотека пресетов анимации (presets/README.md)
tools/      validate.mjs (ES3, matchName, типы AE), kit-sync.mjs, data/ — словари с живого AE 26.5
test/       тестовый проект mcp-test.aep (не в git) — по умолчанию менять можно только его
out/        журнал, кадры, рендеры (не в git)
```

## Установка

Нужно: **macOS**, **After Effects 2026** (проверено на 26.5), **Node 20+**, **ffmpeg** (`brew install ffmpeg`).

```bash
git clone git@github.com:baibesh/after-effects-mcp.git ~/Projects/ae-plugin
```

```bash
cd ~/Projects/ae-plugin && npm install && npm run build
```

Проверка без Claude (AE запустится сам, если не открыт):

```bash
node build/cli.js ae_status
```

## Настройка After Effects

1. **Settings → Scripting & Expressions → Allow Scripts to Write Files and Access Network** — включить. Без этого
   AE не запишет ответ, и сервер скажет «AE не записал ответ».
2. **Шаблоны вывода для мастер-файлов** (один раз; кодек из скрипта не выставить). Edit → Templates → Output Module → New → Edit:

   | Поле | `MCP ProRes 422 HQ` | `MCP ProRes 4444` |
   |---|---|---|
   | Format | QuickTime | QuickTime |
   | Video Codec (Format Options) | Apple ProRes 422 HQ | Apple ProRes 4444 (не XQ) |
   | Channels | RGB | RGB + Alpha |
   | Depth | Trillions of Colors | Trillions of Colors+ |
   | Color | — | Straight (Unmatted) |
   | Audio | 48 kHz, 24 или 32 bit, Stereo | то же |

   Без них мастер рендерится штатными «High Quality» / «High Quality with Alpha» (ProRes 422 / 4444 с 8-битным входом) —
   в ответе `render_master` будет пометка.
3. **Шрифты проекта** должны быть установлены в систему (PostScript-имена — `kit.config.jsx` проекта или значения кита
   по умолчанию: Inter-Black/-Bold/-SemiBold/-Medium/-Regular). Неустановленный шрифт `add_text` не подставляет молча, а
   возвращает ошибку.

## Подключение к Claude

**Claude Code** — в репозитории уже есть `.mcp.json`; запустите `claude` в папке `ae-plugin` и разрешите сервер
`after-effects`.

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "after-effects": {
      "command": "node",
      "args": ["/Users/<you>/Projects/ae-plugin/build/index.js"],
      "env": {
        "AE_MCP_PROJECT_ROOTS": "/Users/<you>/Projects/ae-plugin/test",
        "AE_MCP_FOREIGN_LOCKS": "/Users/<you>/Projects/dilyolu/dilyolu-content/ae/out/.ae-lock,/Users/<you>/kemel-bilim/kemel-bilim-content/ae/out/.ae-lock"
      }
    }
  }
}
```

Переменные окружения (все необязательные):

| Переменная | По умолчанию | Что делает |
|---|---|---|
| `AE_MCP_PROJECT_ROOTS` | `<repo>/test` | папки (через `,` или `:`), проекты из которых разрешено **менять**; первая — для `open_test_project` |
| `AE_MCP_FOREIGN_LOCKS` | — | замки других конвейеров (`out/.ae-lock` китов): пока замок есть, сервер ждёт и не запускает AE |
| `AE_MCP_RENDER_DIR` | `<repo>/out/renders` | куда пишутся мастера и выдача; `deliver` берёт мастер только отсюда |
| `AE_MCP_MIN_FREE_GB` | `1.5` | меньше свободного места — AE не запускается (на полном диске он виснет на модальном диалоге) |
| `AE_MCP_APP` | последняя «Adobe After Effects NNNN» в /Applications | имя приложения для osascript |

## Безопасность

- **Чтение — любой проект, запись — только из разрешённых папок.** Изменяющие инструменты проверяют путь открытого
  проекта; несохранённый проект тоже не меняют (непонятно, тестовый ли он).
- **Чужую работу не закрывает.** `open_test_project` закрывает только сохранённый проект без правок
  (`app.project.dirty`) или тестовый; иначе — ошибка с просьбой закрыть самим (диалог «Сохранить?» повесил бы AE).
- **Произвольного кода нет.** Инструмента «выполнить скрипт» нет; аргументы приходят литералом, `eval` в AE не вызывается.
  Сборки роликов скриптами кита — через `tools/run.sh` самих проектов.
- **Очередь рендера пользователя не трогает:** чужие элементы на время рендера снимаются с галочки и возвращаются.
- **Одна отмена на вызов:** любое изменение откатывается Cmd+Z в AE одним шагом.

## Инструменты

Слои и композиции ищутся **по имени** (композиция — также путём `"Папка/Имя"`, если имена повторяются). Ошибка
возвращается текстом с подсказкой: «Нет композиции «X». Есть: …».

### Чтение

| Инструмент | Что делает | Пример |
|---|---|---|
| `ae_status` | версия AE, открытый проект, `dirty`, битность, активная композиция | `{}` |
| `list_comps` | композиции: путь, размер, fps, длительность, число слоёв | `{}` |
| `list_layers` | слои сверху вниз: тип, in/out, родитель, эффекты, 3D, трек-мат | `{"comp": "Scene"}` |
| `get_layer` | трансформ со значениями и ключами (время, значение, интерполяция, ease), выражения, текст, эффекты, содержимое shape | `{"comp": "Scene", "layer": "title"}` |
| `get_frames` | **кадры картинкой**: один или лист до 4 в ряд; цвет как в рендере (поправка 32 бит, фон композиции, прозрачность) | `{"comp": "Scene", "times": [0.5, 1, 2], "width": 480}` |
| `list_render_templates` | шаблоны рендера и вывода в AE (только в тестовом проекте) | `{}` |
| `list_presets` | пресеты: свои (`local`) или штатные Adobe (`adobe`, с поиском) | `{"source": "adobe", "query": "Behaviors"}` |

### Проект и слои

| Инструмент | Что делает | Пример |
|---|---|---|
| `open_project` | открыть любой `.aep`; текущий закрывается, только если ничего не потеряется; `writable` — можно ли менять | `{"path": "/…/out/a1-01.aep"}` |
| `open_test_project` | открыть или создать `test/<имя>.aep` (32 бита, линейный свет) | `{"name": "mcp-test"}` |
| `create_comp` | композиция; по умолчанию 1920×1080, 30 fps, 10 с | `{"name": "Scene", "duration": 4, "background": [0.96, 0.95, 0.92]}` |
| `save_project` | сохранить (только разрешённые папки) | `{}` |
| `add_text` | текст, якорь в центре; `font` — ключ шрифта проекта или PostScript-имя | `{"comp": "Scene", "name": "title", "text": "Сәлем!", "font": "black", "size": 110, "color": [1,1,1], "position": [960, 300], "start": 0.3}` |
| `add_shape` | прямоугольник (скругление) или эллипс, заливка/обводка | `{"comp": "Scene", "name": "plaque", "shape": "rect", "size": [900, 220], "radius": 24, "fill": [0.18, 0.43, 0.71]}` |
| `add_text_plate` | плашка под текстом по его размеру: ребёнок текста (двигается, масштабируется, поворачивается с ним), размер и положение — выражения от `sourceRectAtTime`, прозрачность повторяет текст; `set_text` пересчитывает её сама | `{"comp": "Scene", "text": "title", "radius": 24, "fill": [0.18, 0.43, 0.71], "padding": [44, 22]}` |
| `add_solid` | заливка; `adjustment: true` — корректирующий слой | `{"comp": "Scene", "name": "paper", "color": [0.96, 0.95, 0.92], "moveTo": "bottom"}` |
| `add_null` | невидимый родитель группы | `{"comp": "Scene", "name": "rig", "position": [960, 300]}` |
| `add_footage` | картинка/видео/звук; `fit`: none, contain, cover или ширина px; `blend` | `{"comp": "Scene", "file": "/abs/card.png", "fit": 360, "position": [1500, 780]}` |
| `set_layer` | имя, трансформ, время, родитель, наложение, видимость, порядок | `{"comp": "Scene", "layer": "title", "parent": "rig", "moveTo": {"above": "plaque"}}` |
| `delete_layer` | удалить слой | `{"comp": "Scene", "layer": "sub"}` |

### Правка готового

| Инструмент | Что делает | Пример |
|---|---|---|
| `edit_keys` | ключи слоя на отрезке `from`–`to`: `shift` (seconds/frames), `stretch` (factor от pivot), `ease`, `delete`, `set`; ключи переносятся со всеми свойствами и встают на кадр; перескок через неподвижный ключ, попадание на него, отрицательное время — ошибка без изменений; ease неподвижных соседей сохраняется. `prop`: короткое имя, `*` (весь трансформ) или путь к параметру эффекта | `{"comp": "Scene", "layer": "title", "prop": "scale", "action": "shift", "frames": -3}` · `{"…", "prop": "position", "action": "ease", "from": 0.5, "to": 1, "ease": "snap"}` |
| `set_text` | текст и стиль; якорь в центре текста остаётся в центре; при ключах текста — стиль на все ключи, текст в момент `time` | `{"comp": "Scene", "layer": "title", "text": "Сабақ 3", "font": "black"}` |
| `replace_footage` | заменить файл в слое, та же ширина на экране; `everywhere` — во всём проекте | `{"comp": "Scene", "layer": "card", "file": "/abs/card2.png"}` |
| `set_color` | цвет текста (заливка/обводка), фигуры (все заливки/обводки без ключей), заливки solid | `{"comp": "Scene", "layer": "plaque", "color": [0.72, 0.46, 0.17]}` |

| `shift_layers` | сдвиг слоёв с ключами: по именам, всё после `after`, `alignTo` (начало/конец слоя, маркер, момент + offset); `ripple` — вставить (+) или убрать (−) паузу: сквозные слои удлиняются/укорачиваются, их ключи после точки сдвигаются, маркеры и длина композиции подстраиваются; проверки — до изменений | `{"comp": "Scene", "layers": ["card"], "alignTo": {"layer": "voice-03", "edge": "in", "offset": 0.2}}` · `{"comp": "Scene", "after": 12.5, "seconds": 0.8, "ripple": true}` |
| `set_comp` | имя, длительность, fps, фон, рабочая область | `{"comp": "Scene", "duration": 12, "workArea": [0, 12]}` |

Типовой цикл исправления: `audit_animation` нашёл линейный старт → `edit_keys … action: "ease", ease: "snap"` → `audit_animation` чист;
акцент опаздывает → `edit_keys … action: "shift", frames: -3`.

### Эффекты

| Инструмент | Что делает | Пример |
|---|---|---|
| `list_effects` | поиск по имени/категории: matchName, битность, параметры (словарь с AE 26.5) | `{"query": "glow"}` |
| `add_effect` | эффект по имени или matchName с параметрами по именам; 8/16-битный эффект в 32-битном проекте — warning | `{"comp": "Scene", "layer": "plaque", "effect": "Drop Shadow", "name": "shadow", "params": {"Opacity": 35, "Distance": 12, "Softness": 30}}` |
| `set_effect` | параметры, `enabled`, `rename`, `index`, `remove`; параметр с ключами — через `edit_keys` с путём `["Effects", "<эффект>", "<параметр>"]` | `{"comp": "Scene", "layer": "plaque", "effect": "shadow", "params": {"Distance": 20}}` |

### Анимация

| Инструмент | Что делает | Пример |
|---|---|---|
| `apply_preset` | пресет к слою от `start`: JSON-данные (ease по отрезкам, `speed`), свой `.ffx` или `adobe:…` | `{"comp": "Scene", "layer": "title", "preset": "accent-punch", "start": 2}` |

Свои пресеты, формат JSON и таблица готовых (`fade-up`, `pop-in`, `accent-punch`, `drop-out`, `breathe`…) — [presets/README.md](presets/README.md).

### Проверка по правилам ремесла

| Инструмент | Что делает | Пример |
|---|---|---|
| `audit_animation` | проверка по `/animation-craft`, проект не меняет; ответ — замечания `error` / `warning` / `info` с временем и советом | `{"comp": "s5-world", "characterPattern": "^chr-"}` · `{"comp": "Scene", "beats": [1.25, 2.37]}` |

| Правило | Что ловит | Не считается ошибкой |
|---|---|---|
| `linear` | линейный старт из покоя / остановка в покой на положении, масштабе, повороте, якоре | вход/уход уже в движении: на склейке (момент появления композиции в родительской, с вложенностью), на краю композиции или жизни слоя, за кадром; цепочки ≥ 3 линейных ключей-сэмплов (ease «запечён» в значения); непрозрачность |
| `hold` | у персонажа (по `characters` или шаблону имени, по умолчанию `char\|hero\|персонаж\|герой`) ничего не меняется дольше `maxHold` кадров (6 при 24 fps) | ключи слоя и эффектов, выражения (дыхание, wiggle), анимация внутри прекомпа (моргание, позы) — до 3 уровней |
| `accent` | к ударному слогу (по умолчанию — опорные слова озвучки: маркеры `!имя` звуковых слоёв, которые ставит кит, в этой или родительских композициях; или `beats`, маркеры слоя `beatLayer`, маркеры композиции `useCompMarkers`) самый сильный пик движения совпадает или опаздывает (warning) / слишком рано или его нет (info) | пик на 1–6 кадров раньше (лучше 2–4) |
| `entrance` | 2+ разных элемента входят в пределах 4 кадров (совет, Глебас) | дети одного родителя, слои с общим началом имени (`ben-text` + `ben-plate`), входы в одном кадре (строка целиком) |
| `expression` | выражение с ошибкой | — |

Удары из озвучки: кит при сборке ставит на звуковые слои маркеры слов `w1…` и опорных слов `!имя`
(`kbAudio({…, words, anchors})`, `kbVoiceTrack` — сам). Опорные слова без пика движения в отчёт не попадают
(это отметки тайминга, не обязательные акценты) — только счётчик `beatsWithoutAccent`. По тем же маркерам
выравнивает `shift_layers alignTo: {marker: "emreyim"}`.

Проверено на уроке A1-01 dilyolu: сцена 383 с — 0,5 с на проверку, замечаний нет (урок прошёл приёмку), советы — по делу.

### Форматы и рендер

| Инструмент | Что делает | Пример |
|---|---|---|
| `make_format_comp` | композиция под формат: своя раскладка `«<comp> <формат>»` → сама композиция → переразметка `(reframe)` cover/contain; тексты вне безопасных зон — в ответе | `{"comp": "Scene", "format": "9x16", "mode": "contain"}` |
| `render_master` | мастер ProRes в `out/renders/<comp>/<comp>-master.mov` | `{"comp": "Scene"}` · `{"comp": "Plate", "alpha": true}` |
| `deliver` | файл для площадки из мастера (ffmpeg) | `{"master": "/…/out/renders/Scene/Scene-master.mov", "platform": "youtube"}` |
| `render_formats` | всё сразу: формат → мастер → выдача; переразметку с текстом вне зон не рендерит без `force` | `{"comp": "Scene", "formats": ["16x9", "9x16"]}` |

| Формат | Кадр | Безопасные зоны (лев, верх, прав, низ) | Для |
|---|---|---|---|
| `16x9` | 1920×1080 | 96, 54, 96, 54 (title safe 5 %) | уроки, YouTube |
| `16x9-4k` | 3840×2160 | 192, 108, 192, 108 | YouTube 4K (исходник 4K) |
| `9x16` | 1080×1920 | 60, 220, 140, 420 (интерфейс Reels/TikTok/Shorts) | Reels, TikTok, Shorts |
| `4x5` | 1080×1350 | 60, 80, 60, 120 | лента Instagram |
| `1x1` | 1080×1080 | 60 со всех сторон | квадрат |

| Площадка | Видео | Звук |
|---|---|---|
| `youtube` | H.264 High, CRF 16, preset slow, GOP ½ с | AAC 320k 48 кГц |
| `social` | H.264 High, CRF 18, ≤ 20 Мбит/с | AAC 256k 48 кГц |
| `archive` | ProRes мастера без перекодирования (для монтажа) | PCM 24 бит |

Везде: громкость двумя проходами `loudnorm` до **−14 LUFS**, true peak −1 dBTP; теги цвета BT.709; в mp4 — `faststart`,
без дорожки таймкода.

**Правильный путь к формату** — своя раскладка: композиция `«Scene 9x16»` 1080×1920, собранная из тех же данных
(в ките — другой `KB_FRAME`). Переразметка готовой сцены — запасной путь.

## Типовой порядок работы

1. `ae_status` → `open_test_project` (или рабочий проект из `AE_MCP_PROJECT_ROOTS`).
2. Посмотреть: `list_comps` → `list_layers` → `get_layer` → `get_frames` на ключевых секундах.
3. Изменить: `add_*` / `set_layer` → `apply_preset`. Перед сборкой сцены — план по `/animation-craft` §1
   (одна идея кадра, доминанта, порядок входа, паузы).
4. Проверить: `audit_animation` (ease, холды, акценты к звуку, порядок входов) и `get_frames` после каждой правки — лист на отметках, а не «на глаз по коду».
5. Выдать: `render_formats` → смотреть mp4.

Пример запроса Claude: *«Открой тестовый проект, сделай композицию 4 с на бумаге: синяя плашка с заголовком «Сәлем,
әлем!» выскакивает, под ней подзаголовок всплывает через 0,6 с, на 2-й секунде акцент на заголовке. Покажи кадры и
отрендерь 16:9 и 9:16».*

## Разработка

```bash
npm run build          # esbuild: build/index.js, build/cli.js, build/mcp-call.js
npm run validate       # ES3, matchName, параметры эффектов, типы AE 26 — kit/ и mcp/ вместе
npx tsc --noEmit       # типы сервера
```

```bash
node build/cli.js list_layers '{"comp":"Scene"}'
node build/mcp-call.js get_frames '{"comp":"Scene","times":[1,2]}'
```

`cli.js` вызывает ES3-инструмент напрямую, `mcp-call.js` — через настоящий MCP, как Claude (картинки сохраняет в
`out/frames/mcp-call-<n>.png`).

**Новый инструмент:**
1. `mcp/tools/<группа>.jsx`: `MCP_TOOLS.<имя> = {write: true|false, run: function (args) {…}}` — ES3 (`var`,
   `function`, без `let/const`, стрелок, `JSON`, `forEach`, зарезервированных слов как ключей: `in`, `class`…);
   свойства — `kbProp`/`kbGroup` по matchName; слои и композиции — `mcpFindComp`/`mcpFindLayer`.
2. Подключить файл в `mcp/main.jsx`; `npm run validate`.
3. Зарегистрировать в `src/index.ts`: `server.registerTool(имя, {description, inputSchema: zod}, (a) => call(имя, a))`.
4. `npm run build`, проверить в AE на тестовом проекте, коммит.

**Кит.** Источник — `kit/`; правка → коммит → в проекте `node ~/Projects/ae-plugin/tools/kit-sync.mjs .` → контрольные
кадры проекта. Почему копия, а не ссылка, и настройки проекта (`kit.config.jsx`) — [kit/README.md](kit/README.md).

## Если что-то не так

| Симптом | Причина и что делать |
|---|---|
| «AE не записал ответ», в `out/ae.log` нет `▶` | скрипт не скомпилировался или AE не выполняет скрипты: открыт модальный диалог — нажать OK во всех окнах AE; проверить настройку «Allow Scripts to Write Files…» |
| «AE не ответил вовремя» / `-1712` | в AE модальный диалог (ошибка скрипта, «Undo group mismatch», полный диск) — нажать OK и повторить |
| «AE ещё выполняет прошлый запуск» | прошлый вызов не дописал `OK/ERR` (таймаут, долгий рендер) — дождаться или закрыть диалог |
| «AE занят другим запуском» | идёт сборка кита в dilyolu/kemel-bilim (`AE_MCP_FOREIGN_LOCKS`) — сервер ждёт до 10 минут |
| «вне разрешённых папок» | открыт рабочий проект — чтение работает, запись нет; открыть тестовый или добавить папку в `AE_MCP_PROJECT_ROOTS` |
| превью светлее рендера | старая сборка: в 32 битах `saveFrameToPng` делит на 10 только непрозрачные пиксели — `get_frames` переснимает такие кадры с подложкой |
| «Шрифта … нет в системе» | установить шрифт или взять ключ из списка в ошибке |
| условие выбрало не ту ветку | вложенный `?:` без скобок: ExtendScript группирует `a && b ? x : c ? y : z` как `a && (b ? x : c) ? y : z` — валидатор ловит (`ternary`) |
| «Object is invalid» после добавления в shape-группу | AE делает недействительными прежние ссылки на свойства группы после `addProperty` — брать свойство заново (`kbGroup`) после всех добавлений |
| ошибка изменяющего инструмента на полпути | один вызов — одна группа отмены: Cmd+Z в AE откатывает его целиком |
| `//@include` не находит файл через символическую ссылку | ограничение ExtendScript: кит в проекте — копия (`kit-sync.mjs`), не ссылка |

## Лицензия

MIT — см. [LICENSE](LICENSE). Исходная идея и первая версия — Dakkshin/after-effects-mcp.

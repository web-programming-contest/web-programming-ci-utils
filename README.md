# Web Programming CI Utils

Центральный доверенный grader для автоматизированной приёмки лабораторных работ. Репозиторий содержит CLI, открытый банк задач, декларативные контракты, ограниченный Docker runtime и reusable GitHub Actions workflows. Работы студентов здесь не хранятся.

Полная инструкция по установке, всем CLI-скриптам, подключению репозиториев
групп, эксплуатации и диагностике находится в
[docs/USAGE.md](docs/USAGE.md).

## Состав

```text
web-programming-ci-utils/
├── pr-gate/                  # Проверка PR до запуска студенческого кода
│   ├── title.mjs             # Формат названия и lab/variant/student
│   ├── changed-files.mjs     # Разрешённый каталог и безопасные Git-объекты
│   ├── identity.mjs          # Привязка slug к GitHub-пользователю и варианту
│   ├── github.mjs            # Чтение PR через GitHub API
│   ├── git.mjs               # Чтение истории и дерева Git
│   └── index.mjs             # CLI и оркестрация PR Gate
├── docker-grader/            # Проверки внутри ограниченного контейнера
│   ├── checks/
│   │   ├── quality/          # Prettier, ESLint, Stylelint, HTML Validate, TypeScript
│   │   ├── functions/        # Функциональные проверки lab2/lab3
│   │   ├── model/            # Модели и функции коллекций lab4
│   │   └── browser/
│   │       ├── labs/         # Suite-оркестраторы lab1/lab4/lab5
│   │       └── rules/        # Переиспользуемые DOM/CSS-правила
│   ├── config/               # Единственный источник конфигов grader и студентов
│   ├── contracts/labN/       # Входы и ожидаемые результаты по задачам
│   ├── tasks/                # Банк задач и соответствие variant → task
│   ├── runtime/              # Запуск процессов, сбор файлов и локальный сервер
│   ├── submission/           # Контракт структуры сдаваемой лабораторной
│   ├── Dockerfile
│   └── index.mjs             # CLI и оркестрация grader
├── reports/
│   ├── github-summary.mjs    # Таблица для GitHub Job Summary
│   ├── output.mjs            # summary.json и GitHub output
│   ├── browser-html.mjs      # HTML-отчёт браузерных проверок
│   ├── browser-artifacts.mjs # Screenshot и Playwright trace
│   └── progress.mjs          # Прогресс группы в Markdown/CSV/JSON
├── shared/                   # Общий разбор аргументов CLI
├── scripts/                  # Синхронизация template/course и проверка контрактов
└── .github/workflows/        # Reusable workflows и CI самого utils-репозитория
```

## Разделение ответственности

`web-programming-ci-utils` — единственное место, где живут логика проверок,
версии инструментов, задачи и тестовые контракты. Репозиторий курса не содержит
копию grader и не выполняет студенческий `package.json`: его два маленьких caller
workflow вызывают закреплённый commit utils.

`web-programming-contest-template` содержит только то, что должно сразу появиться
в новом репозитории курса:

- `.github/workflows/submission.yml` и `progress-report.yml`;
- `CODEOWNERS`;
- `.editorconfig`, `.gitignore`, `.nvmrc`, `.prettierignore`, `.prettierrc.json`;
- `eslint.config.mjs`, `.stylelintrc.json`, `.htmlvalidate.json`;
- `package.json` с командами и теми же точными версиями локальных инструментов.

Канонические версии этих девяти student-facing файлов находятся в
`docker-grader/config/`, а расписание progress report — в
`scripts/workflow-refs.mjs`. Их не нужно редактировать в template вручную.

## Публикация

Опубликуйте содержимое этой директории как отдельный репозиторий `YOUR-ORG/web-programming-ci-utils`. Для публичного репозитория курса utils также должен быть публичным: fork PR не получает пользовательские secrets, а токен workflow ограничен репозиторием курса.

После commit и push обновите ссылки в шаблоне и локальных репозиториях курса:

```bash
npm run refs:update:courses
```

Скрипт берёт полный SHA из `HEAD`, обновляет `uses: ...@SHA` и `utils_ref` в
обоих caller workflow, переносит каноническое расписание progress report и
синхронизирует student-facing конфиги из grader. Сначала всегда обновляется
template. Все репозитории групп указываются явно; один `--repo` соответствует
одному локальному клону:

```bash
npm run refs:update:courses -- \
  --repo ../web-programming-v2026-autumn-group-1 \
  --repo ../web-programming-v2026-autumn-group-2 \
  --repo ../web-programming-v2026-autumn-group-3
```

Без `--repo` обновляется только `web-programming-contest-template`. Скрипт не
ищет репозитории по именам и не изменяет неуказанные репозитории.

Если нужно только заново собрать template из текущих конфигов и расписания без
смены SHA:

```bash
npm run template:sync
```

PR Gate сверяет корневые конфиги base-ветки курса с конфигами закреплённого
grader. Поэтому SHA и конфиги следует обновлять одной командой выше и
коммитить вместе. Если они разъехались, студенческий код не запускается, а gate
показывает список устаревших файлов.

Тестовые репозитории обновляются отдельной командой:

```bash
npm run refs:update:test
```

Она обновляет `../web-programming-ci-test` и его локальную копию в
`../workdir/web-programming-ci-test`. Чтобы обновить только один путь, передайте
`--repo PATH`. Для закрепления заданного коммита обе команды поддерживают
`--sha FULL_40_CHARACTER_SHA`.

При незакоммиченных изменениях в utils автоматическое определение `HEAD`
останавливается: локальные изменения ещё не входят в этот SHA. После обновления
нужно закоммитить и отправить изменённые workflow соответствующих репозиториев.
Вызов reusable workflow по ветке `@main` не допускается.

## Локальный запуск

Требуется Node.js `24.19.0`.

```bash
npm ci
npm run grade -- --submission /path/to/course/ivanov.ivan/lab2 --lab 2 --variant 7
```

Для lab1, lab4 и lab5 перед первым запуском установите Chromium:

```bash
npm run setup:browser
```

Проверка форматирования и линтеров самого utils-репозитория:

```bash
npm run validate
```

### Команды для студента

После создания или клонирования репозитория курса один раз установить локальные
инструменты:

```bash
npm install
```

Для своей работы студент указывает ровно свой каталог:

```bash
npm run format -- surname.name/lab2
npm run format:check -- surname.name/lab2
npm run lint:js -- surname.name/lab2
npm run lint:css -- "surname.name/lab2/**/*.css"
npm run lint:html -- "surname.name/lab2/**/*.html"
```

Функциональные и браузерные контракты запускаются только доверенным grader;
локальный `package.json` студента CI не исполняет.

## Отчёт CI

После запуска grader формирует `summary.json` и человекочитаемый `report.md`.
Workflow явно добавляет `report.md` в GitHub Actions Job Summary: таблица
показывает статус и время каждого этапа, а ниже раскрывается stdout/stderr
каждого упавшего этапа. Каждая ошибка дополнительно публикуется как GitHub
annotation и видна из PR в `Checks`; для этого не нужны write-permissions и
secrets. Полный отчёт находится на странице конкретного workflow run в блоке
`Summary`. Docker build/run логи, браузерные screenshot, trace и HTML-report
загружаются в artifact `grader-results-<PR number>`.

## Отчёт прогресса группы

Progress report строится по основной ветке репозитория курса. Лабораторная
считается принятой, если её каталог существует в полном Git checkout и содержит
все обязательные файлы. Отсутствующий каталог отображается как несданная работа
(`—`) без предупреждения; существующий каталог с неполной или неверной
структурой отображается как ошибка.

В репозитории курса откройте **Actions → Progress report → Run workflow**.
Markdown-таблица появится в Job Summary, а `progress.md`, `progress.csv` и
`progress.json` — в artifact `progress-report`. Автоматический запуск происходит
один раз в неделю, в ночь с воскресенья на понедельник, примерно в `00:30` по
московскому времени.

Локальный отчёт по уже клонированному курсу:

```bash
npm run report -- \
  --root /path/to/course \
  --output-dir /tmp/progress
```

Генератор не принимает URL репозитория в `--root`: ему нужны рабочее дерево и
полная история Git. Чтобы построить отчёт по удалённому репозиторию без
`GITHUB_TOKEN`, сначала создайте временный полный clone:

```bash
REPORT_ROOT=$(mktemp -d)
git clone https://github.com/YOUR-ORG/course-repo.git "$REPORT_ROOT/course"
npm run report -- \
  --root "$REPORT_ROOT/course" \
  --repository YOUR-ORG/course-repo \
  --output-dir "$REPORT_ROOT/progress"
```

Не используйте `--depth 1`: полная история нужна для определения дат первой
сдачи. Для публичного репозитория GitHub API доступен без токена, но действует
низкий лимит запросов; при его исчерпании автор или вариант могут не
определиться. Полный справочник приведён в разделе
[Progress report](docs/USAGE.md#13-progress-report).

Каждая задача lab1 имеет отдельный браузерный контракт, а каждая функция
lab2/lab3 — отдельный JSON-набор входов и результатов. Для lab4 проверяются
класс и обязательные экспорты модели, асинхронное добавление/удаление,
автоматическое обновление DOM и восстановление из localStorage. Для всех 40
вариантов lab5 проверяются структура приложения и ключевой пользовательский
сценарий конкретной задачи: сортировка, формы, игры, localStorage, drag-and-drop
и другие взаимодействия. Выбранный контракт и связь варианта с задачей
валидируются непосредственно во время сдачи.

Команда `npm run contracts:check` проверяет все 200 сочетаний из 5 лабораторных
и 40 вариантов и гарантирует, что каждая ссылка разрешается в существующую
задачу и контракт.

Открытые контракты задач находятся в [docs/TASK_CONTRACTS.md](docs/TASK_CONTRACTS.md).

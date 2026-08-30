# Web Programming CI Utils

Центральный доверенный grader для автоматизированной приёмки лабораторных работ. Репозиторий содержит CLI, открытый банк задач, декларативные контракты, ограниченный Docker runtime и reusable GitHub Actions workflows. Работы студентов здесь не хранятся.

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
│   ├── config/               # Доверенные конфиги статических проверок
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
└── .github/workflows/        # Reusable workflows и CI самого utils-репозитория
```

## Публикация

Опубликуйте содержимое этой директории как отдельный репозиторий `YOUR-ORG/web-programming-ci-utils`. Для публичного репозитория курса utils также должен быть публичным: fork PR не получает пользовательские secrets, а токен workflow ограничен репозиторием курса.

После commit и push обновите ссылки в шаблоне и локальных репозиториях курса:

```bash
npm run refs:update:courses
```

Скрипт берёт полный SHA из `HEAD`, обновляет `uses: ...@SHA` и `utils_ref` в
обоих caller workflow шаблона. Все репозитории групп указываются явно; один
`--repo` соответствует одному локальному клону:

```bash
npm run refs:update:courses -- \
  --repo ../web-programming-v2026-autumn-group-1 \
  --repo ../web-programming-v2026-autumn-group-2 \
  --repo ../web-programming-v2026-autumn-group-3
```

Без `--repo` обновляется только `web-programming-contest-template`. Скрипт не
ищет репозитории по именам и не изменяет неуказанные репозитории.

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

## Отчёт CI

После запуска grader формирует `summary.json` и человекочитаемый `report.md`.
Тот же отчёт выводится в GitHub Actions Job Summary: таблица показывает статус
и время каждого этапа, а ниже раскрывается stdout/stderr каждого упавшего этапа.
Проверки продолжаются после отдельного падения, поэтому один запуск показывает
сразу все найденные проблемы. Docker build/run логи, браузерные screenshot,
trace и HTML-report загружаются в artifact `grader-results-<PR number>`.

Каждая задача lab1 имеет отдельный браузерный контракт, а каждая функция
lab2/lab3 — отдельный JSON-набор входов и результатов. Для lab4 проверяются
класс и обязательные экспорты модели, асинхронное добавление/удаление,
автоматическое обновление DOM и восстановление из localStorage. Для всех 40
вариантов lab5 проверяются структура приложения и ключевой пользовательский
сценарий конкретной задачи: сортировка, формы, игры, localStorage, drag-and-drop
и другие взаимодействия. Выбранный контракт и связь варианта с задачей
валидируются непосредственно во время сдачи.

Google-style конфиги, которые CI использует для проверки работ, находятся в
`docker-grader/config/`.

Открытые контракты задач находятся в [docs/TASK_CONTRACTS.md](docs/TASK_CONTRACTS.md).

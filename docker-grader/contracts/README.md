# Контракты проверок

Контракты сгруппированы по лабораторной и задаче:

```text
contracts/
├── lab1/
│   ├── common.json
│   └── one JSON file per unique task
├── lab2/
│   └── one JSON file per task
├── lab3/
│   └── one JSON file per task
├── lab4/
│   ├── common.json
│   ├── models.json
│   └── queries.json
└── lab5/
    ├── common.json
    └── scenarios.json
```

Каждый функциональный контракт lab2/lab3 объявляет `taskId` и непустой массив
`cases`. Один case содержит понятное имя, аргументы функции в `args` и обычно
ожидаемый результат в `expected`. По умолчанию используется глубокое сравнение.

Поддерживаемые декларативные способы сравнения:

- `matches` — match the returned string against `pattern` and optional `flags`;
- `unordered` — compare iterable results without considering order;
- `pairs-unordered` — compare pairs without considering pair or item order;
- `permutation` — require a new array containing the input elements;
- `parity-partition` — require the same values with even numbers before odd ones.

Use `{ "$date": "ISO timestamp" }` to pass a JavaScript `Date`. A top-level
`clock` fixes the system time for all cases in the file. `repeat` runs a case
multiple times.

Файлы содержат только входы, ожидаемые результаты и метаданные сравнения. В них
не должно быть эталонных реализаций студенческих задач.

UI-лабораторные хранят общие браузерные требования в `common.json`. Lab1
связывает все 40 вариантов с task ID в `docker-grader/tasks/variants.json`; каждая
уникальная задача имеет JSON-контракт с селекторами, атрибутами, computed CSS,
взаимодействиями и правилами layout. Повторяющиеся задания используют один
контракт. Lab4 хранит декларативные проверки классов в `models.json`, проверки
функций коллекций в `queries.json`, а данные формы каждого варианта — в
`docker-grader/tasks/lab4.json`. Lab5 хранит публичные `data-testid`, действия и
ожидаемые изменения интерфейса для всех уникальных задач в `scenarios.json`.
Повторяющиеся варианты ссылаются на один task ID и не дублируют сценарии.

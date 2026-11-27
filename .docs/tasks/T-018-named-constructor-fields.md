# T-018: Give the control-module model classes named constructor fields

<!-- File: .docs/tasks/T-018-named-constructor-fields.md. Branch: feature/T-018-named-constructor-fields. PR title: "T-018: Give the control-module model classes named constructor fields". -->

## Context

- **Decision (Jeff, 2026-11-26):** a post-release refactor, across the app, to named fields where it makes sense. It comes from the T-013 pre-push type review.
- **Timing:** start after the server release that carries T-013, T-014 and T-017. It is a pure refactor and must not ride along with a feature release.
- **The problem:** the API's control-module model classes take long lists of positional parameters, often several of the same type side by side. `MaestroChannel` takes 11 (`…, minPos, maxPos, homePos, inverted, releaseMs`).
  - **Swaps compile.** Swapping `minPos` and `maxPos`, or `uartChannel` and `baudRate`, type-checks and only shows up on hardware.
  - **Every new field breaks callers in three projects.** T-013 added one required parameter and broke `astros_smoke_test`'s CI typecheck; it imports these classes through `@api/...`.
- **Survey (2026-11-26):** class constructors with 4+ parameters, the adjacent same-type (`number`/`string`/`boolean`) pairs in each, and the `new …(` call sites across all three projects, tests included.

  | Class | Params | Adjacent same-type pairs | Call sites |
  |---|---|---|---|
  | `MaestroChannel` | 11 | 4 | 16 |
  | `UartModule` | 7 | 3 | 31 |
  | `BaseModule` | 6 | 2 | 0 (`super` only) |
  | `BaseChannel` | 6 | 2 | 4 |
  | `I2cModule` | 6 | 2 | 10 |
  | `GpioChannel` | 6 | 1 | 18 |
  | `KangarooX2Channel` | 5 | 4 | 2 |
  | `UartChannel` | 5 | 2 | 12 |
  | `I2cChannel` | 4 | 2 | 3 |

  All nine live in `astros_api/src/models/control_module/`. `PwmChannel` (9 parameters) is never constructed, so it is left out (Out of scope).

## Contract (pinned — do not change)

- **In scope: exactly the nine classes above.** Each constructor takes one object parameter, `constructor(fields: <Class>Fields)`.
  - `<Class>Fields` is an exported interface next to the class. Its keys are the names of the properties the parameters set today (e.g. `channelName`, not a new name).
  - A subclass's fields leave out what the subclass fixes itself. For example, `MaestroChannel` sets `moduleSubType` to `maestro`, so `MaestroChannelFields` has no `moduleSubType`.
  - Optional parameters and defaults stay optional with the same defaults. Required stays required.
- **No behavior change.** For the same inputs, every instance has the same own enumerable properties, with the same values, assigned in the same order. So `JSON.stringify` of any instance, and every API response and serial message built from one, is byte-identical.
- **Unchanged:** the database, the wire formats (`.docs/protocol.md`), the HTTP and WebSocket shapes, and the Vue model interfaces (already plain objects).
- **No positional constructor call remains** for these classes in `astros_api`, `astros_smoke_test` or their tests.

## Task

- **Each class:** add its `<Class>Fields` interface and convert the constructor and the `super(…)` calls. Do the base classes first (`BaseChannel`, `BaseModule`), then their subclasses.
- **Every call site** in `astros_api/src` and `astros_smoke_test/src`, tests included. The repository loaders (`uart_repository.ts`, `gpio_repository.ts`, `i2c_repository.ts` and similar) map DB rows field by field, which is where swaps hide today.
- **Byte-identity check:** before converting anything, add a test that builds one instance of each class with distinct values and pins its `JSON.stringify` output as a literal. It must pass unchanged after the refactor.
- **Split point:** if the diff grows past what one review can read, stop after the channel classes (`BaseChannel`, `UartChannel`, `GpioChannel`, `I2cChannel`, `MaestroChannel`, `KangarooX2Channel`), and open the module classes (`BaseModule`, `UartModule`, `I2cModule`) as T-018b.

## Acceptance criteria

- [ ] All nine classes take `<Class>Fields`, and `grep -rn "new \(MaestroChannel\|UartModule\|I2cModule\|GpioChannel\|KangarooX2Channel\|UartChannel\|I2cChannel\|BaseChannel\)(" --include=*.ts` finds no positional call. Every match is followed by `{`.
- [ ] The byte-identity test passes unchanged from before the refactor to after it.
- [ ] With `minPos`/`maxPos` swapped in a call: it still type-checks (they're both numbers), but the call now reads `minPos: …, maxPos: …`, so a review can see it. No test is needed for that.
- [ ] All three projects' gates pass: API, Vue and the smoke test's CI steps.

## Out of scope

Considered and left out, because a swap doesn't compile there or because the code follows another API's convention:
- **Functions with 5+ parameters of different types:** `flattenPlaylistTrack`, `addEventBox`, `resolveFlashSource`. Swapping two of their arguments fails to compile.
- **PixiJS rendering helpers** (`createCircularButton`, `PixiScrollBarThumb`): positional `x, y, width, height` follows Pixi's own API, the code is checked only by hand (CLAUDE.md TDD exceptions), and each has one or two call sites.
  - `drawTimelineTicks` and `drawTimelineLabels`, first listed here as the plausible-swap case, turned out to be dead code: nothing imports their module, `timelineRendering.ts`, and the live timeline passes a `ZoomLevelConfig`. T-019 deletes the module (Jeff, 2026-11-27).
- **`SerialMessageTracker`** (4 parameters, no adjacent same types).
- **`PwmChannel`**: never constructed (the PCA9685 servo path is retired; the class survives in the `BaseChannel` type union). Deleting it is a separate question.
- Any other behavior change, rename or new field.

## Verification

- **API:** `cd astros_api && npx vitest run`; `npm run prettier:write && npm run lint:fix`; `npm run build`.
- **Smoke test:** in `astros_smoke_test`, run `npm run prettier:check`, `npx eslint . --ext .js,.jsx,.ts,.tsx,.vue`, `npm run typecheck`, `npm run web:build` and `npm run test -- --run`.
- **Vue:** `cd astros_vue && npx vitest run && npm run build`. Nothing there should change.
- **On a copy of the dev database,** compare before and after the refactor:
  - the `GET /api/locations/load` response body, byte for byte;
  - the `DEPLOY_CONFIG` string from the built generator, as in T-013's Verification;
  - a script upload's converted strings.

## Implementation checklist

<!-- Added when work starts. -->

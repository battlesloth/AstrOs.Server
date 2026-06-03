# Class to Interface — Phase 1: Event Types + Simple Models

## Context

Many model classes are pure data containers written in a C#-style class pattern. Converting them to interfaces/types is more idiomatic TypeScript — eliminates unnecessary constructors, makes the code lighter, and allows object literals instead of `new` calls. Test coverage (168 tests) will catch regressions.

## Conversion pattern

For each class:
1. Replace `export class Foo { constructor(public x: string) {} }` with `export interface Foo { x: string; }`
2. Find all `new Foo(...)` calls and replace with object literals `{ x: ... } as Foo` or just `{ x: ... }`
3. Update imports if needed (class imports and interface imports are the same in TS)
4. Run tests after each file to catch issues early

## Classes to convert (15)

### Event types (`models/scripts/events/`)
- [x] `GenericSerialEvent` — `{ value: string }`
- [x] `GpioEvent` — `{ setHigh: boolean }`
- [x] `I2cEvent` — `{ message: string }`
- [x] `KangarooEvent` — `{ ch1Action, ch1Speed, ch1Position, ch2Action, ch2Speed, ch2Position }`
- [x] `MaestroEvent` — `{ channel, isServo, position, speed, acceleration }`
- [x] `HcrCommand` — `{ id, category, command, valueA, valueB }`
- [x] `HumanCyborgRelationsEvent` — `{ commands: HcrCommand[] }`

### Simple models
- [x] `AudioFile` (`models/audio-file.ts`) — `{ id, fileName, description, duration }`
- [x] `ServoTest` (`models/servo_test.ts`) — `{ controllerAddress, controllerName, moduleSubType, moduleIdx, channelNumber, msValue }`
- [x] `LocationCollection` (`models/location_collection.ts`) — `{ coreModule?, domeModule?, bodyModule? }`
- [x] `DeploymentStatus` (`models/scripts/deployment_status.ts`) — `{ date, value, locationName }`
- [x] `ServoConfig` (`models/config/servo_config.ts`) — `{ id, minPos, maxPos, homePos, set, inverted }`
- [x] `DirectCommand` (`models/networking/direct_command.ts`) — `{ type, controllerId, command }`
- [x] `BaseResponse` (`models/networking/base_response.ts`) — `{ type, success, message }`

### Verification after each batch
- [x] Run `npx vitest run` — all 168 tests pass

## Files that will need `new` → object literal updates

Key consumers to check (grep for `new ClassName`):
- `script_converter.ts` — constructs event types
- `script_converter.test.ts` — constructs event types in test data
- `dal/repositories/audio_file_repository.ts` — constructs AudioFile
- `controllers/locations_controller.ts` — constructs LocationCollection
- `models/index.ts` — re-exports
- `api_server.ts` — constructs ServoTest

## Verification

```bash
cd astros_api && npx vitest run
```

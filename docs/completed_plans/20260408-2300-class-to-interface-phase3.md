# Class to Interface — Phase 3: Control Module + Config

## Context

Continues the class-to-interface refactor. These types are used throughout the system — repos construct them from DB rows, controllers pass them around, the serial layer reads their properties. ControlModule and ControllerLocation are the most widely used types in the codebase.

## Classes to convert (9)

- [ ] `ControlModule` (`models/control_module/control_module.ts`) — `{ id, name, address, fingerprint? }`. **Most widely used** — created in repos, serial responses, api_server, tests. Many `new ControlModule(id, name, address)` calls to convert.
- [ ] `ControlModuleStatus` (`models/control_module/control_module_status.ts`) — `{ id, location, name, address, online, synced }`
- [ ] `ControllerLocation` (`models/control_module/controller_location.ts`) — `{ id, locationName, description, configFingerprint, controller, gpioModule, i2cModules, uartModules }`. Constructor initializes empty module arrays and a default GpioModule — this default init logic needs to move to callers or a factory.
- [ ] `ControllerConfig` (`models/config/controller_config.ts`) — `{ id, location, name, address, gpioChannels, maestroModules }`. Constructor maps from ControllerLocation — extract to factory.
- [ ] `ConfigSync` (`models/config/config_sync.ts`) — `{ type, configs }`. Constructor maps ControllerLocations to ControllerConfigs.
- [ ] `KangarooX2` (`models/control_module/uart/sub_modules/kangarooX2/kangaroo_x2.ts`) — `{ id, ch1Name, ch2Name }`
- [ ] `MaestroBoard` (`models/control_module/uart/sub_modules/maestro/maestro_board.ts`) — `{ id, parentId, boardId, name, channelCount, channels }`
- [ ] `MaestroModule` (`models/control_module/uart/sub_modules/maestro/maestro_module.ts`) — `{ boards }`
- [ ] `PwmModule` (`models/control_module/i2c/sub_modules/pca9685/pwm_module.ts`) — `{ id, address, channels }`

## Key consideration: ControllerLocation constructor

The constructor creates default empty objects:
```typescript
this.controller = new ControlModule('', '', '');
this.gpioModule = new GpioModule(id);
this.i2cModules = new Array<I2cModule>();
this.uartModules = new Array<UartModule>();
```

After converting both ControlModule and ControllerLocation to interfaces, callers that create ControllerLocations will need to provide these defaults explicitly. Recommend a factory function `createControllerLocation(id, name, desc, fingerprint)` that provides the defaults.

## Key consideration: ConfigSync and ControllerConfig constructors

These have mapping logic that transforms ControllerLocations into config wire format. Extract to factory functions colocated in the same files.

## Files that will need updates (high volume)

- `dal/repositories/controller_repository.ts` — creates ControlModule
- `dal/repositories/locations_repository.ts` — creates ControllerLocation, ControlModule
- `serial/serial_worker_response.ts` — creates ControlModule in responses
- `serial/serial_message_service.ts` — creates ControlModule in failure responses
- `serial/message_handler.ts` — creates ControlModule from parsed messages
- `serial/message_generator.ts` — reads ControllerLocation properties
- `serial/message_generator.test.ts` — creates ControllerLocation, ControlModule, MaestroBoard, MaestroModule
- `api_server.ts` — creates ControllerLocation, ControlModule
- `controllers/locations_controller.ts` — creates LocationCollection from ControllerLocations
- `dal/repositories/module_repositories/uart_repository.ts` — creates KangarooX2, MaestroBoard, MaestroModule
- Multiple test files

## Verification

```bash
cd astros_api && npx vitest run
```

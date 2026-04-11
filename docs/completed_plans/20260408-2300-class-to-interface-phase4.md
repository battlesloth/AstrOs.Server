# Class to Interface — Phase 4: Serial/Networking Responses + Remotes

## Context

Final phase of the class-to-interface refactor. These are the serial worker response types and networking/remote models. The serial responses implement `ISerialWorkerResponse` — after conversion they'll just be interfaces extending it.

## Classes to convert (8)

### Serial responses (`serial/serial_worker_response.ts`)
- [ ] `PollResponse` — `{ type: POLL, controller }`
- [ ] `RegistrationResponse` — `{ type: REGISTRATION_SYNC, success, registrations }`
- [ ] `ConfigSyncResponse` — `{ type: CONFIG_SYNC, success, controller }`
- [ ] `ScriptDeployResponse` — `{ type: SCRIPT_DEPLOY, success, scriptId, controller }`
- [ ] `ScriptRunResponse` — `{ type: SCRIPT_RUN, success, scriptId, controller }`

### Serial message (`serial/serial_message.ts`)
- [ ] `SerialMsgValidationResult` — `{ valid, type, id, data }`. Note: `SerialMessage` class stays (has `fromString`/`toString` methods).

### Networking (`models/networking/`)
- [ ] `ControllersResponse` — extends BaseResponse (converted in Phase 1), `{ type, success, message, controllers }`
- [ ] `StatusResponse` — extends BaseResponse, `{ type, success, message, controllerId, location, online, synced }`
- [ ] `ScriptResponse` — extends BaseResponse, `{ type, success, message, scriptId, location, status, deployed }`

After Phase 1 converts `BaseResponse` to an interface, these become interfaces that extend it.

### Remotes
- [ ] `M5Button` (`models/remotes/M5Button.ts`) — `{ name, command }`
- [ ] `M5ScriptList` (`models/remotes/M5ScriptList.ts`) — `{ pages }`

Note: `PageButton` in M5Page.ts is also a candidate but it's only used inside M5Page which stays a class, so convert it only if it simplifies things.

## Key consideration: ISerialWorkerResponse

The response classes currently use `implements ISerialWorkerResponse` with `[x: string]: any` index signatures. After conversion, the interfaces can just extend `ISerialWorkerResponse`:

```typescript
export interface ConfigSyncResponse extends ISerialWorkerResponse {
  type: SerialWorkerResponseType.CONFIG_SYNC;
  success: boolean;
  controller: ControlModule;
}
```

This is actually cleaner than the class version because the `type` field can be a literal type instead of just `SerialWorkerResponseType`.

## Files that will need updates

- `serial/serial_worker_response.ts` — main file, all 5 response classes
- `serial/serial_message.ts` — SerialMsgValidationResult
- `serial/serial_message_service.ts` — creates response objects in `generateFailureResponse`
- `serial/serial_message_service.test.ts` — creates response objects in tests
- `serial/message_handler.ts` — creates response objects from parsed messages
- `api_server.ts` — creates StatusResponse, ControllersResponse, ScriptResponse (these are in networking/)
- `controllers/remote_config_controller.ts` — creates M5Button, M5ScriptList
- `models/remotes/M5Page.ts` — uses PageButton

## Verification

```bash
cd astros_api && npx vitest run
```

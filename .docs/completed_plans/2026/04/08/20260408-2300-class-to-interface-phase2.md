# Class to Interface — Phase 2: Script Models

## Context

Continues the class-to-interface refactor. Script models are used heavily by `script_converter.ts`, `script_repository.ts`, and the message generator. These have more constructor logic (mapping from ControllerLocation to ScriptConfig, etc.) so the object literal replacements need care.

## Classes to convert (7)

- [ ] `ScriptConfig` (`models/scripts/script_config.ts`) — `{ id, name, address, script }`. Constructor maps from ControlModule — this logic moves to where ScriptConfig is created (ScriptRun, ScriptUpload constructors).
- [ ] `ScriptRun` (`models/scripts/script_run.ts`) — `{ type, scriptId, configs }`. Constructor builds configs from locations — this mapping logic needs to be extracted to a factory function or moved inline to callers.
- [ ] `ScriptUpload` (`models/scripts/script_upload.ts`) — `{ type, scriptId, configs }`. Same pattern as ScriptRun — constructor builds configs from locations + scripts map.
- [ ] `Script` (`models/scripts/script.ts`) — `{ id, scriptName, description, lastSaved, durationDS, playlistCount, deploymentStatus, scriptChannels }`
- [ ] `ScriptEvent` (`models/scripts/script_event.ts`) — `{ id, scriptChannel, moduleType, moduleSubType, time, event }`. Note: `eventTypeForSubType()` is a standalone function, not a method.
- [ ] `ScriptChannel` (`models/scripts/script_channel.ts`) — `{ id, scriptId, channelType, parentModuleId, moduleChannelId, moduleChannelType, moduleChannel, maxDuration, events }`
- [ ] `ScriptChannelResource` (`models/scripts/script_channel_resource.ts`) — `{ channelId, scriptChannelType, name, parentModuleId, locationId, channel, available }`

## Key consideration: ScriptRun and ScriptUpload constructors

These constructors have mapping logic:
```typescript
// ScriptRun constructor iterates locations to build configs
locations.forEach(loc => {
  const cfig = new ScriptConfig(loc.controller, '');
  this.configs.push(cfig);
});
```

Options:
1. **Factory function** — `createScriptRun(scriptId, locations): ScriptRun`
2. **Inline at call sites** — map locations to configs where ScriptRun is created

Recommend option 1 (factory function in the same file) to keep the mapping logic colocated.

## Files that will need updates

- `api_server.ts` — creates ScriptRun
- `script_converter.ts` — creates ScriptEvent, uses Script
- `script_converter.test.ts` — creates Script, ScriptEvent, ScriptChannel
- `serial/message_generator.ts` — receives ScriptRun, ScriptUpload
- `serial/message_generator.test.ts` — creates ScriptRun, ScriptUpload
- `dal/repositories/script_repository.ts` — creates Script, ScriptChannel, ScriptEvent
- `controllers/scripts_controller.test.ts` — creates Script via repo

## Verification

```bash
cd astros_api && npx vitest run
```

# Expand Tests: Message Generator, Message Handler, Script Converter

## Context

Coverage report shows message_generator at 45.7% (only REGISTRATION_SYNC and DEPLOY_CONFIG tested), message_handler at 69.2% (missing handleDeployConfigAck, handleDeployScriptAckNak, handleRunScriptAckNak), and script_converter at 74.8% (missing defensive branch coverage). Expanding tests for generator and handler will have the most impact.

## Tasks

- [ ] Message Generator — add tests for: DEPLOY_SCRIPT, RUN_SCRIPT, PANIC_STOP, SERVO_TEST, FORMAT_SD, unknown type
- [ ] Message Handler — add tests for: handleDeployConfigAck (valid + invalid), handleDeployScriptAckNak (ACK + NAK + invalid), handleRunScriptAckNak (ACK + NAK + invalid)
- [ ] Script Converter — add tests for: empty script (no channels), script with no events on a channel
- [ ] Run full suite + coverage, verify improvement

## Files to modify

- `astros_api/src/serial/message_generator.test.ts` — add ~6 tests
- `astros_api/src/serial/message_handler.test.ts` — add ~7 tests
- `astros_api/src/script_converter.test.ts` — add ~2 tests

- [ ] Fix `contoller`/`contollers` typos — `data.contoller` → `data.controller` in message_generator.ts (lines 273, 288); `contollers` → `controllers` in api_server.ts (lines 460, 462, 464)

## Verification

```bash
cd astros_api && npx vitest run --coverage
```

# Unit Tests — Serial Message Service + Tracker

## Context

SerialMessageService orchestrates the message tracking lifecycle (pending → partial ACK → complete/timeout). It has zero test coverage. The MessageGenerator and MessageHandler it delegates to are partially tested, but the service layer's routing, tracker management, and timeout handling are not.

## Tasks

- [x] Write SerialMessageTracker tests (initialization, controller status)
- [x] Write SerialMessageService tests (tracker lifecycle, timeout, failure responses, handleMessage routing)
- [x] Run full suite, verify

## File to create

- `astros_api/src/serial/serial_message_service.test.ts`

## Verification

```bash
cd astros_api && npx vitest run
```

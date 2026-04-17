# Code Review Phase 2: Robustness & Safety

## Context

Fixes that prevent crashes, resource leaks, and data loss in the API backend.

## Tasks

- [x] **API C-1 + L-7**: Add WebSocket close handler + clean up dead clients in `updateClients()`
- [x] **API C-2**: Add graceful shutdown handler (SIGTERM/SIGINT)
- [x] **API H-2**: Add error/close handlers on SerialPort
- [x] **API C-3**: Promisify `file.mv()` in `file_controller.ts`
- [x] **API M-2**: Fix `unlink` in `audio_controller.ts` — use `fs.promises.unlink`
- [x] **API H-1**: Validate `JWT_KEY` exists at startup

Note: Vue H-3 (WebSocket JSON.parse safety) was completed in Phase 3 work.

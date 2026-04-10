# Code Review: astros_api

**Date:** 2026-04-09  
**Scope:** `astros_api/src/` — full backend codebase  
**Focus:** Bugs, unhandled exceptions, data loss risks, bad patterns, code smells

---

## Summary

The API backend is functional and well-structured for a hobbyist hardware control system, but has several categories of risk:

| Category                 | Critical | High | Medium | Low |
| ------------------------ | -------- | ---- | ------ | --- |
| Resource leaks / cleanup | 2        | 1    | —      | —   |
| Error handling gaps      | 1        | 3    | 4      | 2   |
| Data integrity / DB      | —        | 4    | 3      | 1   |
| Concurrency / timing     | —        | 2    | 1      | —   |
| Security                 | —        | 1    | 2      | 1   |
| Code smells              | —        | —    | 3      | 4   |

---

## Critical Issues

### C-1: WebSocket clients never removed on disconnect

**File:** `api_server.ts` ~L388-395

```typescript
this.websocket.on('connection', (conn) => {
  const id = uuid_v4();
  this.clients.set(id, conn);

  conn.on('message', (msg) => {
    this.handelWebsocketMessage(msg.toString());
  });
});
```

There is no `conn.on('close')` handler. Every WebSocket connection is added to the `clients` Map and never removed. Over time (especially on flaky network connections where clients reconnect frequently), this map grows unbounded. Each entry holds a reference to a dead `WebSocket` object, preventing GC. Additionally, `updateClients()` iterates and attempts `send()` on every dead client, triggering silent errors on each broadcast.

**Impact:** Memory leak, increasing error noise in logs, degraded broadcast performance.

**Fix:** Add a close handler:

```typescript
conn.on('close', () => {
  this.clients.delete(id);
});
```

Also clean up dead clients in `updateClients()` catch block.

---

### C-2: No graceful shutdown — serial port and worker thread never cleaned up

**File:** `api_server.ts` — `setupSerialPort()` ~L377-396

The `SerialPort` and `Worker` thread are created but there is:

- No `process.on('SIGTERM')` or `process.on('SIGINT')` handler
- No `this.serialPort.close()` call anywhere
- No `this.serialWorker.terminate()` call anywhere
- No `WebSocketServer.close()` call anywhere

On a Raspberry Pi / Orange Pi running in Docker, this means:

1. The serial port (`/dev/ttyS0`) stays locked after container stop, potentially requiring a reboot to reclaim
2. The worker thread becomes a zombie process
3. File descriptors leak across restarts

**Impact:** Serial port locked after restart, resource exhaustion on constrained ARM SBCs.

**Fix:** Add a shutdown handler:

```typescript
const shutdown = () => {
  this.animationQueue.panicStop();
  this.serialPort?.close();
  this.serialWorker?.terminate();
  this.websocket?.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

---

### C-3: File upload race condition — DB record created before file write confirmed

**File:** `controllers/file_controller.ts` ~L45-53

```typescript
file.mv(path, (err) => {
  if (err) {
    logger.error(err);
    return res.status(500).send('Internal server error');
  }
});

const repo = new AudioFileRepository(db);
await repo.insertFile(filename, file.name);
return res.status(200).send();
```

`file.mv()` is callback-based, but execution continues immediately to the `insertFile()` call without waiting for the callback. This creates two bugs:

1. The DB insert runs regardless of whether the file was written successfully — orphaned DB records pointing to non-existent files
2. If the file write fails, `res.status(500)` fires from the callback AND `res.status(200)` fires from the main flow — "headers already sent" error

**Impact:** Data loss (phantom file records), Express "headers already sent" crash.

**Fix:** Promisify the `mv` call:

```typescript
await new Promise<void>((resolve, reject) => {
  file.mv(path, (err) => (err ? reject(err) : resolve()));
});
await repo.insertFile(filename, file.name);
```

---

## High Severity

### H-1: JWT_KEY not validated at startup

**File:** `api_server.ts` ~L283-288

```typescript
const jwtKey: string = process.env.JWT_KEY as string;

this.authHandler = jwt({
  secret: jwtKey,
  algorithms: ['HS256'],
});
```

If `JWT_KEY` is not set in the environment, `jwtKey` is `undefined` cast to `string`. The `express-jwt` middleware created with an undefined secret has undefined behavior — it may accept any token or reject all tokens depending on the library version. Either outcome is bad: authentication bypass or total lockout.

**Impact:** Potential authentication bypass in production if `.env` file is missing or misconfigured.

**Fix:** Validate at startup:

```typescript
const jwtKey = process.env.JWT_KEY;
if (!jwtKey) {
  logger.error('JWT_KEY environment variable is required');
  process.exit(1);
}
```

---

### H-2: SerialPort and parser have no error handlers

**File:** `api_server.ts` ~L382-396

```typescript
this.serialPort = new SerialPort({
  path: process.env.SERIAL_PORT || '/dev/ttyS0',
  baudRate: Number.parseInt(process.env.BAUD_RATE || '9600'),
});
this.serialParser = this.serialPort
  .pipe(new DelimiterParser({ delimiter: '\n' }))
  .on('data', (data: any) => { ... });
```

Missing:

- No `.on('error')` on `serialPort` — an error event (cable disconnect, permission denied) will crash the process with an unhandled error
- No `.on('close')` — physical disconnect from ESP32 goes undetected
- No try/catch around `new SerialPort()` — if the device path doesn't exist, the constructor throws and crashes the server immediately (not even a graceful error log)

**Impact:** Any serial port error crashes the entire application. Physical cable disconnects go undetected.

**Fix:** Add error/close handlers and wrap construction in try/catch.

---

### H-3: Animation queue timeout overwrite — panic stop leaks timers

**File:** `serial/animation_queue/animation_queue.ts` ~L170-175, L89-96

In `dispatchTrack()`:

```typescript
this.currentTimeout = setTimeout(() => {
  this.playNextTrack();
}, track.duration);
```

In `playNextTrack()` Step D (shuffle delay):

```typescript
this.currentTimeout = setTimeout(() => {
  this.beginTrack(track);
}, delay);
```

Both paths overwrite `this.currentTimeout` without clearing the previous value. The sequence:

1. `dispatchTrack()` sets `currentTimeout` to timer T1
2. T1 fires, calling `playNextTrack()`
3. `playNextTrack()` sets `currentTimeout` to timer T2 (shuffle delay)
4. But `dispatchTrack()` was also called from `beginTrack()`, setting a NEW timer T3
5. `currentTimeout` now points to T3; T2 is leaked

If `panicStop()` is called, it only clears `this.currentTimeout` (the last one assigned). Any previously overwritten timers continue executing, potentially dispatching tracks to hardware after a panic stop.

**Impact:** Panic stop does not fully stop all animations. Hardware receives commands after emergency stop.

**Fix:** Always clear the previous timeout before setting a new one:

```typescript
if (this.currentTimeout) {
  clearTimeout(this.currentTimeout);
}
this.currentTimeout = setTimeout(...);
```

---

### H-4: `controller_locations.controller_id` type mismatch

**File:** `dal/migrations/migration_0.ts` ~L103

```typescript
.createTable('controller_locations')
.addColumn('location_id', 'text', (col) => col.notNull())
.addColumn('controller_id', 'integer', (col) => col.notNull())
```

The `controller_id` column is defined as `integer`, but controllers use text UUIDs as their primary key. SQLite's type affinity permits storing text in an integer column, so this doesn't cause runtime errors — but it defeats type checking, breaks any future migration to a stricter DB, and is misleading.

The seed data at the bottom of the same migration confirms this: `controller_id` receives the UUID string from `masterController.id`.

**Impact:** Latent data integrity issue. Works due to SQLite's permissive typing but is fundamentally incorrect.

**Fix:** Change column type to `'text'` in a new migration.

---

### H-5: No foreign key constraints — orphaned data on delete

**File:** `dal/migrations/migration_0.ts` — entire schema

No foreign key constraints are defined between:

- `script_channels.script_id` → `scripts.id`
- `script_events.script_id` → `scripts.id`
- `controller_locations.controller_id` → `controllers.id`
- `controller_locations.location_id` → `locations.id`
- `maestro_boards.parent_id` → `uart_modules.id`
- `maestro_channels.board_id` → `maestro_boards.id`
- `kangaroo_x2.parent_id` → `uart_modules.id`
- `gpio_channels.location_id` → `locations.id`

Additionally, `script_events` has no primary key and no unique constraint — duplicate events can exist.

The code partially compensates by manually deleting child records (e.g., `deleteScriptEvents` before `deleteScriptChannels`), but this is fragile. The `deleteScript()` method in `script_repository.ts` does a soft delete (sets `enabled = 0`) and removes playlist tracks, but does NOT delete script_channels or script_events, leaving orphaned rows.

**Impact:** Data grows with orphaned records that are never cleaned up. Schema doesn't enforce integrity.

**Fix:** Add foreign keys with CASCADE DELETE in a new migration. Also note that SQLite requires `PRAGMA foreign_keys = ON` per connection.

---

### H-6: Worker thread errors not communicated back to main thread

**File:** `background_tasks/serial_worker.js`

When the worker encounters an invalid message type or an unhandled error:

```javascript
if (isNaN(msg.type)) {
  logger.error(`Message type not defined: ${msg.type}`);
  return; // Silent — no postMessage back
}
```

The main thread sent a command and is waiting for a response (either via WebSocket update or HTTP response). If the worker silently drops the message, the main thread never knows the command failed. The only eventual signal is a message timeout, which masks the real error.

**Impact:** Silent command failures. User sees "success" HTTP response but nothing happens on hardware.

---

### H-7: `handlePollResponse` crashes on malformed poll message

**File:** `api_server.ts` ~L483-510

```typescript
const val = msg as PollRepsonse;
const controller = await controlerRepo.getControllerByAddress(val.controller.address);
```

If `messageHandler.handlePollAck()` receives a malformed message (wrong number of parts), it returns a `PollRepsonse` with `type: UNKNOWN` but the `controller` property is **undefined** (not set). The caller accesses `val.controller.address` without checking, causing a `TypeError: Cannot read properties of undefined`.

This is caught by the outer try/catch so it doesn't crash the server, but it means every malformed poll message from an ESP32 produces an error + stack trace in the logs with no diagnostic information about which controller sent the bad message.

**Impact:** Noisy error logs, masked root cause of serial communication issues.

---

## Medium Severity

### M-1: `deleteScript` has non-atomic multi-step operation

**File:** `controllers/scripts_controller.ts`

```typescript
await scriptRepo.deleteScript(req.query.id);
await playlistRepo.deleteTracksByScriptId(req.query.id);
```

These are two separate operations without a shared transaction. If the second fails (DB error, process crash), the script is deleted but playlist tracks referencing it remain — orphaned data. The HTTP handler returns 500, but the first operation already committed.

**Impact:** Partial deletion leaves inconsistent data.

---

### M-2: `unlink` in audio delete uses callback pattern incorrectly

**File:** `controllers/audio_controller.ts` ~L46-50

```typescript
await unlink(`${appdata('astrosserver')}/files/${req.query.id}`, (err) => {
  if (err) {
    console.error(err);
  }
});
```

`unlink` from `fs` is callback-based, not promise-based. The `await` does nothing. The file deletion is fire-and-forget. If it fails, the error goes to `console.error` instead of the application logger, and the HTTP response still returns 200 success.

Additionally, `req.query.id` is concatenated directly into a file path with no sanitization. A crafted `id` like `../../etc/passwd` would attempt to delete outside the intended directory (though likely blocked by file permissions on Linux).

**Impact:** File deletion failures silently swallowed; mild path traversal risk.

**Fix:** Use `fs.promises.unlink` and validate the resolved path stays within the storage directory.

---

### M-3: File upload creates `.undefined` filenames for unknown MIME types

**File:** `controllers/file_controller.ts` ~L40-42

```typescript
const extensionMap = new Map<string, string>([
  ['audio/ogg', 'ogg'],
  ['audio/mpeg', 'mp3'],
  ['audio/wav', 'wav'],
]);
filename = `${uuid_v4()}.${extensionMap.get(file.mimetype)}`;
```

If the uploaded file has a MIME type not in the map (e.g., `audio/flac`, `application/octet-stream`), `extensionMap.get()` returns `undefined`, producing filenames like `a1b2c3d4.undefined`.

**Impact:** Broken file references, confusing file system state.

---

### M-4: API key checked against DB on every remote control request

**File:** `api_key_validator.ts` ~L16

```typescript
token = await settings.getSetting('apikey');
```

Every request to `/remotecontrol` hits the database to fetch the API key. The API key rarely changes. On a Raspberry Pi under load (e.g., M5Stack sending frequent commands), this creates unnecessary DB contention.

**Impact:** Performance bottleneck under load.

**Fix:** Cache the API key in memory with a reasonable TTL or reload trigger.

---

### M-5: Serial message timeouts not cancellable

**File:** `serial/serial_message_service.ts` ~L140-150

```typescript
setTimeout(() => {
  this.handleTimeout(msgId);
}, timeout);
```

The `setTimeout` return value is never captured. If a response arrives before the timeout, the timer still fires. The `handleTimeout` method checks if the tracker was already deleted and bails out — so it's not a correctness bug — but the timer callbacks accumulate in the event loop. Under high message volume on constrained ARM hardware, this creates unnecessary GC pressure.

**Impact:** Minor memory/performance concern on constrained hardware.

---

### M-6: `migration_1` data migration not wrapped in transaction

**File:** `dal/migrations/migration_1.ts`

The migration reads all script events, creates a new table, inserts rows, then drops the old table — all as separate operations. If the process crashes between the drop and the last insert, data is lost.

**Impact:** Risk of data loss during migration (one-time event, but unrecoverable).

---

### M-7: `reauth` token renewal window may be unintentionally wide

**File:** `controllers/authentication_controller.ts` ~L45-49

```typescript
const buffer = Date.now() - 60 * 60 * 1000;
if (result.exp * 1000 > buffer) {
  // renew token
}
```

This renews tokens that expired up to 1 hour ago. This may be intentional for UX (keeping sessions alive across brief disconnects), but it means a stolen expired token can be renewed for up to an hour after expiration — which reduces the security value of the token's expiry.

**Impact:** Wider-than-expected token renewal window.

---

## Low Severity / Code Smells

### L-1: Typo in method name — `handelWebsocketMessage`

**File:** `api_server.ts` ~L399

Should be `handleWebsocketMessage`. Minor but affects searchability and readability.

---

### L-2: `handelWebsocketMessage` wraps sync code in unnecessary Promise constructor

**File:** `api_server.ts` ~L399-417

```typescript
async handelWebsocketMessage(msg: string): Promise<void> {
  return new Promise((resolve, _) => {
    try {
      const parsed = JSON.parse(msg) as IWebSocketMessage;
      // sync switch statement
    } catch (error) {
      logger.error(`Error parsing websocket message: ${error}`);
    }
    resolve();
  });
}
```

This is an async function that creates and returns a manual Promise around entirely synchronous code. The Promise adds no value and the `reject` parameter is unused (aliased as `_`).

---

### L-3: Repetitive try/catch + serial unavailable pattern across route handlers

**File:** `api_server.ts` — `syncControllers`, `syncControllerConfig`, `uploadScript`, `runPlaylist`, `runScript`, `panicStop`, `directCommand`, `formatSD`

Each follows the identical pattern:

```typescript
try {
  if (this.sendSerialUnavailable(res)) return;
  // ... operation
  res.status(200);
  res.json({ message: 'success' });
} catch (error) {
  logger.error(error);
  res.status(500);
  res.json({ message: 'Internal server error' });
}
```

This boilerplate could be extracted into a middleware or wrapper function to reduce duplication and ensure consistent error handling.

---

### L-4: `req: any, res: any, next: any` throughout all route handlers

All controller functions use untyped `any` parameters instead of Express's `Request`, `Response`, `NextFunction` types. This eliminates all type checking on the request/response objects and makes it easy to miss typos or incorrect property access.

---

### L-5: `runScript` doesn't check if script exists before using it

**File:** `api_server.ts` ~L751-772

```typescript
const script = await scriptRepo.getScript(id);
// No null check
const queueItem: AnimationQueuePlaylist = {
  tracks: [{ id: script.id, duration: script.durationDS * 100 }],
};
```

If `id` doesn't match any script, `getScript` throws or returns null, and `script.id` / `script.durationDS` crash. This is caught by the outer try/catch and returns 500, but a 404 would be more appropriate and informative.

---

### L-6: N+1 query in `loadMaestroModule`

**File:** `dal/repositories/module_repositories/uart_repository.ts`

Loads all boards with one query, then loops to load channels for each board with separate queries. Could be a single JOIN query. On locations with many Maestro boards, this scales linearly in DB calls.

---

### L-7: `updateClients` broadcasts to dead clients without cleanup

**File:** `api_server.ts` ~L935-945

```typescript
private updateClients(msg: any): void {
  const str = JSON.stringify(msg);
  for (const client of this.clients.values()) {
    try {
      client.send(str);
    } catch (err) {
      logger.error(`websocket send error: ${err}`);
      // Client stays in map, will fail again next broadcast
    }
  }
}
```

Failed sends don't remove the client from the map. Combined with C-1, this means dead clients accumulate and generate error logs on every broadcast.

---

### L-8: Login route returns 404 for internal errors

**File:** `controllers/authentication_controller.ts` ~L19

```typescript
if (err) {
  res.status(404).json(err);
  return;
}
```

A passport internal error should return 500, not 404. Additionally, the raw error object is exposed to the client.

---

## Recommendations (prioritized)

1. **Add graceful shutdown handler** (C-2) — prevents serial port lock and resource leaks
2. **Add WebSocket close handler** (C-1) — prevents memory leak
3. **Fix file upload race condition** (C-3) — prevents data loss
4. **Validate JWT_KEY at startup** (H-1) — prevents auth misconfiguration
5. **Add serial port error handlers** (H-2) — prevents crash on disconnect
6. **Clear previous timeout before setting new one in animation queue** (H-3) — fixes panic stop reliability
7. **Fix migration column type mismatch** (H-4) — data integrity housekeeping
8. **Add foreign key constraints** (H-5) — prevent orphaned data accumulation
9. **Communicate worker errors back to main thread** (H-6) — improve debugging
10. **Promisify callback-based file operations** (C-3, M-2) — correct async patterns

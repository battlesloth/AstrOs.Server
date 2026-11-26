// Mirror of astros_api/src/models/control_module/uart/sub_modules/maestro/release_ms.ts:
// a Maestro channel's minimum powered time after a move, in ms. The server is
// the source of truth and refuses a save outside the range; keep these in
// sync with the API values when changing them.
export const RELEASE_MS_DEFAULT = 5000;
export const RELEASE_MS_MIN = 1000;
export const RELEASE_MS_MAX = 120000;

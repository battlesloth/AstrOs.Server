// Mirror of astros_api/src/models/control_module/uart/sub_modules/maestro/release_ms.ts:
// a Maestro channel's minimum powered time after a move, in ms. The server is
// the source of truth and refuses a value outside the range or not a whole
// number; keep these in sync with the API values when changing them
// (constants/__tests__/maestro.spec.ts checks it).
export const RELEASE_MS_DEFAULT = 5000;
export const RELEASE_MS_MIN = 1000;
export const RELEASE_MS_MAX = 120000;

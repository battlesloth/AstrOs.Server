export const CHECK_SESSION = 'api/check-session';
export const LOGIN = 'api/login';
export const LOGOUT = 'api/logout';

export const LOCATIONS = 'api/locations/';
export const LOCATIONS_LOAD = 'api/locations/load';
export const SYNC_CONTROLLERS = 'api/locations/synccontrollers';
export const SYNC_CONFIG = 'api/locations/syncconfig';

export const SETTINGS = 'api/settings';
export const SETTINGS_CONTROLLERS = 'api/settings/controllers';
export const SETTINGS_FORMAT_SD = 'api/settings/formatSD';

export const SCRIPTS = 'api/scripts';
export const SCRIPTS_ALL = 'api/scripts/all';
export const SCRIPTS_ALL_NAMES = 'api/scripts/all-names';
export const SCRIPTS_COPY = 'api/scripts/copy';
export const SCRIPTS_UPLOAD = 'api/scripts/upload';
export const SCRIPTS_RUN = 'api/scripts/run';
export const SCRIPTS_TEST_CHANNEL = 'api/directcommand';

export const PLAYLISTS = 'api/playlists';
export const PLAYLISTS_ALL = 'api/playlists/all';
export const PLAYLISTS_COPY = 'api/playlists/copy';
export const PLAYLISTS_RUN = 'api/playlists/run';

// Stop-all / emergency stop. Backend routes: POST /panicStop, POST /panicClear,
// GET /panicState (api_server.ts).
export const PANIC_STOP = 'api/panicStop';
export const PANIC_CLEAR = 'api/panicClear';
export const PANIC_STATE = 'api/panicState';

export const REMOTE_CONFIG = 'api/remoteConfig';

export const SYSTEM_STATUS = 'api/system/status';

export const FIRMWARE_RELEASES = 'api/firmware/releases';
export const FIRMWARE_FLASH = 'api/firmware/flash';
export const FIRMWARE_UPLOAD = 'api/firmware/upload';
export const FIRMWARE_LOCK_STATE = 'api/firmware/lock-state';

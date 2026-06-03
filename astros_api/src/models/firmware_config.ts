// Hard-coded firmware compatibility floor. Bumped manually when the
// server starts depending on a feature only available in newer firmware.
// Dev / RC builds of this version (e.g. 1.2.0-dev.N) are accepted by
// meetsMinimum() in src/semver.ts.
//
// Mirrored on the Vue side at astros_vue/src/constants/firmware.ts so
// tooltips can show the required minimum without an extra round-trip.
// Keep both in sync.

export class FirmwareConfig {
  static readonly MINIMUM_FIRMWARE_VERSION = '1.2.0';
}

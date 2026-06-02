export class Constants {
  static readonly CORE = 'core';
  static readonly DOME = 'dome';
  static readonly BODY = 'body';
}

/**
 * The canonical location names seeded into `locations.name` and used as the key
 * for a script's per-location deployment status. Kept in sync with `Constants`.
 */
export type LocationName = typeof Constants.BODY | typeof Constants.CORE | typeof Constants.DOME;

export function isLocationName(value: string | null | undefined): value is LocationName {
  return value === Constants.BODY || value === Constants.CORE || value === Constants.DOME;
}

/**
 * Generates a short, prefixed ID: prefix + 7-digit timestamp + 3 random
 * alphabetic characters (e.g., `s1781234abc`).
 *
 * The timestamp component (`Date.now() / 1_000_000`) advances every ~16.7
 * minutes — a million milliseconds is 1000 seconds, despite the visual
 * suggestion of "1M". IDs generated within that window share a timestamp
 * prefix and rely on the 3-char suffix for uniqueness: 52^3 = 140,608
 * possibilities, with birthday-paradox collision becoming likely (~50%)
 * only at ~470 IDs in the same window. AstrOs's user-driven generation
 * rate is comfortably below that.
 *
 * Not cryptographically random.
 */
export function generateShortId(prefix: string): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = `${prefix}${Math.floor(Date.now() / 1000000)}`;
  const charactersLength = characters.length;
  for (let i = 0; i < 3; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

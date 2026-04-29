/**
 * Generates a short, prefixed ID. Combines a truncated timestamp with three
 * random alphabetic characters. Not cryptographically random — used for
 * human-readable identifiers (e.g., script IDs) where collisions within a
 * single second are acceptable given the random suffix.
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

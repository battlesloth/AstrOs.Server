export function generateShortId(prefix: string): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = `${prefix}${Math.floor(Date.now() / 1000000)}`;
  const charactersLength = characters.length;
  for (let i = 0; i < 3; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

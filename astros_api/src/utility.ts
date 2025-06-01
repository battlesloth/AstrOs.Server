export class Utility {
  public static asciiToUint8Array(str: string): Uint8Array {
    const chars = [];
    for (let i = 0; i < str.length; ++i) {
      chars.push(str.charCodeAt(i));
    }
    return new Uint8Array(chars);
  }

  public static numberToUint8Array(depth: number, value: number): Uint8Array {
    const bytes = new Uint8Array(depth);

    let i = depth;

    do {
      bytes[--i] = value & 255;
      value = value >> 8;
    } while (i);

    return bytes;
  }
}

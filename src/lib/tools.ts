/**
 * Parse a hex or decimal number string.
 * @param num The number as a string (e.g. 0x42 or 127)
 * @return    The parsed number
 */
export function parseNumber (num: string): number {
  if (num.startsWith('0x')) {
    return parseInt(num, 16);
  } else {
    return parseInt(num, 10);
  }
}

/**
 * Parse an address to a string.
 * @param addr The address as a hex or decimal number string or `*`.
 * @return     The address as a number or null if `addr` was `*`.
 */
export function parseAddress (addr: number | string): number | null {
  if (typeof addr === 'number') return addr;
  if (addr === '*') return null;
  return parseNumber(addr);
}

/**
 * Format a number as a hex number string.
 * @param num The number.
 * @retrun    The hex number with leading `0x`.
 */
export function hexNumber (num: number): string {
  let s = num.toString(16).toUpperCase();
  if (s.length < 2) {
    s = '0' + s;
  }
  return '0x' + s;
}

/**
 * Round a floating point number to the given precision.
 * @param num       The number.
 * @param precision The number of decimals to round to.
 * @return          The rounded number.
 */
export function round (num: number, precision: number): number {
  if (precision === 0) return Math.round(num);

  let exp = 1;
  for (let i = 0; i < precision; i++) {
    exp *= 10;
  }

  return Math.round(num * exp) / exp;
}

/**
 * Format a buffer as a hex string.
 * @param buf The buffer to format.
 * @return    A string with the buffer content as hex numbers separated by spaces.
 */
export function formatBufferAsHexString (buf: Buffer): string {
  return buf.toString('hex').toUpperCase().replace(/(..)/g, ' 0x$1').trim();
}

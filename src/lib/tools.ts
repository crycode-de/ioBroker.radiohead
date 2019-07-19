export function parseNumber (num: string): number {
  if (num.startsWith('0x')) {
    return parseInt(num, 16);
  } else {
    return parseInt(num, 10);
  }
}

export function parseAddress (addr: number | string): number | null {
  if (typeof addr === 'number') return addr;
  if (addr === '*') return null;
  return parseNumber(addr);
}

export function hexNumber (num: number): string {
  let s = num.toString(16).toUpperCase();
  if (s.length < 2) {
    s = '0' + s;
  }
  return '0x' + s;
}

export function round (num: number, precision: number): number {
  if(precision == 0) return Math.round(num);

  let exp = 1;
  for(let i=0; i < precision; i++) {
    exp *= 10;
  }

  return Math.round(num * exp) / exp;
}

export function formatBufferAsHexString (buf: Buffer): string {
  return buf.toString('hex').toUpperCase().replace(/(..)/g, ' 0x$1').trim();
}

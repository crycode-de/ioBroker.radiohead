"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Parse a hex or decimal number string.
 * @param num The number as a string (e.g. 0x42 or 127)
 * @return    The parsed number
 */
function parseNumber(num) {
    if (num.startsWith('0x')) {
        return parseInt(num, 16);
    }
    else {
        return parseInt(num, 10);
    }
}
exports.parseNumber = parseNumber;
/**
 * Parse an address to a string.
 * @param addr The address as a hex or decimal number string or `*`.
 * @return     The address as a number or null if `addr` was `*`.
 */
function parseAddress(addr) {
    if (typeof addr === 'number')
        return addr;
    if (addr === '*')
        return null;
    return parseNumber(addr);
}
exports.parseAddress = parseAddress;
/**
 * Format a number as a hex number string.
 * @param num The number.
 * @retrun    The hex number with leading `0x`.
 */
function hexNumber(num) {
    let s = num.toString(16).toUpperCase();
    if (s.length < 2) {
        s = '0' + s;
    }
    return '0x' + s;
}
exports.hexNumber = hexNumber;
/**
 * Round a floating point number to the given precision.
 * @param num       The number.
 * @param precision The number of decimals to round to.
 * @return          The rounded number.
 */
function round(num, precision) {
    if (precision == 0)
        return Math.round(num);
    let exp = 1;
    for (let i = 0; i < precision; i++) {
        exp *= 10;
    }
    return Math.round(num * exp) / exp;
}
exports.round = round;
/**
 * Format a buffer as a hex string.
 * @param buf The buffer to format.
 * @return    A string with the buffer content as hex numbers separated by spaces.
 */
function formatBufferAsHexString(buf) {
    return buf.toString('hex').toUpperCase().replace(/(..)/g, ' 0x$1').trim();
}
exports.formatBufferAsHexString = formatBufferAsHexString;

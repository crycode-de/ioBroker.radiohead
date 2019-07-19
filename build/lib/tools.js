"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function parseNumber(num) {
    if (num.startsWith('0x')) {
        return parseInt(num, 16);
    }
    else {
        return parseInt(num, 10);
    }
}
exports.parseNumber = parseNumber;
function parseAddress(addr) {
    if (typeof addr === 'number')
        return addr;
    if (addr === '*')
        return null;
    return parseNumber(addr);
}
exports.parseAddress = parseAddress;
function hexNumber(num) {
    let s = num.toString(16).toUpperCase();
    if (s.length < 2) {
        s = '0' + s;
    }
    return '0x' + s;
}
exports.hexNumber = hexNumber;
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
function formatBufferAsHexString(buf) {
    return buf.toString('hex').toUpperCase().replace(/(..)/g, ' 0x$1').trim();
}
exports.formatBufferAsHexString = formatBufferAsHexString;

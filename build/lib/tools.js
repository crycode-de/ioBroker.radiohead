"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatBufferAsHexString = exports.round = exports.hexNumber = exports.parseAddress = exports.parseNumber = void 0;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL3Rvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7O0dBSUc7QUFDSCxTQUFnQixXQUFXLENBQUUsR0FBVztJQUN0QyxJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDeEIsT0FBTyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0tBQzFCO1NBQU07UUFDTCxPQUFPLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7S0FDMUI7QUFDSCxDQUFDO0FBTkQsa0NBTUM7QUFFRDs7OztHQUlHO0FBQ0gsU0FBZ0IsWUFBWSxDQUFFLElBQXFCO0lBQ2pELElBQUksT0FBTyxJQUFJLEtBQUssUUFBUTtRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQzFDLElBQUksSUFBSSxLQUFLLEdBQUc7UUFBRSxPQUFPLElBQUksQ0FBQztJQUM5QixPQUFPLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMzQixDQUFDO0FBSkQsb0NBSUM7QUFFRDs7OztHQUlHO0FBQ0gsU0FBZ0IsU0FBUyxDQUFFLEdBQVc7SUFDcEMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUN2QyxJQUFJLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1FBQ2hCLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0tBQ2I7SUFDRCxPQUFPLElBQUksR0FBRyxDQUFDLENBQUM7QUFDbEIsQ0FBQztBQU5ELDhCQU1DO0FBRUQ7Ozs7O0dBS0c7QUFDSCxTQUFnQixLQUFLLENBQUUsR0FBVyxFQUFFLFNBQWlCO0lBQ25ELElBQUcsU0FBUyxJQUFJLENBQUM7UUFBRSxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFFMUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO0lBQ1osS0FBSSxJQUFJLENBQUMsR0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUMvQixHQUFHLElBQUksRUFBRSxDQUFDO0tBQ1g7SUFFRCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQztBQUNyQyxDQUFDO0FBVEQsc0JBU0M7QUFFRDs7OztHQUlHO0FBQ0gsU0FBZ0IsdUJBQXVCLENBQUUsR0FBVztJQUNsRCxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUM1RSxDQUFDO0FBRkQsMERBRUMifQ==
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var tools_exports = {};
__export(tools_exports, {
  formatBufferAsHexString: () => formatBufferAsHexString,
  hexNumber: () => hexNumber,
  parseAddress: () => parseAddress,
  parseNumber: () => parseNumber,
  round: () => round
});
module.exports = __toCommonJS(tools_exports);
function parseNumber(num) {
  if (num.startsWith("0x")) {
    return parseInt(num, 16);
  } else {
    return parseInt(num, 10);
  }
}
function parseAddress(addr) {
  if (typeof addr === "number") return addr;
  if (addr === "*") return null;
  return parseNumber(addr);
}
function hexNumber(num) {
  let s = num.toString(16).toUpperCase();
  if (s.length < 2) {
    s = "0" + s;
  }
  return "0x" + s;
}
function round(num, precision) {
  if (precision === 0) return Math.round(num);
  let exp = 1;
  for (let i = 0; i < precision; i++) {
    exp *= 10;
  }
  return Math.round(num * exp) / exp;
}
function formatBufferAsHexString(buf) {
  return buf.toString("hex").toUpperCase().replace(/(..)/g, " 0x$1").trim();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  formatBufferAsHexString,
  hexNumber,
  parseAddress,
  parseNumber,
  round
});
//# sourceMappingURL=tools.js.map

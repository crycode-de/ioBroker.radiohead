"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateText = exports.isArray = void 0;
const axios_1 = require("axios");
/**
 * Tests whether the given variable is really an Array
 * @param it The variable to test
 */
function isArray(it) {
    if (Array.isArray != null)
        return Array.isArray(it);
    return Object.prototype.toString.call(it) === '[object Array]';
}
exports.isArray = isArray;
/**
 * Translates text using the Google Translate API
 * @param text The text to translate
 * @param targetLang The target languate
 */
function translateText(text, targetLang) {
    return __awaiter(this, void 0, void 0, function* () {
        if (targetLang === 'en')
            return text;
        try {
            const url = `http://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}&ie=UTF-8&oe=UTF-8`;
            const response = yield (0, axios_1.default)({ url, timeout: 5000 });
            if (isArray(response.data)) {
                // we got a valid response
                return response.data[0][0][0];
            }
            throw new Error('Invalid response for translate request');
        }
        catch (e) {
            throw new Error(`Could not translate to "${targetLang}": ${e}`);
        }
    });
}
exports.translateText = translateText;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbHMtZGV2LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi90b29scy1kZXYudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUEsaUNBQTBCO0FBRTFCOzs7R0FHRztBQUNILFNBQWdCLE9BQU8sQ0FBQyxFQUFXO0lBQ2pDLElBQUksS0FBSyxDQUFDLE9BQU8sSUFBSSxJQUFJO1FBQUUsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELE9BQU8sTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLGdCQUFnQixDQUFDO0FBQ2pFLENBQUM7QUFIRCwwQkFHQztBQUVEOzs7O0dBSUc7QUFDSCxTQUFzQixhQUFhLENBQUMsSUFBWSxFQUFFLFVBQWtCOztRQUNsRSxJQUFJLFVBQVUsS0FBSyxJQUFJO1lBQUUsT0FBTyxJQUFJLENBQUM7UUFDckMsSUFBSTtZQUNGLE1BQU0sR0FBRyxHQUFHLDBFQUEwRSxVQUFVLFdBQVcsa0JBQWtCLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDO1lBQ3hKLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSxlQUFLLEVBQUMsRUFBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBQyxDQUFDLENBQUM7WUFDbkQsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUMxQiwwQkFBMEI7Z0JBQzFCLE9BQU8sUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUMvQjtZQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsd0NBQXdDLENBQUMsQ0FBQztTQUMzRDtRQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ1YsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsVUFBVSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDakU7SUFDSCxDQUFDO0NBQUE7QUFiRCxzQ0FhQyJ9
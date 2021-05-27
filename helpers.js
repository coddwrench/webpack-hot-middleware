"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pathMatch = void 0;
var parse = require("url-parse");
function pathMatch(url, path) {
    try {
        return parse(url).pathname === path;
    }
    catch (e) {
        return false;
    }
}
exports.pathMatch = pathMatch;
;
//# sourceMappingURL=helpers.js.map
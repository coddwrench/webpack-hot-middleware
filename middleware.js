"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webpackHotMiddleware = void 0;
var helpers_1 = require("./helpers");
var defaultOptions = {};
function webpackHotMiddleware(compiler, opts) {
    opts = opts || {};
    opts.log = typeof opts.log == 'undefined' ? console.log.bind(console) : opts.log;
    opts.path = opts.path || '/__webpack_hmr';
    opts.heartbeat = opts.heartbeat || 10 * 1000;
    var latestStats = null;
    var closed = false;
    var eventStream = new EventStream(opts.heartbeat);
    if (compiler.hooks) {
        compiler.hooks.invalid.tap('webpack-hot-middleware', onInvalid);
        compiler.hooks.done.tap('webpack-hot-middleware', onDone);
    }
    else {
        compiler.plugin('invalid', onInvalid);
        compiler.plugin('done', onDone);
    }
    function onInvalid() {
        var date = new Date();
        if (closed)
            return date;
        latestStats = null;
        if (opts.log)
            opts.log('webpack building...');
        eventStream.publish({ action: 'building' });
        return date;
    }
    function onDone(statsResult) {
        if (closed)
            return;
        // Keep hold of latest stats so they can be propagated to new clients
        latestStats = statsResult;
        publishStats('built', latestStats, eventStream, opts.log);
    }
    var middleware = function (req, res, next) {
        if (closed)
            return next();
        if (!helpers_1.pathMatch(req.url, opts.path))
            return next();
        eventStream.handler(req, res);
        if (latestStats) {
            // Explicitly not passing in `log` fn as we don't want to log again on
            // the server
            publishStats('sync', latestStats, eventStream);
        }
    };
    middleware.publish = function (payload) {
        if (closed)
            return;
        eventStream.publish(payload);
    };
    middleware.close = function () {
        if (closed)
            return;
        // Can't remove compiler plugins, so we just set a flag and noop if closed
        // https://github.com/webpack/tapable/issues/32#issuecomment-350644466
        closed = true;
        eventStream.close();
        eventStream = null;
    };
    return middleware;
}
exports.webpackHotMiddleware = webpackHotMiddleware;
var EventStream = /** @class */ (function () {
    function EventStream(heartbeat) {
        var _this = this;
        this._clientId = 0;
        this._clients = {};
        var intervalHandler = function () {
            _this.everyClient(function (client) {
                client.write('data: \uD83D\uDC93\n\n');
            });
        };
        this._interval = setInterval(intervalHandler.bind(this), heartbeat).unref();
    }
    EventStream.prototype.everyClient = function (fn) {
        var _this = this;
        Object.keys(this._clients).forEach(function (id) {
            fn(_this._clients[id]);
        });
    };
    EventStream.prototype.close = function () {
        clearInterval(this._interval);
        this.everyClient(function (client) {
            if (!client.finished)
                client.end();
        });
        this._clients = {};
    };
    EventStream.prototype.publish = function (payload) {
        this.everyClient(function (client) {
            client.write('data: ' + JSON.stringify(payload) + '\n\n');
        });
    };
    EventStream.prototype.handler = function (req, res) {
        var _this = this;
        var headers = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'text/event-stream;charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            // While behind nginx, event stream should not be buffered:
            // http://nginx.org/docs/http/ngx_http_proxy_module.html#proxy_buffering
            'X-Accel-Buffering': 'no',
        };
        var isHttp = !(parseInt(req.httpVersion) >= 2);
        if (isHttp) {
            req.socket.setKeepAlive(true);
            Object.assign(headers, {
                Connection: 'keep-alive',
            });
        }
        res.writeHead(200, headers);
        res.write('\n');
        var id = this._clientId++;
        this._clients[id] = res;
        var closeHandler = function () {
            if (!res.finished)
                res.end();
            delete _this._clients[id];
        };
        req.on('close', closeHandler);
    };
    return EventStream;
}());
function publishStats(action, statsResult, eventStream, log) {
    var stats = statsResult.toJson({
        all: false,
        cached: true,
        children: true,
        modules: true,
        timings: true,
        hash: true,
    });
    // For multi-compiler, stats will be an object with a 'children' array of stats
    var bundles = extractBundles(stats);
    bundles.forEach(function (stats) {
        var name = stats.name || '';
        // Fallback to compilation name in case of 1 bundle (if it exists)
        if (bundles.length === 1 && !name && statsResult.compilation) {
            name = statsResult.compilation.name || '';
        }
        if (log)
            log("webpack built " + (name ? name + ' ' : '') + stats.hash + " in " + stats.time + "ms");
        eventStream.publish({
            name: name,
            action: action,
            time: stats.time,
            hash: stats.hash,
            warnings: stats.warnings || [],
            errors: stats.errors || [],
            modules: buildModuleMap(stats.modules),
        });
    });
}
function extractBundles(stats) {
    // Stats has modules, single bundle
    if (stats.modules)
        return [stats];
    // Stats has children, multiple bundles
    if (stats.children && stats.children.length)
        return stats.children;
    // Not sure, assume single
    return [stats];
}
function buildModuleMap(modules) {
    var map = {};
    modules.forEach(function (module) {
        map[module.id] = module.name;
    });
    return map;
}
module.exports = webpackHotMiddleware;
//# sourceMappingURL=middleware.js.map
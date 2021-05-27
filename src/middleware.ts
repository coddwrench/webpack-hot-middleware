import { Compiler, Stats } from "webpack"
import { IncomingMessage, ServerResponse } from "http";
import { NextHandleFunction, NextFunction } from "connect";
import { pathMatch } from "./helpers"

interface InternalCompiler extends Compiler  {
  plugin(a: string, b: (...args: any) => any): any;
}


export type Logger = (message?: any, ...optionalParams: any[]) => void;

export interface IHotMiddlewareOptions {
  log?: false | Logger;
  path?: string;
  heartbeat?: number;
}

export interface EventStream {
  publish(payload: any): void;
  close(): void;
}

export interface PublishPayload {
  action: string;
}

export function webpackHotMiddleware(compiler: InternalCompiler, opts: IHotMiddlewareOptions): NextHandleFunction & EventStream {

  opts = opts || {} as IHotMiddlewareOptions;

  opts.log = typeof opts.log == 'undefined' ? console.log.bind(console) : opts.log;
  opts.path = opts.path || '/__webpack_hmr';
  opts.heartbeat = opts.heartbeat || 10 * 1000;


  var latestStats: Stats = null;
  var closed = false;
  var eventStream = createEventStream(opts.heartbeat);

  if (compiler.hooks) {
    compiler.hooks.invalid.tap('webpack-hot-middleware', onInvalid);
    compiler.hooks.done.tap('webpack-hot-middleware', onDone);
  } else {
    compiler.plugin('invalid', onInvalid);
    compiler.plugin('done', onDone);
  }

  function onInvalid(statsResult: string) {
    var date = new Date();
    if (closed)
      return date;
    latestStats = null;
    if (opts.log)
      opts.log('webpack building...');
    eventStream.publish({ action: 'building' });
    return date;
  }

  function onDone(statsResult: Stats) {
    if (closed) return;
    // Keep hold of latest stats so they can be propagated to new clients
    latestStats = statsResult;
    publishStats('built', latestStats, eventStream, opts.log);
  }

  var middleware = function (req: IncomingMessage, res: ServerResponse, next: NextFunction) {
    if (closed)
      return next();
    if (!pathMatch(req.url, opts.path))
      return next();
    eventStream.handler(req, res);

    if (latestStats) {
      // Explicitly not passing in `log` fn as we don't want to log again on
      // the server
      publishStats('sync', latestStats, eventStream);
    }
  } as any;

  middleware.publish = function (payload: PublishPayload) {
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

function createEventStream(heartbeat: number) {
  var clientId = 0;
  var clients: { [key: string]: any } = {};

  function everyClient(fn: (client: any) => void) {
    Object.keys(clients).forEach(function (id) {
      fn(clients[id]);
    });
  }
  var interval = setInterval(function heartbeatTick() {
    everyClient(function (client) {
      client.write('data: \uD83D\uDC93\n\n');
    });
  }, heartbeat).unref();
  return {
    close: function () {
      clearInterval(interval);
      everyClient(function (client) {
        if (!client.finished) client.end();
      });
      clients = {};
    },
    handler: function (req: IncomingMessage, res: ServerResponse) {
      var headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/event-stream;charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        // While behind nginx, event stream should not be buffered:
        // http://nginx.org/docs/http/ngx_http_proxy_module.html#proxy_buffering
        'X-Accel-Buffering': 'no',
      };

      var isHttp1 = !(parseInt(req.httpVersion) >= 2);
      if (isHttp1) {
        req.socket.setKeepAlive(true);
        Object.assign(headers, {
          Connection: 'keep-alive',
        });
      }

      res.writeHead(200, headers);
      res.write('\n');
      var id = clientId++;
      clients[id] = res;
      req.on('close', function () {
        if (!res.finished) res.end();
        delete clients[id];
      });
    },
    publish: function (payload: PublishPayload) {
      everyClient(function (client) {
        client.write('data: ' + JSON.stringify(payload) + '\n\n');
      });
    },
  };
}

function publishStats(action: string, statsResult: Stats, eventStream: EventStream, log?: false | Logger) {
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
  bundles.forEach(function (stats: any) {
    var name = stats.name || '';
    // Fallback to compilation name in case of 1 bundle (if it exists)
    if (bundles.length === 1 && !name && statsResult.compilation) {
      name = (statsResult.compilation as any).name || '';
    }

    if (log)
      log(`webpack built ${(name ? name + ' ' : '')}${stats.hash} in ${stats.time}ms`);

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

function extractBundles(stats: any) {
  // Stats has modules, single bundle
  if (stats.modules)
    return [stats];

  // Stats has children, multiple bundles
  if (stats.children && stats.children.length)
    return stats.children;
  // Not sure, assume single
  return [stats];
}

function buildModuleMap(modules: Array<any>) {
  var map: { [key: string]: any } = {};
  modules.forEach(function (module) {
    map[module.id] = module.name;
  });
  return map;
}

module.exports = webpackHotMiddleware;
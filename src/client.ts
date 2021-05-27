/*eslint-env browser*/
/*global __resourceQuery __webpack_public_path__*/

declare var __resourceQuery: string;
declare var __webpack_public_path__: string;

interface Window {
  __whmEventSourceWrapper: any;
  __webpack_hot_middleware_reporter__: any;
}

declare interface ClientOptions {
  path: string,
  timeout: number,
  overlay: boolean,
  reload: boolean,
  log: boolean,
  warn: boolean,
  name: string,
  noInfo?: boolean,
  quiet?: boolean,
  autoConnect: boolean,
  overlayStyles: { [key: string]: string | number },
  overlayWarnings: boolean,
  ansiColors: { [key: string]: string | Array<string> },
  dynamicPublicPath?: string
}

declare interface OverridesClientOptions {
  path: string,
  timeout: string,
  overlay: string,
  reload: string,
  log: string,
  warn: string,
  name: string,
  noInfo?: string,
  quiet?: string,
  autoConnect: string,
  overlayStyles: string,
  overlayWarnings: string,
  ansiColors: string,
  dynamicPublicPath?: string
}

var options: ClientOptions = {
  path: '/__webpack_hmr',
  timeout: 20 * 1000,
  overlay: true,
  reload: false,
  log: true,
  warn: true,
  name: '',
  autoConnect: true,
  overlayStyles: {},
  overlayWarnings: false,
  ansiColors: {},
};

if (__resourceQuery) {
  var querystring = require('querystring');
  var overrides = querystring.parse(__resourceQuery.slice(1));
  setOverrides(overrides);
}

if (typeof window === 'undefined') {
  // do nothing
} else if (typeof window.EventSource === 'undefined') {
  console.warn(
    "webpack-hot-middleware's client requires EventSource to work. " +
    'You should include a polyfill if you want to support this browser: ' +
    'https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events#Tools'
  );
} else {
  if (options.autoConnect) {
    connect();
  }
}

/* istanbul ignore next */
function setOptionsAndConnect(overrides: OverridesClientOptions) {
  setOverrides(overrides);
  connect();
}

function setOverrides(overrides: OverridesClientOptions) {
  if (overrides.autoConnect)
    options.autoConnect = overrides.autoConnect == 'true';
  if (overrides.path) options.path = overrides.path;
  if (overrides.timeout) options.timeout = parseInt(overrides.timeout);
  if (overrides.overlay) options.overlay = overrides.overlay !== 'false';
  if (overrides.reload) options.reload = overrides.reload !== 'false';
  if (overrides.noInfo && overrides.noInfo !== 'false') {
    options.log = false;
  }
  if (overrides.name) {
    options.name = overrides.name;
  }
  if (overrides.quiet && overrides.quiet !== 'false') {
    options.log = false;
    options.warn = false;
  }

  if (overrides.dynamicPublicPath) {
    options.path = __webpack_public_path__ + options.path;
  }

  if (overrides.ansiColors)
    options.ansiColors = JSON.parse(overrides.ansiColors as string);
  if (overrides.overlayStyles)
    options.overlayStyles = JSON.parse(overrides.overlayStyles as string);

  if (overrides.overlayWarnings) {
    options.overlayWarnings = overrides.overlayWarnings == 'true';
  }
}

function EventSourceWrapper() {
  var source: EventSource;
  var lastActivity = new Date().getTime();
  var listeners = Array<(ev: Event) => void>();

  init();
  var timer = setInterval(function () {
    if (new Date().getTime() - lastActivity > options.timeout)
      handleDisconnect();
  }, options.timeout / 2);

  function init() {
    source = new window.EventSource(options.path);
    source.onopen = handleOnline;
    source.onerror = handleDisconnect;
    source.onmessage = handleMessage;
  }

  function handleOnline() {
    if (options.log) console.log('[HMR] connected');
    lastActivity = new Date().getTime();
  }

  function handleMessage(event: Event) {
    lastActivity = new Date().getTime();
    for (var i = 0; i < listeners.length; i++) {
      listeners[i](event);
    }
  }

  function handleDisconnect() {
    clearInterval(timer);
    source.close();
    setTimeout(init, options.timeout);
  }

  return {
    addMessageListener: function (fn: (e: Event) => void) {
      listeners.push(fn);
    },
  };
}

function getEventSourceWrapper() {
  if (!window.__whmEventSourceWrapper) {
    window.__whmEventSourceWrapper = {};
  }
  if (!window.__whmEventSourceWrapper[options.path]) {
    // cache the wrapper for other entries loaded on
    // the same page with the same options.path
    window.__whmEventSourceWrapper[options.path] = EventSourceWrapper();
  }
  return window.__whmEventSourceWrapper[options.path];
}

function connect() {
  getEventSourceWrapper().addMessageListener(handleMessage);

  function handleMessage(event: { data: string }) {
    if (event.data == '\uD83D\uDC93') {
      return;
    }
    try {
      processMessage(JSON.parse(event.data));
    } catch (ex) {
      if (options.warn) {
        console.warn('Invalid HMR message: ' + event.data + '\n' + ex);
      }
    }
  }
}

// the reporter needs to be a singleton on the page
// in case the client is being used by multiple bundles
// we only want to report once.
// all the errors will go to all clients
var reporter: any;
if (typeof window !== 'undefined') {
  if (!window.__webpack_hot_middleware_reporter__) {
    window.__webpack_hot_middleware_reporter__ = createReporter();
  }
  reporter = window.__webpack_hot_middleware_reporter__;
}

function createReporter() {
  var strip = require('strip-ansi');

  var overlay: any;
  if (typeof document !== 'undefined' && options.overlay) {
    overlay = require('./client-overlay')({
      ansiColors: options.ansiColors,
      overlayStyles: options.overlayStyles,
    });
  }

  var styles: { [key: string]: string } = {
    errors: 'color: #ff0000;',
    warnings: 'color: #999933;',
  };
  var previousProblems: any = null;
  function log(type: any, obj: any) {
    var newProblems = obj[type]
      .map(function (msg: string) {
        return strip(msg);
      })
      .join('\n');
    if (previousProblems == newProblems) {
      return;
    } else {
      previousProblems = newProblems;
    }

    var style = styles[type];
    var name = obj.name ? "'" + obj.name + "' " : '';
    var title = '[HMR] bundle ' + name + 'has ' + obj[type].length + ' ' + type;
    // NOTE: console.warn or console.error will print the stack trace
    // which isn't helpful here, so using console.log to escape it.
    if (console.group && console.groupEnd) {
      console.group('%c' + title, style);
      console.log('%c' + newProblems, style);
      console.groupEnd();
    } else {
      console.log(
        '%c' + title + '\n\t%c' + newProblems.replace(/\n/g, '\n\t'),
        style + 'font-weight: bold;',
        style + 'font-weight: normal;'
      );
    }
  }

  return {
    cleanProblemsCache: function () {
      previousProblems = null;
    },
    problems: function (type: any, obj: any) {
      if (options.warn) {
        log(type, obj);
      }
      if (overlay) {
        if (options.overlayWarnings || type === 'errors') {
          overlay.showProblems(type, obj[type]);
          return false;
        }
        overlay.clear();
      }
      return true;
    },
    success: function () {
      if (overlay) overlay.clear();
    },
    useCustomOverlay: function (customOverlay: any) {
      overlay = customOverlay;
    },
  };
}

var processUpdate = require('./process-update');

var customHandler: any;
var subscribeAllHandler: any;
function processMessage(obj: any) {
  switch (obj.action) {
    case 'building':
      if (options.log) {
        console.log(
          '[HMR] bundle ' +
          (obj.name ? "'" + obj.name + "' " : '') +
          'rebuilding'
        );
      }
      break;
    case 'built':
      if (options.log) {
        console.log(
          '[HMR] bundle ' +
          (obj.name ? "'" + obj.name + "' " : '') +
          'rebuilt in ' +
          obj.time +
          'ms'
        );
      }
    // fall through
    case 'sync':
      if (obj.name && options.name && obj.name !== options.name) {
        return;
      }
      var applyUpdate = true;
      if (obj.errors.length > 0) {
        if (reporter)
          reporter.problems('errors', obj);
        applyUpdate = false;
      } else if (obj.warnings.length > 0) {
        if (reporter) {
          var overlayShown = reporter.problems('warnings', obj);
          applyUpdate = overlayShown;
        }
      } else {
        if (reporter) {
          reporter.cleanProblemsCache();
          reporter.success();
        }
      }
      if (applyUpdate) {
        processUpdate(obj.hash, obj.modules, options);
      }
      break;
    default:
      if (customHandler) {
        customHandler(obj);
      }
  }

  if (subscribeAllHandler) {
    subscribeAllHandler(obj);
  }
}

if (module) {
  module.exports = {
    subscribeAll: function subscribeAll(handler: any) {
      subscribeAllHandler = handler;
    },
    subscribe: function subscribe(handler: any) {
      customHandler = handler;
    },
    useCustomOverlay: function useCustomOverlay(customOverlay: any) {
      if (reporter) reporter.useCustomOverlay(customOverlay);
    },
    setOptionsAndConnect: setOptionsAndConnect,
  };
}

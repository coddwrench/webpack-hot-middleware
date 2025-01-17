/**
 * Based heavily on https://github.com/webpack/webpack/blob/
 *  c0afdf9c6abc1dd70707c594e473802a566f7b6e/hot/only-dev-server.js
 * Original copyright Tobias Koppers @sokra (MIT license)
 */

/* global window __webpack_hash__ */

interface NodeModule {
  hot: any;
}
declare let __webpack_hash__: string;

interface ProcessUpdateData {
  moduleId: string;
  type: string;
  error: string;
  chain: Array<string>;
}

interface ProcessUpdateOptions {
  reload: boolean;
  log: boolean;
  warn: boolean;
}

if (!module.hot) {
  throw new Error("[HMR] Hot Module Replacement is disabled.");
}

const hmrDocsUrl = "https://webpack.js.org/concepts/hot-module-replacement/"; // eslint-disable-line max-len

let lastHash: string;
const failureStatuses = { abort: 1, fail: 1 };
const applyOptions = {
  ignoreUnaccepted: true,
  ignoreDeclined: true,
  ignoreErrored: true,
  onUnaccepted: function (data: ProcessUpdateData) {
    console.warn(
      "Ignored an update to unaccepted module " + data.chain.join(" -> ")
    );
  },
  onDeclined: function (data: ProcessUpdateData) {
    console.warn(
      "Ignored an update to declined module " + data.chain.join(" -> ")
    );
  },
  onErrored: function (data: ProcessUpdateData) {
    console.error(data.error);
    console.warn(
      `Ignored an error while updating module ${data.moduleId} (${data.type})`
    );
  },
};

function upToDate(hash?: string): boolean {
  if (hash) lastHash = hash;
  return lastHash == __webpack_hash__;
}

module.exports = function (
  hash: string,
  moduleMap: { [key: string]: string },
  options: ProcessUpdateOptions
) {
  const reload = options.reload;
  if (!upToDate(hash) && module.hot.status() == "idle") {
    if (options.log) console.log("[HMR] Checking for updates on the server...");
    check();
  }

  function check() {
    const cb = function (err: Error, updatedModules: any) {
      if (err) return handleError(err);

      if (!updatedModules) {
        if (options.warn) {
          console.warn("[HMR] Cannot find update (Full reload needed)");
          console.warn("[HMR] (Probably because of restarting the server)");
        }
        performReload();
        return null;
      }

      const applyCallback = function (applyErr: Error, renewedModules: any) {
        if (applyErr) return handleError(applyErr);

        if (!upToDate()) check();

        logUpdates(updatedModules, renewedModules);
      };

      const applyResult = module.hot.apply(applyOptions, applyCallback);
      // webpack 2 promise
      if (applyResult && applyResult.then) {
        // HotModuleReplacement.runtime.js refers to the result as `outdatedModules`
        applyResult.then(function (outdatedModules: any) {
          applyCallback(null, outdatedModules);
        });
        applyResult.catch(applyCallback);
      }
    };

    const result = module.hot.check(false, cb);
    // webpack 2 promise
    if (result && result.then) {
      result.then(function (updatedModules: any) {
        cb(null, updatedModules);
      });
      result.catch(cb);
    }
  }

  function logUpdates(updatedModules: any, renewedModules: any) {
    const unacceptedModules = updatedModules.filter(function (
      moduleId: string
    ) {
      return renewedModules && renewedModules.indexOf(moduleId) < 0;
    });

    if (unacceptedModules.length > 0) {
      if (options.warn) {
        console.warn(
          "[HMR] The following modules couldn't be hot updated: " +
            "(Full reload needed)\n" +
            "This is usually because the modules which have changed " +
            "(and their parents) do not know how to hot reload themselves. " +
            `See ${hmrDocsUrl}  for more details.`
        );
        unacceptedModules.forEach(function (moduleId: string) {
          console.warn("[HMR]  - " + (moduleMap[moduleId] || moduleId));
        });
      }
      performReload();
      return;
    }

    if (options.log) {
      if (!renewedModules || renewedModules.length === 0) {
        console.log("[HMR] Nothing hot updated.");
      } else {
        console.log("[HMR] Updated modules:");
        renewedModules.forEach(function (moduleId: string) {
          console.log("[HMR]  - " + (moduleMap[moduleId] || moduleId));
        });
      }

      if (upToDate()) {
        console.log("[HMR] App is up to date.");
      }
    }
  }

  function handleError(err: Error) {
    if (module.hot.status() in failureStatuses) {
      if (options.warn) {
        console.warn("[HMR] Cannot check for update (Full reload needed)");
        console.warn("[HMR] " + (err.stack || err.message));
      }
      performReload();
      return;
    }
    if (options.warn) {
      console.warn("[HMR] Update check failed: " + (err.stack || err.message));
    }
  }

  function performReload() {
    if (reload) {
      if (options.warn) console.warn("[HMR] Reloading page");
      window.location.reload();
    }
  }
};

const { dialog } = require('electron');
const psList = require('ps-list');

let enabled;
let enabledForWindows;
let ignored;
let quitHandler;
let setPidsHandler;
let runningPids = {};

const promptToQuit = (windowId) => {
  return new Promise((resolve) => {
    let pids;
    if (!windowId) {
      pids = Object.values(runningPids).reduce((memo, windowPids) => {
        return memo.concat(windowPids);
      }, []);
    } else {
      pids = runningPids[windowId];
    }
    console.log(runningPids);
    console.log('Window ' + (windowId || '[all]') + ' has pids', pids);

    const actionName = windowId ? "Quit Hyper" : "Close window";
    psList().then((procs) => {
      const children = procs.filter((proc) => {
        return pids.some((pid) => pid === proc.ppid)
      }).filter((child) => {
        return !ignored.some((cmd) => { return cmd.test(child.cmd); });
      });

      if (children.length > 0) {
        const runningNames = children.map((c) => c.cmd);
        dialog.showMessageBox({
          type: 'question',
          buttons: ['OK', 'Cancel'],
          defaultId: 0,
          title: actionName + '?',
          message: actionName + ' and ' + children.length + ' running processes?',
          detail: 'The following processes are active:\n' + runningNames.map((rn) => "  " + rn).join("\n")
        }, (selectedButtonIdx) => {
          switch (selectedButtonIdx) {
            case 0: // OK
              resolve(true);
              break;
            default:
              resolve(false);
              break;
          }
        });
      } else {
        resolve(true);
      }
    });
  });
}

const createQuitHandler = (app) => {
  let quitting = false;
  return (evt) => {
    if (enabled && !quitting && app.getWindows().size && Object.keys(runningPids).length > 0) {
      evt.preventDefault();
      promptToQuit().then((shouldQuit) => {
        if (shouldQuit) {
          quitting = true;
          app.quit();
        }
      });
    }
  };
}

const createCloseWindowHandler = (win) => {
  // Hyper doesn't handle this well so
  // we should probably intercept SESSION_USER_EXIT
  let closing = false;
  return (evt) => {
    if (enabledForWindows && !closing) {
      evt.preventDefault();
      promptToQuit(win.id).then((shouldQuit) => {
        if (shouldQuit) {
          closing = true;
          win.close();
        }
      });
    }
  };
};

exports.decorateConfig = (config) => {
  enabled = true;
  enabledForWindows = true;
  ignored = []; //[ /^\/bin\/bash/ ];
  return config;
};

exports.mapTermsState = (props, state) => {
  const sessions = Object.values(props.sessions.sessions);
  const pids = sessions.map((s) => s.pid);
  if (window.rpc.id) {
    if (pids.length === 0) { debugger; }
    console.log("Term state sessions:", sessions);
    window.rpc.emit("set term pids", { pids });
  }
  return state;
};

exports.onWindow = (win) => {
  const windowId = win.id;
  win.rpc.on('set term pids', ({ pids }) => {
    console.log("Setting PIDs for " + windowId + " to ", pids);
    runningPids[win.id] = pids;
  });
  win.on('close', createCloseWindowHandler(win));
  win.on('closed', () => {
    console.log("Clearing PIDs for " + windowId);
    delete runningPids[windowId];
  });
};

exports.onApp = (app) => {
  if (quitHandler) { app.off('before-quit', quitHandler); } // Plugin was reloaded
  quitHandler = createQuitHandler(app);
  app.on('before-quit', quitHandler);
};

exports.onUnload = (app) => {
  console.log("Plugin unload");
  if (quitHandler) {
    app.off('before-quit', quitHandler);
    quitHandler = null;
  } // Plugin was reloaded
};

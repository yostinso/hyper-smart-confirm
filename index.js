const { dialog } = require('electron');
const psList = require('ps-list');

let enabled;
let ignored;
let quitHandler;
let setPidsHandler;
let runningPids = {};

const createQuitHandler = (app) => {
  let quitting = false;
  return (evt) => {
    if (enabled && !quitting && app.getWindows().size && Object.keys(runningPids).length > 0) {
      evt.preventDefault();

      const pids = Object.values(runningPids).reduce((memo, windowPids) => {
        return memo.concat(windowPids);
      }, []);
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
            title: 'Quit Hyper?',
            message: 'Quit Hyper and ' + children.length + ' running processes?',
            detail: 'The following processes are active:\n' + runningNames.map((rn) => "  " + rn).join("\n")
          }, (selectedButtonIdx) => {
            switch (selectedButtonIdx) {
              case 0: // OK
                quitting = true;
                app.quit();
                break;
              default:
                break;
            }
          });
        } else {
          quitting = true;
          app.quit();
        }
      });
    }
  };
}

exports.decorateConfig = (config) => {
  enabled = true;
  ignored = [ /^\/bin\/bash/ ];
  return config;
};

exports.mapTermsState = (props, state) => {
  const sessions = Object.values(props.sessions.sessions);
  const pids = sessions.map((s) => s.pid);
  if (window.rpc.id) {
    window.rpc.emit("set term pids", { pids });
  }
  return state;
};

exports.onWindow = (win) => {
  win.rpc.on('set term pids', ({ pids }) => {
    console.log("Setting PIDs for " + win.id + " to ", pids);
    runningPids[win.id] = pids;
  });
  win.on('close', () => {
    console.log("Clearing PIDs for " + win.id);
    delete runningPids[win.id];
  });
};

exports.onApp = (app) => {
  if (quitHandler) { app.off('before-quit', quitHandler); } // Plugin was reloaded
  quitHandler = createQuitHandler(app);
  app.on('before-quit', quitHandler);
};

exports.onUnload = (app) => {
  if (quitHandler) {
    app.off('before-quit', quitHandler);
    quitHandler = null;
  } // Plugin was reloaded
};

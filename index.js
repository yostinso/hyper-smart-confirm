const { app, dialog } = require('electron');
const remote = require('electron').remote;
const psList = require('ps-list');

let quitting = false;
let decoratedConfig;
let quitHandler;
let setPidsHandler;
let runningPids = {};
let debugEnabled = null;

const getConfig = () => decoratedConfig ? decoratedConfig : window.config.getConfig();
const pluginConfigSelector = () => getConfig().hyperSmartConfirm || {};
const enabledSelector = () => pluginConfigSelector().enabled;
const ignoredSelector = () => pluginConfigSelector().ignored;
const ignoreShellSelector = () => pluginConfigSelector().ignoreShell;
const enabledForWindowsSelector = () => pluginConfigSelector().enabledForWindows;
const debugEnabledSelector = () => pluginConfigSelector().debugEnabled;

const debugLog = () => {
  if (debugEnabled === null) { debugEnabled = !!debugEnabledSelector(); }
  if (debugEnabled) {
    console.log.apply(console, arguments);
  }
}

const askConfirmQuit = (actionName, message, detail) => {
  return new Promise((resolve) => {
    const d = remote ? remote.dialog : dialog;
    d.showMessageBox({
      type: 'question',
      buttons: ['OK', 'Cancel'],
      defaultId: 0,
      title: actionName + '?',
      message: message,
      detail: detail
    }, (selectedButtonIdx) => {
      resolve(selectedButtonIdx === 0); // OK button is 0
    });
  });
}

const promptToQuit = (ptys, actionName) => {
  return new Promise((resolve) => {
    const ignored = ignoredSelector();
    psList().then((procs) => {
      const ignoreShell = ignoreShellSelector();
      const children = procs.filter((proc) => {
        return ptys.some(({ pid }) => (pid === proc.ppid) || (pid === proc.pid))
      }).filter((child) => {
        const pty = ptys.find(({ pid }) => (pid === child.ppid) || (pid === child.pid));
        const isIgnored = ignored.some((cmd) => { return cmd.test(child.cmd); });
        if (!isIgnored && ignoreShell && pty) {
          const childBin = child.cmd.split(' ')[0].match(/[^\/]*$/)[0];
          const ptyBin = (pty.shell || pty._file || "").split(' ')[0].match(/[^\/]*$/)[0];
          const isShell = childBin === ptyBin && childBin !== "";
          return !isShell;
        } else {
          return true;
        }
      });


      if (children.length > 0) {
        const runningNames = children.map((c) => c.cmd);
        askConfirmQuit(
          actionName, 
          actionName + ' and ' + children.length + ' running processes?',
          'The following processes are active:\n' + runningNames.map((rn) => "  " + rn).join("\n")
        ).then((result) => resolve(result));
      } else {
        console.log("Quit now; no children");
        resolve(true);
      }
    });
  });
};

const createQuitHandler = (app) => {
  return (evt) => {
    const enabled = enabledSelector();
    if (enabled && !quitting && app.getWindows().size) {
      evt.preventDefault();
      const ptys = Array.from(app.getWindows()).map(({ sessions }) => {
        return Array.from(sessions.values()).map(({ pty }) => pty);
      }).reduce((memo, ptys) => memo.concat(ptys), []);
      console.log("App closed with pids ", ptys.map((pty) => pty.pid));
      const ignored = ignoredSelector();
      promptToQuit(pty, "Quit Hyper", ignored).then((shouldQuit) => {
        if (shouldQuit) {
          quitting = true;
          app.quit();
        }
      });
    }
  };
};

const createCloseWindowHandler = (win) => {
  let closing = false;
  return (evt) => {
    const enabledForWindows = enabledForWindowsSelector();
    const ignored = ignoredSelector();
    if (enabledForWindows && !closing && !quitting) {
      evt.preventDefault();
      const ptys = Array.from(win.sessions.values()).map(({ pty }) => pty);
      console.log("Window ", win.getTitle(), ":", win.id, " closed with pids ", ptys.map((pty) => pty.pid));
      promptToQuit(ptys, "Close window", ignored).then((shouldQuit) => {
        if (shouldQuit) {
          closing = true;
          win.close();
        }
      });
    }
  };
};

exports.decorateConfig = (config) => {
  const hyperSmartConfirm = config.hyperSmartConfirm || {};
  const newPluginConfig = Object.assign({}, 
    hyperSmartConfirm,
    {
      enabled: hyperSmartConfirm.enabled || true,
      enabledForWindows: hyperSmartConfirm.enabled || true,
      ignored: hyperSmartConfirm.ignored || [],
      ignoreShell: hyperSmartConfirm.ignoreShell || true
    }
  );
  decoratedConfig = Object.assign({}, config, { hyperSmartConfirm: newPluginConfig });
  return decoratedConfig;
};

exports.middleware = (store) => (next) => (action) => {
  const ignored = ignoredSelector();
  const enabledForWindows = enabledForWindowsSelector();

  if (action.type === 'TERM_GROUP_EXIT' && enabledForWindows) {
    const {sessionUid} = store.getState().termGroups.termGroups[action.uid];
    const {shell, pid} = store.getState().sessions.sessions[sessionUid];
    console.log("Session ", sessionUid, " closed with pid ", pid);
    promptToQuit([{ shell, pid }], "Close session").then((shouldQuit) => {
      if (shouldQuit) {
        console.log("Quitting...");
        next(action);
      } else {
        console.log("Quit cancelled...");
      }
    });
  } else {
    next(action);
  }
};

exports.onWindow = (win) => {
  win.on('close', createCloseWindowHandler(win));
  const oldOn = win.on;
  win.on = (evtType, handler, ...extraArgs) => {
    const wrappedHandler = (evt, ...evtArgs) => {
      if (!evt.defaultPrevented) { handler(evt, ...evtArgs); }
    };
    return oldOn.call(win, evtType, wrappedHandler, ...extraArgs);
  };
};

exports.onApp = (app) => {
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

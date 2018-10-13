const { dialog } = require('electron');

let quitHandler;

const createQuitHandler = (app) => {
  let quitting = false;
  return (evt) => {
    if (enabled && !quitting && app.getWindows().size) {
      evt.preventDefault();
      dialog.showMessageBox({
        type: 'question',
        buttons: ['OK', 'Cancel'],
        defaultId: 0,
        title: 'Quit Hyper?',
        message: 'Quit Hyper?',
        detail: 'All windows and active applications will be closed.'
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
    }
  };
}

exports.decorateConfig = (config) => {
  enabled = true;
  return config;
};

exports.onApp = (app) => {
  if (quitHandler) { app.off('before-quit', quitHandler); } // Plugin was reloaded
  quitHandler = createQuitHandler(app);
  app.on('before-quit', quitHandler);
};

export.onUnload = (app) => {
  if (quitHandler) {
    app.off('before-quit', quitHandler);
    quitHandler = null;
  }
};

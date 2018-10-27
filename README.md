# hyper-smart-confirm

`hyper-smart-confirm` is a plugin for [Hyper](https://hyper.is/), inspired by the behavior of the
native macOS Terminal.app and meant to act as a more complete solution than that provided by the
existing [hyper-confirm](https://github.com/zachflower/hyper-confirm) plugin. It provides a
confirmation dialog when attempting to close a session or window with active processes, and is meant
to work cross-platform although as yet it's only tested on macOS.

## Features
* Prompt when closing a window
* Prompt when closing a tab
* Prompt when quitting the app
* Do not prompt if the only running process is the shell
* Support a whitelist of process names that shouldn't cause a prompt

## Configuration
There are four configuration options that live in the `hyperSmartConfirm` namespace:
```javascript
  config: {
    // ...
    hyperSmartConfirm: {
      enabled: true,            // Prompt on quit
      enabledForWindows: true,  // Prompt when closing windows/tabs (independent of 'enabled')
      ignored: [],              // An array of RegExps containing process names to ignore
      ignoreShell: true,        // (Attempt to) ignore the shell when quitting
      debug: false              // Log more stuff to the console (when ELECTRON_IS_DEV=1)
    }
  }
```

## Known issues
1. Shell detection is a little iffy and varies depending on whether you're closing a window or a
   tab. (This is because the `pty` object provided when looking at the list of sessions differs
   depending on whether you get if from the global `app` object or the `window`.
2. `child-process` (used by `ps-list`) sometimes throws an error (on macOS) when trying to run the
   `ps` command to get running processes. We trap the error and show the quit prompt because it's
    better to err on the side of caution, but it's still icky.

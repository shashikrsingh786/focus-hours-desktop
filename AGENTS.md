# Focus Hours

A private, offline-first desktop time tracker built as a single Electron app
(vanilla HTML/CSS/JS, no backend, no database, no network). All data persists
locally to `focus-hours-data.json` in Electron's per-user data directory.

## Cursor Cloud specific instructions

- Single service: the Electron app. There is no backend, DB, or web dev server.
- Run it in development with `npm start` (alias `npm run dev`, both run `electron .`).
  A graphical display is required; the VM exposes one at `DISPLAY=:1`, so launch
  with `DISPLAY=:1 npm start`.
- On startup the app opens the dashboard window plus a floating "Focus Buddy"
  widget and a system-tray icon; global shortcuts (`Ctrl+Alt+*`) are registered.
- Expect noisy but harmless startup logs on Linux: `Failed to connect to the bus`
  (dbus) and `Exiting GPU process ... errors during initialization` are non-fatal;
  the windows still render. Do not treat them as failures.
- Linting/tests: there is no ESLint/Prettier and no automated test suite. The only
  static check is `npm run check`, which is `node --check` (parse-only) on the three
  JS entry points — it does not execute the app.
- Building: `npm run pack` (unpacked) and `npm run dist` are configured for Windows
  targets only (NSIS + portable via electron-builder), so a full `dist` build is not
  expected to succeed on Linux without cross-build tooling. Use `npm start` for dev.
- No hot reload: edit files under `src/` and restart the app to pick up changes.
- App state lives outside the repo at `<userData>/focus-hours-data.json`; delete it
  to reset to a clean first-run state.

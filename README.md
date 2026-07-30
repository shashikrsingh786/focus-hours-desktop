# Focus Hours

A private Windows desktop time tracker with manual work logs, a live timer,
Pomodoro sessions, daily and weekly summaries, and an always-on-top companion.

## Screenshots

### Focus Buddy on the desktop

| Expanded companion | Minimal companion |
|:---:|:---:|
| ![Expanded Focus Buddy floating over a desktop workspace](docs/screenshots/focus-buddy-expanded.png) | ![Minimal custom Focus Buddy floating over a desktop workspace](docs/screenshots/focus-buddy-collapsed.png) |

### Dashboard

| Today overview | Work ledger |
|:---:|:---:|
| ![Focus Hours today overview](docs/screenshots/overview.png) | ![Focus Hours work ledger](docs/screenshots/work-ledger.png) |
| **Pomodoro** | **Companion settings** |
| ![Focus Hours Pomodoro timer](docs/screenshots/pomodoro.png) | ![Focus Hours desktop companion settings](docs/screenshots/settings-companion.png) |

## Run locally

```powershell
npm install
npm start
```

On a managed Windows device, you can also double-click
`Start Focus Hours.cmd`. It launches the app through the installed Electron
development runtime.

## Build the Windows installer

```powershell
npm run dist
```

Build output is written to `dist/`. App data stays on the device in Electron's
per-user application-data folder as `focus-hours-data.json`.

> Some organization-managed devices enable the Microsoft Defender ASR rule that
> blocks newly packaged executables until they have sufficient reputation or are
> approved by IT. In that case, use `Start Focus Hours.cmd` for local development.
> Production distribution requires trusted Windows code signing or an
> administrator-approved ASR exclusion.

## Main workflows

- **Live tracking:** enter what you are working on and start a timer.
- **Pomodoro:** start a focused interval; completed focus intervals are logged
  automatically.
- **Manual time:** record a past range such as 1:20 PM to 3:30 PM.
- **Mini timer:** keep the frameless timer above other apps and drag it anywhere.
- **Floating companion:** choose a built-in or custom Focus Buddy, compact strip,
  or full timer. Custom PNG, JPG, and WebP icons are copied into the app's local
  data folder.
- **Work ledger:** search, filter, group, classify, edit, or delete work sessions.
- **About:** see the product principles and builder attribution.
- **Offline motivation:** occasionally shows a quiet companion quote selected
  from the complete locally bundled quote collection; no network is required
  while the app runs.

## Global shortcuts

These shortcuts work while Focus Hours is running:

- `Ctrl + Alt + Space` - start or stop the live timer
- `Ctrl + Alt + P` - start a Pomodoro
- `Ctrl + Alt + L` - log past work
- `Ctrl + Alt + F` - open the dashboard
- `Ctrl + Alt + M` - show or hide the floating companion

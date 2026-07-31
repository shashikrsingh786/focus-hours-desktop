# Focus Hours

A private Windows desktop time tracker with a live timer, Pomodoro sessions, a work ledger, and an always-on-top **Focus Buddy** companion. Everything stays on your device ΓÇö no account, no cloud sync.

## Screenshots

### Focus Buddy

| Expanded panel | Collapsed companion |
|:---:|:---:|
| ![Expanded Focus Buddy](docs/screenshots/focus-buddy-expanded.png) | ![Collapsed Focus Buddy on the desktop](docs/screenshots/focus-buddy-collapsed.png) |

### Dashboard

| Work ledger | Pomodoro |
|:---:|:---:|
| ![Work ledger](docs/screenshots/work-ledger.png) | ![Pomodoro focus stage](docs/screenshots/pomodoro.png) |

| Companion settings |
|:---:|
| ![Desktop companion preferences](docs/screenshots/settings-companion.png) |

## Requirements

- **Windows 10 or 11**
- **[Node.js](https://nodejs.org/)** 18 or newer (LTS recommended)
- **npm** (ships with Node.js)

Check your versions:

```powershell
node -v
npm -v
```

## Install and run

### 1. Clone the repo

```powershell
git clone https://github.com/shashikrsingh786/focus-hours-desktop.git
cd focus-hours-desktop
```

If you already have the folder, skip clone and `cd` into it.

### 2. Install dependencies

```powershell
npm install
```

This installs Electron and the Windows build tools used for packaging. The first run can take a minute.

### 3. Start the app

```powershell
npm start
```

Or:

```powershell
npm run dev
```

Both launch the same Electron app. You should see:

- the **Focus Hours** dashboard window
- the floating **Focus Buddy** (if the companion is enabled in Settings)

On some managed Windows devices you can also double-click `Start Focus Hours.cmd`, which starts the app through the local Electron development runtime.

## Build a Windows installer

```powershell
npm run dist
```

Installer and portable builds are written to `dist/`.

> Some organization-managed PCs block newly packaged executables (Microsoft Defender ASR). For day-to-day use on those machines, prefer `npm start` or `Start Focus Hours.cmd`. Shipping a public installer usually needs code signing or an IT-approved exclusion.

## Where your data lives

All sessions, preferences, notepad content, and custom buddy images are stored locally in ElectronΓÇÖs per-user app data folder as `focus-hours-data.json`. Nothing is uploaded.

Typical path on Windows:

```text
%APPDATA%\focus-hours\focus-hours-data.json
```

## Features

- **Live tracking** ΓÇö name the task, start a timer, pause or stop anytime
- **Pomodoro** ΓÇö focus / short break / long break rhythm with automatic history
- **Manual log** ΓÇö add a past time range after the fact
- **Work ledger** ΓÇö search, filter, edit, and delete sessions
- **Focus Buddy** ΓÇö always-on-top companion with built-in or custom pets; click outside the panel to collapse back to the buddy
- **Offline quotes** ΓÇö occasional companion quotes from a local bundle (no network needed while running)

## Global shortcuts

These work while Focus Hours is running:

| Shortcut | Action |
| --- | --- |
| `Ctrl` + `Alt` + `Space` | Start or stop the live timer |
| `Ctrl` + `Alt` + `P` | Start a Pomodoro |
| `Ctrl` + `Alt` + `K` | Pause or resume |
| `Ctrl` + `Alt` + `L` | Log past work |
| `Ctrl` + `Alt` + `F` | Open the dashboard |
| `Ctrl` + `Alt` + `M` | Show or hide the companion |

## Project scripts

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm start` / `npm run dev` | Run the desktop app |
| `npm run check` | Syntax-check main, preload, and renderer JS |
| `npm run pack` | Package an unpacked app into `dist/` |
| `npm run dist` | Build NSIS installer + portable EXE |

## Troubleshooting

**`npm start` fails after clone**  
Run `npm install` again, then retry. Confirm `node -v` is 18+.

**Companion window missing**  
Open **Settings ΓåÆ Desktop companion**, ensure launch/visibility is on, or press `Ctrl` + `Alt` + `M`.

**Electron download blocked on corporate network**  
Retry on a network that allows GitHub/Electron CDN access, or ask IT to allow the Electron download host used by npm.

## License

MIT ΓÇö see the repository for details.

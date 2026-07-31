const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, globalShortcut, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const motivationalQuotes = require("./assets/motivational-quotes.json");

let dashboardWindow;
let widgetWindow;
let tray;
let tickTimer;
let state;
let dataFile;
let widgetExpanded = false;
let widgetNotesOpen = false;
let widgetClickThrough = false;
let widgetQuoteVisible = false;
let widgetQuotePlacement = { horizontal: "left", vertical: "up" };
let lastQuoteIndex = -1;

const BUDDY_SIZE_MIN = 28;
const BUDDY_SIZE_MAX = 180;
// Vertical room the always-visible time/pause pill takes above the collapsed buddy.
const HALO_BLOCK = 32;
const HALO_MIN_WIDTH = 150;
const PET_PANEL_HEIGHT = 252;
const NOTES_BLOCK = 214;
const NOTEPAD_LIMIT = 4000;

const defaults = {
  sessions: [],
  notepad: "",
  tracker: null,
  settings: {
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    roundsBeforeLongBreak: 4,
    dailyGoalHours: 8,
    autoStartBreaks: false,
    alwaysOnTop: true,
    launchWidget: true,
    widgetDisplay: "pet",
    petStyle: "cat",
    customPetIcon: "",
    buddySize: 62
  },
  pomodoroRound: 0
};

function loadState() {
  dataFile = path.join(app.getPath("userData"), "focus-hours-data.json");
  try {
    const saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    return {
      ...structuredClone(defaults),
      ...saved,
      settings: { ...defaults.settings, ...(saved.settings || {}) },
      sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
      notepad: typeof saved.notepad === "string" ? saved.notepad.slice(0, NOTEPAD_LIMIT) : "",
      tracker: normalizeTracker(saved.tracker)
    };
  } catch {
    return structuredClone(defaults);
  }
}

// Trackers saved before pause support only had startedAt, so treat them as one running segment.
function normalizeTracker(tracker) {
  if (!tracker) return null;
  if (Number.isFinite(tracker.segmentStartedAt) || tracker.pausedAt) return tracker;
  return { ...tracker, segmentStartedAt: tracker.startedAt, accumulatedMs: 0, pausedAt: null };
}

function persistState() {
  const temporaryFile = `${dataFile}.tmp`;
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(temporaryFile, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(temporaryFile, dataFile);
}

function snapshot() {
  const now = Date.now();
  const day = new Date(now);
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  let todayTotalMs = state.sessions.reduce(
    (sum, session) => sum + Math.max(0, Math.min(session.endedAt, now) - Math.max(session.startedAt, dayStart)),
    0
  );
  // Finished segments are already stored as sessions, so only the live segment is added here.
  if (state.tracker && state.tracker.kind !== "break" && state.tracker.segmentStartedAt) {
    todayTotalMs += Math.max(0, now - Math.max(state.tracker.segmentStartedAt, dayStart));
  }
  return {
    ...state,
    appVersion: app.getVersion(),
    now,
    todayTotalMs,
    tracker: state.tracker
      ? {
          ...state.tracker,
          elapsedMs: trackerElapsed(state.tracker, now),
          remainingMs: state.tracker.endsAt
            ? Math.max(0, state.tracker.endsAt - (state.tracker.pausedAt ?? now))
            : null
        }
      : null
  };
}

function trackerElapsed(tracker, now = Date.now()) {
  const live = tracker.segmentStartedAt ? Math.max(0, now - tracker.segmentStartedAt) : 0;
  return Math.max(0, (tracker.accumulatedMs || 0) + live);
}

function broadcast() {
  const current = snapshot();
  refreshTrayMenu();
  if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.webContents.send("state:changed", current);
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send("state:changed", { ...current, sessions: [] });
  }
}

function broadcastTick() {
  const current = snapshot();
  const tick = { now: current.now, tracker: current.tracker, todayTotalMs: current.todayTotalMs };
  for (const win of [dashboardWindow, widgetWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("timer:tick", tick);
  }
}

function createSession({ startedAt, endedAt, task = "", project = "", note = "", source = "manual" }) {
  const start = Number(startedAt);
  const end = Number(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("The end time must be after the start time.");
  }
  const session = {
    id: crypto.randomUUID(),
    startedAt: start,
    endedAt: end,
    durationMs: end - start,
    task: String(task).trim().slice(0, 120),
    project: String(project).trim().slice(0, 80),
    note: String(note).trim().slice(0, 500),
    source,
    createdAt: Date.now()
  };
  state.sessions.unshift(session);
  persistState();
  broadcast();
  return session;
}

// Records the segment that is currently running. Paused spans are never part of a segment,
// so the work ledger stays truthful without any duration bookkeeping.
function saveTrackerSegment(tracker, endedAt) {
  if (tracker.kind === "break" || !tracker.segmentStartedAt || endedAt <= tracker.segmentStartedAt) return false;
  createSession({
    startedAt: tracker.segmentStartedAt,
    endedAt,
    task: tracker.task,
    project: tracker.project,
    source: tracker.kind === "pomodoro" ? "pomodoro" : "timer"
  });
  return true;
}

function saveNotepad(text) {
  state.notepad = String(text ?? "").slice(0, NOTEPAD_LIMIT);
  persistState();
  broadcast();
  return state.notepad;
}

function stopTracker(save = true) {
  if (!state.tracker) return;
  const tracker = state.tracker;
  const endedAt = tracker.endsAt ? Math.min(Date.now(), tracker.endsAt) : Date.now();
  state.tracker = null;
  if (save && saveTrackerSegment(tracker, endedAt)) return;
  persistState();
  broadcast();
}

function pauseTracker() {
  const tracker = state.tracker;
  if (!tracker || tracker.pausedAt) return;
  const now = Date.now();
  const endedAt = tracker.endsAt ? Math.min(now, tracker.endsAt) : now;
  tracker.accumulatedMs = trackerElapsed(tracker, now);
  tracker.pausedAt = now;
  const segmentStartedAt = tracker.segmentStartedAt;
  tracker.segmentStartedAt = null;
  if (saveTrackerSegment({ ...tracker, segmentStartedAt }, endedAt)) return;
  persistState();
  broadcast();
}

function resumeTracker() {
  const tracker = state.tracker;
  if (!tracker || !tracker.pausedAt) return;
  const now = Date.now();
  if (tracker.endsAt) tracker.endsAt += now - tracker.pausedAt;
  tracker.pausedAt = null;
  tracker.segmentStartedAt = now;
  persistState();
  broadcast();
}

function startTracker(payload) {
  if (state.tracker) stopTracker(true);
  const now = Date.now();
  const kind = payload.kind === "pomodoro" ? "pomodoro" : "timer";
  state.tracker = {
    kind,
    phase: kind === "pomodoro" ? "focus" : null,
    task: String(payload.task || "").trim().slice(0, 120),
    project: String(payload.project || "").trim().slice(0, 80),
    startedAt: now,
    segmentStartedAt: now,
    accumulatedMs: 0,
    pausedAt: null,
    endsAt: kind === "pomodoro" ? now + state.settings.workMinutes * 60_000 : null
  };
  persistState();
  broadcast();
}

function handleTimerCompletion() {
  const tracker = state.tracker;
  if (!tracker?.endsAt || tracker.pausedAt || Date.now() < tracker.endsAt) return false;

  if (tracker.kind === "pomodoro" && tracker.phase === "focus") {
    saveTrackerSegment(tracker, tracker.endsAt);
    state.pomodoroRound += 1;
    const longBreak = state.pomodoroRound % state.settings.roundsBeforeLongBreak === 0;
    const breakMinutes = longBreak ? state.settings.longBreakMinutes : state.settings.shortBreakMinutes;
    state.tracker = state.settings.autoStartBreaks
      ? {
          kind: "break",
          phase: longBreak ? "long-break" : "short-break",
          task: tracker.task,
          startedAt: Date.now(),
          segmentStartedAt: Date.now(),
          accumulatedMs: 0,
          pausedAt: null,
          endsAt: Date.now() + breakMinutes * 60_000
        }
      : null;
  } else {
    state.tracker = null;
  }
  persistState();
  broadcast();
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.flashFrame(true);
  }
  return true;
}

function createDashboard() {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 650,
    backgroundColor: "#f6f7fb",
    title: "Focus Hours",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  dashboardWindow = window;
  window.loadFile(path.join(__dirname, "renderer", "index.html"));
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (dashboardWindow === window) dashboardWindow = null;
  });
  return window;
}

function createWidget() {
  const display = screen.getPrimaryDisplay().workArea;
  const size = widgetSize();
  widgetWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: display.x + display.width - size.width - 20,
    y: display.y + 20,
    minWidth: BUDDY_SIZE_MIN + 14,
    minHeight: BUDDY_SIZE_MIN + 14,
    maxHeight: PET_PANEL_HEIGHT + NOTES_BLOCK + 40,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    alwaysOnTop: state.settings.alwaysOnTop,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  widgetWindow.setAlwaysOnTop(state.settings.alwaysOnTop, "floating");
  widgetWindow.loadFile(path.join(__dirname, "renderer", "index.html"), {
    query: { view: "widget" }
  });
  widgetWindow.once("ready-to-show", () => widgetWindow.showInactive());
  widgetClickThrough = false;
  widgetWindow.on("closed", () => {
    widgetWindow = null;
    widgetClickThrough = false;
  });
}

// The companion window is larger than the visuals it holds, so anything the buddy does not
// cover forwards clicks to whatever app sits underneath.
function setWidgetClickThrough(enabled) {
  if (!widgetWindow || widgetWindow.isDestroyed() || widgetClickThrough === enabled) return;
  widgetClickThrough = enabled;
  widgetWindow.setIgnoreMouseEvents(enabled, { forward: true });
}

function widgetSize(expanded = widgetExpanded) {
  const mode = state?.settings?.widgetDisplay || "pet";
  const buddySize = state?.settings?.buddySize || 62;
  const buddyExtra = Math.max(0, buddySize - 62);
  if (mode === "pet" && widgetQuoteVisible && !expanded) {
    return { width: 350 + buddyExtra, height: 152 + buddyExtra + HALO_BLOCK };
  }
  if (mode === "pet") {
    return expanded
      ? { width: 392, height: PET_PANEL_HEIGHT + (widgetNotesOpen ? NOTES_BLOCK : 0) }
      : { width: Math.max(buddySize + 14, HALO_MIN_WIDTH), height: buddySize + 14 + HALO_BLOCK };
  }
  if (mode === "compact") return { width: 270, height: 84 };
  return { width: 330, height: 126 };
}

function getVirtualDesktopBounds() {
  return screen.getAllDisplays().reduce((desktop, display) => ({
    left: Math.min(desktop.left, display.bounds.x),
    top: Math.min(desktop.top, display.bounds.y),
    right: Math.max(desktop.right, display.bounds.x + display.bounds.width),
    bottom: Math.max(desktop.bottom, display.bounds.y + display.bounds.height)
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
}

function resizeWidget(expanded = false, notesOpen = widgetNotesOpen) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  if (expanded && widgetQuoteVisible) resizeWidgetQuote(false);
  widgetExpanded = expanded;
  widgetNotesOpen = expanded ? Boolean(notesOpen) : false;
  if (expanded) {
    widgetQuoteVisible = false;
    setWidgetClickThrough(false);
  }
  const current = widgetWindow.getBounds();
  const next = widgetSize(expanded);
  const desktop = getVirtualDesktopBounds();
  const right = current.x + current.width;
  widgetWindow.setBounds({
    x: Math.max(desktop.left, Math.min(right - next.width, desktop.right - next.width)),
    y: Math.max(desktop.top, Math.min(current.y, desktop.bottom - next.height)),
    width: next.width,
    height: next.height
  }, true);
}

function resizeWidgetQuote(visible, placement = widgetQuotePlacement) {
  if (!widgetWindow || widgetWindow.isDestroyed() || state.settings.widgetDisplay !== "pet" || widgetExpanded) return;
  const resolvedPlacement = {
    horizontal: placement?.horizontal === "right" ? "right" : "left",
    vertical: placement?.vertical === "down" ? "down" : "up"
  };
  if (visible) widgetQuotePlacement = resolvedPlacement;
  const activePlacement = visible ? resolvedPlacement : widgetQuotePlacement;
  const wasVisible = widgetQuoteVisible;
  widgetQuoteVisible = Boolean(visible);
  const current = widgetWindow.getBounds();
  const next = widgetSize(false);
  widgetWindow.setBounds({
    x: activePlacement.horizontal === "left" && (visible || wasVisible)
      ? current.x + current.width - next.width
      : current.x,
    y: activePlacement.vertical === "up" && (visible || wasVisible)
      ? current.y + current.height - next.height
      : current.y,
    width: next.width,
    height: next.height
  }, true);
}

function showDashboard(action) {
  const window = dashboardWindow && !dashboardWindow.isDestroyed() ? dashboardWindow : createDashboard();
  if (!window.isVisible()) window.show();
  window.focus();
  if (action) {
    if (window.webContents.isLoadingMainFrame()) {
      window.webContents.once("did-finish-load", () => window.webContents.send("app:action", action));
    } else {
      window.webContents.send("app:action", action);
    }
  }
}

function registerProductivityShortcuts() {
  const shortcuts = [
    ["CommandOrControl+Alt+Space", () => state.tracker ? stopTracker(true) : startTracker({ kind: "timer" })],
    ["CommandOrControl+Alt+K", () => {
      if (!state.tracker) startTracker({ kind: "timer" });
      else if (state.tracker.pausedAt) resumeTracker();
      else pauseTracker();
    }],
    ["CommandOrControl+Alt+P", () => startTracker({ kind: "pomodoro" })],
    ["CommandOrControl+Alt+F", () => showDashboard()],
    ["CommandOrControl+Alt+L", () => showDashboard("manual-log")],
    ["CommandOrControl+Alt+M", () => {
      if (!widgetWindow) createWidget();
      else if (widgetWindow.isVisible()) widgetWindow.hide();
      else widgetWindow.showInactive();
    }]
  ];
  for (const [accelerator, handler] of shortcuts) globalShortcut.register(accelerator, handler);
}

function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Focus Hours", click: () => showDashboard() },
      {
        label: "Show mini timer",
        click: () => {
          if (!widgetWindow) createWidget();
          else widgetWindow.showInactive();
        }
      },
      { type: "separator" },
      {
        label: state.tracker?.pausedAt ? "Resume timer" : "Pause timer",
        enabled: Boolean(state.tracker),
        click: () => (state.tracker?.pausedAt ? resumeTracker() : pauseTracker())
      },
      {
        label: "Stop current timer",
        enabled: Boolean(state.tracker),
        click: () => stopTracker(true)
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function createTray() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect rx="9" width="32" height="32" fill="#635bff"/><circle cx="16" cy="17" r="9" fill="none" stroke="white" stroke-width="2.5"/><path d="M16 11v6l4 2M12 5h8" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  tray = new Tray(nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`));
  tray.setToolTip("Focus Hours");
  tray.on("double-click", () => showDashboard());
  refreshTrayMenu();
}

app.whenReady().then(() => {
  state = loadState();
  createDashboard();
  if (state.settings.launchWidget) createWidget();
  createTray();
  registerProductivityShortcuts();
  tickTimer = setInterval(() => {
    if (!handleTimerCompletion()) broadcastTick();
  }, 1000);

  app.on("activate", () => showDashboard());
});

app.on("before-quit", () => {
  app.isQuitting = true;
  clearInterval(tickTimer);
  globalShortcut.unregisterAll();
});
app.on("window-all-closed", () => {});

ipcMain.handle("state:get", (event) => {
  const current = snapshot();
  return widgetWindow?.webContents === event.sender ? { ...current, sessions: [] } : current;
});
ipcMain.handle("session:add", (_event, payload) => createSession(payload));
ipcMain.handle("session:update", (_event, payload) => {
  const index = state.sessions.findIndex((session) => session.id === payload.id);
  if (index < 0) throw new Error("Session not found.");
  const current = state.sessions[index];
  const startedAt = Number(payload.startedAt ?? current.startedAt);
  const endedAt = Number(payload.endedAt ?? current.endedAt);
  if (endedAt <= startedAt) throw new Error("The end time must be after the start time.");
  state.sessions[index] = {
    ...current,
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
    task: String(payload.task ?? current.task).trim().slice(0, 120),
    project: String(payload.project ?? current.project ?? "").trim().slice(0, 80),
    note: String(payload.note ?? current.note).trim().slice(0, 500)
  };
  persistState();
  broadcast();
  return state.sessions[index];
});
ipcMain.handle("session:delete", (_event, id) => {
  state.sessions = state.sessions.filter((session) => session.id !== id);
  persistState();
  broadcast();
});
ipcMain.handle("session:delete-range", (_event, payload) => {
  const from = Number(payload?.from);
  const to = Number(payload?.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    throw new Error("Choose a valid deletion period.");
  }
  const removed = state.sessions.filter((session) => session.startedAt < to && session.endedAt >= from);
  if (!removed.length) return { deletedCount: 0, deletedDurationMs: 0 };
  const removedIds = new Set(removed.map((session) => session.id));
  state.sessions = state.sessions.filter((session) => !removedIds.has(session.id));
  persistState();
  broadcast();
  return {
    deletedCount: removed.length,
    deletedDurationMs: removed.reduce((sum, session) => sum + session.durationMs, 0)
  };
});
ipcMain.handle("tracker:start", (_event, payload) => startTracker(payload));
ipcMain.handle("tracker:stop", (_event, save) => stopTracker(save));
ipcMain.handle("tracker:pause", () => pauseTracker());
ipcMain.handle("tracker:resume", () => resumeTracker());
ipcMain.handle("notepad:save", (_event, text) => saveNotepad(text));
ipcMain.handle("settings:update", (_event, settings) => {
  const numeric = ["workMinutes", "shortBreakMinutes", "longBreakMinutes", "roundsBeforeLongBreak", "dailyGoalHours", "buddySize"];
  const next = { ...state.settings, ...settings };
  for (const key of numeric) next[key] = Math.max(1, Math.min(180, Number(next[key]) || defaults.settings[key]));
  next.dailyGoalHours = Math.min(24, next.dailyGoalHours);
  next.buddySize = Math.max(BUDDY_SIZE_MIN, Math.min(BUDDY_SIZE_MAX, Math.round(next.buddySize)));
  state.settings = next;
  widgetWindow?.setAlwaysOnTop(Boolean(next.alwaysOnTop), "floating");
  if (!["pet", "compact", "full"].includes(next.widgetDisplay)) next.widgetDisplay = "pet";
  if (!["cat", "owl", "sprout", "robot", "custom"].includes(next.petStyle)) next.petStyle = "cat";
  if (next.petStyle === "custom" && !next.customPetIcon) next.petStyle = "cat";
  if (widgetQuoteVisible) resizeWidgetQuote(false);
  else resizeWidget(false);
  persistState();
  broadcast();
  return state.settings;
});
ipcMain.handle("window:dashboard", () => {
  showDashboard();
});
ipcMain.handle("window:widget", (_event, visible) => {
  if (visible) {
    if (!widgetWindow) createWidget();
    else widgetWindow.showInactive();
  } else {
    widgetWindow?.hide();
  }
});
ipcMain.handle("window:widget-expand", (_event, expanded, notesOpen) => resizeWidget(Boolean(expanded), notesOpen));
ipcMain.handle("window:widget-quote", (_event, visible, placement) => resizeWidgetQuote(Boolean(visible), placement));
ipcMain.handle("quote:random", () => {
  if (!motivationalQuotes.length) return null;
  let index = Math.floor(Math.random() * motivationalQuotes.length);
  if (motivationalQuotes.length > 1 && index === lastQuoteIndex) index = (index + 1) % motivationalQuotes.length;
  lastQuoteIndex = index;
  return motivationalQuotes[index];
});
ipcMain.on("window:widget-interactive", (_event, interactive) => setWidgetClickThrough(!interactive));
ipcMain.on("window:widget-move", (_event, delta) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const dx = Math.max(-100, Math.min(100, Number(delta?.x) || 0));
  const dy = Math.max(-100, Math.min(100, Number(delta?.y) || 0));
  if (!dx && !dy) return;
  const bounds = widgetWindow.getBounds();
  // Re-assert the intended size on every move — setPosition alone can drift height on Windows DPI.
  const size = widgetSize(widgetExpanded);
  const virtualDesktop = getVirtualDesktopBounds();
  const visibleGrip = 24;
  const targetX = Math.round(Math.max(
    virtualDesktop.left - size.width + visibleGrip,
    Math.min(bounds.x + dx, virtualDesktop.right - visibleGrip)
  ));
  const targetY = Math.round(Math.max(
    virtualDesktop.top - size.height + visibleGrip,
    Math.min(bounds.y + dy, virtualDesktop.bottom - visibleGrip)
  ));
  if (Number.isFinite(targetX) && Number.isFinite(targetY)) {
    widgetWindow.setBounds({ x: targetX, y: targetY, width: size.width, height: size.height }, false);
  }
});
ipcMain.handle("pet:choose", async () => {
  const options = {
    title: "Choose a Focus Buddy icon",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]
  };
  const result = dashboardWindow && !dashboardWindow.isDestroyed()
    ? await dialog.showOpenDialog(dashboardWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;

  const source = result.filePaths[0];
  const extension = path.extname(source).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) throw new Error("Choose a PNG, JPG, or WebP image.");
  if (fs.statSync(source).size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");

  const imageBuffer = fs.readFileSync(source);
  const imageHash = crypto.createHash("sha256").update(imageBuffer).digest("hex").slice(0, 12);
  const userDataPath = app.getPath("userData");
  const destination = path.join(userDataPath, `focus-hours-custom-pet-${imageHash}${extension}`);
  if (path.resolve(source).toLowerCase() !== path.resolve(destination).toLowerCase()) {
    fs.writeFileSync(destination, imageBuffer);
  }

  const customPetFilePattern = /^focus-hours-custom-pet(?:-[a-f0-9]{12})?\.(?:png|jpe?g|webp)$/i;
  for (const fileName of fs.readdirSync(userDataPath)) {
    if (!customPetFilePattern.test(fileName)) continue;
    const oldFile = path.join(userDataPath, fileName);
    if (path.resolve(oldFile).toLowerCase() !== path.resolve(destination).toLowerCase()) fs.rmSync(oldFile);
  }
  state.settings.customPetIcon = pathToFileURL(destination).href;
  state.settings.petStyle = "custom";
  persistState();
  broadcast();
  return state.settings.customPetIcon;
});
ipcMain.handle("window:hide", (event) => BrowserWindow.fromWebContents(event.sender)?.hide());

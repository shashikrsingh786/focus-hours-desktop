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
let widgetVideoVisible = false;
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
const PET_DROP_VIDEO_SIZE_MIN = 80;
const PET_DROP_VIDEO_SIZE_MAX = 480;
const PET_DROP_VIDEO_SIZE_DEFAULT = 280;
const PET_DROP_VIDEO_MAX_BYTES = 40 * 1024 * 1024;

const DAY_MS = 86_400_000;
const DELETED_RETENTION_MIN = 1;
const DELETED_RETENTION_MAX = 30;
const FONT_FAMILIES = ["focus-hours", "lora", "dm-sans", "inter", "outfit", "georgia", "system"];
const FONT_STYLES = ["regular", "italic", "medium", "semibold"];
const FONT_SIZES = ["small", "default", "large", "xl"];

const defaults = {
  sessions: [],
  deletedSessions: [],
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
    petDropVideo: "",
    petDropVideoSound: false,
    petDropVideoSize: PET_DROP_VIDEO_SIZE_DEFAULT,
    buddySize: 62,
    timerEndSound: true,
    deletedRetentionDays: 2,
    fontFamily: "focus-hours",
    fontStyle: "regular",
    fontSize: "default",
    integrations: {
      whatsapp: null
    }
  },
  pomodoroRound: 0,
  focusDraft: { task: "", project: "" }
};

const WHATSAPP_GRAPH_VERSION = "v21.0";
const WHATSAPP_NOTIFICATION_DEFAULTS = {
  focusStart: {
    enabled: false,
    message: 'Focus started on "{{task}}". Stay with it.'
  },
  focusEnd: {
    enabled: true,
    message: 'Focus finished for "{{task}}". Time for a break.'
  },
  breakStart: {
    enabled: true,
    message: "Rest started ({{phase}}). Step away for a bit."
  },
  breakEnd: {
    enabled: true,
    message: 'Break over. Ready to focus again on "{{task}}".'
  },
  sessionPaused: {
    enabled: false,
    message: 'Session paused for "{{task}}".'
  },
  sessionResumed: {
    enabled: false,
    message: 'Back to {{phase}} on "{{task}}".'
  },
  sessionStopped: {
    enabled: false,
    message: 'Session stopped for "{{task}}" ({{duration}}).'
  }
};

function defaultWhatsAppSettings() {
  return {
    enabled: false,
    accessToken: "",
    phoneNumberId: "",
    recipientNumber: "",
    alertTemplateName: "",
    alertTemplateLanguage: "en",
    lastStatus: "idle",
    lastCheckedAt: null,
    lastError: "",
    lastMessageId: "",
    notifications: structuredClone(WHATSAPP_NOTIFICATION_DEFAULTS)
  };
}

function normalizeWhatsAppSettings(raw) {
  const base = defaultWhatsAppSettings();
  const incoming = raw && typeof raw === "object" ? raw : {};
  const notifications = { ...base.notifications };
  const incomingNotes = incoming.notifications && typeof incoming.notifications === "object"
    ? incoming.notifications
    : {};
  for (const key of Object.keys(WHATSAPP_NOTIFICATION_DEFAULTS)) {
    const item = incomingNotes[key];
    notifications[key] = {
      enabled: item && typeof item.enabled === "boolean"
        ? item.enabled
        : WHATSAPP_NOTIFICATION_DEFAULTS[key].enabled,
      message: item && typeof item.message === "string" && item.message.trim()
        ? item.message.slice(0, 500)
        : WHATSAPP_NOTIFICATION_DEFAULTS[key].message
    };
  }
  return {
    enabled: Boolean(incoming.enabled),
    accessToken: typeof incoming.accessToken === "string" ? incoming.accessToken.trim() : "",
    phoneNumberId: typeof incoming.phoneNumberId === "string" ? incoming.phoneNumberId.trim() : "",
    recipientNumber: String(incoming.recipientNumber || "").replace(/\D/g, "").slice(0, 20),
    alertTemplateName: typeof incoming.alertTemplateName === "string"
      ? incoming.alertTemplateName.trim().slice(0, 120)
      : "",
    alertTemplateLanguage: typeof incoming.alertTemplateLanguage === "string" && incoming.alertTemplateLanguage.trim()
      ? incoming.alertTemplateLanguage.trim().slice(0, 16)
      : "en",
    lastStatus: ["idle", "connected", "error"].includes(incoming.lastStatus) ? incoming.lastStatus : "idle",
    lastCheckedAt: Number.isFinite(Number(incoming.lastCheckedAt)) ? Number(incoming.lastCheckedAt) : null,
    lastError: typeof incoming.lastError === "string" ? incoming.lastError.slice(0, 300) : "",
    lastMessageId: typeof incoming.lastMessageId === "string" ? incoming.lastMessageId.slice(0, 200) : "",
    notifications
  };
}

function getWhatsAppSettings() {
  return normalizeWhatsAppSettings(state.settings.integrations?.whatsapp);
}

function setWhatsAppSettings(next, { persist = true, broadcastChange = true } = {}) {
  state.settings.integrations = {
    ...(state.settings.integrations || {}),
    whatsapp: normalizeWhatsAppSettings(next)
  };
  if (persist) persistState();
  if (broadcastChange) broadcast();
  return state.settings.integrations.whatsapp;
}

function formatWhatsAppDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.floor(Number(milliseconds || 0) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function phaseLabelForWhatsApp(tracker) {
  if (!tracker) return "Focus";
  if (tracker.kind === "break") {
    return tracker.phase === "long-break" ? "Long break" : "Short break";
  }
  if (tracker.kind === "pomodoro") return "Focus";
  return "Timer";
}

function renderWhatsAppTemplate(template, context = {}) {
  return String(template || "")
    .replaceAll("{{task}}", context.task || "Focused work")
    .replaceAll("{{project}}", context.project || "Unsorted")
    .replaceAll("{{phase}}", context.phase || "Focus")
    .replaceAll("{{round}}", String(context.round ?? 0))
    .replaceAll("{{duration}}", context.duration || "0 min")
    .trim()
    .slice(0, 1000);
}

function whatsappContextFromTracker(tracker, extras = {}) {
  const elapsed = tracker ? trackerElapsed(tracker) : 0;
  return {
    task: tracker?.task || "",
    project: tracker?.project || "",
    phase: phaseLabelForWhatsApp(tracker),
    round: (state.pomodoroRound % Math.max(1, state.settings.roundsBeforeLongBreak)) + 1,
    duration: formatWhatsAppDuration(extras.durationMs ?? elapsed),
    ...extras
  };
}

async function graphWhatsAppRequest(pathname, { method = "GET", body } = {}) {
  const wa = getWhatsAppSettings();
  if (!wa.accessToken || !wa.phoneNumberId) {
    throw new Error("Add your WhatsApp access token and phone number ID first.");
  }
  const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${pathname.replace(/^\//, "")}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${wa.accessToken}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `WhatsApp API error (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

function assertWhatsAppAccepted(payload, actionLabel = "WhatsApp send") {
  const messageId = payload?.messages?.[0]?.id;
  if (!messageId) {
    const detail = payload?.error?.message || "Meta did not return a message id.";
    throw new Error(`${actionLabel} failed: ${detail}`);
  }
  return messageId;
}

async function sendWhatsAppText(text) {
  const wa = getWhatsAppSettings();
  if (!wa.recipientNumber) throw new Error("Add a recipient WhatsApp number first.");
  const body = String(text || "").trim();
  if (!body) throw new Error("Message is empty.");
  const payload = await graphWhatsAppRequest(`${wa.phoneNumberId}/messages`, {
    method: "POST",
    body: {
      messaging_product: "whatsapp",
      to: wa.recipientNumber,
      type: "text",
      text: { body: body.slice(0, 1000), preview_url: false }
    }
  });
  return { payload, messageId: assertWhatsAppAccepted(payload, "Free-form text") };
}

async function sendWhatsAppTemplate({ name, language = "en", bodyParams = [] }) {
  const wa = getWhatsAppSettings();
  if (!wa.recipientNumber) throw new Error("Add a recipient WhatsApp number first.");
  if (!name) throw new Error("Template name is required.");
  const template = {
    name,
    language: { code: language || "en" }
  };
  if (bodyParams.length) {
    template.components = [{
      type: "body",
      parameters: bodyParams.map((value) => ({
        type: "text",
        text: String(value ?? "").slice(0, 1024) || "-"
      }))
    }];
  }
  const payload = await graphWhatsAppRequest(`${wa.phoneNumberId}/messages`, {
    method: "POST",
    body: {
      messaging_product: "whatsapp",
      to: wa.recipientNumber,
      type: "template",
      template
    }
  });
  return { payload, messageId: assertWhatsAppAccepted(payload, `Template "${name}"`) };
}

async function sendHelloWorldTemplate() {
  const errors = [];
  for (const language of ["en_US", "en"]) {
    try {
      const result = await sendWhatsAppTemplate({
        name: "hello_world",
        language,
        bodyParams: []
      });
      return { ...result, language };
    } catch (error) {
      errors.push(`${language}: ${error.message}`);
    }
  }
  throw new Error(`hello_world failed (${errors.join(" · ")})`);
}

async function sendWhatsAppAlert(text, { allowHelloWorldFallback = false } = {}) {
  const wa = getWhatsAppSettings();
  const body = String(text || "").trim();
  if (!body) throw new Error("Message is empty.");
  const errors = [];
  // Approved templates can land outside the 24h window; free-form cannot.
  if (wa.alertTemplateName) {
    try {
      const result = await sendWhatsAppTemplate({
        name: wa.alertTemplateName,
        language: wa.alertTemplateLanguage || "en",
        bodyParams: [body]
      });
      return { ...result, mode: "template" };
    } catch (error) {
      errors.push(`template: ${error.message}`);
    }
  }
  try {
    const result = await sendWhatsAppText(body);
    return { ...result, mode: "text" };
  } catch (error) {
    errors.push(`text: ${error.message}`);
  }
  if (allowHelloWorldFallback) {
    try {
      const result = await sendHelloWorldTemplate();
      return {
        ...result,
        mode: "hello_world",
        hint: "Custom alert text needs an approved template with body {{1}}. Sent Meta's hello_world instead so you can confirm delivery."
      };
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(
    `${errors.join(" · ")} Set Template name to an approved Meta template with body {{1}}, or message your business WhatsApp from the recipient phone to open the 24h window.`
  );
}

function emitWhatsAppNotifyResult(result) {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) return;
  dashboardWindow.webContents.send("integrations:whatsapp-notify", result);
}

async function notifyWhatsAppEvent(eventId, context = {}, { force = false } = {}) {
  try {
    const wa = getWhatsAppSettings();
    // Sample sends may run even when the master toggle is off, so connection can be verified.
    if (!wa.enabled && !force) {
      return { skipped: true, reason: "disabled", eventId };
    }
    const event = wa.notifications[eventId];
    if (!force && !event?.enabled) return { skipped: true, reason: "event-disabled", eventId };
    if (!wa.accessToken || !wa.phoneNumberId || !wa.recipientNumber) {
      const error = "WhatsApp credentials are incomplete.";
      setWhatsAppSettings({
        ...wa,
        lastStatus: "error",
        lastCheckedAt: Date.now(),
        lastError: error,
        lastMessageId: ""
      }, { persist: true, broadcastChange: true });
      emitWhatsAppNotifyResult({ ok: false, eventId, error });
      return { ok: false, error };
    }
    const template = force
      ? (event?.message || WHATSAPP_NOTIFICATION_DEFAULTS[eventId]?.message || "Focus Hours alert.")
      : event.message;
    const message = renderWhatsAppTemplate(template, context);
    if (!message) return { skipped: true, reason: "empty-message", eventId };
    const result = await sendWhatsAppAlert(message, { allowHelloWorldFallback: force });
    setWhatsAppSettings({
      ...wa,
      lastStatus: "connected",
      lastCheckedAt: Date.now(),
      lastError: "",
      lastMessageId: result.messageId
    }, { persist: true, broadcastChange: true });
    const hint = result.hint
      || (result.mode === "template"
        ? "Sample/alert sent with your template."
        : result.mode === "text"
          ? "Alert accepted as free-form text. If WhatsApp stays silent, set a template with body {{1}}."
          : "WhatsApp alert accepted by Meta.");
    const payload = {
      ok: true,
      eventId,
      messageId: result.messageId,
      mode: result.mode,
      hint
    };
    if (!force) emitWhatsAppNotifyResult(payload);
    return payload;
  } catch (error) {
    const wa = getWhatsAppSettings();
    setWhatsAppSettings({
      ...wa,
      lastStatus: "error",
      lastCheckedAt: Date.now(),
      lastError: error.message || "WhatsApp send failed",
      lastMessageId: ""
    }, { persist: true, broadcastChange: true });
    const payload = { ok: false, eventId, error: error.message || "WhatsApp send failed" };
    if (!force) emitWhatsAppNotifyResult(payload);
    return payload;
  }
}

function redactSettingsForExport(settings) {
  const clone = structuredClone(settings || {});
  if (clone.integrations?.whatsapp) {
    clone.integrations.whatsapp = {
      ...normalizeWhatsAppSettings(clone.integrations.whatsapp),
      accessToken: ""
    };
  }
  return clone;
}

function loadState() {
  dataFile = path.join(app.getPath("userData"), "focus-hours-data.json");
  try {
    const saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    const savedSettings = saved.settings || {};
    const loaded = {
      ...structuredClone(defaults),
      ...saved,
      settings: {
        ...defaults.settings,
        ...savedSettings,
        integrations: {
          ...defaults.settings.integrations,
          ...(savedSettings.integrations || {}),
          whatsapp: normalizeWhatsAppSettings(savedSettings.integrations?.whatsapp)
        }
      },
      sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
      deletedSessions: Array.isArray(saved.deletedSessions) ? saved.deletedSessions : [],
      notepad: typeof saved.notepad === "string" ? saved.notepad.slice(0, NOTEPAD_LIMIT) : "",
      tracker: normalizeTracker(saved.tracker),
      focusDraft: normalizeFocusDraft(saved.focusDraft)
    };
    loaded.settings.deletedRetentionDays = clampRetentionDays(loaded.settings.deletedRetentionDays);
    normalizeTypographySettings(loaded.settings);
    return loaded;
  } catch {
    const fresh = structuredClone(defaults);
    fresh.settings.integrations = {
      whatsapp: normalizeWhatsAppSettings(null)
    };
    return fresh;
  }
}

function clampRetentionDays(value) {
  const days = Math.round(Number(value));
  if (!Number.isFinite(days)) return defaults.settings.deletedRetentionDays;
  return Math.max(DELETED_RETENTION_MIN, Math.min(DELETED_RETENTION_MAX, days));
}

function normalizeTypographySettings(settings) {
  if (!FONT_FAMILIES.includes(settings.fontFamily)) settings.fontFamily = defaults.settings.fontFamily;
  if (!FONT_STYLES.includes(settings.fontStyle)) settings.fontStyle = defaults.settings.fontStyle;
  if (!FONT_SIZES.includes(settings.fontSize)) settings.fontSize = defaults.settings.fontSize;
  return settings;
}

function retentionMs() {
  return clampRetentionDays(state.settings.deletedRetentionDays) * DAY_MS;
}

function normalizeSessionRecord(raw, { requireId = false } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const startedAt = Number(raw.startedAt);
  const endedAt = Number(raw.endedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return null;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "";
  if (requireId && !id) return null;
  return {
    id: id || crypto.randomUUID(),
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
    task: String(raw.task || "").trim().slice(0, 120),
    project: String(raw.project || "").trim().slice(0, 80),
    note: String(raw.note || "").trim().slice(0, 500),
    source: ["manual", "timer", "pomodoro"].includes(raw.source) ? raw.source : "manual",
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : startedAt
  };
}

function softDeleteSessions(sessions) {
  if (!sessions.length) return 0;
  const now = Date.now();
  const ids = new Set(sessions.map((session) => session.id));
  state.sessions = state.sessions.filter((session) => !ids.has(session.id));
  state.deletedSessions = state.deletedSessions.filter((session) => !ids.has(session.id));
  state.deletedSessions.unshift(...sessions.map((session) => ({ ...session, deletedAt: now })));
  return sessions.length;
}

function purgeExpiredDeleted(shouldPersist = true) {
  const cutoff = Date.now() - retentionMs();
  const before = state.deletedSessions.length;
  state.deletedSessions = state.deletedSessions.filter((session) => Number(session.deletedAt || 0) > cutoff);
  const changed = state.deletedSessions.length !== before;
  if (changed && shouldPersist) persistState();
  return changed;
}

function sortSessionsNewestFirst(list) {
  list.sort((a, b) => b.startedAt - a.startedAt || b.createdAt - a.createdAt);
  return list;
}

// Trackers saved before pause support only had startedAt, so treat them as one running segment.
function normalizeTracker(tracker) {
  if (!tracker) return null;
  const next = (Number.isFinite(tracker.segmentStartedAt) || tracker.pausedAt)
    ? { ...tracker }
    : { ...tracker, segmentStartedAt: tracker.startedAt, accumulatedMs: 0, pausedAt: null };
  next.overtimeMs = Math.max(0, Number(next.overtimeMs) || 0);
  return next;
}

function normalizeFocusDraft(raw) {
  const draft = raw && typeof raw === "object" ? raw : {};
  return {
    task: String(draft.task || "").trim().slice(0, 120),
    project: String(draft.project || "").trim().slice(0, 80)
  };
}

function saveFocusDraft(payload = {}) {
  state.focusDraft = normalizeFocusDraft({
    task: Object.prototype.hasOwnProperty.call(payload, "task") ? payload.task : state.focusDraft?.task,
    project: Object.prototype.hasOwnProperty.call(payload, "project") ? payload.project : state.focusDraft?.project
  });
  // Persist quietly — broadcasting would rebuild the Pomodoro inputs mid-typing.
  persistState();
  return state.focusDraft;
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
    widgetWindow.webContents.send("state:changed", { ...current, sessions: [], deletedSessions: [] });
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

function stopTracker(save = true, { notify = true } = {}) {
  if (!state.tracker) return;
  const tracker = state.tracker;
  const context = whatsappContextFromTracker(tracker);
  const endedAt = tracker.endsAt ? Math.min(Date.now(), tracker.endsAt) : Date.now();
  state.tracker = null;
  if (save && saveTrackerSegment(tracker, endedAt)) {
    if (notify) notifyWhatsAppEvent("sessionStopped", context);
    return;
  }
  persistState();
  broadcast();
  if (notify) notifyWhatsAppEvent("sessionStopped", context);
}

function pauseTracker() {
  const tracker = state.tracker;
  if (!tracker || tracker.pausedAt) return;
  const context = whatsappContextFromTracker(tracker);
  const now = Date.now();
  const endedAt = tracker.endsAt ? Math.min(now, tracker.endsAt) : now;
  tracker.accumulatedMs = trackerElapsed(tracker, now);
  tracker.pausedAt = now;
  const segmentStartedAt = tracker.segmentStartedAt;
  tracker.segmentStartedAt = null;
  if (saveTrackerSegment({ ...tracker, segmentStartedAt }, endedAt)) {
    notifyWhatsAppEvent("sessionPaused", context);
    return;
  }
  persistState();
  broadcast();
  notifyWhatsAppEvent("sessionPaused", context);
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
  notifyWhatsAppEvent("sessionResumed", whatsappContextFromTracker(tracker));
}

function startTracker(payload = {}) {
  if (state.tracker) stopTracker(true, { notify: false });
  const now = Date.now();
  const kind = payload.kind === "pomodoro" ? "pomodoro" : "timer";
  const draft = normalizeFocusDraft(state.focusDraft);
  const task = Object.prototype.hasOwnProperty.call(payload, "task")
    ? String(payload.task || "").trim().slice(0, 120)
    : draft.task;
  const project = Object.prototype.hasOwnProperty.call(payload, "project")
    ? String(payload.project || "").trim().slice(0, 80)
    : draft.project;
  if (kind === "pomodoro") {
    state.focusDraft = { task, project };
  }
  state.tracker = {
    kind,
    phase: kind === "pomodoro" ? "focus" : null,
    task,
    project,
    startedAt: now,
    segmentStartedAt: now,
    accumulatedMs: 0,
    pausedAt: null,
    overtimeMs: 0,
    endsAt: kind === "pomodoro" ? now + state.settings.workMinutes * 60_000 : null
  };
  persistState();
  broadcast();
  if (kind === "pomodoro") {
    notifyWhatsAppEvent("focusStart", whatsappContextFromTracker(state.tracker));
  }
}

function extendTracker(minutes = 2) {
  const tracker = state.tracker;
  if (!tracker?.endsAt) return null;
  if (tracker.kind !== "pomodoro" && tracker.kind !== "break") return null;
  const addMs = Math.max(1, Math.min(30, Number(minutes) || 2)) * 60_000;
  tracker.endsAt += addMs;
  tracker.overtimeMs = Math.max(0, Number(tracker.overtimeMs) || 0) + addMs;
  persistState();
  broadcast();
  return snapshot();
}

function notifyTimerCompleted(completed) {
  const payload = { completed, next: state.tracker };
  // Prefer the always-on-top companion so the chime plays while the user is elsewhere.
  const target = (widgetWindow && !widgetWindow.isDestroyed())
    ? widgetWindow
    : (dashboardWindow && !dashboardWindow.isDestroyed() ? dashboardWindow : null);
  target?.webContents.send("timer:completed", payload);
  if (dashboardWindow && !dashboardWindow.isDestroyed() && dashboardWindow !== target) {
    dashboardWindow.webContents.send("timer:completed", { ...payload, silent: true });
  }
}

function handleTimerCompletion() {
  const tracker = state.tracker;
  if (!tracker?.endsAt || tracker.pausedAt || Date.now() < tracker.endsAt) return false;

  const completed = { kind: tracker.kind, phase: tracker.phase };
  const completedContext = whatsappContextFromTracker(tracker, {
    durationMs: Math.max(0, tracker.endsAt - tracker.startedAt)
  });

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
          project: tracker.project,
          startedAt: Date.now(),
          segmentStartedAt: Date.now(),
          accumulatedMs: 0,
          pausedAt: null,
          overtimeMs: 0,
          endsAt: Date.now() + breakMinutes * 60_000
        }
      : null;
  } else {
    state.tracker = null;
  }
  persistState();
  broadcast();
  notifyTimerCompleted(completed);

  if (completed.kind === "pomodoro" && completed.phase === "focus") {
    notifyWhatsAppEvent("focusEnd", completedContext);
    if (state.tracker?.kind === "break") {
      notifyWhatsAppEvent("breakStart", whatsappContextFromTracker(state.tracker));
    }
  } else if (completed.kind === "break") {
    notifyWhatsAppEvent("breakEnd", completedContext);
  }

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
    backgroundColor: "#f9f7f1",
    title: "Focus Hours",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required"
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

function applyWidgetAlwaysOnTop(enabled = state.settings.alwaysOnTop) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const onTop = Boolean(enabled);
  // screen-saver sits above the Windows taskbar; floating often loses to it.
  widgetWindow.setAlwaysOnTop(onTop, onTop ? "screen-saver" : "normal");
  if (typeof widgetWindow.moveTop === "function") widgetWindow.moveTop();
  try {
    widgetWindow.setVisibleOnAllWorkspaces(onTop, { visibleOnFullScreen: true });
  } catch {
    // Older Electron builds may not support the options object.
    if (onTop) widgetWindow.setVisibleOnAllWorkspaces(true);
  }
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
    maxWidth: Math.max(420, PET_DROP_VIDEO_SIZE_MAX + 24),
    maxHeight: Math.max(PET_PANEL_HEIGHT + NOTES_BLOCK + 40, PET_DROP_VIDEO_SIZE_MAX + 24),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    alwaysOnTop: state.settings.alwaysOnTop,
    skipTaskbar: true,
    show: false,
    type: process.platform === "darwin" ? "panel" : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required"
    }
  });
  applyWidgetAlwaysOnTop(state.settings.alwaysOnTop);
  widgetWindow.loadFile(path.join(__dirname, "renderer", "index.html"), {
    query: { view: "widget" }
  });
  widgetWindow.once("ready-to-show", () => {
    applyWidgetAlwaysOnTop(state.settings.alwaysOnTop);
    widgetWindow.showInactive();
  });
  widgetWindow.on("show", () => applyWidgetAlwaysOnTop(state.settings.alwaysOnTop));
  widgetWindow.on("focus", () => applyWidgetAlwaysOnTop(state.settings.alwaysOnTop));
  widgetClickThrough = false;
  widgetWindow.on("closed", () => {
    widgetWindow = null;
    widgetClickThrough = false;
    widgetExpanded = false;
    widgetNotesOpen = false;
    widgetQuoteVisible = false;
    widgetVideoVisible = false;
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
  if (mode === "pet" && widgetVideoVisible && !expanded) {
    const videoSize = Math.max(
      PET_DROP_VIDEO_SIZE_MIN,
      Math.min(PET_DROP_VIDEO_SIZE_MAX, Math.round(state?.settings?.petDropVideoSize || PET_DROP_VIDEO_SIZE_DEFAULT))
    );
    return { width: videoSize, height: videoSize };
  }
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
  if (expanded && widgetVideoVisible) resizeWidgetVideo(false);
  widgetExpanded = expanded;
  widgetNotesOpen = expanded ? Boolean(notesOpen) : false;
  if (expanded) {
    widgetQuoteVisible = false;
    widgetVideoVisible = false;
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

function resizeWidgetVideo(visible) {
  if (!widgetWindow || widgetWindow.isDestroyed() || state.settings.widgetDisplay !== "pet" || widgetExpanded) return;
  if (visible && widgetQuoteVisible) resizeWidgetQuote(false);
  widgetVideoVisible = Boolean(visible);
  if (visible) setWidgetClickThrough(false);
  const current = widgetWindow.getBounds();
  const next = widgetSize(false);
  const desktop = getVirtualDesktopBounds();
  const centerX = current.x + current.width / 2;
  const centerY = current.y + current.height / 2;
  widgetWindow.setBounds({
    x: Math.max(desktop.left, Math.min(Math.round(centerX - next.width / 2), desktop.right - next.width)),
    y: Math.max(desktop.top, Math.min(Math.round(centerY - next.height / 2), desktop.bottom - next.height)),
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

let lastDeletedPurgeAt = 0;

app.whenReady().then(() => {
  state = loadState();
  if (purgeExpiredDeleted(true)) {
    // Dropped expired audit entries on startup.
  }
  createDashboard();
  if (state.settings.launchWidget) createWidget();
  createTray();
  registerProductivityShortcuts();
  tickTimer = setInterval(() => {
    const now = Date.now();
    if (now - lastDeletedPurgeAt >= 60_000) {
      lastDeletedPurgeAt = now;
      if (purgeExpiredDeleted(true) && !handleTimerCompletion()) {
        broadcast();
        return;
      }
    }
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
  return widgetWindow?.webContents === event.sender
    ? { ...current, sessions: [], deletedSessions: [] }
    : current;
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
  const removed = state.sessions.filter((session) => session.id === id);
  if (!removed.length) return { deletedCount: 0 };
  softDeleteSessions(removed);
  persistState();
  broadcast();
  return { deletedCount: removed.length };
});
ipcMain.handle("session:delete-range", (_event, payload) => {
  const from = Number(payload?.from);
  const to = Number(payload?.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    throw new Error("Choose a valid deletion period.");
  }
  const removed = state.sessions.filter((session) => session.startedAt < to && session.endedAt >= from);
  if (!removed.length) return { deletedCount: 0, deletedDurationMs: 0 };
  softDeleteSessions(removed);
  persistState();
  broadcast();
  return {
    deletedCount: removed.length,
    deletedDurationMs: removed.reduce((sum, session) => sum + session.durationMs, 0)
  };
});
ipcMain.handle("session:restore", (_event, id) => {
  const index = state.deletedSessions.findIndex((session) => session.id === id);
  if (index < 0) throw new Error("That deleted entry was not found.");
  const [entry] = state.deletedSessions.splice(index, 1);
  const { deletedAt: _deletedAt, ...session } = entry;
  if (!state.sessions.some((item) => item.id === session.id)) {
    state.sessions.unshift(session);
    sortSessionsNewestFirst(state.sessions);
  }
  persistState();
  broadcast();
  return session;
});
ipcMain.handle("session:purge", (_event, id) => {
  const before = state.deletedSessions.length;
  state.deletedSessions = state.deletedSessions.filter((session) => session.id !== id);
  if (state.deletedSessions.length === before) throw new Error("That deleted entry was not found.");
  persistState();
  broadcast();
  return { purgedCount: 1 };
});
ipcMain.handle("session:purge-all-deleted", () => {
  const purgedCount = state.deletedSessions.length;
  state.deletedSessions = [];
  persistState();
  broadcast();
  return { purgedCount };
});
ipcMain.handle("data:export", async () => {
  const stamp = new Date().toISOString().slice(0, 10);
  const options = {
    title: "Export Focus Hours backup",
    defaultPath: `focus-hours-backup-${stamp}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }]
  };
  const result = dashboardWindow && !dashboardWindow.isDestroyed()
    ? await dialog.showSaveDialog(dashboardWindow, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { canceled: true };

  const backup = {
    version: 1,
    exportedAt: Date.now(),
    app: "focus-hours",
    sessions: state.sessions,
    deletedSessions: state.deletedSessions,
    settings: redactSettingsForExport(state.settings),
    notepad: state.notepad,
    pomodoroRound: state.pomodoroRound,
    focusDraft: normalizeFocusDraft(state.focusDraft)
  };
  fs.writeFileSync(result.filePath, JSON.stringify(backup, null, 2), "utf8");
  return {
    canceled: false,
    filePath: result.filePath,
    sessionCount: backup.sessions.length,
    deletedCount: backup.deletedSessions.length
  };
});
ipcMain.handle("data:choose-import", async () => {
  const options = {
    title: "Import Focus Hours backup",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }]
  };
  const result = dashboardWindow && !dashboardWindow.isDestroyed()
    ? await dialog.showOpenDialog(dashboardWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return { canceled: true };

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(result.filePaths[0], "utf8"));
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sessions)) {
    throw new Error("That file is not a Focus Hours backup.");
  }
  const sessions = parsed.sessions.map((item) => normalizeSessionRecord(item)).filter(Boolean);
  const deletedSessions = Array.isArray(parsed.deletedSessions)
    ? parsed.deletedSessions
      .map((item) => {
        const session = normalizeSessionRecord(item, { requireId: true });
        if (!session) return null;
        const deletedAt = Number(item.deletedAt);
        return { ...session, deletedAt: Number.isFinite(deletedAt) ? deletedAt : Date.now() };
      })
      .filter(Boolean)
    : [];
  return {
    canceled: false,
    filePath: result.filePaths[0],
    backup: {
      version: Number(parsed.version) || 1,
      sessions,
      deletedSessions,
      settings: parsed.settings && typeof parsed.settings === "object" ? parsed.settings : null,
      notepad: typeof parsed.notepad === "string" ? parsed.notepad.slice(0, NOTEPAD_LIMIT) : null,
      pomodoroRound: Number.isFinite(Number(parsed.pomodoroRound)) ? Math.max(0, Number(parsed.pomodoroRound)) : null,
      focusDraft: parsed.focusDraft ? normalizeFocusDraft(parsed.focusDraft) : null
    },
    sessionCount: sessions.length,
    deletedCount: deletedSessions.length
  };
});
ipcMain.handle("data:apply-import", (_event, payload) => {
  const mode = payload?.mode === "merge" ? "merge" : "replace";
  const backup = payload?.backup;
  if (!backup || !Array.isArray(backup.sessions)) throw new Error("Import data is missing.");

  if (mode === "replace") {
    state.sessions = backup.sessions.map((item) => normalizeSessionRecord(item, { requireId: true })).filter(Boolean);
    sortSessionsNewestFirst(state.sessions);
    state.deletedSessions = Array.isArray(backup.deletedSessions)
      ? backup.deletedSessions
        .map((item) => {
          const session = normalizeSessionRecord(item, { requireId: true });
          if (!session) return null;
          const deletedAt = Number(item.deletedAt);
          return { ...session, deletedAt: Number.isFinite(deletedAt) ? deletedAt : Date.now() };
        })
        .filter(Boolean)
      : [];
    if (backup.settings && typeof backup.settings === "object") {
      state.settings = {
        ...defaults.settings,
        ...backup.settings,
        deletedRetentionDays: clampRetentionDays(backup.settings.deletedRetentionDays ?? state.settings.deletedRetentionDays),
        integrations: {
          ...defaults.settings.integrations,
          ...(backup.settings.integrations || {}),
          whatsapp: normalizeWhatsAppSettings(backup.settings.integrations?.whatsapp)
        }
      };
    }
    if (typeof backup.notepad === "string") state.notepad = backup.notepad.slice(0, NOTEPAD_LIMIT);
    if (Number.isFinite(Number(backup.pomodoroRound))) state.pomodoroRound = Math.max(0, Number(backup.pomodoroRound));
    if (backup.focusDraft) state.focusDraft = normalizeFocusDraft(backup.focusDraft);
    purgeExpiredDeleted(false);
    persistState();
    broadcast();
    return {
      mode,
      importedSessions: state.sessions.length,
      importedDeleted: state.deletedSessions.length,
      addedSessions: state.sessions.length
    };
  }

  const existingIds = new Set([
    ...state.sessions.map((session) => session.id),
    ...state.deletedSessions.map((session) => session.id)
  ]);
  let addedSessions = 0;
  for (const item of backup.sessions) {
    const session = normalizeSessionRecord(item, { requireId: true });
    if (!session || existingIds.has(session.id)) continue;
    state.sessions.unshift(session);
    existingIds.add(session.id);
    addedSessions += 1;
  }
  sortSessionsNewestFirst(state.sessions);
  persistState();
  broadcast();
  return {
    mode,
    importedSessions: backup.sessions.length,
    importedDeleted: 0,
    addedSessions
  };
});
ipcMain.handle("tracker:start", (_event, payload) => startTracker(payload));
ipcMain.handle("tracker:stop", (_event, save) => stopTracker(save));
ipcMain.handle("tracker:pause", () => pauseTracker());
ipcMain.handle("tracker:resume", () => resumeTracker());
ipcMain.handle("tracker:extend", (_event, minutes) => extendTracker(minutes));
ipcMain.handle("focus-draft:save", (_event, draft) => saveFocusDraft(draft));
ipcMain.handle("notepad:save", (_event, text) => saveNotepad(text));
ipcMain.handle("settings:update", (_event, settings) => {
  const numeric = ["workMinutes", "shortBreakMinutes", "longBreakMinutes", "roundsBeforeLongBreak", "dailyGoalHours", "buddySize"];
  const incoming = settings || {};
  const next = { ...state.settings, ...incoming };
  for (const key of numeric) next[key] = Math.max(1, Math.min(180, Number(next[key]) || defaults.settings[key]));
  next.dailyGoalHours = Math.min(24, next.dailyGoalHours);
  next.buddySize = Math.max(BUDDY_SIZE_MIN, Math.min(BUDDY_SIZE_MAX, Math.round(next.buddySize)));
  next.deletedRetentionDays = clampRetentionDays(next.deletedRetentionDays);
  if (incoming.integrations) {
    next.integrations = {
      ...(state.settings.integrations || {}),
      ...incoming.integrations,
      whatsapp: normalizeWhatsAppSettings({
        ...getWhatsAppSettings(),
        ...(incoming.integrations.whatsapp || {})
      })
    };
  } else {
    next.integrations = {
      ...(state.settings.integrations || {}),
      whatsapp: getWhatsAppSettings()
    };
  }
  state.settings = next;
  applyWidgetAlwaysOnTop(next.alwaysOnTop);
  if (!["pet", "compact", "full"].includes(next.widgetDisplay)) next.widgetDisplay = "pet";
  if (!["cat", "owl", "sprout", "robot", "custom"].includes(next.petStyle)) next.petStyle = "cat";
  if (next.petStyle === "custom" && !next.customPetIcon) next.petStyle = "cat";
  next.petDropVideo = typeof next.petDropVideo === "string" ? next.petDropVideo : "";
  next.petDropVideoSound = Boolean(next.petDropVideoSound);
  next.timerEndSound = next.timerEndSound !== false;
  normalizeTypographySettings(next);
  next.petDropVideoSize = Math.max(
    PET_DROP_VIDEO_SIZE_MIN,
    Math.min(PET_DROP_VIDEO_SIZE_MAX, Math.round(Number(next.petDropVideoSize) || PET_DROP_VIDEO_SIZE_DEFAULT))
  );
  purgeExpiredDeleted(false);
  if (widgetVideoVisible) resizeWidgetVideo(true);
  else if (widgetQuoteVisible) resizeWidgetQuote(false);
  else resizeWidget(widgetExpanded);
  persistState();
  broadcast();
  return state.settings;
});
ipcMain.handle("integrations:whatsapp-sample", async (_event, eventId = "focusEnd") => {
  const key = WHATSAPP_NOTIFICATION_DEFAULTS[eventId] ? eventId : "focusEnd";
  return notifyWhatsAppEvent(key, {
    task: "Sample focus task",
    project: "Focus Hours",
    phase: key.startsWith("break") ? "Short break" : "Focus",
    round: 1,
    duration: "25 min"
  }, { force: true });
});
ipcMain.handle("integrations:whatsapp-test", async () => {
  const wa = getWhatsAppSettings();
  if (!wa.accessToken || !wa.phoneNumberId || !wa.recipientNumber) {
    throw new Error("Fill in access token, phone number ID, and recipient number first.");
  }
  try {
    await graphWhatsAppRequest(wa.phoneNumberId);

    // Prefer an approved template — free-form text is accepted by the API even when
    // WhatsApp later drops delivery outside the 24-hour customer-care window.
    let result;
    let mode = "template";
    if (wa.alertTemplateName) {
      result = await sendWhatsAppTemplate({
        name: wa.alertTemplateName,
        language: wa.alertTemplateLanguage || "en",
        bodyParams: ["Focus Hours is connected to WhatsApp."]
      });
    } else {
      try {
        result = await sendHelloWorldTemplate();
        mode = "hello_world";
      } catch (helloError) {
        try {
          result = await sendWhatsAppText("Focus Hours is connected to WhatsApp.");
          mode = "text";
        } catch (textError) {
          throw new Error(
            `${textError.message} ${helloError.message}. Create an approved template with body {{1}} and set Template name, or message your business WhatsApp from the recipient phone first.`
          );
        }
      }
    }

    const updated = setWhatsAppSettings({
      ...wa,
      lastStatus: "connected",
      lastCheckedAt: Date.now(),
      lastError: "",
      lastMessageId: result.messageId
    });
    return {
      ok: true,
      status: updated.lastStatus,
      mode,
      messageId: result.messageId,
      hint: mode === "text"
        ? "Meta accepted a free-form text. If WhatsApp stays silent, message your business number from the recipient phone, then test again within 24 hours — or set an alert template."
        : mode === "hello_world"
          ? "Sent Meta's hello_world template. You should see the sample Hello World message on WhatsApp."
          : "Sent your alert template. Check WhatsApp for the message."
    };
  } catch (error) {
    setWhatsAppSettings({
      ...wa,
      lastStatus: "error",
      lastCheckedAt: Date.now(),
      lastError: error.message || "WhatsApp connection failed",
      lastMessageId: ""
    });
    throw error;
  }
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
ipcMain.handle("window:widget-video", (_event, visible) => resizeWidgetVideo(Boolean(visible)));
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

function clearStoredPetDropVideos(keepPath = "") {
  const userDataPath = app.getPath("userData");
  const dropVideoPattern = /^focus-hours-pet-drop(?:-[a-f0-9]{12})?\.(?:mp4|webm|mov)$/i;
  const keep = keepPath ? path.resolve(keepPath) : "";
  for (const fileName of fs.readdirSync(userDataPath)) {
    if (!dropVideoPattern.test(fileName)) continue;
    const oldFile = path.join(userDataPath, fileName);
    if (keep && path.resolve(oldFile).toLowerCase() === keep.toLowerCase()) continue;
    fs.rmSync(oldFile, { force: true });
  }
}

ipcMain.handle("pet:choose-drop-video", async () => {
  const options = {
    title: "Choose a Focus Buddy drop video",
    properties: ["openFile"],
    filters: [{ name: "Videos", extensions: ["mp4", "webm", "mov"] }]
  };
  const result = dashboardWindow && !dashboardWindow.isDestroyed()
    ? await dialog.showOpenDialog(dashboardWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;

  const source = result.filePaths[0];
  const extension = path.extname(source).toLowerCase();
  if (![".mp4", ".webm", ".mov"].includes(extension)) throw new Error("Choose an MP4, WebM, or MOV video.");
  if (fs.statSync(source).size > PET_DROP_VIDEO_MAX_BYTES) throw new Error("Choose a video smaller than 40 MB.");

  const videoBuffer = fs.readFileSync(source);
  const videoHash = crypto.createHash("sha256").update(videoBuffer).digest("hex").slice(0, 12);
  const userDataPath = app.getPath("userData");
  const destination = path.join(userDataPath, `focus-hours-pet-drop-${videoHash}${extension}`);
  if (path.resolve(source).toLowerCase() !== path.resolve(destination).toLowerCase()) {
    fs.writeFileSync(destination, videoBuffer);
  }

  clearStoredPetDropVideos(destination);
  state.settings.petDropVideo = pathToFileURL(destination).href;
  persistState();
  broadcast();
  return state.settings.petDropVideo;
});

ipcMain.handle("pet:clear-drop-video", () => {
  clearStoredPetDropVideos();
  state.settings.petDropVideo = "";
  if (widgetVideoVisible) resizeWidgetVideo(false);
  persistState();
  broadcast();
  return true;
});

ipcMain.handle("window:hide", (event) => BrowserWindow.fromWebContents(event.sender)?.hide());

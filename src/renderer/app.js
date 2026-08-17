const api = window.focusHours;
const appRoot = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");
const isWidget = new URLSearchParams(window.location.search).get("view") === "widget";
const BUDDY_SIZE_MIN = 28;
const BUDDY_SIZE_MAX = 180;
const PET_DROP_VIDEO_SIZE_MIN = 80;
const PET_DROP_VIDEO_SIZE_MAX = 480;
const PET_DROP_VIDEO_SIZE_DEFAULT = 280;
const HALO_BLOCK = 32;
const HALO_MIN_WIDTH = 150;
const NOTEPAD_LIMIT = 4000;

let appState;
let currentPage = "overview";
let selectedRange = "week";
let historyPeriodOffset = 0;
let historySearch = "";
let historySource = "all";
let ledgerPageIndex = 1;
let historyPageSize = 10;
const HISTORY_PAGE_SIZES = [10, 20, 50];
let historySearchTimer;
let buddySizeTimer;
let dropVideoSizeTimer;
let notepadSaveTimer;
let petOpen = false;
let petNotesOpen = false;
let petVideoPlaying = false;
let petVideoFrameHandle = 0;
let petVideoFrameTarget = null;
let widgetInteractive = true;
let widgetDragState = null;
let motivationQuote = null;
let quotePlacement = { horizontal: "left", vertical: "up" };
let quoteScheduleTimer = null;
let quoteDismissTimer = null;
let pendingDeletionRange = null;
let pendingDeleteSessionId = null;
let pendingImportBackup = null;
let settingsSection = "rhythm";
let editingSessionId = null;
let lastRenderKey = "";

const icons = {
  clock: '<path d="M12 8v4l2.7 1.7"/><circle cx="12" cy="12" r="9"/>',
  home: '<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  focus: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  pause: '<path d="M9.5 5.5v13M14.5 5.5v13"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  note: '<path d="M5 4h11l3 3v13H5z"/><path d="M8.5 10h7M8.5 14h4.5"/>',
  edit: '<path d="m4 20 4.5-1 10-10-3.5-3.5-10 10zM13.8 6.7l3.5 3.5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v7H4V6h7"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>'
  ,
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  layers: '<path d="m12 3-9 5 9 5 9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  spark: '<path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8zM5 16l.7 2.3L8 19.5l-2.3 1.2L5 23l-.7-2.3L2 19.5l2.3-1.2z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19.07"/>'
};

const WHATSAPP_EVENT_META = [
  { id: "focusStart", label: "Focus started", hint: "When a Pomodoro focus session begins" },
  { id: "focusEnd", label: "Focus finished", hint: "When a focus round completes" },
  { id: "breakStart", label: "Rest started", hint: "When a short or long break begins" },
  { id: "breakEnd", label: "Rest finished", hint: "When a break ends" },
  { id: "sessionPaused", label: "Session paused", hint: "When you pause an active session" },
  { id: "sessionResumed", label: "Session resumed", hint: "When you resume after a pause" },
  { id: "sessionStopped", label: "Session stopped", hint: "When you manually end a session" }
];

const WHATSAPP_MESSAGE_DEFAULTS = {
  focusStart: 'Focus started on "{{task}}". Stay with it.',
  focusEnd: 'Focus finished for "{{task}}". Time for a break.',
  breakStart: "Rest started ({{phase}}). Step away for a bit.",
  breakEnd: 'Break over. Ready to focus again on "{{task}}".',
  sessionPaused: 'Session paused for "{{task}}".',
  sessionResumed: 'Back to {{phase}} on "{{task}}".',
  sessionStopped: 'Session stopped for "{{task}}" ({{duration}}).'
};

function icon(name, size = 20) {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDuration(milliseconds, compact = false) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (compact) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function formatClock(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(timestamp);
}

function formatDay(timestamp, long = false) {
  return new Intl.DateTimeFormat(undefined, long
    ? { weekday: "long", month: "long", day: "numeric" }
    : { weekday: "short", month: "short", day: "numeric" }).format(timestamp);
}

function startOfDay(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function shiftDays(timestamp, days) {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

function startOfWeek(timestamp = Date.now()) {
  const dayStart = startOfDay(timestamp);
  const weekday = new Date(dayStart).getDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  return shiftDays(dayStart, -daysFromMonday);
}

function historyPeriodBounds(offset = historyPeriodOffset) {
  const todayStart = startOfDay();
  if (selectedRange === "today") {
    const from = shiftDays(todayStart, -offset);
    return { from, to: shiftDays(from, 1) };
  }
  if (selectedRange === "week") {
    const from = shiftDays(startOfWeek(todayStart), -offset * 7);
    return { from, to: shiftDays(from, 7) };
  }
  if (selectedRange === "month") {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - offset, 1).getTime();
    const to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1).getTime();
    return { from, to };
  }
  return { from: 0, to: Date.now() + 1 };
}

function sessionDurationInRange(session, from, to) {
  return Math.max(0, Math.min(session.endedAt, to) - Math.max(session.startedAt, from));
}

function totalBetween(from, to) {
  return appState.sessions.reduce((sum, session) => sum + sessionDurationInRange(session, from, to), 0);
}

function todayTotal(includeActive = true) {
  if (isWidget && Number.isFinite(appState.todayTotalMs)) return appState.todayTotalMs;
  const dayStart = startOfDay();
  let total = totalBetween(dayStart, Date.now() + 1);
  // Finished segments already live in sessions, so only the running segment is added.
  if (includeActive && appState.tracker && appState.tracker.kind !== "break" && appState.tracker.segmentStartedAt) {
    total += Math.max(0, Date.now() - Math.max(dayStart, appState.tracker.segmentStartedAt));
  }
  return total;
}

function renderKey(state) {
  return JSON.stringify({
    page: currentPage,
    range: selectedRange,
    historyPeriodOffset,
    historySearch,
    historySource,
    ledgerPageIndex,
    historyPageSize,
    settingsSection,
    sessions: state.sessions.map(({ id, startedAt, endedAt, task, project, note }) => ({ id, startedAt, endedAt, task, project, note })),
    deletedSessions: (state.deletedSessions || []).map(({ id, deletedAt, task }) => ({ id, deletedAt, task })),
    settings: state.settings,
    tracker: state.tracker
      ? `${state.tracker.kind}:${state.tracker.phase}:${state.tracker.startedAt}:${state.tracker.pausedAt ? "paused" : "live"}:${state.tracker.overtimeMs || 0}:${state.tracker.endsAt || 0}`
      : null,
    pomodoroRound: state.pomodoroRound,
    petOpen,
    petNotesOpen,
    petVideoPlaying,
    editingSessionId
  });
}

function showToast(message, tone = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  toastRegion.append(toast);
  setTimeout(() => toast.remove(), 3200);
}

function navItem(page, label, iconName) {
  return `<button class="nav-item ${currentPage === page ? "active" : ""}" data-page="${page}">
    ${icon(iconName)}<span>${label}</span>
  </button>`;
}

function shell(content) {
  return `<div class="shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">${icon("clock", 21)}</span><span>Focus Hours</span></div>
      <nav aria-label="Primary">
        ${navItem("overview", "Overview", "home")}
        ${navItem("history", "Work ledger", "history")}
        ${navItem("pomodoro", "Pomodoro", "focus")}
      </nav>
      <div class="sidebar-bottom">
        ${navItem("settings", "Settings", "settings")}
        ${navItem("about", "About", "about")}
        <div class="privacy-note"><span class="status-dot"></span><span>Saved privately<br/>on this device</span></div>
      </div>
    </aside>
    <main class="main-content">
      <header class="topbar">
        <div>
          <p class="eyebrow">${formatDay(Date.now(), true)}</p>
          <h1>${pageTitle()}</h1>
        </div>
        <button class="button primary" data-action="manual">${icon("plus", 18)} Log work time</button>
      </header>
      ${content}
    </main>
  </div>`;
}

function pageTitle() {
  return {
    overview: "Today",
    history: "Work ledger",
    pomodoro: "Pomodoro",
    settings: "Preferences",
    about: "About Focus Hours"
  }[currentPage];
}

function trackerIsBreak() {
  return appState.tracker?.kind === "break";
}

function trackerIsOverloaded() {
  return Boolean(appState.tracker?.endsAt && (appState.tracker.overtimeMs || 0) > 0);
}

function trackerIsPomodoroFlow() {
  const kind = appState.tracker?.kind;
  return kind === "pomodoro" || kind === "break";
}

function currentPomodoroRound() {
  const cycle = Math.max(1, appState.settings.roundsBeforeLongBreak || 4);
  return (appState.pomodoroRound % cycle) + 1;
}

function stickyFocusTask() {
  return appState.tracker?.task || appState.focusDraft?.task || "";
}

function stickyFocusProject() {
  return appState.tracker?.project || appState.focusDraft?.project || "";
}

function trackerPanel(compact = false) {
  const tracker = appState.tracker;
  const displayMs = tracker
    ? (tracker.remainingMs ?? tracker.elapsedMs)
    : appState.settings.workMinutes * 60_000;
  const paused = trackerIsPaused();
  const onBreak = trackerIsBreak();
  const phaseLabel = paused
    ? "Paused"
    : onBreak
      ? (tracker.phase === "long-break" ? "Long break" : "Short break")
      : tracker?.kind === "pomodoro" ? "Focus session" : tracker ? "Tracking now" : "Ready when you are";
  return `<section class="tracker-card ${tracker ? "running" : ""} ${paused ? "paused" : ""} ${onBreak ? "on-break" : ""} ${compact ? "compact" : ""}">
    <div class="tracker-copy">
      <span class="live-label">${tracker ? '<i></i>' : ""}${phaseLabel}</span>
      <h2 data-dynamic="tracker-time">${formatClock(displayMs)}</h2>
      <p data-dynamic="tracker-task">${escapeHtml(tracker?.task || (compact ? "Start a timer to stay intentional." : "What are you working on?"))}</p>
    </div>
    <div class="tracker-actions">
      ${tracker
        ? `<button class="timer-button" data-action="${paused ? "resume" : "pause"}" title="${paused ? "Resume this session" : "Pause and keep the time logged"}">${icon(paused ? "play" : "pause", 22)}</button>
           <button class="timer-button stop" data-action="stop" title="Stop and save this session">${icon("stop", 20)}</button>`
        : `<button class="timer-button" data-action="start" title="Start live timer">${icon("play", 23)}</button>`}
    </div>
  </section>`;
}

function overviewPage() {
  const dayStart = startOfDay();
  const weekStart = startOfWeek(dayStart);
  const today = todayTotal();
  const week = totalBetween(weekStart, Date.now() + 1);
  const sessionsToday = appState.sessions.filter((s) => s.startedAt >= dayStart).length;
  const focusSessions = appState.sessions.filter((s) => s.source === "pomodoro" && s.startedAt >= dayStart).length;
  const recent = appState.sessions.slice(0, 4);

  return shell(`<div class="page-grid">
    <div class="primary-column">
      <section class="hero-card">
        <div class="hero-heading">
          <div><span class="section-kicker">NOW</span><h2>Current session</h2></div>
          <button class="icon-button info" title="Live timers keep counting even if this window is hidden.">${icon("info", 18)}</button>
        </div>
        <div class="tracking-fields">
          <label class="task-input-wrap"><span class="sr-only">Current task</span><input id="quick-task" placeholder="Name the outcome you want to move forward…" maxlength="120" value="${escapeHtml(stickyFocusTask())}" ${appState.tracker ? "disabled" : ""}/></label>
          <label class="task-input-wrap project-input"><span class="sr-only">Project or area</span><input id="quick-project" placeholder="Project / area" maxlength="80" value="${escapeHtml(stickyFocusProject())}" ${appState.tracker ? "disabled" : ""}/></label>
        </div>
        <div class="mode-row">
          <button class="mode-button ${appState.tracker?.kind !== "pomodoro" ? "selected" : ""}" data-start-kind="timer">${icon("clock", 18)} Open timer</button>
          <button class="mode-button ${appState.tracker?.kind === "pomodoro" ? "selected" : ""}" data-start-kind="pomodoro">${icon("focus", 18)} Pomodoro · ${appState.settings.workMinutes} min</button>
        </div>
        ${trackerPanel()}
      </section>
      <section class="section-block">
        <div class="section-heading"><div><span class="section-kicker">RECENT</span><h2>Latest work</h2></div><button class="text-button" data-page="history">View all ${icon("chevron", 16)}</button></div>
        ${sessionList(recent, true)}
      </section>
    </div>
    <aside class="insights-column">
      <section class="today-card">
        <div class="ring" style="--progress:${Math.min(100, today / (8 * 36_000))}">
          <div><strong data-dynamic="today-total">${formatDuration(today, true)}</strong><span>today</span></div>
        </div>
        <h3>Your focused time</h3>
        <p>${today >= 8 * 3_600_000 ? "Daily goal complete. Nicely done." : `${formatDuration(Math.max(0, 8 * 3_600_000 - today))} to an 8-hour day`}</p>
      </section>
      <div class="mini-stats">
        <div><span>This week</span><strong>${formatDuration(week, true)}</strong></div>
        <div><span>Sessions today</span><strong>${sessionsToday}</strong></div>
        <div><span>Focus rounds</span><strong>${focusSessions}</strong></div>
      </div>
      ${weekChart()}
    </aside>
  </div>`);
}

function weekChart() {
  const today = startOfDay();
  const values = Array.from({ length: 7 }, (_, index) => {
    const start = today - (6 - index) * 86_400_000;
    return {
      start,
      value: totalBetween(start, start + 86_400_000),
      label: new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(start)
    };
  });
  const max = Math.max(8 * 3_600_000, ...values.map((item) => item.value));
  return `<section class="week-card">
    <div class="card-title"><div><span>Last 7 days</span><strong>${formatDuration(values.reduce((a, b) => a + b.value, 0), true)}</strong></div>${icon("calendar", 18)}</div>
    <div class="bar-chart">${values.map((item) => `<div class="bar-column" title="${formatDuration(item.value)} on ${formatDay(item.start)}"><div class="bar-track"><i style="height:${Math.max(item.value ? 8 : 2, item.value / max * 100)}%"></i></div><span>${item.label}</span></div>`).join("")}</div>
  </section>`;
}

function sessionList(sessions, minimal = false) {
  if (!sessions.length) {
    return `<div class="empty-state">${icon("clock", 30)}<h3>No work logged yet</h3><p>Start the live timer or add a past time range.</p><button class="text-button" data-action="manual">Log your first session</button></div>`;
  }
  return `<div class="session-list">${sessions.map((session) => `
    <article class="session-row">
      <div class="session-icon ${session.source}">${icon(session.source === "pomodoro" ? "focus" : "clock", 18)}</div>
      <div class="session-main">
        <strong>${escapeHtml(session.task || "Focused work")}</strong>
        <span>${formatDay(session.startedAt)} · ${formatTime(session.startedAt)}–${formatTime(session.endedAt)}</span>
        ${!minimal && session.note ? `<p>${escapeHtml(session.note)}</p>` : ""}
      </div>
      <strong class="session-duration">${formatDuration(session.durationMs, true)}</strong>
      ${minimal ? "" : `<div class="row-actions">
        <button class="icon-button" data-edit="${session.id}" title="Edit session">${icon("edit", 17)}</button>
        <button class="icon-button danger" data-delete="${session.id}" title="Delete session">${icon("trash", 17)}</button>
      </div>`}
    </article>`).join("")}</div>`;
}

function historyPeriodSupportsOffset(range = selectedRange) {
  return range === "today" || range === "week" || range === "month";
}

function formatPeriodSpan(from, to) {
  const startLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(from);
  const endLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(to - 1);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function worklogPeriodNavigator() {
  if (!historyPeriodSupportsOffset()) return "";
  const { from, to } = historyPeriodBounds();
  const label = selectedRange === "month"
    ? new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(from)
    : selectedRange === "today"
      ? (historyPeriodOffset === 0 ? "Today" : historyPeriodOffset === 1 ? "Yesterday" : formatDay(from))
      : formatPeriodSpan(from, to);
  return `<div class="period-nav" role="group" aria-label="Browse ${selectedRange} periods">
    <button type="button" class="period-nav-button" data-history-period="prev" aria-label="Previous ${selectedRange}"><span class="flip">${icon("chevron", 15)}</span></button>
    <span class="period-nav-label" title="${escapeHtml(worklogRangeLabel())}">${escapeHtml(label)}</span>
    <button type="button" class="period-nav-button" data-history-period="next" ${historyPeriodOffset <= 0 ? "disabled" : ""} aria-label="Next ${selectedRange}">${icon("chevron", 15)}</button>
  </div>`;
}

function historyPage() {
  historyPeriodOffset = historyPeriodSupportsOffset() ? Math.max(0, historyPeriodOffset) : 0;
  const { from, to } = historyPeriodBounds();
  const query = historySearch.trim().toLowerCase();
  const sessions = appState.sessions.filter((session) => {
    const haystack = `${session.task || ""} ${session.project || ""} ${session.note || ""}`.toLowerCase();
    return session.endedAt >= from
      && session.endedAt < to
      && (historySource === "all" || session.source === historySource)
      && (!query || haystack.includes(query));
  });
  const totalPages = Math.max(1, Math.ceil(sessions.length / historyPageSize));
  ledgerPageIndex = Math.min(Math.max(1, ledgerPageIndex), totalPages);
  const pageStart = (ledgerPageIndex - 1) * historyPageSize;
  const pageSessions = sessions.slice(pageStart, pageStart + historyPageSize);
  const total = sessions.reduce((sum, session) => sum + session.durationMs, 0);
  const activeDays = new Set(sessions.map((session) => startOfDay(session.startedAt))).size;
  const longest = sessions.reduce((best, session) => Math.max(best, session.durationMs), 0);
  const average = activeDays ? total / activeDays : 0;
  const goalMs = (appState.settings.dailyGoalHours || 8) * 3_600_000;
  const showingFrom = sessions.length ? pageStart + 1 : 0;
  const showingTo = Math.min(sessions.length, pageStart + pageSessions.length);

  return shell(`<section class="worklog-commandbar">
      <div class="worklog-range-row">
        <div class="range-tabs worklog-ranges" role="tablist" aria-label="Work log range">
          ${["today", "week", "month", "all"].map((range) => `<button class="${selectedRange === range ? "active" : ""}" data-range="${range}">${range === "all" ? "All time" : range[0].toUpperCase() + range.slice(1)}</button>`).join("")}
        </div>
        ${worklogPeriodNavigator()}
      </div>
      <div class="worklog-tools">
        <label class="search-field">${icon("search", 17)}<input id="history-search" value="${escapeHtml(historySearch)}" placeholder="Search task, project or note" aria-label="Search work log"/></label>
        <select id="history-source" aria-label="Filter by tracking method">
          <option value="all" ${historySource === "all" ? "selected" : ""}>All methods</option>
          <option value="manual" ${historySource === "manual" ? "selected" : ""}>Manual</option>
          <option value="timer" ${historySource === "timer" ? "selected" : ""}>Live timer</option>
          <option value="pomodoro" ${historySource === "pomodoro" ? "selected" : ""}>Pomodoro</option>
        </select>
      </div>
    </section>
    <section class="worklog-metrics">
      ${metricCard("Logged time", formatDuration(total, true), `${sessions.length} session${sessions.length === 1 ? "" : "s"}`, "clock")}
      ${metricCard("Daily average", formatDuration(average, true), `${activeDays} active day${activeDays === 1 ? "" : "s"}`, "calendar")}
      ${metricCard("Longest block", formatDuration(longest, true), longest ? "Your deepest session" : "No session yet", "focus")}
      ${metricCard("Goal coverage", `${Math.round(Math.min(999, total / Math.max(1, activeDays || 1) / goalMs * 100))}%`, `${appState.settings.dailyGoalHours || 8}h daily target`, "spark")}
    </section>
    <div class="worklog-layout">
      <section class="ledger-card">
        <div class="ledger-heading">
          <div><span class="section-kicker">WORK LEDGER</span><h2>${worklogRangeLabel()}</h2></div>
          <span class="ledger-count">${sessions.length ? `${showingFrom}–${showingTo} of ${sessions.length}` : "0 entries"}</span>
        </div>
        ${workLedger(pageSessions)}
        ${sessions.length ? ledgerPagination(totalPages) : ""}
      </section>
      <aside class="worklog-insights">
        ${activityPulse(from, to)}
        ${projectBreakdown(sessions)}
        <section class="tracking-note">
          <span class="note-mark">${icon("spark", 17)}</span>
          <div><strong>Make the log useful</strong><p>Name the outcome, not just the activity. "Shipped invoice export" tells tomorrow-you much more than "Coding".</p></div>
        </section>
      </aside>
    </div>`);
}

function metricCard(label, value, meta, iconName) {
  return `<article class="metric-card">
    <span class="metric-icon">${icon(iconName, 18)}</span>
    <div><span>${label}</span><strong>${value}</strong><small>${meta}</small></div>
  </article>`;
}

function worklogRangeLabel() {
  const { from, to } = historyPeriodBounds();
  if (selectedRange === "today") {
    if (historyPeriodOffset === 0) return "Today";
    if (historyPeriodOffset === 1) return "Yesterday";
    return formatDay(from, true);
  }
  if (selectedRange === "week") {
    if (historyPeriodOffset === 0) return `This week · ${formatPeriodSpan(from, to)}`;
    return formatPeriodSpan(from, to);
  }
  if (selectedRange === "month") {
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(from);
  }
  return "All recorded work";
}

function sourceLabel(source) {
  return { manual: "Manual", timer: "Live timer", pomodoro: "Pomodoro" }[source] || "Tracked";
}

function dayHeading(day) {
  const today = startOfDay();
  if (day === today) return "Today";
  if (day === today - 86_400_000) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(day);
}

function ledgerPageNumbers(totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, ledgerPageIndex, ledgerPageIndex - 1, ledgerPageIndex + 1, ledgerPageIndex - 2, ledgerPageIndex + 2]);
  return [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
}

function ledgerPagination(totalPages) {
  const pages = ledgerPageNumbers(totalPages);
  let pageControls = "";
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (index > 0 && page - pages[index - 1] > 1) {
      pageControls += '<span class="ledger-page-ellipsis" aria-hidden="true">…</span>';
    }
    pageControls += `<button type="button" class="ledger-page-number${page === ledgerPageIndex ? " active" : ""}" data-ledger-page="${page}" aria-label="Page ${page}" ${page === ledgerPageIndex ? 'aria-current="page"' : ""}>${page}</button>`;
  }

  return `<div class="ledger-pagination">
    <label class="ledger-page-size">
      <span>Per page</span>
      <select id="history-page-size" aria-label="Entries per page">
        ${HISTORY_PAGE_SIZES.map((size) => `<option value="${size}" ${historyPageSize === size ? "selected" : ""}>${size}</option>`).join("")}
      </select>
    </label>
    <div class="ledger-page-controls" role="navigation" aria-label="Ledger pages">
      <button type="button" class="ledger-page-nav" data-ledger-page="${ledgerPageIndex - 1}" ${ledgerPageIndex <= 1 ? "disabled" : ""} aria-label="Previous page"><span class="flip">${icon("chevron", 15)}</span> Prev</button>
      ${pageControls}
      <button type="button" class="ledger-page-nav" data-ledger-page="${ledgerPageIndex + 1}" ${ledgerPageIndex >= totalPages ? "disabled" : ""} aria-label="Next page">Next ${icon("chevron", 15)}</button>
    </div>
    <span class="ledger-page-status">Page ${ledgerPageIndex} of ${totalPages}</span>
  </div>`;
}

function workLedger(sessions) {
  if (!sessions.length) {
    const filtered = historySearch || historySource !== "all";
    return `<div class="ledger-empty">${icon(filtered ? "search" : "clock", 28)}<h3>${filtered ? "Nothing matches those filters" : "Your ledger is ready"}</h3><p>${filtered ? "Try a broader search or another method." : "Log a real block of work and it will appear here with its context."}</p>${filtered ? "" : '<button class="button secondary" data-action="manual">Add first entry</button>'}</div>`;
  }

  const groups = new Map();
  for (const session of sessions) {
    const day = startOfDay(session.startedAt);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(session);
  }

  return `<div class="ledger-days">${[...groups.entries()].map(([day, daySessions]) => {
    const dayTotal = daySessions.reduce((sum, session) => sum + session.durationMs, 0);
    return `<section class="ledger-day">
      <header><div><strong>${dayHeading(day)}</strong><span>${formatDay(day)}</span></div><em>${formatDuration(dayTotal, true)}</em></header>
      <div class="ledger-entries">${daySessions.map((session) => `
        <article class="ledger-entry">
          <div class="entry-time"><strong>${formatTime(session.startedAt)}</strong><span>${formatTime(session.endedAt)}</span></div>
          <div class="entry-rail"><i class="${session.source}"></i></div>
          <div class="entry-body">
            <div class="entry-meta">
              ${session.project ? `<span class="project-chip">${icon("briefcase", 12)} ${escapeHtml(session.project)}</span>` : '<span class="project-chip muted">Unsorted</span>'}
              <span class="source-chip ${session.source}">${sourceLabel(session.source)}</span>
            </div>
            <h3>${escapeHtml(session.task || "Focused work")}</h3>
            ${session.note ? `<p>${escapeHtml(session.note)}</p>` : ""}
          </div>
          <div class="entry-duration"><strong>${formatDuration(session.durationMs, true)}</strong><span>${Math.max(1, Math.round(session.durationMs / 60_000))} min</span></div>
          <div class="entry-actions">
            <button class="icon-button" data-edit="${session.id}" title="Edit entry">${icon("edit", 16)}</button>
            <button class="icon-button danger" data-delete="${session.id}" title="Delete entry">${icon("trash", 16)}</button>
          </div>
        </article>`).join("")}</div>
    </section>`;
  }).join("")}</div>`;
}

function activityPulse(from = startOfWeek(), to = shiftDays(startOfWeek(), 7)) {
  const earliest = startOfDay(Math.max(0, from || 0));
  const safeTo = Number.isFinite(to) && to < 8.64e15 ? to : Date.now() + 1;
  const periodLast = startOfDay(Math.min(safeTo, Date.now() + 1) - 1);
  const lastDay = selectedRange === "week" ? startOfDay(safeTo - 1) : periodLast;
  let firstDay = selectedRange === "week" ? earliest : shiftDays(lastDay, -6);
  if (firstDay < earliest) firstDay = earliest;
  const values = [];
  for (let day = firstDay; day <= lastDay; day = shiftDays(day, 1)) {
    values.push({
      day,
      value: totalBetween(day, shiftDays(day, 1)),
      label: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day).slice(0, 2)
    });
  }
  if (!values.length) {
    values.push({ day: lastDay, value: 0, label: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(lastDay).slice(0, 2) });
  }
  const goal = (appState.settings.dailyGoalHours || 8) * 3_600_000;
  const pulseTitle = selectedRange === "week"
    ? "Week pulse"
    : selectedRange === "month"
      ? "Month-end pulse"
      : "Seven-day pulse";
  return `<section class="pulse-card">
    <div class="insight-title"><div><span class="section-kicker">RHYTHM</span><h3>${pulseTitle}</h3></div><span>${formatDuration(values.reduce((sum, item) => sum + item.value, 0), true)}</span></div>
    <div class="pulse-bars">${values.map((item) => `<div title="${formatDuration(item.value)} on ${formatDay(item.day)}"><span><i style="height:${Math.max(item.value ? 7 : 2, Math.min(100, item.value / goal * 100))}%"></i></span><em>${item.label}</em></div>`).join("")}</div>
    <div class="goal-key"><i></i><span>Bars are measured against your ${appState.settings.dailyGoalHours || 8}h daily goal.</span></div>
  </section>`;
}

function projectBreakdown(sessions) {
  const projects = new Map();
  for (const session of sessions) {
    const name = session.project || "Unsorted";
    projects.set(name, (projects.get(name) || 0) + session.durationMs);
  }
  const rows = [...projects.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  return `<section class="project-card">
    <div class="insight-title"><div><span class="section-kicker">ALLOCATION</span><h3>Where time went</h3></div>${icon("layers", 18)}</div>
    ${rows.length ? `<div class="project-list">${rows.map(([name, value]) => `<div><span><i style="--share:${Math.round(value / total * 100)}%"></i></span><p><strong>${escapeHtml(name)}</strong><em>${formatDuration(value, true)}</em></p></div>`).join("")}</div>` : '<p class="insight-empty">Projects will appear as you classify entries.</p>'}
  </section>`;
}

function pomodoroStatusLabel(tracker, onBreak, paused, overloaded) {
  if (!tracker) return "Ready to focus";
  if (paused) return "Paused";
  if (overloaded) return onBreak ? "Extra rest" : "Overtime · keep going";
  if (onBreak) return "Breathe and reset";
  return "Stay with it";
}

function extendChipButton() {
  return `<button type="button" class="extend-chip" data-action="extend-2" title="Add 2 minutes of overtime" aria-label="Add 2 minutes">
    <strong>+2</strong><span>min</span>
  </button>`;
}

function pomodoroPage() {
  const tracker = appState.tracker;
  const onBreak = trackerIsBreak();
  const paused = trackerIsPaused();
  const overloaded = trackerIsOverloaded();
  const phaseName = onBreak
    ? (tracker.phase === "long-break" ? "LONG BREAK" : "SHORT BREAK")
    : "DEEP FOCUS";
  const duration = tracker ? (tracker.remainingMs ?? tracker.elapsedMs) : appState.settings.workMinutes * 60_000;
  const total = tracker?.endsAt ? tracker.endsAt - tracker.startedAt : appState.settings.workMinutes * 60_000;
  const progress = tracker?.endsAt ? Math.max(0, Math.min(100, (tracker.remainingMs / total) * 100)) : 100;
  const round = currentPomodoroRound();
  const cycle = appState.settings.roundsBeforeLongBreak;
  return shell(`<div class="pomodoro-layout">
    <section class="focus-stage ${onBreak ? "is-break" : tracker ? "is-focus" : ""} ${overloaded ? "is-overloaded" : ""}">
      <div class="phase-pill ${onBreak ? "is-break" : ""} ${overloaded ? "is-overloaded" : ""}">${phaseName} · ROUND ${round} OF ${cycle}${overloaded ? " · +TIME" : ""}</div>
      <div class="focus-ring ${paused ? "paused" : ""} ${onBreak ? "is-break" : ""} ${overloaded ? "is-overloaded" : ""} ${tracker && !paused ? "is-ticking" : ""}" style="--progress:${progress}">
        <i class="focus-ring-cap" aria-hidden="true"></i>
        <div><strong data-dynamic="tracker-time">${formatClock(duration)}</strong><span data-dynamic="focus-status">${pomodoroStatusLabel(tracker, onBreak, paused, overloaded)}</span></div>
      </div>
      <div class="focus-inputs">
        <input class="focus-task-input" id="focus-task" placeholder="What deserves your full attention?" value="${escapeHtml(stickyFocusTask())}" ${tracker ? "disabled" : ""}/>
        <input class="focus-task-input focus-project-input" id="focus-project" placeholder="Project / area" value="${escapeHtml(stickyFocusProject())}" ${tracker ? "disabled" : ""}/>
      </div>
      ${tracker
        ? `<div class="focus-actions">
             <button class="button secondary" data-action="${trackerIsPaused() ? "resume" : "pause"}">${icon(trackerIsPaused() ? "play" : "pause", 18)} ${trackerIsPaused() ? "Resume" : "Pause"}</button>
             ${extendChipButton()}
             <button class="button primary large" data-action="stop">${icon("stop", 20)} End ${tracker.kind === "break" ? "break" : "focus session"}</button>
           </div>`
        : `<button class="button primary large" data-action="start-pomodoro">${icon("play", 20)} Start focus session</button>`}
      <p class="quiet-note">Your focus note sticks until you change it — saved when you leave the field or start. Completed rounds go to work history automatically.</p>
    </section>
    <aside class="pomodoro-aside">
      <div class="aside-card">
        <span class="section-kicker">YOUR RHYTHM</span>
        <h3>${appState.settings.workMinutes} min focus</h3>
        <div class="rhythm-flow">
          <span class="focus">${appState.settings.workMinutes}</span><i></i>
          <span>${appState.settings.shortBreakMinutes}</span><i></i>
          <span class="focus">${appState.settings.workMinutes}</span><i></i>
          <span>${appState.settings.shortBreakMinutes}</span>
        </div>
        <button class="text-button" data-page="settings">Adjust timing ${icon("chevron", 16)}</button>
      </div>
      <div class="tip-card"><span>Small reminder</span><p>One task, one timer. Put distractions somewhere you can return to later.</p></div>
    </aside>
  </div>`);
}

function settingsNavItem(id, label, iconName, hint) {
  return `<button type="button" class="settings-nav-item ${settingsSection === id ? "active" : ""}" data-settings-section="${id}" aria-pressed="${settingsSection === id}">
    <span class="settings-nav-icon">${icon(iconName, 17)}</span>
    <span class="settings-nav-text"><strong>${label}</strong><em>${hint}</em></span>
  </button>`;
}

function settingsRhythmCard() {
  const s = appState.settings;
  return `<section class="settings-card">
    <div class="settings-heading"><span class="settings-icon">${icon("focus", 20)}</span><div><h2>Focus rhythm</h2><p>Choose a pace that helps you stay fresh.</p></div></div>
    <div class="field-grid">
      ${numberField("workMinutes", "Focus", s.workMinutes, "minutes")}
      ${numberField("shortBreakMinutes", "Short break", s.shortBreakMinutes, "minutes")}
      ${numberField("longBreakMinutes", "Long break", s.longBreakMinutes, "minutes")}
      ${numberField("roundsBeforeLongBreak", "Long break after", s.roundsBeforeLongBreak, "rounds")}
    </div>
    ${toggleField("autoStartBreaks", "Start breaks automatically", "Move into recovery as soon as a focus round ends.", s.autoStartBreaks)}
    ${toggleField("timerEndSound", "Play sound when a timer ends", "Hear a short chime when a focus round or break finishes.", s.timerEndSound !== false)}
    <div class="settings-divider"></div>
    <div class="settings-heading compact"><span class="settings-icon">${icon("history", 20)}</span><div><h2>Work log target</h2><p>Give your history a realistic daily context.</p></div></div>
    <div class="field-grid compact-fields">
      ${numberField("dailyGoalHours", "Daily focused-work goal", s.dailyGoalHours || 8, "hours")}
    </div>
  </section>`;
}

function settingsCompanionCard() {
  const s = appState.settings;
  return `<section class="settings-card">
    <div class="settings-heading"><span class="settings-icon">${icon("external", 20)}</span><div><h2>Desktop companion</h2><p>Keep your current focus visible while you work.</p></div></div>
    <label class="field companion-style"><span>Floating style</span><select name="widgetDisplay">
      <option value="pet" ${s.widgetDisplay === "pet" || !s.widgetDisplay ? "selected" : ""}>Focus buddy - smallest</option>
      <option value="compact" ${s.widgetDisplay === "compact" ? "selected" : ""}>Compact timer strip</option>
      <option value="full" ${s.widgetDisplay === "full" ? "selected" : ""}>Full timer card</option>
    </select></label>
    <div class="pet-choice">
      <div class="pet-choice-heading"><span>Choose your focus buddy</span><button type="button" class="icon-button info" title="CSS-drawn companions stay sharp and add no image weight.">${icon("info", 16)}</button></div>
      ${petPicker(s.petStyle || "cat")}
    </div>
    <label class="buddy-size-control">
      <div><span>Focus Buddy size</span><button type="button" class="icon-button info" title="Adjusts the collapsed companion icon. The expanded overview keeps its carefully spaced layout.">${icon("info", 16)}</button></div>
      <div class="buddy-size-slider"><span class="size-dot small"></span><input id="buddy-size" name="buddySize" type="range" min="${BUDDY_SIZE_MIN}" max="${BUDDY_SIZE_MAX}" step="2" value="${s.buddySize || 62}"/><span class="size-dot large"></span><output id="buddy-size-output">${s.buddySize || 62}px</output></div>
    </label>
    <div class="drop-video-control">
      <div class="pet-choice-heading"><span>Drop animation video</span><button type="button" class="icon-button info" title="When you drag and drop the Focus Buddy, this video plays once, then the buddy returns.">${icon("info", 16)}</button></div>
      <div class="drop-video-row">
        <button type="button" class="button secondary" data-action="choose-drop-video">${s.petDropVideo ? "Change video" : "Choose video"}</button>
        ${s.petDropVideo ? `<button type="button" class="button danger-outline" data-action="clear-drop-video">Remove</button>` : ""}
      </div>
      <p class="drop-video-status">${s.petDropVideo ? `Ready: ${escapeHtml(petDropVideoLabel(s.petDropVideo))}` : "No video selected — drop will only move the buddy."}</p>
      <label class="buddy-size-control drop-video-size-control">
        <div><span>Drop video size</span><button type="button" class="icon-button info" title="Independent from Focus Buddy size. Use this if the drop clip looks smaller or larger than your companion.">${icon("info", 16)}</button></div>
        <div class="buddy-size-slider"><span class="size-dot small"></span><input id="drop-video-size" name="petDropVideoSize" type="range" min="${PET_DROP_VIDEO_SIZE_MIN}" max="${PET_DROP_VIDEO_SIZE_MAX}" step="10" value="${clampPetDropVideoSize(s.petDropVideoSize)}"/><span class="size-dot large"></span><output id="drop-video-size-output">${clampPetDropVideoSize(s.petDropVideoSize)}px</output></div>
      </label>
      ${toggleField("petDropVideoSound", "Play video sound", "Allow audio when the drop animation plays. Leave off to keep drops silent.", Boolean(s.petDropVideoSound))}
    </div>
    ${toggleField("alwaysOnTop", "Keep companion above everything", "Stays on top of other apps and the Windows taskbar.", s.alwaysOnTop)}
    ${toggleField("launchWidget", "Show mini timer on launch", "Open the compact timer when Focus Hours starts.", s.launchWidget)}
    <button type="button" class="button secondary widget-preview" data-action="show-widget">${icon("external", 18)} Show mini timer now</button>
  </section>`;
}

function settingsShortcutsCard() {
  return `<section class="settings-card">
    <div class="settings-heading"><span class="settings-icon">${icon("spark", 20)}</span><div><h2>Keyboard shortcuts</h2><p>Control Focus Hours without leaving the app you are working in.</p></div></div>
    ${shortcutList()}
  </section>`;
}

function whatsappSettings() {
  return appState.settings?.integrations?.whatsapp || {
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
    notifications: Object.fromEntries(
      Object.entries(WHATSAPP_MESSAGE_DEFAULTS).map(([id, message]) => [id, {
        enabled: ["focusEnd", "breakStart", "breakEnd"].includes(id),
        message
      }])
    )
  };
}

function whatsappStatusMeta(wa) {
  if (!wa.accessToken || !wa.phoneNumberId || !wa.recipientNumber) {
    return { tone: "idle", label: "Not configured" };
  }
  if (wa.lastStatus === "connected") return { tone: "connected", label: "Connected" };
  if (wa.lastStatus === "error") return { tone: "error", label: "Failed" };
  return { tone: "idle", label: "Ready to test" };
}

async function collectAndSaveWhatsAppSettings() {
  const form = document.querySelector("#settings-form");
  if (!form) throw new Error("Open Integrations settings first.");
  const current = whatsappSettings();
  const notifications = {};
  for (const event of WHATSAPP_EVENT_META) {
    const enabled = form.querySelector(`[name="wa-enabled-${event.id}"]`)?.checked || false;
    const message = form.querySelector(`[name="wa-message-${event.id}"]`)?.value?.trim()
      || WHATSAPP_MESSAGE_DEFAULTS[event.id];
    notifications[event.id] = { enabled, message: message.slice(0, 500) };
  }
  await api.updateSettings({
    integrations: {
      whatsapp: {
        ...current,
        enabled: Boolean(form.whatsappEnabled?.checked),
        accessToken: form.whatsappAccessToken?.value?.trim() || "",
        phoneNumberId: form.whatsappPhoneNumberId?.value?.trim() || "",
        recipientNumber: (form.whatsappRecipientNumber?.value || "").replace(/\D/g, ""),
        alertTemplateName: form.whatsappAlertTemplateName?.value?.trim() || "",
        alertTemplateLanguage: form.whatsappAlertTemplateLanguage?.value?.trim() || "en",
        notifications
      }
    }
  });
}

function settingsIntegrationsCard() {
  const wa = whatsappSettings();
  const status = whatsappStatusMeta(wa);
  const notifications = wa.notifications || {};
  return `<div class="settings-stack">
    <section class="settings-card">
      <div class="settings-heading integration-heading">
        <div class="integration-heading-copy">
          <span class="settings-icon">${icon("link", 20)}</span>
          <div>
            <div class="heading-with-help">
              <h2>WhatsApp</h2>
              <span class="integration-status is-${status.tone}">${status.label}</span>
            </div>
            <p>Send timer alerts through Meta WhatsApp Cloud API.</p>
          </div>
        </div>
        <div class="integration-heading-actions">
          <button type="button" class="button secondary" data-action="test-whatsapp">${icon("external", 16)} Test connection</button>
          <button type="button" class="button primary" data-action="sample-whatsapp">${icon("spark", 16)} Send sample alert</button>
        </div>
      </div>
      ${wa.lastError ? `<p class="integration-error">${escapeHtml(wa.lastError)}</p>` : `<p class="quiet-note">If alerts do not arrive, Meta is usually blocking free-form text. Set a template below, or message your business WhatsApp from the recipient phone first.</p>`}
      ${toggleField("whatsappEnabled", "Enable WhatsApp alerts", "Allow Focus Hours to message your WhatsApp number when configured events fire.", Boolean(wa.enabled))}
      <div class="integration-block">
        <span class="integration-block-label">Connection</span>
        <div class="field-grid integration-fields">
          <label class="field full-span"><span>Access token</span><input type="password" name="whatsappAccessToken" autocomplete="off" placeholder="WHATSAPP_TOKEN" value="${escapeHtml(wa.accessToken || "")}"/></label>
          <label class="field"><span>Phone number ID</span><input type="text" name="whatsappPhoneNumberId" autocomplete="off" placeholder="From Meta" value="${escapeHtml(wa.phoneNumberId || "")}"/></label>
          <label class="field"><span>Recipient number <em>country code, digits only</em></span><input type="text" name="whatsappRecipientNumber" autocomplete="off" placeholder="918527192366" value="${escapeHtml(wa.recipientNumber || "")}"/></label>
        </div>
      </div>
      <div class="integration-block">
        <span class="integration-block-label">Reliable delivery template</span>
        <p class="integration-block-copy">Meta blocks ordinary chat text unless that phone messaged you in the last 24 hours. Create an approved WhatsApp template in Meta with one body variable <code>{{1}}</code>, then put its name here so timer alerts can always send.</p>
        <div class="field-grid integration-fields">
          <label class="field"><span>Template name</span><input type="text" name="whatsappAlertTemplateName" autocomplete="off" placeholder="focus_hours_alert" value="${escapeHtml(wa.alertTemplateName || "")}"/></label>
          <label class="field"><span>Language code</span><input type="text" name="whatsappAlertTemplateLanguage" autocomplete="off" placeholder="en" value="${escapeHtml(wa.alertTemplateLanguage || "en")}"/></label>
        </div>
      </div>
    </section>
    <section class="settings-card">
      <div class="settings-heading">
        <span class="settings-icon">${icon("spark", 20)}</span>
        <div><h2>Notification events</h2><p>Choose which moments ping WhatsApp, and edit each message.</p></div>
      </div>
      <p class="placeholder-help">Use <code>{{task}}</code>, <code>{{project}}</code>, <code>{{phase}}</code>, <code>{{round}}</code>, <code>{{duration}}</code> in messages.</p>
      <div class="whatsapp-event-list">
        ${WHATSAPP_EVENT_META.map((event) => {
          const item = notifications[event.id] || { enabled: false, message: WHATSAPP_MESSAGE_DEFAULTS[event.id] };
          return `<article class="whatsapp-event-row">
            <div class="whatsapp-event-head">
              <div>
                <strong>${event.label}</strong>
                <span>${event.hint}</span>
              </div>
              <label class="mini-toggle"><input type="checkbox" name="wa-enabled-${event.id}" ${item.enabled ? "checked" : ""}/><i></i></label>
            </div>
            <label class="field">
              <span>Message</span>
              <textarea name="wa-message-${event.id}" rows="2" maxlength="500">${escapeHtml(item.message || WHATSAPP_MESSAGE_DEFAULTS[event.id])}</textarea>
            </label>
            <button type="button" class="text-button" data-action="reset-whatsapp-message" data-event="${event.id}">Reset to default</button>
          </article>`;
        }).join("")}
      </div>
    </section>
  </div>`;
}

function auditExpiresAt(deletedAt) {
  const days = Math.max(1, Number(appState.settings.deletedRetentionDays) || 2);
  return Number(deletedAt || 0) + days * 86_400_000;
}

function formatRelativeExpiry(expiresAt) {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "Expiring soon";
  const hours = Math.ceil(remaining / 3_600_000);
  if (hours < 24) return `Expires in ${hours}h`;
  const days = Math.ceil(hours / 24);
  return `Expires in ${days} day${days === 1 ? "" : "s"}`;
}

function recentlyDeletedCard() {
  const deleted = [...(appState.deletedSessions || [])].sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  const retention = Math.max(1, Number(appState.settings.deletedRetentionDays) || 2);
  return `<section class="settings-card">
    <div class="settings-heading">
      <span class="settings-icon">${icon("history", 20)}</span>
      <div><h2>Recently deleted</h2><p>Deleted work stays recoverable here for ${retention} day${retention === 1 ? "" : "s"}, then is removed automatically.</p></div>
    </div>
    <div class="field-grid compact-fields">
      ${numberField("deletedRetentionDays", "Keep deleted entries for", retention, "days", { min: 1, max: 30 })}
    </div>
    ${deleted.length
      ? `<div class="audit-list">
          ${deleted.map((session) => {
            const expiresAt = auditExpiresAt(session.deletedAt);
            return `<article class="audit-row">
              <div>
                <strong>${escapeHtml(session.task || "Focused work")}</strong>
                <span>${escapeHtml(session.project || "Unsorted")} · ${formatDuration(session.durationMs, true)} · deleted ${formatDay(session.deletedAt || Date.now())}</span>
                <em>${formatRelativeExpiry(expiresAt)}</em>
              </div>
              <div class="audit-actions">
                <button type="button" class="button secondary" data-action="restore-session" data-id="${escapeHtml(session.id)}">Restore</button>
                <button type="button" class="button danger-outline" data-action="purge-session" data-id="${escapeHtml(session.id)}">Delete forever</button>
              </div>
            </article>`;
          }).join("")}
        </div>
        <div class="audit-footer">
          <button type="button" class="text-button danger-text" data-action="purge-all-deleted">Clear all deleted entries</button>
        </div>`
      : `<div class="audit-empty"><p>No recently deleted sessions. Entries you remove from History will appear here.</p></div>`}
  </section>`;
}

function settingsDataCard() {
  const defaultRange = deletionRangeForPeriod("month");
  const impact = deletionImpact(defaultRange);
  const today = toDateTimeLocal(Date.now()).slice(0, 10);
  const weekAgo = toDateTimeLocal(startOfDay() - 6 * 86_400_000).slice(0, 10);
  return `<div class="settings-stack">
    <section class="settings-card">
      <div class="settings-heading"><span class="settings-icon">${icon("layers", 20)}</span><div><h2>Backup & restore</h2><p>Export a local backup, or import one from another machine.</p></div></div>
      <div class="backup-actions">
        <button type="button" class="button secondary" data-action="export-data">${icon("external", 16)} Export backup</button>
        <button type="button" class="button primary" data-action="import-data">${icon("plus", 16)} Import backup</button>
      </div>
      <p class="quiet-note">Backups include sessions, deleted audit entries, preferences, and notes. An active timer is never overwritten.</p>
    </section>
    <section class="settings-card data-controls-card">
      <div class="settings-heading">
        <span class="settings-icon danger-icon">${icon("trash", 20)}</span>
        <div><div class="heading-with-help"><h2>Reset work records</h2><button type="button" class="icon-button info" title="Moves completed work-ledger sessions into Recently deleted. Preferences, companion settings, and an active timer are preserved.">${icon("info", 16)}</button></div><p>Clear recorded work for a period. Entries stay recoverable for a few days.</p></div>
      </div>
      <div class="data-control-row">
        <label class="field"><span>Period to reset</span><select id="data-period">
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="month" selected>This month</option>
          <option value="custom">Custom range</option>
          <option value="all">All time</option>
        </select></label>
        <div class="custom-date-range" id="custom-date-range" hidden>
          <label class="field"><span>From</span><input id="data-from" type="date" value="${weekAgo}"/></label>
          <label class="field"><span>Through</span><input id="data-to" type="date" value="${today}"/></label>
        </div>
        <div class="deletion-impact"><span id="deletion-impact">${impactText(impact)}</span><button type="button" class="button danger-outline" data-action="prepare-data-reset" ${impact.count ? "" : "disabled"}>${icon("trash", 16)} Reset records</button></div>
      </div>
    </section>
    ${recentlyDeletedCard()}
  </div>`;
}

function settingsPage() {
  const panel = settingsSection === "companion"
    ? settingsCompanionCard()
    : settingsSection === "data"
      ? settingsDataCard()
      : settingsSection === "integrations"
        ? settingsIntegrationsCard()
        : settingsSection === "shortcuts"
          ? settingsShortcutsCard()
          : settingsRhythmCard();
  const showSave = settingsSection !== "shortcuts";
  return shell(`<form id="settings-form" class="settings-shell">
    <aside class="settings-nav" aria-label="Preference sections">
      <span class="settings-nav-kicker">PREFERENCES</span>
      ${settingsNavItem("rhythm", "Focus rhythm", "focus", "Timers, breaks, goal")}
      ${settingsNavItem("companion", "Companion", "external", "Buddy & widget")}
      ${settingsNavItem("integrations", "Integrations", "link", "WhatsApp alerts")}
      ${settingsNavItem("data", "Data & backup", "layers", "Export, restore, deleted")}
      ${settingsNavItem("shortcuts", "Shortcuts", "spark", "Global keys")}
    </aside>
    <div class="settings-panel">
      ${panel}
      ${showSave ? `<div class="settings-save"><span>Changes are saved only on this device.</span><button class="button primary" type="submit">Save preferences</button></div>` : ""}
    </div>
  </form>`);
}

function deletionRangeForPeriod(period, customFrom, customTo) {
  const today = startOfDay();
  if (period === "today") return { from: today, to: today + 86_400_000, label: "today" };
  if (period === "week") return { from: today - 6 * 86_400_000, to: today + 86_400_000, label: "the last 7 days" };
  if (period === "month") {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
      label: new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(now)
    };
  }
  if (period === "all") return { from: 0, to: Number.MAX_SAFE_INTEGER, label: "all time" };
  const from = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : NaN;
  const endDay = customTo ? new Date(`${customTo}T00:00:00`).getTime() : NaN;
  if (!Number.isFinite(from) || !Number.isFinite(endDay) || endDay < from) return null;
  return {
    from,
    to: endDay + 86_400_000,
    label: `${formatDay(from)} through ${formatDay(endDay)}`
  };
}

function deletionImpact(range) {
  if (!range) return { count: 0, durationMs: 0, invalid: true };
  const matching = appState.sessions.filter((session) => session.startedAt < range.to && session.endedAt >= range.from);
  return {
    count: matching.length,
    durationMs: matching.reduce((sum, session) => sum + session.durationMs, 0)
  };
}

function impactText(impact) {
  if (impact.invalid) return "Choose a valid date range.";
  if (!impact.count) return "No recorded sessions in this period.";
  return `${impact.count} session${impact.count === 1 ? "" : "s"} · ${formatDuration(impact.durationMs, true)} recorded`;
}

function currentDeletionRange() {
  const period = document.querySelector("#data-period")?.value;
  return deletionRangeForPeriod(
    period,
    document.querySelector("#data-from")?.value,
    document.querySelector("#data-to")?.value
  );
}

function updateDataControl() {
  const period = document.querySelector("#data-period")?.value;
  const customFields = document.querySelector("#custom-date-range");
  if (!period || !customFields) return;
  customFields.hidden = period !== "custom";
  const impact = deletionImpact(currentDeletionRange());
  const summary = document.querySelector("#deletion-impact");
  const button = document.querySelector('[data-action="prepare-data-reset"]');
  if (summary) summary.textContent = impactText(impact);
  if (button) button.disabled = !impact.count || impact.invalid;
}

function openDataResetModal() {
  const range = currentDeletionRange();
  const impact = deletionImpact(range);
  if (!range || !impact.count) return;
  pendingDeletionRange = range;
  const retention = Math.max(1, Number(appState.settings.deletedRetentionDays) || 2);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal data-reset-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
    <div class="reset-warning-icon">${icon("trash", 22)}</div>
    <h2 id="reset-title">Reset work records?</h2>
    <p>This moves <strong>${impact.count} session${impact.count === 1 ? "" : "s"}</strong> totaling <strong>${formatDuration(impact.durationMs, true)}</strong> from ${escapeHtml(range.label)} into Recently deleted.</p>
    <div class="reset-preserves">${icon("info", 16)}<span>Entries stay recoverable for ${retention} day${retention === 1 ? "" : "s"}. Preferences, companion, shortcuts, and an active timer are unchanged.</span></div>
    <div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Keep records</button><button type="button" class="button danger-solid" data-action="confirm-data-reset">Move to deleted</button></div>
  </div>`;
  document.body.append(modal);
  modal.querySelector('[data-action="close-modal"]').focus();
}

function openSessionDeleteModal(sessionId) {
  const session = appState.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  pendingDeleteSessionId = sessionId;
  const retention = Math.max(1, Number(appState.settings.deletedRetentionDays) || 2);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal data-reset-modal" role="dialog" aria-modal="true" aria-labelledby="delete-session-title">
    <div class="reset-warning-icon">${icon("trash", 22)}</div>
    <h2 id="delete-session-title">Delete this session?</h2>
    <p><strong>${escapeHtml(session.task || "Focused work")}</strong> (${formatDuration(session.durationMs, true)}) will leave your history and stay recoverable for <strong>${retention} day${retention === 1 ? "" : "s"}</strong>.</p>
    <div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Keep it</button><button type="button" class="button danger-solid" data-action="confirm-session-delete">Delete</button></div>
  </div>`;
  document.body.append(modal);
  modal.querySelector('[data-action="close-modal"]').focus();
}

function openImportModeModal(preview) {
  pendingImportBackup = preview.backup;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal import-mode-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
    <div class="modal-header"><div><span class="section-kicker">IMPORT BACKUP</span><h2 id="import-title">How should this backup be applied?</h2></div><button type="button" class="icon-button" data-action="close-modal">${icon("close", 20)}</button></div>
    <p class="modal-intro">Found <strong>${preview.sessionCount}</strong> session${preview.sessionCount === 1 ? "" : "s"}${preview.deletedCount ? ` and <strong>${preview.deletedCount}</strong> deleted audit entr${preview.deletedCount === 1 ? "y" : "ies"}` : ""}.</p>
    <div class="import-mode-options">
      <button type="button" class="import-mode-card" data-action="confirm-import" data-mode="replace">
        <strong>Replace all</strong>
        <span>Overwrite sessions, deleted audit, preferences, and notes with this backup. The active timer is left alone.</span>
      </button>
      <button type="button" class="import-mode-card" data-action="confirm-import" data-mode="merge">
        <strong>Merge sessions</strong>
        <span>Add sessions that are not already here. Current settings, notes, and deleted audit stay as they are.</span>
      </button>
    </div>
    <div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button></div>
  </div>`;
  document.body.append(modal);
}

function aboutPage() {
  return shell(`<div class="about-layout">
    <section class="about-hero">
      <div class="about-product">
        <span class="about-logo">${icon("clock", 28)}</span>
        <div><span>FOCUS HOURS</span><h2>A clear record of focused work.</h2><p>Local time tracking for exact work sessions, useful context, and a daily view that stays honest.</p></div>
      </div>
      <span class="version-pill">Version ${escapeHtml(appState.appVersion || "1.0.0")}</span>
    </section>
    <section class="creator-card">
      <div class="creator-avatar">SK</div>
      <div class="creator-copy">
        <span class="section-kicker">CREATOR</span>
        <h2>Built by Shashi Kumar Singh</h2>
        <p>Designed as a practical daily instrument: less ceremony, honest records, and enough structure to understand where the day went.</p>
      </div>
      <span class="craft-label">${icon("spark", 15)} Crafted for focused work</span>
    </section>
    <section class="about-principles">
      <article><span>01</span><h3>Your data stays yours</h3><p>Sessions and preferences live on this computer. No account, cloud sync, or hidden telemetry.</p></article>
      <article><span>02</span><h3>Records over estimates</h3><p>Log exact time ranges, preserve useful context, and edit the ledger when real life interrupts.</p></article>
      <article><span>03</span><h3>Calm by default</h3><p>The mini timer stays present without demanding attention. The full detail waits in the work log.</p></article>
    </section>
    <section class="about-shortcuts">
      <div><span class="section-kicker">WORK WITHOUT SWITCHING</span><h2>Shortcuts that stay out of the way</h2><p>These work globally while Focus Hours is running.</p></div>
      ${shortcutList()}
    </section>
    <section class="about-footer-card">
      <div>${icon("about", 20)}<p><strong>Focus Hours ${escapeHtml(appState.appVersion || "1.0.0")}</strong><span>Private desktop time tracking for Windows</span></p></div>
      <button class="button secondary" data-page="history">${icon("history", 17)} Open work ledger</button>
    </section>
  </div>`);
}

function shortcutList() {
  const rows = [
    ["Start or stop timer", ["Ctrl", "Alt", "Space"]],
    ["Pause or resume timer", ["Ctrl", "Alt", "K"]],
    ["Start Pomodoro", ["Ctrl", "Alt", "P"]],
    ["Log past work", ["Ctrl", "Alt", "L"]],
    ["Open dashboard", ["Ctrl", "Alt", "F"]],
    ["Show or hide companion", ["Ctrl", "Alt", "M"]]
  ];
  return `<div class="shortcut-list">${rows.map(([label, keys]) => `<div><span>${label}</span><p>${keys.map((key) => `<kbd>${key}</kbd>`).join("<i>+</i>")}</p></div>`).join("")}</div>`;
}

function petFace() {
  return '<span class="pet-ears"><i></i><i></i></span><span class="pet-face"><i></i><i></i><em></em></span>';
}

function petVisual(style) {
  if (style === "custom" && appState.settings.customPetIcon) {
    return `<img class="custom-pet-image" draggable="false" src="${escapeHtml(appState.settings.customPetIcon)}" alt="Custom focus buddy"/>`;
  }
  return petFace();
}

function petPicker(selected) {
  const pets = [
    ["cat", "Miso", "Cat"],
    ["owl", "Orbit", "Owl"],
    ["sprout", "Sprig", "Sprout"],
    ["robot", "Pixel", "Robot"]
  ];
  return `<div class="pet-picker">${pets.map(([value, name, type]) => `<label class="${selected === value ? "selected" : ""}">
    <input type="radio" name="petStyle" value="${value}" ${selected === value ? "checked" : ""}/>
    <span class="pet-preview"><span class="pet-orb pet-${value}">${petFace()}</span></span>
    <strong>${name}</strong><small>${type}</small>
  </label>`).join("")}
  <button type="button" class="custom-pet-card ${selected === "custom" ? "selected" : ""}" data-action="choose-custom-pet">
    <span class="custom-pet-preview">${appState.settings.customPetIcon ? `<img src="${escapeHtml(appState.settings.customPetIcon)}" alt="Current custom icon"/>` : icon("plus", 20)}</span>
    <strong>From PC</strong><small>PNG, JPG or WebP</small>
  </button></div>`;
}

function numberField(name, label, value, suffix, { min = 1, max = 180 } = {}) {
  return `<label class="field"><span>${label}</span><div class="number-control"><input type="number" min="${min}" max="${max}" name="${name}" value="${value}" required/><em>${suffix}</em></div></label>`;
}

function toggleField(name, title, description, checked) {
  return `<label class="toggle-row"><div><strong>${title}</strong><span>${description}</span></div><input type="checkbox" name="${name}" ${checked ? "checked" : ""}/><i></i></label>`;
}

function trackerIsPaused() {
  return Boolean(appState.tracker?.pausedAt);
}

// Time shown above the collapsed buddy: the live session while tracking, today's total when idle.
function haloTime() {
  const tracker = appState.tracker;
  if (!tracker) return formatDuration(todayTotal(), true);
  return formatClock(tracker.remainingMs ?? tracker.elapsedMs);
}

function clampPetDropVideoSize(value) {
  const size = Math.round(Number(value) || PET_DROP_VIDEO_SIZE_DEFAULT);
  return Math.max(PET_DROP_VIDEO_SIZE_MIN, Math.min(PET_DROP_VIDEO_SIZE_MAX, size));
}

function petDropVideoLabel(url) {
  try {
    const name = decodeURIComponent(String(url).split(/[/\\]/).pop() || "");
    return name.replace(/^focus-hours-pet-drop-[a-f0-9]{12}\./i, "drop.") || "drop video";
  } catch {
    return "drop video";
  }
}

function petDropVideoShell() {
  const src = appState.settings.petDropVideo;
  const muted = !appState.settings.petDropVideoSound;
  const size = clampPetDropVideoSize(appState.settings.petDropVideoSize);
  return `<div class="pet-video-shell" data-pet-video="true" style="width:${size}px;height:${size}px">
    <video class="pet-drop-video" src="${escapeHtml(src)}" ${muted ? "muted" : ""} playsinline disablepictureinpicture controlslist="nodownload nofullscreen noremoteplayback" aria-label="Focus Buddy drop animation"></video>
    <canvas class="pet-drop-canvas" width="${size}" height="${size}" aria-hidden="true"></canvas>
  </div>`;
}

// Many “transparent” WebMs are actually opaque with a checkerboard baked into RGB.
// Flood-fill gray board pixels from the edges so the subject floats over the desktop.
function punchCheckerboardBackground(imageData) {
  const { data, width, height } = imageData;
  const marked = new Uint8Array(width * height);
  const stack = [];

  const isBoardPixel = (index) => {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min > 18) return false;
    return max >= 135 && max <= 250;
  };

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (marked[pixel]) return;
    if (!isBoardPixel(pixel * 4)) return;
    marked[pixel] = 1;
    stack.push(pixel);
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length) {
    const pixel = stack.pop();
    const x = pixel % width;
    const y = (pixel / width) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  for (let pixel = 0; pixel < marked.length; pixel += 1) {
    if (marked[pixel]) data[pixel * 4 + 3] = 0;
  }
}

function petDock(petStyle) {
  if (petVideoPlaying && appState.settings.petDropVideo) return petDropVideoShell();
  const tracker = appState.tracker;
  const paused = trackerIsPaused();
  const onBreak = trackerIsBreak();
  const overloaded = trackerIsOverloaded();
  const state = !tracker ? "idle" : paused ? "paused" : overloaded ? "overloaded" : onBreak ? "break" : "live";
  const label = !tracker ? "today" : paused ? "paused" : overloaded ? "over" : onBreak ? "rest" : "focus";
  const orbMood = tracker && !paused ? (overloaded ? "overloaded" : onBreak ? "resting" : "working") : "";
  const sessionTitle = onBreak
    ? (tracker.phase === "long-break" ? "Long break" : "Short break")
    : (tracker?.task || "Focused work");
  const petButton = `<button class="pet-orb pet-${petStyle} ${orbMood}" data-pet-trigger="true" title="${tracker ? `${escapeHtml(sessionTitle)} - click to open` : "Click to open your focus buddy"}">
    ${petVisual(petStyle)}
    ${tracker ? `<span class="pet-live ${onBreak ? "is-break" : ""} ${overloaded ? "is-overloaded" : ""}"></span>` : ""}
  </button>`;
  return `<div class="pet-dock">
    <div class="pet-halo is-${state}">
      <span class="halo-pulse"></span>
      <strong data-dynamic="halo-time">${haloTime()}</strong>
      <span class="halo-label">${label}</span>
      ${tracker
        ? `<span class="halo-actions">
            <button data-action="${paused ? "resume" : "pause"}" title="${paused ? "Resume" : "Pause"}" aria-label="${paused ? "Resume" : "Pause"}">${icon(paused ? "play" : "pause", 13)}</button>
            <button class="halo-stop" data-action="stop" title="Stop and save" aria-label="Stop and save">${icon("stop", 13)}</button>
          </span>`
        : ""}
    </div>
    ${petButton}
  </div>`;
}

function petNotesSection() {
  const open = petNotesOpen;
  const notepad = appState.notepad || "";
  return `<div class="pet-notes ${open ? "is-open" : ""}">
    <button class="pet-notes-toggle" data-action="toggle-notes" aria-expanded="${open}" aria-controls="pet-notes-body">
      ${icon("note", 14)}
      <span>Notes</span>
      ${notepad.trim() && !open ? '<em class="notes-dot" aria-label="Has notes"></em>' : ""}
      <i class="notes-chevron">${icon("chevron", 14)}</i>
    </button>
    ${open
      ? `<div class="pet-notes-body" id="pet-notes-body">
          <textarea id="pet-notepad" maxlength="${NOTEPAD_LIMIT}" spellcheck="false" placeholder="Thoughts, blockers, links…" aria-label="Notes">${escapeHtml(notepad)}</textarea>
          <div class="pet-notes-meta"><span data-dynamic="notes-status">Autosaved</span></div>
        </div>`
      : ""}
  </div>`;
}

function widgetView() {
  const tracker = appState.tracker;
  const displayMs = tracker ? (tracker.remainingMs ?? tracker.elapsedMs) : 0;
  const mode = appState.settings.widgetDisplay || "pet";
  const petStyle = appState.settings.petStyle || "cat";
  const paused = trackerIsPaused();
  const onBreak = trackerIsBreak();
  const overloaded = trackerIsOverloaded();
  const phaseBadge = paused
    ? "Paused"
    : overloaded
      ? (onBreak ? "Extra rest" : "Overtime")
      : onBreak
        ? "Rest"
        : "Focus";
  const statusDot = tracker ? (paused ? "paused" : overloaded ? "overloaded" : onBreak ? "break" : "active") : "";
  const taskFallback = onBreak
    ? (tracker.phase === "long-break" ? "Long break" : "Short break")
    : "Ready to focus";

  if (mode === "pet" && !petOpen) {
    if (petVideoPlaying) return petDock(petStyle);
    if (motivationQuote) {
      return `<div class="quote-companion-shell quote-${quotePlacement.horizontal} quote-${quotePlacement.vertical}">
        <aside class="motivation-bubble" aria-live="polite">
          <button data-action="dismiss-quote" title="Dismiss quote" aria-label="Dismiss quote">${icon("close", 13)}</button>
          <p>${escapeHtml(motivationQuote.text)}</p>
          <span>&mdash; ${escapeHtml(motivationQuote.author)}</span>
        </aside>
        ${petDock(petStyle)}
      </div>`;
    }
    return petDock(petStyle);
  }

  if (mode === "pet") {
    return `<div class="pet-panel ${tracker ? "is-running" : ""} ${paused ? "is-paused" : ""} ${onBreak ? "is-break" : ""} ${overloaded ? "is-overloaded" : ""} ${petNotesOpen ? "notes-open" : ""}">
      <div class="pet-panel-drag">
        <span class="pet-brand"><i></i>Focus Buddy</span>
        <div class="pet-panel-drag-end">
          ${tracker ? `<em class="pet-panel-state ${overloaded ? "is-overloaded" : ""}">${phaseBadge}</em>` : ""}
          <button data-action="open-dashboard" title="Open dashboard" aria-label="Open dashboard">${icon("external", 15)}</button>
          <button data-action="collapse-pet" title="Minimize to buddy" aria-label="Minimize companion">${icon("close", 15)}</button>
        </div>
      </div>
      <div class="pet-panel-body">
        <span class="mini-pet pet-${petStyle}">${petStyle === "custom" && appState.settings.customPetIcon ? `<img src="${escapeHtml(appState.settings.customPetIcon)}" alt="Custom focus buddy"/>` : "<i></i><i></i><em></em>"}</span>
        <div class="pet-status"><strong data-dynamic="tracker-time">${formatClock(displayMs)}</strong><span data-dynamic="tracker-task">${escapeHtml(tracker?.task || taskFallback)}</span><small data-dynamic="today-total">${formatDuration(todayTotal(), true)} today</small></div>
        <div class="pet-controls">
          ${tracker
            ? `<button data-action="${paused ? "resume" : "pause"}" title="${paused ? "Resume" : "Pause"}" aria-label="${paused ? "Resume" : "Pause"}">${icon(paused ? "play" : "pause", 19)}</button>
               <button class="pet-secondary-control" data-action="stop" title="Stop and save" aria-label="Stop and save timer">${icon("stop", 15)}</button>`
            : `<button data-action="start" title="Start timer" aria-label="Start timer">${icon("play", 19)}</button>`}
        </div>
      </div>
      ${tracker
        ? `<div class="pet-ledger-context">${icon("briefcase", 13)}<span>${onBreak ? "Recovery time · not logged as work" : `${escapeHtml(tracker.project || "Unsorted")} &middot; ${paused ? "time so far is already in the ledger" : "saves to the work ledger when you pause or stop"}`}</span></div>`
        : `<div class="pet-entry-fields"><input id="pet-task" maxlength="120" placeholder="What are you working on?" aria-label="Task name" value="${escapeHtml(stickyFocusTask())}"/><input id="pet-project" maxlength="80" placeholder="Project / area" aria-label="Project or area" value="${escapeHtml(stickyFocusProject())}"/></div>`}
      ${petNotesSection()}
    </div>`;
  }

  if (mode === "compact") {
    return `<div class="compact-widget ${tracker ? "is-running" : ""} ${onBreak ? "is-break" : ""}">
      <div class="compact-drag"><span class="${statusDot}"></span></div>
      <div class="compact-time"><strong data-dynamic="tracker-time">${formatClock(displayMs)}</strong><span data-dynamic="tracker-task">${escapeHtml(tracker?.task || taskFallback)}</span></div>
      <button class="compact-control" data-action="${tracker ? (paused ? "resume" : "pause") : "start"}" title="${tracker ? (paused ? "Resume" : "Pause") : "Start timer"}">${icon(tracker && !paused ? "pause" : "play", 17)}</button>
      ${tracker ? `<button class="compact-control stop" data-action="stop" title="Stop and save">${icon("stop", 15)}</button>` : ""}
      <button class="compact-open" data-action="open-dashboard" title="Dashboard">${icon("external", 15)}</button>
      <button class="compact-hide" data-action="hide-widget" title="Hide">${icon("close", 13)}</button>
    </div>`;
  }

  return `<div class="widget-shell ${onBreak ? "is-break" : ""}">
    <div class="widget-drag">
      <span class="widget-brand">${icon("clock", 16)} FOCUS HOURS</span>
      <button class="widget-close" data-action="hide-widget" title="Hide mini timer">${icon("close", 15)}</button>
    </div>
    <div class="widget-content">
      <div class="widget-time">
        <strong data-dynamic="tracker-time">${formatClock(displayMs)}</strong>
        <span data-dynamic="tracker-task">${escapeHtml(tracker?.task || taskFallback)}</span>
      </div>
      <div class="widget-actions">
        ${tracker
          ? `<button class="widget-control" data-action="${paused ? "resume" : "pause"}" title="${paused ? "Resume" : "Pause"}">${icon(paused ? "play" : "pause", 18)}</button>
             <button class="widget-control stop" data-action="stop" title="Stop and save">${icon("stop", 16)}</button>`
          : `<button class="widget-control" data-action="start" title="Start timer">${icon("play", 18)}</button>`}
        <button class="widget-open" data-action="open-dashboard" title="Open dashboard">${icon("external", 17)}</button>
      </div>
    </div>
    <div class="widget-footer"><span data-dynamic="today-total">${formatDuration(todayTotal(), true)} today</span><i class="${statusDot}"></i></div>
  </div>`;
}

function render(force = false) {
  const key = renderKey(appState);
  if (!force && key === lastRenderKey) {
    updateDynamic();
    syncNotepadField();
    return;
  }
  // Keep the drop video mounted so state broadcasts do not restart playback mid-clip.
  if (isWidget && petVideoPlaying && !force && document.querySelector("[data-pet-video='true']")) {
    const video = document.querySelector(".pet-drop-video");
    if (video) video.muted = !appState.settings.petDropVideoSound;
    syncPetDropVideoSize();
    lastRenderKey = key;
    updateDynamic();
    return;
  }
  lastRenderKey = key;
  document.body.classList.toggle("widget-body", isWidget);
  document.documentElement.classList.toggle("widget-html", isWidget);
  if (isWidget) {
    const buddySize = Math.max(BUDDY_SIZE_MIN, Math.min(BUDDY_SIZE_MAX, appState.settings.buddySize || 62));
    document.documentElement.style.setProperty("--buddy-scale", String(buddySize / 62));
    document.documentElement.style.setProperty("--buddy-extra", `${Math.max(0, buddySize - 62)}px`);
    syncPetDropVideoSize();
    const typing = captureWidgetTyping();
    appRoot.innerHTML = widgetView();
    restoreWidgetTyping(typing);
    if (petVideoPlaying) bindPetDropVideo();
    return;
  }
  const typing = captureTyping();
  appRoot.innerHTML = currentPage === "overview"
    ? overviewPage()
    : currentPage === "history"
      ? historyPage()
      : currentPage === "pomodoro"
        ? pomodoroPage()
        : currentPage === "settings"
          ? settingsPage()
          : aboutPage();
  restoreTyping(typing);
  paintFocusRing();
  ensureFocusRingLoop();
}

function setNotesStatus(message) {
  const status = document.querySelector('[data-dynamic="notes-status"]');
  if (status) status.textContent = message;
}

function queueNotepadSave(value) {
  setNotesStatus("Saving…");
  clearTimeout(notepadSaveTimer);
  notepadSaveTimer = setTimeout(() => {
    api.saveNotepad(value)
      .then(() => setNotesStatus("Autosaved"))
      .catch((error) => showToast(error.message || "Could not save your notes", "error"));
  }, 400);
}

function flushNotepadSave() {
  const field = document.querySelector("#pet-notepad");
  if (!field) return;
  clearTimeout(notepadSaveTimer);
  if (field.value === (appState.notepad || "")) return;
  api.saveNotepad(field.value).catch(() => {});
}

// Notes are excluded from the render key so typing never rebuilds the panel; instead the
// field is refreshed only while the writer is not in it.
function syncNotepadField() {
  const field = document.querySelector("#pet-notepad");
  if (!field || field === document.activeElement) return;
  const next = appState.notepad || "";
  if (field.value !== next) field.value = next;
}

// Re-renders wipe inputs, so half-typed text and the caret are carried across.
function captureTyping(selector = ".pet-panel input, .pet-panel textarea, #focus-task, #focus-project, #quick-task, #quick-project") {
  const active = document.activeElement;
  if (!active?.id || !active.matches?.(selector)) return null;
  return { id: active.id, value: active.value, start: active.selectionStart, end: active.selectionEnd };
}

function restoreTyping(typing) {
  if (!typing) return;
  const input = document.getElementById(typing.id);
  if (!input) return;
  input.value = typing.value;
  input.focus();
  input.setSelectionRange?.(typing.start, typing.end);
}

function captureWidgetTyping() {
  return captureTyping(".pet-panel input, .pet-panel textarea");
}

function restoreWidgetTyping(typing) {
  restoreTyping(typing);
}

let focusRingRaf = 0;

function liveCountdownMs() {
  const tracker = appState.tracker;
  if (!tracker?.endsAt) return null;
  if (tracker.pausedAt) return Math.max(0, tracker.remainingMs ?? 0);
  return Math.max(0, tracker.endsAt - Date.now());
}

function focusRingProgress(remainingMs = liveCountdownMs()) {
  const tracker = appState.tracker;
  if (!tracker?.endsAt || remainingMs == null) return 100;
  const total = Math.max(1, tracker.endsAt - tracker.startedAt);
  return Math.max(0, Math.min(100, (remainingMs / total) * 100));
}

function paintFocusRing() {
  const rings = document.querySelectorAll(".focus-ring");
  if (!rings.length) return false;
  const tracker = appState.tracker;
  const remaining = liveCountdownMs();
  const progress = focusRingProgress(remaining);
  const ticking = Boolean(tracker?.endsAt && !tracker.pausedAt && (remaining ?? 0) > 0);
  const overloaded = trackerIsOverloaded();
  rings.forEach((el) => {
    el.style.setProperty("--progress", progress.toFixed(3));
    el.classList.toggle("is-ticking", ticking);
    el.classList.toggle("paused", Boolean(tracker?.pausedAt));
    el.classList.toggle("is-overloaded", overloaded);
  });
  document.querySelectorAll(".focus-stage").forEach((el) => el.classList.toggle("is-overloaded", overloaded));
  document.querySelectorAll(".phase-pill").forEach((el) => el.classList.toggle("is-overloaded", overloaded));
  return ticking;
}

function ensureFocusRingLoop() {
  if (focusRingRaf || isWidget) return;
  const step = () => {
    focusRingRaf = 0;
    if (paintFocusRing()) focusRingRaf = requestAnimationFrame(step);
  };
  focusRingRaf = requestAnimationFrame(step);
}

function updateDynamic() {
  const tracker = appState.tracker;
  const time = tracker ? (tracker.remainingMs ?? tracker.elapsedMs) : (isWidget ? 0 : appState.settings.workMinutes * 60_000);
  const onBreak = trackerIsBreak();
  const paused = trackerIsPaused();
  const overloaded = trackerIsOverloaded();
  const taskFallback = onBreak
    ? (tracker.phase === "long-break" ? "Long break" : "Short break")
    : (isWidget ? "Ready to focus" : "What are you working on?");
  document.querySelectorAll('[data-dynamic="tracker-time"]').forEach((el) => { el.textContent = formatClock(time); });
  document.querySelectorAll('[data-dynamic="tracker-task"]').forEach((el) => { el.textContent = tracker?.task || taskFallback; });
  document.querySelectorAll('[data-dynamic="today-total"]').forEach((el) => { el.textContent = `${formatDuration(todayTotal(), true)}${isWidget ? " today" : ""}`; });
  document.querySelectorAll('[data-dynamic="halo-time"]').forEach((el) => { el.textContent = haloTime(); });
  document.querySelectorAll('[data-dynamic="focus-status"]').forEach((el) => {
    el.textContent = pomodoroStatusLabel(tracker, onBreak, paused, overloaded);
  });
  paintFocusRing();
  ensureFocusRingLoop();
}

let timerChimeContext = null;

function playTimerEndSound(completedKind) {
  if (appState?.settings?.timerEndSound === false) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!timerChimeContext || timerChimeContext.state === "closed") timerChimeContext = new AudioCtx();
    const ctx = timerChimeContext;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const isBreakEnd = completedKind === "break";
    // Focus end: soft descending chime. Break end: brighter ascending chime.
    const notes = isBreakEnd
      ? [{ f: 523.25, t: 0 }, { f: 659.25, t: 0.16 }, { f: 783.99, t: 0.32 }]
      : [{ f: 659.25, t: 0 }, { f: 523.25, t: 0.18 }, { f: 392, t: 0.36 }];
    const now = ctx.currentTime;
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = note.f;
      gain.gain.setValueAtTime(0.0001, now + note.t);
      gain.gain.exponentialRampToValueAtTime(0.18, now + note.t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.t + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.t);
      osc.stop(now + note.t + 0.45);
    }
  } catch {
    // Ignore audio failures — visual cues still cover completion.
  }
}

function handleTimerCompleted(payload) {
  const kind = payload?.completed?.kind;
  if (!payload?.silent) playTimerEndSound(kind);
  if (isWidget) return;
  if (kind === "pomodoro") showToast("Focus round complete — time to rest");
  else if (kind === "break") showToast("Break over — ready to focus again");
  else showToast("Timer finished");
}

function scheduleMotivationQuote(initial = false) {
  if (!isWidget) return;
  clearTimeout(quoteScheduleTimer);
  const delay = initial
    ? (90 + Math.random() * 90) * 1000
    : (25 + Math.random() * 20) * 60_000;
  quoteScheduleTimer = setTimeout(showMotivationQuote, delay);
}

async function showMotivationQuote() {
  if (petOpen || petVideoPlaying || motivationQuote || appState.settings.widgetDisplay !== "pet") {
    scheduleMotivationQuote(false);
    return;
  }
  const quote = await api.getMotivationalQuote();
  if (!quote) {
    scheduleMotivationQuote(false);
    return;
  }
  const buddySize = Math.max(BUDDY_SIZE_MIN, Math.min(BUDDY_SIZE_MAX, appState.settings.buddySize || 62));
  const collapsedWidth = Math.max(buddySize + 14, HALO_MIN_WIDTH);
  const collapsedHeight = buddySize + 14 + HALO_BLOCK;
  const quoteWidth = 350 + Math.max(0, buddySize - 62);
  const quoteHeight = 152 + Math.max(0, buddySize - 62) + HALO_BLOCK;
  const availableLeft = window.screenX - (window.screen.availLeft || 0);
  const availableTop = window.screenY - (window.screen.availTop || 0);
  const availableRight = (window.screen.availLeft || 0) + window.screen.availWidth - (window.screenX + collapsedWidth);
  const availableBottom = (window.screen.availTop || 0) + window.screen.availHeight - (window.screenY + collapsedHeight);
  const horizontalGrowth = quoteWidth - collapsedWidth;
  const verticalGrowth = quoteHeight - collapsedHeight;
  quotePlacement = {
    horizontal: availableLeft >= horizontalGrowth || availableLeft >= availableRight ? "left" : "right",
    vertical: availableTop >= verticalGrowth || availableTop >= availableBottom ? "up" : "down"
  };
  motivationQuote = quote;
  lastRenderKey = "";
  render(true);
  await api.setQuoteVisible(true, quotePlacement);
  clearTimeout(quoteDismissTimer);
  quoteDismissTimer = setTimeout(dismissMotivationQuote, 14_000);
}

function dismissMotivationQuote(scheduleNext = true) {
  if (!motivationQuote) return;
  motivationQuote = null;
  clearTimeout(quoteDismissTimer);
  lastRenderKey = "";
  render(true);
  api.setQuoteVisible(false);
  if (scheduleNext) scheduleMotivationQuote(false);
}

async function startPetDropVideo() {
  if (!isWidget || petOpen || petVideoPlaying || !appState.settings.petDropVideo) return;
  if (motivationQuote) dismissMotivationQuote(false);
  petVideoPlaying = true;
  widgetInteractive = true;
  lastRenderKey = "";
  render(true);
  try {
    await api.setWidgetVideo(true);
  } catch (error) {
    petVideoPlaying = false;
    lastRenderKey = "";
    render(true);
    showToast(error.message || "Could not play drop video", "error");
  }
}

function syncPetDropVideoSize() {
  const size = clampPetDropVideoSize(appState.settings.petDropVideoSize);
  document.documentElement.style.setProperty("--pet-video-size", `${size}px`);
  const shell = document.querySelector(".pet-video-shell");
  if (shell) {
    shell.style.width = `${size}px`;
    shell.style.height = `${size}px`;
  }
  const canvas = document.querySelector(".pet-drop-canvas");
  if (canvas && (canvas.width !== size || canvas.height !== size)) {
    canvas.width = size;
    canvas.height = size;
  }
}

function stopPetDropVideoLoop() {
  if (!petVideoFrameHandle) return;
  if (petVideoFrameTarget?.cancelVideoFrameCallback) {
    try { petVideoFrameTarget.cancelVideoFrameCallback(petVideoFrameHandle); } catch {}
  } else {
    cancelAnimationFrame(petVideoFrameHandle);
  }
  petVideoFrameHandle = 0;
  petVideoFrameTarget = null;
}

function paintPetDropVideoFrame(video, canvas) {
  if (!video.videoWidth || !video.videoHeight) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: true });
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
  const drawW = Math.max(1, Math.round(video.videoWidth * scale));
  const drawH = Math.max(1, Math.round(video.videoHeight * scale));
  const dx = Math.round((width - drawW) / 2);
  const dy = Math.round((height - drawH) / 2);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(video, dx, dy, drawW, drawH);
  const frame = ctx.getImageData(0, 0, width, height);
  punchCheckerboardBackground(frame);
  ctx.putImageData(frame, 0, 0);
}

function bindPetDropVideo() {
  const video = document.querySelector(".pet-drop-video");
  const canvas = document.querySelector(".pet-drop-canvas");
  if (!video || !canvas) {
    endPetDropVideo();
    return;
  }
  stopPetDropVideoLoop();
  video.muted = !appState.settings.petDropVideoSound;
  const finish = () => endPetDropVideo();
  video.addEventListener("ended", finish, { once: true });
  video.addEventListener("error", finish, { once: true });

  const schedule = () => {
    if (!petVideoPlaying) return;
    if (typeof video.requestVideoFrameCallback === "function") {
      petVideoFrameTarget = video;
      petVideoFrameHandle = video.requestVideoFrameCallback(() => {
        if (!petVideoPlaying) return;
        paintPetDropVideoFrame(video, canvas);
        schedule();
      });
      return;
    }
    petVideoFrameTarget = null;
    petVideoFrameHandle = requestAnimationFrame(() => {
      if (!petVideoPlaying) return;
      paintPetDropVideoFrame(video, canvas);
      schedule();
    });
  };

  const startPlayback = () => {
    schedule();
  };

  video.play().then(startPlayback).catch(() => {
    // Autoplay with sound can be blocked; retry muted so the clip still finishes.
    if (!video.muted) {
      video.muted = true;
      video.play().then(startPlayback).catch(finish);
      return;
    }
    finish();
  });
}

async function endPetDropVideo() {
  if (!petVideoPlaying && !petVideoFrameHandle) return;
  stopPetDropVideoLoop();
  const video = document.querySelector(".pet-drop-video");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  if (!petVideoPlaying) return;
  petVideoPlaying = false;
  lastRenderKey = "";
  render(true);
  try {
    await api.setWidgetVideo(false);
  } catch {
    // Window restore is best-effort; the pet is already back in the DOM.
  }
}

function toDateTimeLocal(timestamp) {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
}

function openManualModal(sessionId = null) {
  editingSessionId = sessionId;
  const session = appState.sessions.find((item) => item.id === sessionId);
  const now = Date.now();
  const defaultEnd = new Date(Math.floor(now / 300_000) * 300_000).getTime();
  const defaultStart = defaultEnd - 60 * 60_000;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<form class="modal" id="manual-form">
    <div class="modal-header"><div><span class="section-kicker">${session ? "EDIT SESSION" : "MANUAL ENTRY"}</span><h2>${session ? "Adjust work time" : "Log work you already did"}</h2></div><button type="button" class="icon-button" data-action="close-modal">${icon("close", 20)}</button></div>
    <p class="modal-intro">Add the real start and finish time. The duration is calculated for you.</p>
    <label class="field full"><span>What did you work on?</span><input name="task" maxlength="120" placeholder="e.g. Client proposal" value="${escapeHtml(session?.task || "")}" autofocus/></label>
    <label class="field full"><span>Project or area <em>Optional</em></span><input name="project" maxlength="80" placeholder="e.g. LawConnect, Finance, Personal" value="${escapeHtml(session?.project || "")}"/></label>
    <div class="modal-field-grid">
      <label class="field"><span>Started</span><input type="datetime-local" name="startedAt" value="${toDateTimeLocal(session?.startedAt || defaultStart)}" required/></label>
      <label class="field"><span>Finished</span><input type="datetime-local" name="endedAt" value="${toDateTimeLocal(session?.endedAt || defaultEnd)}" required/></label>
    </div>
    <label class="field full"><span>Note <em>Optional</em></span><textarea name="note" maxlength="500" rows="3" placeholder="Add context you may want later…">${escapeHtml(session?.note || "")}</textarea></label>
    <div class="duration-preview"><span>Time to add</span><strong id="duration-preview">1 hr</strong></div>
    <div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button primary" type="submit">${session ? "Save changes" : "Add to work history"}</button></div>
  </form>`;
  document.body.append(modal);
  updateDurationPreview(modal);
  modal.querySelectorAll('input[type="datetime-local"]').forEach((input) => input.addEventListener("input", () => updateDurationPreview(modal)));
  setTimeout(() => modal.querySelector('input[name="task"]').focus(), 50);
}

function updateDurationPreview(modal) {
  const start = new Date(modal.querySelector('[name="startedAt"]').value).getTime();
  const end = new Date(modal.querySelector('[name="endedAt"]').value).getTime();
  const preview = modal.querySelector("#duration-preview");
  preview.textContent = Number.isFinite(start) && Number.isFinite(end) && end > start ? formatDuration(end - start) : "Check times";
  preview.classList.toggle("invalid", !(end > start));
}

function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
  editingSessionId = null;
  pendingDeletionRange = null;
  pendingDeleteSessionId = null;
  pendingImportBackup = null;
}

document.addEventListener("click", async (event) => {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    currentPage = pageButton.dataset.page;
    lastRenderKey = "";
    render(true);
    return;
  }
  const settingsSectionButton = event.target.closest("[data-settings-section]");
  if (settingsSectionButton) {
    settingsSection = settingsSectionButton.dataset.settingsSection;
    lastRenderKey = "";
    render(true);
    return;
  }
  const rangeButton = event.target.closest("[data-range]");
  if (rangeButton) {
    selectedRange = rangeButton.dataset.range;
    historyPeriodOffset = 0;
    ledgerPageIndex = 1;
    lastRenderKey = "";
    render(true);
    return;
  }
  const periodButton = event.target.closest("[data-history-period]");
  if (periodButton) {
    if (!periodButton.disabled && historyPeriodSupportsOffset()) {
      const direction = periodButton.dataset.historyPeriod;
      if (direction === "prev") historyPeriodOffset += 1;
      if (direction === "next") historyPeriodOffset = Math.max(0, historyPeriodOffset - 1);
      ledgerPageIndex = 1;
      lastRenderKey = "";
      render(true);
    }
    return;
  }
  const ledgerPageButton = event.target.closest("[data-ledger-page]");
  if (ledgerPageButton) {
    if (!ledgerPageButton.disabled) {
      const nextPage = Number(ledgerPageButton.dataset.ledgerPage);
      if (Number.isFinite(nextPage) && nextPage >= 1 && nextPage !== ledgerPageIndex) {
        ledgerPageIndex = nextPage;
        lastRenderKey = "";
        render(true);
      }
    }
    return;
  }
  const target = event.target.closest("[data-action], [data-start-kind], [data-edit], [data-delete]");
  if (!target) return;

  try {
    if (target.dataset.action === "manual") openManualModal();
    if (target.dataset.action === "prepare-data-reset") openDataResetModal();
    if (target.dataset.action === "close-modal") closeModal();
    if (target.dataset.action === "start") {
      await start("timer", isWidget && petOpen ? "#pet-task" : "#quick-task", isWidget && petOpen ? "#pet-project" : "#quick-project");
    }
    if (target.dataset.action === "start-pomodoro") await start("pomodoro", "#focus-task", "#focus-project");
    if (target.dataset.startKind) await start(target.dataset.startKind);
    if (target.dataset.action === "extend-2") {
      await api.extendTracker(2);
      showToast("Added +2 minutes · overtime");
    }
    if (target.dataset.action === "stop") {
      await api.stopTracker(true);
      showToast("Session saved to your history");
    }
    if (target.dataset.action === "pause") {
      await api.pauseTracker();
      showToast("Paused · time so far is saved");
    }
    if (target.dataset.action === "resume") {
      await api.resumeTracker();
      showToast("Back to focus");
    }
    if (target.dataset.action === "toggle-notes") {
      if (petNotesOpen) flushNotepadSave();
      petNotesOpen = !petNotesOpen;
      widgetInteractive = true;
      await api.setWidgetExpanded(true, petNotesOpen);
      lastRenderKey = "";
      render(true);
      if (petNotesOpen) document.querySelector("#pet-notepad")?.focus();
    }
    if (target.dataset.action === "show-widget") {
      await api.setWidgetVisible(true);
      showToast("Mini timer is now visible");
    }
    if (target.dataset.action === "hide-widget") await api.hideWindow();
    if (target.dataset.action === "dismiss-quote") dismissMotivationQuote(true);
    if (target.dataset.action === "collapse-pet") {
      await collapsePetPanel();
    }
    if (target.dataset.action === "open-dashboard") await api.openDashboard();
    if (target.dataset.action === "choose-custom-pet") {
      const chosen = await api.chooseCustomPet();
      if (chosen) showToast("Custom focus buddy applied");
    }
    if (target.dataset.action === "choose-drop-video") {
      const chosen = await api.choosePetDropVideo();
      if (chosen) showToast("Drop animation video ready");
    }
    if (target.dataset.action === "clear-drop-video") {
      if (petVideoPlaying) await endPetDropVideo();
      await api.clearPetDropVideo();
      showToast("Drop animation video removed");
    }
    if (target.dataset.action === "test-whatsapp") {
      await collectAndSaveWhatsAppSettings();
      const result = await api.testWhatsAppIntegration();
      showToast(result?.hint || "WhatsApp test accepted by Meta");
    }
    if (target.dataset.action === "sample-whatsapp") {
      await collectAndSaveWhatsAppSettings();
      const result = await api.sendWhatsAppSample("focusEnd");
      if (result?.ok) showToast(result.hint || "Sample alert sent");
      else showToast(result?.error || "Sample alert failed", "error");
    }
    if (target.dataset.action === "reset-whatsapp-message" && target.dataset.event) {
      const field = document.querySelector(`[name="wa-message-${target.dataset.event}"]`);
      if (field) field.value = WHATSAPP_MESSAGE_DEFAULTS[target.dataset.event] || "";
      showToast("Message reset to default");
    }
    if (target.dataset.action === "export-data") {
      const result = await api.exportData();
      if (!result?.canceled) showToast(`Backup saved · ${result.sessionCount} session${result.sessionCount === 1 ? "" : "s"}`);
    }
    if (target.dataset.action === "import-data") {
      const preview = await api.chooseImportData();
      if (!preview?.canceled) openImportModeModal(preview);
    }
    if (target.dataset.action === "confirm-import" && pendingImportBackup) {
      const mode = target.dataset.mode === "merge" ? "merge" : "replace";
      const backup = pendingImportBackup;
      const result = await api.applyImportData({ mode, backup });
      closeModal();
      settingsSection = "data";
      if (mode === "merge") {
        showToast(result.addedSessions
          ? `Merged ${result.addedSessions} new session${result.addedSessions === 1 ? "" : "s"}`
          : "No new sessions to merge");
      } else {
        showToast(`Import complete · ${result.importedSessions} session${result.importedSessions === 1 ? "" : "s"} restored`);
      }
    }
    if (target.dataset.action === "restore-session" && target.dataset.id) {
      await api.restoreSession(target.dataset.id);
      showToast("Session restored to your history");
    }
    if (target.dataset.action === "purge-session" && target.dataset.id) {
      await api.purgeDeletedSession(target.dataset.id);
      showToast("Entry permanently deleted");
    }
    if (target.dataset.action === "purge-all-deleted") {
      const count = (appState.deletedSessions || []).length;
      if (!count) return;
      const result = await api.purgeAllDeletedSessions();
      showToast(`${result.purgedCount} deleted entr${result.purgedCount === 1 ? "y" : "ies"} cleared`);
    }
    if (target.dataset.action === "confirm-data-reset" && pendingDeletionRange) {
      const range = pendingDeletionRange;
      const result = await api.deleteSessionsInRange(range);
      closeModal();
      settingsSection = "data";
      showToast(`${result.deletedCount} session${result.deletedCount === 1 ? "" : "s"} moved to Recently deleted`);
    }
    if (target.dataset.action === "confirm-session-delete" && pendingDeleteSessionId) {
      await api.deleteSession(pendingDeleteSessionId);
      closeModal();
      showToast("Session moved to Recently deleted");
    }
    if (target.dataset.edit) openManualModal(target.dataset.edit);
    if (target.dataset.delete) openSessionDeleteModal(target.dataset.delete);
  } catch (error) {
    showToast(error.message || "Something went wrong", "error");
  }
});

function commitFocusDraftFromInputs(taskSelector, projectSelector) {
  const taskEl = document.querySelector(taskSelector);
  const projectEl = document.querySelector(projectSelector);
  if (!taskEl && !projectEl) return;
  const draft = {
    task: taskEl?.value || "",
    project: projectEl?.value || ""
  };
  if (appState) appState.focusDraft = draft;
  api.saveFocusDraft(draft).catch(() => {});
}

async function start(kind, taskSelector = "#quick-task", projectSelector = "#quick-project") {
  const task = document.querySelector(taskSelector)?.value?.trim() || "";
  const project = document.querySelector(projectSelector)?.value?.trim() || "";
  if (kind === "pomodoro") {
    if (appState) appState.focusDraft = { task, project };
    await api.saveFocusDraft({ task, project }).catch(() => {});
  }
  await api.startTracker({ kind, task, project });
  showToast(kind === "pomodoro" ? "Focus session started" : "Timer started");
}

document.addEventListener("focusout", (event) => {
  const id = event.target?.id;
  if (id === "focus-task" || id === "focus-project") {
    commitFocusDraftFromInputs("#focus-task", "#focus-project");
    return;
  }
  if (id === "quick-task" || id === "quick-project") {
    commitFocusDraftFromInputs("#quick-task", "#quick-project");
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "pet-notepad") {
    queueNotepadSave(event.target.value);
    return;
  }
  if (event.target.id === "buddy-size") {
    const value = Number(event.target.value);
    const output = document.querySelector("#buddy-size-output");
    if (output) output.textContent = `${value}px`;
    clearTimeout(buddySizeTimer);
    buddySizeTimer = setTimeout(() => {
      api.updateSettings({ buddySize: value }).catch((error) => showToast(error.message || "Could not resize companion", "error"));
    }, 120);
    return;
  }
  if (event.target.id === "drop-video-size") {
    const value = clampPetDropVideoSize(event.target.value);
    const output = document.querySelector("#drop-video-size-output");
    if (output) output.textContent = `${value}px`;
    clearTimeout(dropVideoSizeTimer);
    dropVideoSizeTimer = setTimeout(() => {
      api.updateSettings({ petDropVideoSize: value }).catch((error) => showToast(error.message || "Could not resize drop video", "error"));
    }, 120);
    return;
  }
  if (event.target.id !== "history-search") return;
  historySearch = event.target.value;
  ledgerPageIndex = 1;
  clearTimeout(historySearchTimer);
  historySearchTimer = setTimeout(() => {
    lastRenderKey = "";
    render(true);
    const input = document.querySelector("#history-search");
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }, 180);
});

document.addEventListener("change", async (event) => {
  if (event.target.id === "history-source") {
    historySource = event.target.value;
    ledgerPageIndex = 1;
    lastRenderKey = "";
    render(true);
    return;
  }
  if (event.target.id === "history-page-size") {
    const nextSize = Number(event.target.value);
    if (HISTORY_PAGE_SIZES.includes(nextSize)) {
      historyPageSize = nextSize;
      ledgerPageIndex = 1;
      lastRenderKey = "";
      render(true);
    }
    return;
  }
  if (event.target.id === "data-period" || event.target.id === "data-from" || event.target.id === "data-to") {
    updateDataControl();
    return;
  }
  if (event.target.name === "widgetDisplay" || event.target.name === "petStyle") {
    try {
      await api.updateSettings({ [event.target.name]: event.target.value });
      showToast(event.target.name === "widgetDisplay" ? "Floating style applied" : "Focus buddy changed");
    } catch (error) {
      showToast(error.message || "Could not apply that choice", "error");
    }
    return;
  }
  if (event.target.name === "petDropVideoSound") {
    try {
      await api.updateSettings({ petDropVideoSound: event.target.checked });
      showToast(event.target.checked ? "Drop video sound on" : "Drop video sound off");
    } catch (error) {
      showToast(error.message || "Could not update sound setting", "error");
    }
    return;
  }
  if (event.target.name === "timerEndSound") {
    try {
      await api.updateSettings({ timerEndSound: event.target.checked });
      showToast(event.target.checked ? "Timer end sound on" : "Timer end sound off");
    } catch (error) {
      showToast(error.message || "Could not update sound setting", "error");
    }
    return;
  }
  if (event.target.name === "whatsappEnabled" || event.target.name?.startsWith("wa-enabled-")) {
    try {
      await collectAndSaveWhatsAppSettings();
      if (event.target.name === "whatsappEnabled") {
        showToast(event.target.checked ? "WhatsApp alerts on" : "WhatsApp alerts off");
      }
    } catch (error) {
      showToast(error.message || "Could not update WhatsApp settings", "error");
    }
  }
});

const WIDGET_HIT_AREAS = ".pet-orb, .pet-halo, .pet-panel, .pet-video-shell, .motivation-bubble, .compact-widget, .widget-shell";
const WIDGET_DRAG_BLOCKERS = "button, input, textarea, select, a, label, [contenteditable='true']";

async function collapsePetPanel() {
  if (!isWidget || !petOpen) return;
  flushNotepadSave();
  petOpen = false;
  petNotesOpen = false;
  lastRenderKey = "";
  render(true);
  try {
    await api.setWidgetExpanded(false);
  } catch (error) {
    showToast(error.message || "Could not minimize companion", "error");
  }
}

function beginWidgetDrag(event, el, kind) {
  event.preventDefault();
  widgetDragState = {
    kind,
    el,
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    lastX: event.screenX,
    lastY: event.screenY,
    moved: false
  };
  el.setPointerCapture?.(event.pointerId);
}

document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (petVideoPlaying) {
    const shell = event.target.closest(".pet-video-shell");
    if (shell) beginWidgetDrag(event, shell, "surface");
    return;
  }
  const pet = event.target.closest('.pet-orb[data-pet-trigger="true"]');
  if (pet) {
    beginWidgetDrag(event, pet, "pet");
    return;
  }
  if (!isWidget) return;
  // Click outside the expanded Focus Buddy panel → collapse back to the pet.
  if (petOpen && !event.target.closest(".pet-panel")) {
    collapsePetPanel();
    return;
  }
  if (event.target.closest(WIDGET_DRAG_BLOCKERS)) return;
  const surface = event.target.closest(".pet-panel, .pet-halo, .motivation-bubble, .compact-widget, .widget-shell");
  if (!surface) return;
  beginWidgetDrag(event, surface, "surface");
});

document.addEventListener("pointermove", (event) => {
  if (!widgetDragState || event.pointerId !== widgetDragState.pointerId) return;
  const totalDistance = Math.hypot(event.screenX - widgetDragState.startX, event.screenY - widgetDragState.startY);
  if (totalDistance > 4) {
    widgetDragState.moved = true;
    widgetDragState.el.classList.add("dragging");
  }
  if (!widgetDragState.moved) return;
  const dx = event.screenX - widgetDragState.lastX;
  const dy = event.screenY - widgetDragState.lastY;
  widgetDragState.lastX = event.screenX;
  widgetDragState.lastY = event.screenY;
  if (dx || dy) api.moveWidgetBy(dx, dy);
});

function finishWidgetDrag(event, cancelled = false) {
  if (!widgetDragState || event.pointerId !== widgetDragState.pointerId) return;
  const { kind, el, moved } = widgetDragState;
  el.classList.remove("dragging");
  el.releasePointerCapture?.(event.pointerId);
  widgetDragState = null;
  if (kind !== "pet" || cancelled) return;
  if (moved) {
    if (appState.settings.petDropVideo) startPetDropVideo();
    return;
  }
  if (motivationQuote) dismissMotivationQuote(false);
  petOpen = true;
  widgetInteractive = true;
  lastRenderKey = "";
  render(true);
  api.setWidgetExpanded(true, petNotesOpen).catch((error) => {
    petOpen = false;
    lastRenderKey = "";
    render(true);
    showToast(error.message || "Could not open companion", "error");
  });
}

document.addEventListener("pointerup", finishWidgetDrag);
document.addEventListener("pointercancel", (event) => finishWidgetDrag(event, true));

function syncWidgetInteractive(interactive) {
  if (interactive === widgetInteractive) return;
  widgetInteractive = interactive;
  api.setWidgetInteractive(interactive);
}

if (isWidget) {
  window.addEventListener("blur", () => {
    flushNotepadSave();
    // Clicking the desktop, dashboard, or any other window dismisses the panel.
    if (petOpen && !widgetDragState) collapsePetPanel();
  });
  window.addEventListener("beforeunload", flushNotepadSave);
  document.addEventListener("mousemove", (event) => {
    if (widgetDragState) return;
    syncWidgetInteractive(Boolean(event.target?.closest?.(WIDGET_HIT_AREAS)));
  });
  document.addEventListener("mouseleave", () => {
    if (!widgetDragState) syncWidgetInteractive(false);
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector(".modal-backdrop")) closeModal();
  if (event.key === "Escape" && isWidget && petVideoPlaying) {
    event.preventDefault();
    endPetDropVideo();
    return;
  }
  if (event.key === "Escape" && isWidget && petOpen) {
    event.preventDefault();
    collapsePetPanel();
    return;
  }
  if (event.key === "Enter" && (event.target.id === "pet-task" || event.target.id === "pet-project")) {
    event.preventDefault();
    start("timer", "#pet-task", "#pet-project").catch((error) => showToast(error.message || "Could not start timer", "error"));
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (event.target.id === "manual-form") {
      const wasEditing = Boolean(editingSessionId);
      const values = Object.fromEntries(new FormData(event.target));
      const payload = {
        id: editingSessionId,
        task: values.task,
        project: values.project,
        note: values.note,
        startedAt: new Date(values.startedAt).getTime(),
        endedAt: new Date(values.endedAt).getTime()
      };
      if (editingSessionId) await api.updateSession(payload);
      else await api.addSession(payload);
      closeModal();
      showToast(wasEditing ? "Session updated" : "Work time added");
    }
    if (event.target.id === "settings-form") {
      const form = event.target;
      const values = Object.fromEntries(new FormData(form));
      const patch = {};
      const assignNumber = (key) => {
        if (values[key] === undefined || values[key] === "") return;
        patch[key] = Number(values[key]);
      };
      if (settingsSection === "rhythm") {
        assignNumber("workMinutes");
        assignNumber("shortBreakMinutes");
        assignNumber("longBreakMinutes");
        assignNumber("roundsBeforeLongBreak");
        assignNumber("dailyGoalHours");
        if (form.autoStartBreaks) patch.autoStartBreaks = form.autoStartBreaks.checked;
        if (form.timerEndSound) patch.timerEndSound = form.timerEndSound.checked;
      } else if (settingsSection === "companion") {
        if (values.widgetDisplay) patch.widgetDisplay = values.widgetDisplay;
        if (values.petStyle) patch.petStyle = values.petStyle;
        assignNumber("buddySize");
        if (values.petDropVideoSize !== undefined) patch.petDropVideoSize = clampPetDropVideoSize(values.petDropVideoSize);
        if (form.petDropVideoSound) patch.petDropVideoSound = form.petDropVideoSound.checked;
        if (form.alwaysOnTop) patch.alwaysOnTop = form.alwaysOnTop.checked;
        if (form.launchWidget) patch.launchWidget = form.launchWidget.checked;
      } else if (settingsSection === "data") {
        assignNumber("deletedRetentionDays");
      } else if (settingsSection === "integrations") {
        await collectAndSaveWhatsAppSettings();
        showToast("Preferences saved");
        return;
      }
      if (Object.keys(patch).length) await api.updateSettings(patch);
      showToast("Preferences saved");
    }
  } catch (error) {
    showToast(error.message || "Could not save your changes", "error");
  }
});

async function init() {
  appState = await api.getState();
  render(true);
  api.onStateChanged((next) => {
    const previousWidgetDisplay = appState?.settings?.widgetDisplay;
    const previousDropVideo = appState?.settings?.petDropVideo;
    const settingsChanged = JSON.stringify(appState?.settings) !== JSON.stringify(next.settings);
    appState = next;
    if (isWidget && settingsChanged && motivationQuote) dismissMotivationQuote(false);
    if (isWidget && petVideoPlaying && !next.settings.petDropVideo) {
      endPetDropVideo();
      return;
    }
    if (isWidget && previousWidgetDisplay !== next.settings.widgetDisplay) {
      petOpen = false;
      if (petVideoPlaying) endPetDropVideo();
      if (motivationQuote) dismissMotivationQuote(false);
      scheduleMotivationQuote(false);
    }
    if (isWidget && petVideoPlaying && previousDropVideo && previousDropVideo !== next.settings.petDropVideo) {
      endPetDropVideo();
      return;
    }
    if (!isWidget && (document.activeElement?.id === "buddy-size" || document.activeElement?.id === "drop-video-size")) {
      lastRenderKey = renderKey(appState);
      return;
    }
    render();
  });
  api.onTimerTick((tick) => {
    appState.now = tick.now;
    appState.tracker = tick.tracker;
    appState.todayTotalMs = tick.todayTotalMs;
    updateDynamic();
  });
  api.onAppAction((action) => {
    if (action === "manual-log") openManualModal();
  });
  api.onTimerCompleted?.(handleTimerCompleted);
  api.onWhatsAppNotify?.((result) => {
    if (isWidget) return;
    if (result?.ok) showToast(result.hint || "WhatsApp alert sent");
    else if (result?.error) showToast(result.error, "error");
  });
  if (isWidget) scheduleMotivationQuote(true);
}

init().catch((error) => {
  appRoot.innerHTML = `<div class="fatal-error"><h1>Focus Hours could not start</h1><p>${escapeHtml(error.message)}</p></div>`;
});

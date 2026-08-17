const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("focusHours", {
  getState: () => ipcRenderer.invoke("state:get"),
  addSession: (session) => ipcRenderer.invoke("session:add", session),
  updateSession: (session) => ipcRenderer.invoke("session:update", session),
  deleteSession: (id) => ipcRenderer.invoke("session:delete", id),
  deleteSessionsInRange: (range) => ipcRenderer.invoke("session:delete-range", range),
  restoreSession: (id) => ipcRenderer.invoke("session:restore", id),
  purgeDeletedSession: (id) => ipcRenderer.invoke("session:purge", id),
  purgeAllDeletedSessions: () => ipcRenderer.invoke("session:purge-all-deleted"),
  exportData: () => ipcRenderer.invoke("data:export"),
  chooseImportData: () => ipcRenderer.invoke("data:choose-import"),
  applyImportData: (payload) => ipcRenderer.invoke("data:apply-import", payload),
  startTracker: (options) => ipcRenderer.invoke("tracker:start", options),
  stopTracker: (save = true) => ipcRenderer.invoke("tracker:stop", save),
  pauseTracker: () => ipcRenderer.invoke("tracker:pause"),
  resumeTracker: () => ipcRenderer.invoke("tracker:resume"),
  extendTracker: (minutes = 2) => ipcRenderer.invoke("tracker:extend", minutes),
  saveFocusDraft: (draft) => ipcRenderer.invoke("focus-draft:save", draft),
  saveNotepad: (text) => ipcRenderer.invoke("notepad:save", text),
  updateSettings: (settings) => ipcRenderer.invoke("settings:update", settings),
  testWhatsAppIntegration: () => ipcRenderer.invoke("integrations:whatsapp-test"),
  sendWhatsAppSample: (eventId) => ipcRenderer.invoke("integrations:whatsapp-sample", eventId),
  onWhatsAppNotify: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("integrations:whatsapp-notify", listener);
    return () => ipcRenderer.removeListener("integrations:whatsapp-notify", listener);
  },
  openDashboard: () => ipcRenderer.invoke("window:dashboard"),
  setWidgetVisible: (visible) => ipcRenderer.invoke("window:widget", visible),
  setWidgetExpanded: (expanded, notesOpen) => ipcRenderer.invoke("window:widget-expand", expanded, notesOpen),
  setQuoteVisible: (visible, placement) => ipcRenderer.invoke("window:widget-quote", visible, placement),
  setWidgetVideo: (visible) => ipcRenderer.invoke("window:widget-video", visible),
  getMotivationalQuote: () => ipcRenderer.invoke("quote:random"),
  moveWidgetBy: (x, y) => ipcRenderer.send("window:widget-move", { x, y }),
  setWidgetInteractive: (interactive) => ipcRenderer.send("window:widget-interactive", interactive),
  chooseCustomPet: () => ipcRenderer.invoke("pet:choose"),
  choosePetDropVideo: () => ipcRenderer.invoke("pet:choose-drop-video"),
  clearPetDropVideo: () => ipcRenderer.invoke("pet:clear-drop-video"),
  hideWindow: () => ipcRenderer.invoke("window:hide"),
  onStateChanged: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
  onTimerTick: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("timer:tick", listener);
    return () => ipcRenderer.removeListener("timer:tick", listener);
  },
  onTimerCompleted: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("timer:completed", listener);
    return () => ipcRenderer.removeListener("timer:completed", listener);
  },
  onAppAction: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("app:action", listener);
    return () => ipcRenderer.removeListener("app:action", listener);
  }
});

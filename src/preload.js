const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("focusHours", {
  getState: () => ipcRenderer.invoke("state:get"),
  addSession: (session) => ipcRenderer.invoke("session:add", session),
  updateSession: (session) => ipcRenderer.invoke("session:update", session),
  deleteSession: (id) => ipcRenderer.invoke("session:delete", id),
  deleteSessionsInRange: (range) => ipcRenderer.invoke("session:delete-range", range),
  startTracker: (options) => ipcRenderer.invoke("tracker:start", options),
  stopTracker: (save = true) => ipcRenderer.invoke("tracker:stop", save),
  updateSettings: (settings) => ipcRenderer.invoke("settings:update", settings),
  openDashboard: () => ipcRenderer.invoke("window:dashboard"),
  setWidgetVisible: (visible) => ipcRenderer.invoke("window:widget", visible),
  setWidgetExpanded: (expanded) => ipcRenderer.invoke("window:widget-expand", expanded),
  setQuoteVisible: (visible) => ipcRenderer.invoke("window:widget-quote", visible),
  getMotivationalQuote: () => ipcRenderer.invoke("quote:random"),
  moveWidgetBy: (x, y) => ipcRenderer.send("window:widget-move", { x, y }),
  chooseCustomPet: () => ipcRenderer.invoke("pet:choose"),
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
  onAppAction: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("app:action", listener);
    return () => ipcRenderer.removeListener("app:action", listener);
  }
});

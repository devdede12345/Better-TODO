"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // File operations
  newFile: () => electron.ipcRenderer.invoke("file:new"),
  openFile: () => electron.ipcRenderer.invoke("file:open"),
  saveFile: (content) => electron.ipcRenderer.invoke("file:save", content),
  saveFileAs: (content) => electron.ipcRenderer.invoke("file:saveAs", content),
  getDefaultFile: () => electron.ipcRenderer.invoke("file:getDefault"),
  getCurrentPath: () => electron.ipcRenderer.invoke("file:getCurrentPath"),
  getNextReminder: () => electron.ipcRenderer.invoke("reminder:getNext"),
  reminderSnoozeNext: (delayMs) => electron.ipcRenderer.invoke("reminder:snoozeNext", delayMs),
  reminderCompleteNext: () => electron.ipcRenderer.invoke("reminder:completeNext"),
  reminderSyncDraft: (content) => electron.ipcRenderer.send("reminder:syncDraft", content),
  onNativeMenuAction: (cb) => {
    const handler = (_event, action) => cb(action);
    electron.ipcRenderer.on("nativeMenu:action", handler);
    return () => electron.ipcRenderer.removeListener("nativeMenu:action", handler);
  },
  // Sticker operations
  stickerToggle: () => electron.ipcRenderer.invoke("sticker:toggle"),
  stickerIsVisible: () => electron.ipcRenderer.invoke("sticker:isVisible"),
  widgetToggle: () => electron.ipcRenderer.invoke("widget:toggle"),
  widgetIsVisible: () => electron.ipcRenderer.invoke("widget:isVisible"),
  stickerSetLocked: (locked) => electron.ipcRenderer.invoke("sticker:setLocked", locked),
  stickerGetLocked: () => electron.ipcRenderer.invoke("sticker:getLocked"),
  stickerToggleTask: (lineIndex) => electron.ipcRenderer.invoke("sticker:toggleTask", lineIndex),
  stickerSyncContent: (content, fileName) => electron.ipcRenderer.send("sticker:syncContent", content, fileName),
  stickerRequestContent: () => electron.ipcRenderer.invoke("sticker:requestContent"),
  stickerBack: () => electron.ipcRenderer.invoke("sticker:back"),
  // Sticker listeners (used by the sticker window)
  onStickerUpdate: (cb) => {
    const handler = (_event, content, fileName) => cb(content, fileName);
    electron.ipcRenderer.on("sticker:update", handler);
    return () => electron.ipcRenderer.removeListener("sticker:update", handler);
  },
  onStickerLockState: (cb) => {
    const handler = (_event, locked) => cb(locked);
    electron.ipcRenderer.on("sticker:lockState", handler);
    return () => electron.ipcRenderer.removeListener("sticker:lockState", handler);
  },
  onStickerVisibility: (cb) => {
    const handler = (_event, visible) => cb(visible);
    electron.ipcRenderer.on("sticker:visibility", handler);
    return () => electron.ipcRenderer.removeListener("sticker:visibility", handler);
  },
  onWidgetVisibility: (cb) => {
    const handler = (_event, visible) => cb(visible);
    electron.ipcRenderer.on("widget:visibility", handler);
    return () => electron.ipcRenderer.removeListener("widget:visibility", handler);
  },
  // Quick Entry
  quickEntrySubmit: (text) => electron.ipcRenderer.invoke("quickentry:submit", text),
  quickEntryHide: () => electron.ipcRenderer.invoke("quickentry:hide"),
  onQuickEntryShow: (cb) => {
    electron.ipcRenderer.on("quickentry:show", () => cb());
    return () => electron.ipcRenderer.removeAllListeners("quickentry:show");
  },
  // Main window listener for appended tasks
  onTaskAppended: (cb) => {
    const handler = (_event, task) => cb(task);
    electron.ipcRenderer.on("editor:taskAppended", handler);
    return () => electron.ipcRenderer.removeListener("editor:taskAppended", handler);
  },
  // System settings
  systemGetSettings: () => electron.ipcRenderer.invoke("system:getSettings"),
  systemSetAutoLaunch: (enabled) => electron.ipcRenderer.invoke("system:setAutoLaunch", enabled),
  systemSetMinimizeToTray: (enabled) => electron.ipcRenderer.invoke("system:setMinimizeToTray", enabled)
});

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
  // Sticker operations
  stickerToggle: () => electron.ipcRenderer.invoke("sticker:toggle"),
  stickerIsVisible: () => electron.ipcRenderer.invoke("sticker:isVisible"),
  stickerSetLocked: (locked) => electron.ipcRenderer.invoke("sticker:setLocked", locked),
  stickerGetLocked: () => electron.ipcRenderer.invoke("sticker:getLocked"),
  stickerSyncContent: (content) => electron.ipcRenderer.send("sticker:syncContent", content),
  // Sticker listeners (used by the sticker window)
  onStickerUpdate: (cb) => {
    const handler = (_event, content) => cb(content);
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
  }
});

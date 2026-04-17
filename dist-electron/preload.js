"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  newFile: () => electron.ipcRenderer.invoke("file:new"),
  openFile: () => electron.ipcRenderer.invoke("file:open"),
  saveFile: (content) => electron.ipcRenderer.invoke("file:save", content),
  saveFileAs: (content) => electron.ipcRenderer.invoke("file:saveAs", content),
  getDefaultFile: () => electron.ipcRenderer.invoke("file:getDefault"),
  getCurrentPath: () => electron.ipcRenderer.invoke("file:getCurrentPath")
});

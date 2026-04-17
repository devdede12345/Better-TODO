import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  newFile: () => ipcRenderer.invoke("file:new"),
  openFile: () => ipcRenderer.invoke("file:open"),
  saveFile: (content: string) => ipcRenderer.invoke("file:save", content),
  saveFileAs: (content: string) => ipcRenderer.invoke("file:saveAs", content),
  getDefaultFile: () => ipcRenderer.invoke("file:getDefault"),
  getCurrentPath: () => ipcRenderer.invoke("file:getCurrentPath"),
});

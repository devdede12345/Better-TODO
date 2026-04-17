import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // File operations
  newFile: () => ipcRenderer.invoke("file:new"),
  openFile: () => ipcRenderer.invoke("file:open"),
  saveFile: (content: string) => ipcRenderer.invoke("file:save", content),
  saveFileAs: (content: string) => ipcRenderer.invoke("file:saveAs", content),
  getDefaultFile: () => ipcRenderer.invoke("file:getDefault"),
  getCurrentPath: () => ipcRenderer.invoke("file:getCurrentPath"),

  // Sticker operations
  stickerToggle: () => ipcRenderer.invoke("sticker:toggle"),
  stickerIsVisible: () => ipcRenderer.invoke("sticker:isVisible"),
  stickerSetLocked: (locked: boolean) => ipcRenderer.invoke("sticker:setLocked", locked),
  stickerGetLocked: () => ipcRenderer.invoke("sticker:getLocked"),
  stickerSyncContent: (content: string) => ipcRenderer.send("sticker:syncContent", content),

  // Sticker listeners (used by the sticker window)
  onStickerUpdate: (cb: (content: string) => void) => {
    const handler = (_event: any, content: string) => cb(content);
    ipcRenderer.on("sticker:update", handler);
    return () => ipcRenderer.removeListener("sticker:update", handler);
  },
  onStickerLockState: (cb: (locked: boolean) => void) => {
    const handler = (_event: any, locked: boolean) => cb(locked);
    ipcRenderer.on("sticker:lockState", handler);
    return () => ipcRenderer.removeListener("sticker:lockState", handler);
  },
  onStickerVisibility: (cb: (visible: boolean) => void) => {
    const handler = (_event: any, visible: boolean) => cb(visible);
    ipcRenderer.on("sticker:visibility", handler);
    return () => ipcRenderer.removeListener("sticker:visibility", handler);
  },
});

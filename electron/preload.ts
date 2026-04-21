import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // File operations
  newFile: () => ipcRenderer.invoke("file:new"),
  openFile: () => ipcRenderer.invoke("file:open"),
  saveFile: (content: string) => ipcRenderer.invoke("file:save", content),
  saveFileAs: (content: string) => ipcRenderer.invoke("file:saveAs", content),
  getDefaultFile: () => ipcRenderer.invoke("file:getDefault"),
  getCurrentPath: () => ipcRenderer.invoke("file:getCurrentPath"),
  getNextReminder: () => ipcRenderer.invoke("reminder:getNext"),
  reminderSnoozeNext: (delayMs: number) => ipcRenderer.invoke("reminder:snoozeNext", delayMs),
  reminderCompleteNext: () => ipcRenderer.invoke("reminder:completeNext"),
  reminderSyncDraft: (content: string) => ipcRenderer.send("reminder:syncDraft", content),
  onNativeMenuAction: (cb: (action: string) => void) => {
    const handler = (_event: any, action: string) => cb(action);
    ipcRenderer.on("nativeMenu:action", handler);
    return () => ipcRenderer.removeListener("nativeMenu:action", handler);
  },

  // Sticker operations
  stickerToggle: () => ipcRenderer.invoke("sticker:toggle"),
  stickerIsVisible: () => ipcRenderer.invoke("sticker:isVisible"),
  widgetToggle: () => ipcRenderer.invoke("widget:toggle"),
  widgetIsVisible: () => ipcRenderer.invoke("widget:isVisible"),
  stickerSetLocked: (locked: boolean) => ipcRenderer.invoke("sticker:setLocked", locked),
  stickerGetLocked: () => ipcRenderer.invoke("sticker:getLocked"),
  stickerToggleTask: (lineIndex: number) => ipcRenderer.invoke("sticker:toggleTask", lineIndex),
  stickerDeleteTask: (lineIndex: number) => ipcRenderer.invoke("sticker:deleteTask", lineIndex),
  stickerAddTask: (text: string) => ipcRenderer.invoke("sticker:addTask", text),
  stickerSyncContent: (content: string, fileName: string) => ipcRenderer.send("sticker:syncContent", content, fileName),
  stickerRequestContent: () => ipcRenderer.invoke("sticker:requestContent"),
  stickerBack: () => ipcRenderer.invoke("sticker:back"),

  // Sticker listeners (used by the sticker window)
  onStickerUpdate: (cb: (content: string, fileName: string) => void) => {
    const handler = (_event: any, content: string, fileName: string) => cb(content, fileName);
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
  onWidgetVisibility: (cb: (visible: boolean) => void) => {
    const handler = (_event: any, visible: boolean) => cb(visible);
    ipcRenderer.on("widget:visibility", handler);
    return () => ipcRenderer.removeListener("widget:visibility", handler);
  },

  // Quick Entry
  quickEntrySubmit: (text: string) => ipcRenderer.invoke("quickentry:submit", text),
  quickEntryHide: () => ipcRenderer.invoke("quickentry:hide"),
  onQuickEntryShow: (cb: () => void) => {
    ipcRenderer.on("quickentry:show", () => cb());
    return () => ipcRenderer.removeAllListeners("quickentry:show");
  },
  // Main window listener for appended tasks
  onTaskAppended: (cb: (task: string) => void) => {
    const handler = (_event: any, task: string) => cb(task);
    ipcRenderer.on("editor:taskAppended", handler);
    return () => ipcRenderer.removeListener("editor:taskAppended", handler);
  },

  // Explorer
  explorerOpenFolder: () => ipcRenderer.invoke("explorer:openFolder"),
  explorerReadDir: (rootPath: string) => ipcRenderer.invoke("explorer:readDir", rootPath),
  explorerOpenFileByPath: (filePath: string) => ipcRenderer.invoke("explorer:openFileByPath", filePath),

  // System settings
  systemGetSettings: () => ipcRenderer.invoke("system:getSettings"),
  systemSetAutoLaunch: (enabled: boolean) => ipcRenderer.invoke("system:setAutoLaunch", enabled),
  systemSetMinimizeToTray: (enabled: boolean) => ipcRenderer.invoke("system:setMinimizeToTray", enabled),
  setTitleBarOverlay: (color: string, symbolColor: string) => ipcRenderer.invoke("system:setTitleBarOverlay", color, symbolColor),
});

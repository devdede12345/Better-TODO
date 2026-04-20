import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {
    // File operations
    newFile: () => ipcRenderer.invoke("file:new"),
    openFile: () => ipcRenderer.invoke("file:open"),
    saveFile: (content) => ipcRenderer.invoke("file:save", content),
    saveFileAs: (content) => ipcRenderer.invoke("file:saveAs", content),
    getDefaultFile: () => ipcRenderer.invoke("file:getDefault"),
    getCurrentPath: () => ipcRenderer.invoke("file:getCurrentPath"),
    getNextReminder: () => ipcRenderer.invoke("reminder:getNext"),
    reminderSnoozeNext: (delayMs) => ipcRenderer.invoke("reminder:snoozeNext", delayMs),
    reminderCompleteNext: () => ipcRenderer.invoke("reminder:completeNext"),
    reminderSyncDraft: (content) => ipcRenderer.send("reminder:syncDraft", content),
    onNativeMenuAction: (cb) => {
        const handler = (_event, action) => cb(action);
        ipcRenderer.on("nativeMenu:action", handler);
        return () => ipcRenderer.removeListener("nativeMenu:action", handler);
    },
    // Sticker operations
    stickerToggle: () => ipcRenderer.invoke("sticker:toggle"),
    stickerIsVisible: () => ipcRenderer.invoke("sticker:isVisible"),
    widgetToggle: () => ipcRenderer.invoke("widget:toggle"),
    widgetIsVisible: () => ipcRenderer.invoke("widget:isVisible"),
    stickerSetLocked: (locked) => ipcRenderer.invoke("sticker:setLocked", locked),
    stickerGetLocked: () => ipcRenderer.invoke("sticker:getLocked"),
    stickerToggleTask: (lineIndex) => ipcRenderer.invoke("sticker:toggleTask", lineIndex),
    stickerSyncContent: (content, fileName) => ipcRenderer.send("sticker:syncContent", content, fileName),
    stickerRequestContent: () => ipcRenderer.invoke("sticker:requestContent"),
    stickerBack: () => ipcRenderer.invoke("sticker:back"),
    // Sticker listeners (used by the sticker window)
    onStickerUpdate: (cb) => {
        const handler = (_event, content, fileName) => cb(content, fileName);
        ipcRenderer.on("sticker:update", handler);
        return () => ipcRenderer.removeListener("sticker:update", handler);
    },
    onStickerLockState: (cb) => {
        const handler = (_event, locked) => cb(locked);
        ipcRenderer.on("sticker:lockState", handler);
        return () => ipcRenderer.removeListener("sticker:lockState", handler);
    },
    onStickerVisibility: (cb) => {
        const handler = (_event, visible) => cb(visible);
        ipcRenderer.on("sticker:visibility", handler);
        return () => ipcRenderer.removeListener("sticker:visibility", handler);
    },
    onWidgetVisibility: (cb) => {
        const handler = (_event, visible) => cb(visible);
        ipcRenderer.on("widget:visibility", handler);
        return () => ipcRenderer.removeListener("widget:visibility", handler);
    },
    // Quick Entry
    quickEntrySubmit: (text) => ipcRenderer.invoke("quickentry:submit", text),
    quickEntryHide: () => ipcRenderer.invoke("quickentry:hide"),
    onQuickEntryShow: (cb) => {
        ipcRenderer.on("quickentry:show", () => cb());
        return () => ipcRenderer.removeAllListeners("quickentry:show");
    },
    // Main window listener for appended tasks
    onTaskAppended: (cb) => {
        const handler = (_event, task) => cb(task);
        ipcRenderer.on("editor:taskAppended", handler);
        return () => ipcRenderer.removeListener("editor:taskAppended", handler);
    },
    // Explorer
    explorerOpenFolder: () => ipcRenderer.invoke("explorer:openFolder"),
    explorerReadDir: (rootPath) => ipcRenderer.invoke("explorer:readDir", rootPath),
    explorerOpenFileByPath: (filePath) => ipcRenderer.invoke("explorer:openFileByPath", filePath),
    // System settings
    systemGetSettings: () => ipcRenderer.invoke("system:getSettings"),
    systemSetAutoLaunch: (enabled) => ipcRenderer.invoke("system:setAutoLaunch", enabled),
    systemSetMinimizeToTray: (enabled) => ipcRenderer.invoke("system:setMinimizeToTray", enabled),
});

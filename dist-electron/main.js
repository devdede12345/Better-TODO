"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
let mainWindow = null;
let stickerWindow = null;
let quickEntryWindow = null;
let tray = null;
let currentFilePath = null;
let stickerLocked = false;
const isMac = process.platform === "darwin";
const quickEntryShortcut = isMac ? "CommandOrControl+Shift+Space" : "Ctrl+Space";
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 600,
    minHeight: 400,
    frame: false,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    titleBarOverlay: isMac ? void 0 : {
      color: "#1e1e2e",
      symbolColor: "#cdd6f4",
      height: 36
    },
    backgroundColor: isMac ? "#00000000" : "#1e1e2e",
    transparent: isMac,
    vibrancy: isMac ? "under-window" : void 0,
    visualEffectState: isMac ? "active" : void 0,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (stickerWindow && !stickerWindow.isDestroyed()) {
      stickerWindow.close();
    }
  });
}
function createStickerWindow() {
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.focus();
    return;
  }
  const { width: screenW, height: screenH } = electron.screen.getPrimaryDisplay().workAreaSize;
  stickerWindow = new electron.BrowserWindow({
    width: 320,
    height: 480,
    x: screenW - 340,
    y: screenH - 520,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: isMac ? true : false,
    backgroundColor: "#00000000",
    vibrancy: isMac ? "hud" : void 0,
    visualEffectState: isMac ? "active" : void 0,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    stickerWindow.loadURL(process.env.VITE_DEV_SERVER_URL + "/sticker.html");
  } else {
    stickerWindow.loadFile(path.join(__dirname, "../dist/sticker.html"));
  }
  stickerWindow.webContents.on("did-finish-load", () => {
    if (currentFilePath && fs.existsSync(currentFilePath)) {
      const content = fs.readFileSync(currentFilePath, "utf-8");
      const fileName = currentFilePath.split(/[\\/]/).pop() || "Untitled";
      stickerWindow == null ? void 0 : stickerWindow.webContents.send("sticker:update", content, fileName);
    }
    stickerWindow == null ? void 0 : stickerWindow.webContents.send("sticker:lockState", stickerLocked);
  });
  stickerWindow.on("closed", () => {
    stickerWindow = null;
    mainWindow == null ? void 0 : mainWindow.webContents.send("sticker:visibility", false);
  });
  mainWindow == null ? void 0 : mainWindow.webContents.send("sticker:visibility", true);
}
function createQuickEntryWindow() {
  if (quickEntryWindow && !quickEntryWindow.isDestroyed()) {
    quickEntryWindow.show();
    quickEntryWindow.focus();
    quickEntryWindow.webContents.send("quickentry:show");
    return;
  }
  const { width: screenW } = electron.screen.getPrimaryDisplay().workAreaSize;
  quickEntryWindow = new electron.BrowserWindow({
    width: 520,
    height: 180,
    x: Math.round((screenW - 520) / 2),
    y: 120,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: true,
    backgroundColor: "#00000000",
    vibrancy: isMac ? "popover" : void 0,
    visualEffectState: isMac ? "active" : void 0,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    quickEntryWindow.loadURL(process.env.VITE_DEV_SERVER_URL + "/quickentry.html");
  } else {
    quickEntryWindow.loadFile(path.join(__dirname, "../dist/quickentry.html"));
  }
  quickEntryWindow.once("ready-to-show", () => {
    quickEntryWindow == null ? void 0 : quickEntryWindow.show();
    quickEntryWindow == null ? void 0 : quickEntryWindow.focus();
  });
  quickEntryWindow.on("blur", () => {
    quickEntryWindow == null ? void 0 : quickEntryWindow.hide();
  });
  quickEntryWindow.on("closed", () => {
    quickEntryWindow = null;
  });
}
function toggleQuickEntry() {
  if (quickEntryWindow && !quickEntryWindow.isDestroyed() && quickEntryWindow.isVisible()) {
    quickEntryWindow.hide();
  } else {
    createQuickEntryWindow();
  }
}
function createTray() {
  const iconPath = path.join(__dirname, "../build/icon.png");
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    trayIcon = electron.nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    trayIcon = electron.nativeImage.createEmpty();
  }
  tray = new electron.Tray(trayIcon);
  tray.setToolTip("Better TODO");
  const contextMenu = electron.Menu.buildFromTemplate([
    { label: "Show Editor", click: () => {
      mainWindow == null ? void 0 : mainWindow.show();
      mainWindow == null ? void 0 : mainWindow.focus();
    } },
    { label: "Quick Entry", accelerator: quickEntryShortcut, click: () => toggleQuickEntry() },
    { type: "separator" },
    { label: "Quit", click: () => electron.app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    mainWindow == null ? void 0 : mainWindow.show();
    mainWindow == null ? void 0 : mainWindow.focus();
  });
}
electron.app.whenReady().then(() => {
  createWindow();
  createTray();
  const registered = electron.globalShortcut.register(quickEntryShortcut, () => {
    toggleQuickEntry();
  });
  if (!registered) {
    console.warn(`[shortcut] Failed to register global shortcut: ${quickEntryShortcut}`);
  }
});
electron.app.on("will-quit", () => {
  electron.globalShortcut.unregisterAll();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
});
electron.ipcMain.handle("file:open", async () => {
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Todo Files", extensions: ["todo", "txt", "md"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  currentFilePath = result.filePaths[0];
  const content = fs.readFileSync(currentFilePath, "utf-8");
  const fn = currentFilePath.split(/[\\/]/).pop() || "Untitled";
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.webContents.send("sticker:update", content, fn);
  }
  return { path: currentFilePath, content };
});
electron.ipcMain.handle("file:save", async (_event, content) => {
  if (!currentFilePath) {
    const result = await electron.dialog.showSaveDialog(mainWindow, {
      defaultPath: "tasks.todo",
      filters: [
        { name: "Todo Files", extensions: ["todo"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePath) return null;
    currentFilePath = result.filePath;
  }
  fs.writeFileSync(currentFilePath, content, "utf-8");
  const fn = currentFilePath.split(/[\\/]/).pop() || "Untitled";
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.webContents.send("sticker:update", content, fn);
  }
  return currentFilePath;
});
electron.ipcMain.handle("file:saveAs", async (_event, content) => {
  const result = await electron.dialog.showSaveDialog(mainWindow, {
    defaultPath: currentFilePath || "tasks.todo",
    filters: [
      { name: "Todo Files", extensions: ["todo"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) return null;
  currentFilePath = result.filePath;
  fs.writeFileSync(currentFilePath, content, "utf-8");
  return currentFilePath;
});
electron.ipcMain.handle("file:new", async () => {
  const result = await electron.dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(electron.app.getPath("documents"), "tasks.todo"),
    filters: [
      { name: "Todo Files", extensions: ["todo"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) return null;
  currentFilePath = result.filePath;
  const defaultContent = ``;
  fs.writeFileSync(currentFilePath, defaultContent, "utf-8");
  return { path: currentFilePath, content: defaultContent };
});
electron.ipcMain.handle("file:getDefault", () => {
  const defaultPath = path.join(electron.app.getPath("documents"), "tasks.todo");
  if (fs.existsSync(defaultPath)) {
    currentFilePath = defaultPath;
    return { path: defaultPath, content: fs.readFileSync(defaultPath, "utf-8") };
  }
  currentFilePath = defaultPath;
  const defaultContent = `欢迎使用 Todo Studio:
  ☐ 这是一个待办事项，使用 ☐ 标记 @started
  ✔ 这是已完成的任务，使用 ✔ 标记 @done(2025-04-16)
  ✘ 这是已取消的任务，使用 ✘ 标记 @cancelled(2025-04-16)

快捷键:
  ☐ 按 Ctrl+D 切换任务状态（待办 → 完成 → 取消 → 待办）
  ☐ 按 Ctrl+Enter 在当前行下方新建任务
  ☐ 按 Ctrl+Shift+A 将已完成/已取消的任务归档
  ☐ 按 Ctrl+S 保存文件 / Ctrl+O 打开文件
  ☐ 按 Ctrl+Shift+S 另存为
  ☐ 按 Ctrl+F 搜索 / Ctrl+H 替换
  ☐ 按 Ctrl+Z 撤销 / Ctrl+Shift+Z 重做

标签系统:
  ☐ 使用 @tag 添加自定义标签 @重要
  ☐ 使用 +项目名 标记所属项目 +Todo-Studio
  ☐ @critical 和 @high 标记紧急任务 @critical
  ☐ @low 标记低优先级任务 @low
  ☐ @today 标记今天要做的事 @today
  ☐ @started 表示已经开始 @started
  ☐ @due(2025-12-31) 设置截止日期 @due(2025-12-31)
  ☐ !1 !2 !3 设置优先级（1最高） !1

嵌套任务:
  ☐ 通过缩进创建层级结构
    ☐ 这是一个子任务
      ☐ 这是更深层的子任务
    ☐ 另一个子任务 +子项目

项目分组:
  ☐ 以冒号结尾的行会被识别为项目标题
  ☐ 用来组织不同类别的任务

链接支持:
  ☐ 支持 URL 高亮 https://github.com

其他格式:
  - 普通列表项使用 - 开头
  * 也可以使用 * 开头
  ☐ 文件会在编辑后 2 秒自动保存

Archive:
  ✔ 归档的任务会出现在这里 @done(2025-04-16)
`;
  fs.writeFileSync(defaultPath, defaultContent, "utf-8");
  return { path: defaultPath, content: defaultContent };
});
electron.ipcMain.handle("file:getCurrentPath", () => currentFilePath);
electron.ipcMain.handle("sticker:requestContent", () => {
  if (currentFilePath && fs.existsSync(currentFilePath)) {
    const content = fs.readFileSync(currentFilePath, "utf-8");
    const fileName = currentFilePath.split(/[\\/]/).pop() || "Untitled";
    return { content, fileName };
  }
  return null;
});
electron.ipcMain.handle("sticker:toggle", () => {
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.close();
    stickerWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.restore();
      mainWindow.focus();
    }
    return false;
  } else {
    createStickerWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
    return true;
  }
});
electron.ipcMain.handle("sticker:isVisible", () => {
  return stickerWindow !== null && !stickerWindow.isDestroyed();
});
electron.ipcMain.handle("sticker:setLocked", (_event, locked) => {
  stickerLocked = locked;
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.setIgnoreMouseEvents(locked, { forward: true });
    stickerWindow.webContents.send("sticker:lockState", locked);
  }
  return locked;
});
electron.ipcMain.handle("sticker:getLocked", () => stickerLocked);
electron.ipcMain.handle("sticker:back", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.restore();
    mainWindow.focus();
  }
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.close();
    stickerWindow = null;
  }
});
electron.ipcMain.on("sticker:syncContent", (_event, content, fileName) => {
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.webContents.send("sticker:update", content, fileName);
  }
});
electron.ipcMain.handle("quickentry:submit", (_event, text) => {
  if (!text.trim()) return;
  const tasks = text.split("\n").filter((l) => l.trim()).map((l) => `  ☐ ${l.trim()}`).join("\n");
  if (currentFilePath && fs.existsSync(currentFilePath)) {
    let content = fs.readFileSync(currentFilePath, "utf-8");
    const quickaddIdx = content.indexOf("\nQuickadd:");
    if (quickaddIdx !== -1) {
      const afterHeader = quickaddIdx + "\nQuickadd:".length;
      const rest = content.slice(afterHeader);
      const nextSection = rest.search(/\n\S[^\n]*:\s*(\([^)]*\))?\s*$/m);
      const insertAt = nextSection !== -1 ? afterHeader + nextSection : content.length;
      content = content.slice(0, insertAt) + "\n" + tasks + content.slice(insertAt);
    } else {
      const archiveIdx = content.indexOf("\nArchive:");
      if (archiveIdx !== -1) {
        content = content.slice(0, archiveIdx) + "\n\nQuickadd:\n" + tasks + content.slice(archiveIdx);
      } else {
        content = content.trimEnd() + "\n\nQuickadd:\n" + tasks + "\n";
      }
    }
    fs.writeFileSync(currentFilePath, content, "utf-8");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("editor:taskAppended", content);
    }
    const fn = currentFilePath.split(/[\\/]/).pop() || "Untitled";
    if (stickerWindow && !stickerWindow.isDestroyed()) {
      stickerWindow.webContents.send("sticker:update", content, fn);
    }
  }
  if (quickEntryWindow && !quickEntryWindow.isDestroyed()) {
    quickEntryWindow.hide();
  }
});
electron.ipcMain.handle("quickentry:hide", () => {
  if (quickEntryWindow && !quickEntryWindow.isDestroyed()) {
    quickEntryWindow.hide();
  }
});

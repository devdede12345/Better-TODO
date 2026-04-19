import { app, BrowserWindow, ipcMain, dialog, screen, Tray, Menu, globalShortcut, nativeImage } from "electron";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

let mainWindow: BrowserWindow | null = null;
let stickerWindow: BrowserWindow | null = null;
let quickEntryWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentFilePath: string | null = null;
let stickerLocked = false;
const isMac = process.platform === "darwin";
const quickEntryShortcut = isMac ? "CommandOrControl+Shift+Space" : "Ctrl+Space";

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 600,
    minHeight: 400,
    frame: false,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 14, y: 12 } : undefined,
    titleBarOverlay: isMac ? undefined : {
      color: "#1e1e2e",
      symbolColor: "#cdd6f4",
      height: 36,
    },
    backgroundColor: isMac ? "#00000000" : "#1e1e2e",
    transparent: isMac,
    vibrancy: isMac ? "under-window" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
    // Close sticker when main window closes
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

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  stickerWindow = new BrowserWindow({
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
    vibrancy: isMac ? "hud" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    stickerWindow.loadURL(process.env.VITE_DEV_SERVER_URL + "/sticker.html");
  } else {
    stickerWindow.loadFile(join(__dirname, "../dist/sticker.html"));
  }

  // Send current file content to sticker once it's ready
  stickerWindow.webContents.on("did-finish-load", () => {
    if (currentFilePath && existsSync(currentFilePath)) {
      const content = readFileSync(currentFilePath, "utf-8");
      const fileName = currentFilePath.split(/[\\/]/).pop() || "Untitled";
      stickerWindow?.webContents.send("sticker:update", content, fileName);
    }
    stickerWindow?.webContents.send("sticker:lockState", stickerLocked);
  });

  stickerWindow.on("closed", () => {
    stickerWindow = null;
    // Notify main window
    mainWindow?.webContents.send("sticker:visibility", false);
  });

  // Notify main window sticker is visible
  mainWindow?.webContents.send("sticker:visibility", true);
}

// ─── Quick Entry Window ─────────────────────────────────────────────────────

function createQuickEntryWindow() {
  if (quickEntryWindow && !quickEntryWindow.isDestroyed()) {
    quickEntryWindow.show();
    quickEntryWindow.focus();
    quickEntryWindow.webContents.send("quickentry:show");
    return;
  }

  const { width: screenW } = screen.getPrimaryDisplay().workAreaSize;

  quickEntryWindow = new BrowserWindow({
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
    vibrancy: isMac ? "popover" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    quickEntryWindow.loadURL(process.env.VITE_DEV_SERVER_URL + "/quickentry.html");
  } else {
    quickEntryWindow.loadFile(join(__dirname, "../dist/quickentry.html"));
  }

  quickEntryWindow.once("ready-to-show", () => {
    quickEntryWindow?.show();
    quickEntryWindow?.focus();
  });

  quickEntryWindow.on("blur", () => {
    quickEntryWindow?.hide();
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

// ─── Tray ───────────────────────────────────────────────────────────────────

function createTray() {
  // Create a simple 16x16 tray icon
  const iconPath = join(__dirname, "../build/icon.png");
  let trayIcon: Electron.NativeImage;
  if (existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    // Fallback: create a simple colored icon
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip("Better TODO");

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show Editor", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: "Quick Entry", accelerator: quickEntryShortcut, click: () => toggleQuickEntry() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Register global shortcut for quick entry
  const registered = globalShortcut.register(quickEntryShortcut, () => {
    toggleQuickEntry();
  });

  if (!registered) {
    console.warn(`[shortcut] Failed to register global shortcut: ${quickEntryShortcut}`);
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC Handlers ---

ipcMain.handle("file:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openFile"],
    filters: [
      { name: "Todo Files", extensions: ["todo", "txt", "md"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  currentFilePath = result.filePaths[0];
  const content = readFileSync(currentFilePath, "utf-8");
  // Also sync to sticker
  const fn = currentFilePath.split(/[\\/]/).pop() || "Untitled";
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.webContents.send("sticker:update", content, fn);
  }
  return { path: currentFilePath, content };
});

ipcMain.handle("file:save", async (_event, content: string) => {
  if (!currentFilePath) {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: "tasks.todo",
      filters: [
        { name: "Todo Files", extensions: ["todo"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    currentFilePath = result.filePath;
  }

  writeFileSync(currentFilePath, content, "utf-8");
  // Sync to sticker after save
  const fn = currentFilePath.split(/[\\/]/).pop() || "Untitled";
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.webContents.send("sticker:update", content, fn);
  }
  return currentFilePath;
});

ipcMain.handle("file:saveAs", async (_event, content: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: currentFilePath || "tasks.todo",
    filters: [
      { name: "Todo Files", extensions: ["todo"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePath) return null;
  currentFilePath = result.filePath;
  writeFileSync(currentFilePath, content, "utf-8");
  return currentFilePath;
});

ipcMain.handle("file:new", async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: join(app.getPath("documents"), "tasks.todo"),
    filters: [
      { name: "Todo Files", extensions: ["todo"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePath) return null;
  currentFilePath = result.filePath;
  const defaultContent = ``;
  writeFileSync(currentFilePath, defaultContent, "utf-8");
  return { path: currentFilePath, content: defaultContent };
});

ipcMain.handle("file:getDefault", () => {
  const defaultPath = join(app.getPath("documents"), "tasks.todo");
  if (existsSync(defaultPath)) {
    currentFilePath = defaultPath;
    return { path: defaultPath, content: readFileSync(defaultPath, "utf-8") };
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
  writeFileSync(defaultPath, defaultContent, "utf-8");
  return { path: defaultPath, content: defaultContent };
});

ipcMain.handle("file:getCurrentPath", () => currentFilePath);

// Sticker can request current file content directly
ipcMain.handle("sticker:requestContent", () => {
  if (currentFilePath && existsSync(currentFilePath)) {
    const content = readFileSync(currentFilePath, "utf-8");
    const fileName = currentFilePath.split(/[\\/]/).pop() || "Untitled";
    return { content, fileName };
  }
  return null;
});

// ─── Sticker IPC ─────────────────────────────────────────────────────────────

ipcMain.handle("sticker:toggle", () => {
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.close();
    stickerWindow = null;
    // Restore main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.restore();
      mainWindow.focus();
    }
    return false;
  } else {
    createStickerWindow();
    // Minimize main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
    return true;
  }
});

ipcMain.handle("sticker:isVisible", () => {
  return stickerWindow !== null && !stickerWindow.isDestroyed();
});

ipcMain.handle("sticker:setLocked", (_event, locked: boolean) => {
  stickerLocked = locked;
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.setIgnoreMouseEvents(locked, { forward: true });
    stickerWindow.webContents.send("sticker:lockState", locked);
  }
  return locked;
});

ipcMain.handle("sticker:getLocked", () => stickerLocked);

// Back to main editor: restore main window and close sticker
ipcMain.handle("sticker:back", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.restore();
    mainWindow.focus();
  }
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.close();
    stickerWindow = null;
  }
});

// Called by main renderer whenever content changes — forward to sticker
ipcMain.on("sticker:syncContent", (_event, content: string, fileName: string) => {
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.webContents.send("sticker:update", content, fileName);
  }
});

// ─── Quick Entry IPC ────────────────────────────────────────────────────────

ipcMain.handle("quickentry:submit", (_event, text: string) => {
  if (!text.trim()) return;

  // Format each line as a pending task
  const tasks = text.split("\n").filter((l: string) => l.trim()).map((l: string) => `  ☐ ${l.trim()}`).join("\n");

  // Append under "Quickadd:" section (create if missing, always before Archive:)
  if (currentFilePath && existsSync(currentFilePath)) {
    let content = readFileSync(currentFilePath, "utf-8");
    const quickaddIdx = content.indexOf("\nQuickadd:");
    if (quickaddIdx !== -1) {
      // Find the end of existing Quickadd section (next project header or Archive or EOF)
      const afterHeader = quickaddIdx + "\nQuickadd:".length;
      // Find next section boundary after Quickadd:
      const rest = content.slice(afterHeader);
      const nextSection = rest.search(/\n\S[^\n]*:\s*(\([^)]*\))?\s*$/m);
      const insertAt = nextSection !== -1 ? afterHeader + nextSection : content.length;
      content = content.slice(0, insertAt) + "\n" + tasks + content.slice(insertAt);
    } else {
      // Create Quickadd: section
      const archiveIdx = content.indexOf("\nArchive:");
      if (archiveIdx !== -1) {
        content = content.slice(0, archiveIdx) + "\n\nQuickadd:\n" + tasks + content.slice(archiveIdx);
      } else {
        content = content.trimEnd() + "\n\nQuickadd:\n" + tasks + "\n";
      }
    }
    writeFileSync(currentFilePath, content, "utf-8");

    // Notify main editor to reload content
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("editor:taskAppended", content);
    }
    // Sync to sticker
    const fn = currentFilePath.split(/[\\/]/).pop() || "Untitled";
    if (stickerWindow && !stickerWindow.isDestroyed()) {
      stickerWindow.webContents.send("sticker:update", content, fn);
    }
  }

  // Hide quick entry after submit
  if (quickEntryWindow && !quickEntryWindow.isDestroyed()) {
    quickEntryWindow.hide();
  }
});

ipcMain.handle("quickentry:hide", () => {
  if (quickEntryWindow && !quickEntryWindow.isDestroyed()) {
    quickEntryWindow.hide();
  }
});

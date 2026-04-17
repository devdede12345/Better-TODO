import { app, BrowserWindow, ipcMain, dialog, screen } from "electron";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

let mainWindow: BrowserWindow | null = null;
let stickerWindow: BrowserWindow | null = null;
let currentFilePath: string | null = null;
let stickerLocked = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#1e1e2e",
      symbolColor: "#cdd6f4",
      height: 36,
    },
    backgroundColor: "#1e1e2e",
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
    hasShadow: false,
    backgroundColor: "#00000000",
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

app.whenReady().then(createWindow);

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
    return false;
  } else {
    createStickerWindow();
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

// Called by main renderer whenever content changes — forward to sticker
ipcMain.on("sticker:syncContent", (_event, content: string, fileName: string) => {
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.webContents.send("sticker:update", content, fileName);
  }
});

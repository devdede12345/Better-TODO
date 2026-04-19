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
const REMINDER_REPEAT_MS = 5 * 60 * 1e3;
const activeReminders = /* @__PURE__ */ new Map();
function parseDurationToMinutes(input) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return 0;
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  let minutes = 0;
  const dayMatch = trimmed.match(/(\d+(?:\.\d+)?)d/);
  const hourMatch = trimmed.match(/(\d+(?:\.\d+)?)h/);
  const minMatch = trimmed.match(/(\d+(?:\.\d+)?)m/);
  if (dayMatch) minutes += parseFloat(dayMatch[1]) * 8 * 60;
  if (hourMatch) minutes += parseFloat(hourMatch[1]) * 60;
  if (minMatch) minutes += parseFloat(minMatch[1]);
  return Math.round(minutes);
}
function extractReminderMinutes(taskText) {
  const plainMinuteTag = taskText.match(/(?:^|\s)@(\d+)(?=\s|$)/);
  if (plainMinuteTag) return parseInt(plainMinuteTag[1], 10);
  const compactDuration = taskText.match(/(?:^|\s)@(\d+(?:\.\d+)?(?:d|h|m)(?:\d+m)?)(?=\s|$)/);
  if (compactDuration) return parseDurationToMinutes(compactDuration[1]);
  const estTag = taskText.match(/@est\(([^)]+)\)/);
  if (estTag) return parseDurationToMinutes(estTag[1]);
  return 0;
}
function cleanTaskLabel(text) {
  return text.replace(/@est\([^)]*\)/g, "").replace(/(?:^|\s)@\d+(?:\.\d+)?(?:d|h|m)?(?:\d+m?)?(?=\s|$)/g, "").replace(/\s+/g, " ").trim();
}
function extractReminderTasks(content, filePath) {
  const lines = content.split("\n");
  const projectStack = [];
  const reminders = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const projectMatch = raw.match(/^(\s*)([^☐✔✘].*?):\s*(?:@.*)?$/);
    if (projectMatch && raw.trim().endsWith(":")) {
      const indent = projectMatch[1].length;
      while (projectStack.length > 0 && projectStack[projectStack.length - 1].indent >= indent) {
        projectStack.pop();
      }
      projectStack.push({ indent, name: projectMatch[2].trim() });
      continue;
    }
    const pendingMatch = raw.match(/^(\s*)☐\s+(.+)$/);
    if (!pendingMatch) continue;
    const taskIndent = pendingMatch[1].length;
    while (projectStack.length > 0 && projectStack[projectStack.length - 1].indent >= taskIndent) {
      projectStack.pop();
    }
    const taskText = pendingMatch[2].trim();
    const minutes = extractReminderMinutes(taskText);
    if (minutes <= 0) continue;
    const projectName = projectStack.length > 0 ? projectStack[projectStack.length - 1].name : "Tasks";
    const id = `${filePath}:${i}:${taskText}`;
    reminders.push({
      id,
      filePath,
      lineIndex: i,
      taskText,
      projectName,
      minutes,
      timer: null,
      dueAt: 0
    });
  }
  return reminders;
}
function clearReminderTimer(reminder) {
  if (reminder.timer) {
    clearTimeout(reminder.timer);
    reminder.timer = null;
  }
}
function broadcastUpdatedContent(content, filePath) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("editor:taskAppended", content);
  }
  const fileName = filePath.split(/[\\/]/).pop() || "Untitled";
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.webContents.send("sticker:update", content, fileName);
  }
}
function markReminderTaskDone(reminder) {
  var _a, _b;
  if (!fs.existsSync(reminder.filePath)) return;
  const lines = fs.readFileSync(reminder.filePath, "utf-8").split("\n");
  let targetIndex = -1;
  if (lines[reminder.lineIndex]) {
    const current = (_b = (_a = lines[reminder.lineIndex].match(/^\s*☐\s+(.+)$/)) == null ? void 0 : _a[1]) == null ? void 0 : _b.trim();
    if (current === reminder.taskText) {
      targetIndex = reminder.lineIndex;
    }
  }
  if (targetIndex === -1) {
    targetIndex = lines.findIndex((line) => {
      const pending = line.match(/^\s*☐\s+(.+)$/);
      return pending ? pending[1].trim() === reminder.taskText : false;
    });
  }
  if (targetIndex === -1) return;
  let updated = lines[targetIndex].replace(/^(\s*)☐\s+/, "$1✔ ");
  if (!/@done\(/.test(updated)) {
    const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    updated += ` @done(${date})`;
  }
  lines[targetIndex] = updated;
  const content = lines.join("\n");
  fs.writeFileSync(reminder.filePath, content, "utf-8");
  syncRemindersFromContent(content, reminder.filePath);
  broadcastUpdatedContent(content, reminder.filePath);
}
function removeReminder(reminderId) {
  const reminder = activeReminders.get(reminderId);
  if (!reminder) return;
  clearReminderTimer(reminder);
  activeReminders.delete(reminderId);
}
function scheduleReminder(reminderId, delayMs) {
  const reminder = activeReminders.get(reminderId);
  if (!reminder) return;
  reminder.dueAt = Date.now() + Math.max(1e3, delayMs);
  clearReminderTimer(reminder);
  reminder.timer = setTimeout(() => {
    fireReminder(reminderId);
  }, Math.max(1e3, delayMs));
}
function getNextReminderPreview() {
  let next = null;
  for (const reminder of activeReminders.values()) {
    if (!next || reminder.dueAt < next.dueAt) {
      next = reminder;
    }
  }
  if (!next) return null;
  const remainingSeconds = Math.max(0, Math.ceil((next.dueAt - Date.now()) / 1e3));
  return {
    id: next.id,
    projectName: next.projectName,
    taskText: cleanTaskLabel(next.taskText),
    remainingSeconds
  };
}
function showReminderNotification(reminder) {
  let handled = false;
  const onCancel = () => {
    handled = true;
    removeReminder(reminder.id);
  };
  const onComplete = () => {
    handled = true;
    removeReminder(reminder.id);
    markReminderTaskDone(reminder);
  };
  if (!electron.Notification.isSupported()) {
    const fallbackOptions = {
      type: "info",
      title: "任务提醒",
      message: reminder.projectName,
      detail: cleanTaskLabel(reminder.taskText),
      buttons: ["取消提醒", "已完成", "稍后提醒"],
      defaultId: 2,
      cancelId: 2
    };
    const result = mainWindow ? electron.dialog.showMessageBoxSync(mainWindow, fallbackOptions) : electron.dialog.showMessageBoxSync(fallbackOptions);
    if (result === 0) onCancel();
    else if (result === 1) onComplete();
    if (!handled) scheduleReminder(reminder.id, REMINDER_REPEAT_MS);
    return;
  }
  const notification = new electron.Notification({
    title: `提醒 · ${reminder.projectName}`,
    body: `${cleanTaskLabel(reminder.taskText)}
已到 ${reminder.minutes} 分钟`,
    actions: [
      { type: "button", text: "取消提醒" },
      { type: "button", text: "已完成" }
    ],
    closeButtonText: "稍后提醒",
    silent: false
  });
  notification.on("action", (_event, index) => {
    if (index === 0) onCancel();
    else if (index === 1) onComplete();
  });
  notification.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  notification.on("close", () => {
    if (!handled) {
      scheduleReminder(reminder.id, REMINDER_REPEAT_MS);
    }
  });
  notification.show();
}
function fireReminder(reminderId) {
  const reminder = activeReminders.get(reminderId);
  if (!reminder) return;
  showReminderNotification(reminder);
}
function syncRemindersFromContent(content, filePath) {
  const parsed = extractReminderTasks(content, filePath);
  const nextIds = new Set(parsed.map((task) => task.id));
  for (const [id, reminder] of activeReminders.entries()) {
    if (!nextIds.has(id)) {
      clearReminderTimer(reminder);
      activeReminders.delete(id);
    }
  }
  for (const task of parsed) {
    if (activeReminders.has(task.id)) continue;
    activeReminders.set(task.id, task);
    scheduleReminder(task.id, task.minutes * 60 * 1e3);
  }
}
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 600,
    minHeight: 400,
    frame: false,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 14, y: 12 } : void 0,
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
  syncRemindersFromContent(content, currentFilePath);
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
  syncRemindersFromContent(content, currentFilePath);
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
  syncRemindersFromContent(content, currentFilePath);
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
  syncRemindersFromContent(defaultContent, currentFilePath);
  return { path: currentFilePath, content: defaultContent };
});
electron.ipcMain.handle("file:getDefault", () => {
  const defaultPath = path.join(electron.app.getPath("documents"), "tasks.todo");
  if (fs.existsSync(defaultPath)) {
    currentFilePath = defaultPath;
    const content = fs.readFileSync(defaultPath, "utf-8");
    syncRemindersFromContent(content, currentFilePath);
    return { path: defaultPath, content };
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
  syncRemindersFromContent(defaultContent, currentFilePath);
  return { path: defaultPath, content: defaultContent };
});
electron.ipcMain.handle("file:getCurrentPath", () => currentFilePath);
electron.ipcMain.handle("reminder:getNext", () => getNextReminderPreview());
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
    stickerWindow.setIgnoreMouseEvents(false);
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
    syncRemindersFromContent(content, currentFilePath);
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

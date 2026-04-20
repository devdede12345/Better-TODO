"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
let mainWindow = null;
let widgetWindow = null;
let quickEntryWindow = null;
let tray = null;
let currentFilePath = null;
let stickerLocked = false;
let minimizeToTray = false;
let forceQuit = false;
const isMac = process.platform === "darwin";
const quickEntryShortcut = isMac ? "CommandOrControl+Shift+Space" : "Ctrl+Space";
const settingsPath = path.join(electron.app.getPath("userData"), "system-settings.json");
function loadSystemSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
  } catch {
  }
  return { autoLaunch: false, minimizeToTray: false };
}
function saveSystemSettings(s) {
  fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2), "utf-8");
}
const REMINDER_REPEAT_MS = 5 * 60 * 1e3;
const COMPLETED_TASK_TTL_MS = 2 * 60 * 60 * 1e3;
const COMPLETED_TASK_CLEANUP_INTERVAL_MS = 60 * 1e3;
let completedTaskCleanupTimer = null;
const activeReminders = /* @__PURE__ */ new Map();
function buildFileTree(rootPath) {
  if (!fs.existsSync(rootPath)) return null;
  const walk = (dirPath) => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true }).filter((entry) => !entry.name.startsWith(".")).map((entry) => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: fullPath,
          isDirectory: true,
          children: walk(fullPath)
        };
      }
      return {
        name: entry.name,
        path: fullPath,
        isDirectory: false
      };
    });
    return entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  };
  return {
    rootPath,
    rootName: rootPath.split(/[\\/]/).pop() || rootPath,
    children: walk(rootPath)
  };
}
function toValidTimestamp(year, month, day, hour, minute) {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) {
    return null;
  }
  return date.getTime();
}
function extractDueTimestamp(taskText) {
  const explicitYear = taskText.match(/(?:^|\s)@(\d{4})(?=\s|$)/);
  const fallbackYear = explicitYear ? parseInt(explicitYear[1], 10) : (/* @__PURE__ */ new Date()).getFullYear();
  const fullDateMatch = taskText.match(/(?:^|\s)@(\d{4})[\/.](\d{2})[\/.](\d{2})\s+(\d{2}):(\d{2})(?=\s|$)/);
  if (fullDateMatch) {
    return toValidTimestamp(
      parseInt(fullDateMatch[1], 10),
      parseInt(fullDateMatch[2], 10),
      parseInt(fullDateMatch[3], 10),
      parseInt(fullDateMatch[4], 10),
      parseInt(fullDateMatch[5], 10)
    );
  }
  const monthDayMatch = taskText.match(/(?:^|\s)@(\d{2})[\/.](\d{2})\s+(\d{2}):(\d{2})(?=\s|$)/);
  if (monthDayMatch) {
    return toValidTimestamp(
      fallbackYear,
      parseInt(monthDayMatch[1], 10),
      parseInt(monthDayMatch[2], 10),
      parseInt(monthDayMatch[3], 10),
      parseInt(monthDayMatch[4], 10)
    );
  }
  const compactMatch = taskText.match(/(?:^|\s)@(\d{2})(\d{2})(\d{2})(\d{2})(?=\s|$)/);
  if (compactMatch) {
    return toValidTimestamp(
      fallbackYear,
      parseInt(compactMatch[1], 10),
      parseInt(compactMatch[2], 10),
      parseInt(compactMatch[3], 10),
      parseInt(compactMatch[4], 10)
    );
  }
  return null;
}
function cleanTaskLabel(text) {
  return text.replace(/@est\([^)]*\)/g, "").replace(/(?:^|\s)@\d{4}[\/.]\d{2}[\/.]\d{2}\s+\d{2}:\d{2}(?=\s|$)/g, "").replace(/(?:^|\s)@\d{2}[\/.]\d{2}\s+\d{2}:\d{2}(?=\s|$)/g, "").replace(/(?:^|\s)@\d{8}(?=\s|$)/g, "").replace(/(?:^|\s)@\d{4}(?=\s|$)/g, "").replace(/\s+/g, " ").trim();
}
function formatTaskStatusTimestamp(date = /* @__PURE__ */ new Date()) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${m}`;
}
function parseTaskStatusTimestamp(raw) {
  const full = raw.match(/^(\d{4})[-\/.](\d{2})[-\/.](\d{2})[T\s](\d{2}):(\d{2})(?::\d{2})?$/);
  if (!full) return null;
  return toValidTimestamp(
    parseInt(full[1], 10),
    parseInt(full[2], 10),
    parseInt(full[3], 10),
    parseInt(full[4], 10),
    parseInt(full[5], 10)
  );
}
function extractTaskStatusTimestamp(line) {
  const match = line.match(/@(?:done|cancel(?:led)?)\(([^)]+)\)/i);
  if (!match) return null;
  return parseTaskStatusTimestamp(match[1].trim());
}
function pruneExpiredCompletedTasks(content, nowMs = Date.now()) {
  const lines = content.split("\n");
  const kept = [];
  let changed = false;
  for (const line of lines) {
    if (/^\s*[✔✘]\s+/.test(line)) {
      const statusTs = extractTaskStatusTimestamp(line);
      if (statusTs && nowMs - statusTs >= COMPLETED_TASK_TTL_MS) {
        changed = true;
        continue;
      }
    }
    kept.push(line);
  }
  return { content: kept.join("\n"), changed };
}
function cleanupExpiredCompletedTasksInFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const current = fs.readFileSync(filePath, "utf-8");
  const pruned = pruneExpiredCompletedTasks(current);
  if (!pruned.changed) return current;
  fs.writeFileSync(filePath, pruned.content, "utf-8");
  syncRemindersFromContent(pruned.content, filePath);
  broadcastUpdatedContent(pruned.content, filePath);
  return pruned.content;
}
function formatReminderDueAt(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "--/-- --:--";
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${mo}/${day} ${h}:${m}`;
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
    const dueAt = extractDueTimestamp(taskText);
    if (!dueAt) continue;
    const projectName = projectStack.length > 0 ? projectStack[projectStack.length - 1].name : "Tasks";
    const id = `${filePath}:${i}:${taskText}`;
    reminders.push({
      id,
      filePath,
      lineIndex: i,
      taskText,
      projectName,
      timer: null,
      dueAt
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
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send("sticker:update", content, fileName);
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
    updated += ` @done(${formatTaskStatusTimestamp()})`;
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
function scheduleReminder(reminderId, dueAt) {
  const reminder = activeReminders.get(reminderId);
  if (!reminder) return;
  reminder.dueAt = dueAt;
  clearReminderTimer(reminder);
  const delayMs = Math.max(0, reminder.dueAt - Date.now());
  reminder.timer = setTimeout(() => {
    fireReminder(reminderId);
  }, delayMs);
}
function getNextReminderTask() {
  let next = null;
  for (const reminder of activeReminders.values()) {
    if (!next || reminder.dueAt < next.dueAt) {
      next = reminder;
    }
  }
  return next;
}
function getNextReminderPreview() {
  const next = getNextReminderTask();
  if (!next) return null;
  const deltaMs = next.dueAt - Date.now();
  const remainingSeconds = Math.max(0, Math.ceil(deltaMs / 1e3));
  return {
    id: next.id,
    projectName: next.projectName,
    taskText: cleanTaskLabel(next.taskText),
    remainingSeconds,
    dueAt: next.dueAt,
    isOverdue: deltaMs <= 0
  };
}
function showReminderNotification(reminder) {
  let handled = false;
  const reminderTitle = `提醒 · ${reminder.projectName}`;
  const reminderBody = [
    cleanTaskLabel(reminder.taskText),
    `⏰截止时间到！（${formatReminderDueAt(reminder.dueAt)}）`
  ].join("\n");
  const onComplete = () => {
    handled = true;
    removeReminder(reminder.id);
    markReminderTaskDone(reminder);
  };
  if (!electron.Notification.isSupported()) {
    const fallbackOptions = {
      type: "info",
      title: "任务提醒",
      message: reminderTitle,
      detail: reminderBody,
      buttons: ["已完成", "稍后提醒"],
      defaultId: 1,
      cancelId: 1
    };
    const result = mainWindow ? electron.dialog.showMessageBoxSync(mainWindow, fallbackOptions) : electron.dialog.showMessageBoxSync(fallbackOptions);
    if (result === 0) onComplete();
    if (!handled) scheduleReminder(reminder.id, Date.now() + REMINDER_REPEAT_MS);
    return;
  }
  const notification = new electron.Notification({
    title: reminderTitle,
    body: reminderBody,
    actions: [
      { type: "button", text: "已完成" },
      { type: "button", text: "稍后提醒" }
    ],
    closeButtonText: "关闭",
    silent: false
  });
  notification.on("action", (_event, index) => {
    if (index === 0) onComplete();
    else if (index === 1) {
      handled = true;
      scheduleReminder(reminder.id, Date.now() + REMINDER_REPEAT_MS);
    }
  });
  notification.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  notification.on("close", () => {
    if (!handled) {
      scheduleReminder(reminder.id, Date.now() + REMINDER_REPEAT_MS);
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
    scheduleReminder(task.id, task.dueAt);
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
  mainWindow.on("close", (e) => {
    if (minimizeToTray && !forceQuit) {
      e.preventDefault();
      mainWindow == null ? void 0 : mainWindow.hide();
      return;
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.close();
    }
  });
}
function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.focus();
    return;
  }
  const { width: screenW, height: screenH } = electron.screen.getPrimaryDisplay().workAreaSize;
  widgetWindow = new electron.BrowserWindow({
    width: 360,
    height: 420,
    x: screenW - 380,
    y: screenH - 460,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    fullscreenable: false,
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
  if (isMac) {
    widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  if (process.env.VITE_DEV_SERVER_URL) {
    widgetWindow.loadURL(process.env.VITE_DEV_SERVER_URL + "/sticker.html?widget=1");
  } else {
    widgetWindow.loadFile(path.join(__dirname, "../dist/sticker.html"), {
      query: { widget: "1" }
    });
  }
  widgetWindow.webContents.on("did-finish-load", () => {
    if (currentFilePath && fs.existsSync(currentFilePath)) {
      const content = fs.readFileSync(currentFilePath, "utf-8");
      const fileName = currentFilePath.split(/[\\/]/).pop() || "Untitled";
      widgetWindow == null ? void 0 : widgetWindow.webContents.send("sticker:update", content, fileName);
    }
    widgetWindow == null ? void 0 : widgetWindow.webContents.send("sticker:lockState", stickerLocked);
  });
  widgetWindow.on("closed", () => {
    widgetWindow = null;
    mainWindow == null ? void 0 : mainWindow.webContents.send("widget:visibility", false);
  });
  mainWindow == null ? void 0 : mainWindow.webContents.send("widget:visibility", true);
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
    {
      label: "Show Editor",
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          createWindow();
        }
        mainWindow == null ? void 0 : mainWindow.show();
        mainWindow == null ? void 0 : mainWindow.focus();
      }
    },
    { label: "Quick Entry", accelerator: quickEntryShortcut, click: () => toggleQuickEntry() },
    { type: "separator" },
    { label: "Quit", click: () => electron.app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
    }
    mainWindow == null ? void 0 : mainWindow.show();
    mainWindow == null ? void 0 : mainWindow.focus();
  });
}
electron.app.whenReady().then(() => {
  const sysSettings = loadSystemSettings();
  minimizeToTray = sysSettings.minimizeToTray;
  createWindow();
  createTray();
  const registered = electron.globalShortcut.register(quickEntryShortcut, () => {
    toggleQuickEntry();
  });
  if (!registered) {
    console.warn(`[shortcut] Failed to register global shortcut: ${quickEntryShortcut}`);
  }
  completedTaskCleanupTimer = setInterval(() => {
    if (!currentFilePath) return;
    cleanupExpiredCompletedTasksInFile(currentFilePath);
  }, COMPLETED_TASK_CLEANUP_INTERVAL_MS);
});
electron.app.on("before-quit", () => {
  forceQuit = true;
});
electron.app.on("will-quit", () => {
  electron.globalShortcut.unregisterAll();
  if (completedTaskCleanupTimer) {
    clearInterval(completedTaskCleanupTimer);
    completedTaskCleanupTimer = null;
  }
});
electron.app.on("window-all-closed", () => {
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
  const content = cleanupExpiredCompletedTasksInFile(currentFilePath) ?? fs.readFileSync(currentFilePath, "utf-8");
  const fn = currentFilePath.split(/[\\/]/).pop() || "Untitled";
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send("sticker:update", content, fn);
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
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send("sticker:update", content, fn);
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
electron.ipcMain.handle("explorer:openFolder", async () => {
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return buildFileTree(result.filePaths[0]);
});
electron.ipcMain.handle("explorer:readDir", (_event, rootPath) => {
  if (!rootPath) return null;
  return buildFileTree(rootPath);
});
electron.ipcMain.handle("explorer:openFileByPath", (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return null;
  const content = fs.readFileSync(filePath, "utf-8");
  currentFilePath = filePath;
  syncRemindersFromContent(content, currentFilePath);
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    const fileName = filePath.split(/[\\/]/).pop() || "Untitled";
    widgetWindow.webContents.send("sticker:update", content, fileName);
  }
  return { path: filePath, content };
});
electron.ipcMain.handle("file:getDefault", () => {
  const defaultPath = path.join(electron.app.getPath("documents"), "tasks.todo");
  if (fs.existsSync(defaultPath)) {
    currentFilePath = defaultPath;
    const content = cleanupExpiredCompletedTasksInFile(defaultPath) ?? fs.readFileSync(defaultPath, "utf-8");
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
electron.ipcMain.handle("reminder:snoozeNext", (_event, delayMs) => {
  const next = getNextReminderTask();
  if (!next) return false;
  if (!Number.isFinite(delayMs) || delayMs <= 0) return false;
  scheduleReminder(next.id, Date.now() + delayMs);
  return true;
});
electron.ipcMain.handle("reminder:completeNext", () => {
  const next = getNextReminderTask();
  if (!next) return false;
  removeReminder(next.id);
  markReminderTaskDone(next);
  return true;
});
electron.ipcMain.handle("sticker:requestContent", () => {
  if (currentFilePath && fs.existsSync(currentFilePath)) {
    const content = fs.readFileSync(currentFilePath, "utf-8");
    const fileName = currentFilePath.split(/[\\/]/).pop() || "Untitled";
    return { content, fileName };
  }
  return null;
});
electron.ipcMain.handle("sticker:toggle", () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close();
    widgetWindow = null;
    return false;
  }
  createWidgetWindow();
  return true;
});
electron.ipcMain.handle("sticker:isVisible", () => {
  return widgetWindow !== null && !widgetWindow.isDestroyed();
});
electron.ipcMain.handle("widget:toggle", () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close();
    widgetWindow = null;
    return false;
  }
  createWidgetWindow();
  return true;
});
electron.ipcMain.handle("widget:isVisible", () => {
  return widgetWindow !== null && !widgetWindow.isDestroyed();
});
electron.ipcMain.handle("sticker:setLocked", (_event, locked) => {
  stickerLocked = locked;
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.setIgnoreMouseEvents(false);
    widgetWindow.webContents.send("sticker:lockState", locked);
  }
  return locked;
});
electron.ipcMain.handle("sticker:getLocked", () => stickerLocked);
electron.ipcMain.handle("sticker:toggleTask", (_event, lineIndex) => {
  if (!currentFilePath || !fs.existsSync(currentFilePath)) return false;
  if (!Number.isInteger(lineIndex) || lineIndex < 0) return false;
  const lines = fs.readFileSync(currentFilePath, "utf-8").split("\n");
  if (lineIndex >= lines.length) return false;
  const line = lines[lineIndex];
  const now = formatTaskStatusTimestamp();
  if (line.includes("☐")) {
    let next = line.replace("☐", "✔");
    if (!next.includes("@done")) {
      next += ` @done(${now})`;
    }
    lines[lineIndex] = next;
  } else if (line.includes("✔")) {
    lines[lineIndex] = line.replace("✔", "☐").replace(/ ?@done(\([^)]*\))?/g, "");
  } else if (line.includes("✘")) {
    lines[lineIndex] = line.replace("✘", "☐").replace(/ ?@cancel(?:led)?(\([^)]*\))?/g, "");
  } else {
    return false;
  }
  const content = lines.join("\n");
  fs.writeFileSync(currentFilePath, content, "utf-8");
  syncRemindersFromContent(content, currentFilePath);
  broadcastUpdatedContent(content, currentFilePath);
  return true;
});
electron.ipcMain.handle("sticker:addTask", (_event, text) => {
  if (!currentFilePath || !fs.existsSync(currentFilePath)) return false;
  const taskText = text.trim();
  if (!taskText) return false;
  const taskLine = `  ☐ ${taskText}`;
  let content = fs.readFileSync(currentFilePath, "utf-8");
  const archiveIdx = content.indexOf("\nArchive:");
  if (archiveIdx !== -1) {
    const before = content.slice(0, archiveIdx).trimEnd();
    const after = content.slice(archiveIdx);
    content = before ? `${before}
${taskLine}${after}` : `${taskLine}${after}`;
  } else {
    const trimmed = content.trimEnd();
    content = trimmed ? `${trimmed}
${taskLine}
` : `${taskLine}
`;
  }
  fs.writeFileSync(currentFilePath, content, "utf-8");
  syncRemindersFromContent(content, currentFilePath);
  broadcastUpdatedContent(content, currentFilePath);
  return true;
});
electron.ipcMain.handle("sticker:back", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.restore();
    mainWindow.focus();
  }
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close();
    widgetWindow = null;
  }
});
electron.ipcMain.on("sticker:syncContent", (_event, content, fileName) => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send("sticker:update", content, fileName);
  }
});
electron.ipcMain.on("reminder:syncDraft", (_event, content) => {
  if (!currentFilePath) return;
  syncRemindersFromContent(content, currentFilePath);
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
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send("sticker:update", content, fn);
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
electron.ipcMain.handle("system:getSettings", () => {
  const s = loadSystemSettings();
  const loginSettings = electron.app.getLoginItemSettings();
  return {
    autoLaunch: loginSettings.openAtLogin,
    minimizeToTray: s.minimizeToTray
  };
});
electron.ipcMain.handle("system:setAutoLaunch", (_event, enabled) => {
  electron.app.setLoginItemSettings({ openAtLogin: enabled });
  const s = loadSystemSettings();
  s.autoLaunch = enabled;
  saveSystemSettings(s);
  return enabled;
});
electron.ipcMain.handle("system:setMinimizeToTray", (_event, enabled) => {
  minimizeToTray = enabled;
  const s = loadSystemSettings();
  s.minimizeToTray = enabled;
  saveSystemSettings(s);
  return enabled;
});

import { app, BrowserWindow, ipcMain, dialog, screen, Tray, Menu, globalShortcut, nativeImage, Notification } from "electron";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

let mainWindow: BrowserWindow | null = null;
let stickerWindow: BrowserWindow | null = null;
let widgetWindow: BrowserWindow | null = null;
let quickEntryWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentFilePath: string | null = null;
let stickerLocked = false;
const isMac = process.platform === "darwin";
const quickEntryShortcut = isMac ? "CommandOrControl+Shift+Space" : "Ctrl+Space";

const REMINDER_REPEAT_MS = 5 * 60 * 1000;

interface ReminderTask {
  id: string;
  filePath: string;
  lineIndex: number;
  taskText: string;
  projectName: string;
  timer: NodeJS.Timeout | null;
  dueAt: number;
}

const activeReminders = new Map<string, ReminderTask>();

type NativeMenuAction =
  | "file:new"
  | "file:open"
  | "file:save"
  | "file:saveAs"
  | "task:new"
  | "task:toggleDone"
  | "task:toggleCancelled"
  | "task:archive"
  | "edit:find"
  | "edit:replace"
  | "format:bold"
  | "format:italic"
  | "format:underline"
  | "view:sticker"
  | "view:widget"
  | "view:themeCycle";

function sendNativeMenuAction(action: NativeMenuAction) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const target = mainWindow;
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();

  if (target.webContents.isLoadingMainFrame()) {
    target.webContents.once("did-finish-load", () => {
      target.webContents.send("nativeMenu:action", action);
    });
    return;
  }

  target.webContents.send("nativeMenu:action", action);
}

function setupMacApplicationMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        { label: "New File", accelerator: "CommandOrControl+N", click: () => sendNativeMenuAction("file:new") },
        { label: "Open File", accelerator: "CommandOrControl+O", click: () => sendNativeMenuAction("file:open") },
        { type: "separator" },
        { label: "Save", accelerator: "CommandOrControl+S", click: () => sendNativeMenuAction("file:save") },
        { label: "Save As...", accelerator: "CommandOrControl+Shift+S", click: () => sendNativeMenuAction("file:saveAs") },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { type: "separator" },
        { label: "Find", accelerator: "CommandOrControl+F", click: () => sendNativeMenuAction("edit:find") },
        { label: "Replace", accelerator: "CommandOrControl+H", click: () => sendNativeMenuAction("edit:replace") },
      ],
    },
    {
      label: "Tasks",
      submenu: [
        { label: "New Task", accelerator: "CommandOrControl+Enter", click: () => sendNativeMenuAction("task:new") },
        { label: "Toggle Done", accelerator: "CommandOrControl+D", click: () => sendNativeMenuAction("task:toggleDone") },
        { label: "Toggle Cancelled", accelerator: "Alt+C", click: () => sendNativeMenuAction("task:toggleCancelled") },
        { type: "separator" },
        { label: "Archive Done", accelerator: "CommandOrControl+Shift+A", click: () => sendNativeMenuAction("task:archive") },
      ],
    },
    {
      label: "Format",
      submenu: [
        { label: "Bold", accelerator: "CommandOrControl+B", click: () => sendNativeMenuAction("format:bold") },
        { label: "Italic", accelerator: "CommandOrControl+I", click: () => sendNativeMenuAction("format:italic") },
        { label: "Underline", accelerator: "CommandOrControl+U", click: () => sendNativeMenuAction("format:underline") },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Widget", click: () => sendNativeMenuAction("view:widget") },
        { label: "Cycle Theme", click: () => sendNativeMenuAction("view:themeCycle") },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "front" }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function toValidTimestamp(year: number, month: number, day: number, hour: number, minute: number): number | null {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date.getTime();
}

function extractDueTimestamp(taskText: string): number | null {
  const explicitYear = taskText.match(/(?:^|\s)@(\d{4})(?=\s|$)/);
  const fallbackYear = explicitYear ? parseInt(explicitYear[1], 10) : new Date().getFullYear();

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

function cleanTaskLabel(text: string): string {
  return text
    .replace(/@est\([^)]*\)/g, "")
    .replace(/(?:^|\s)@\d{4}[\/.]\d{2}[\/.]\d{2}\s+\d{2}:\d{2}(?=\s|$)/g, "")
    .replace(/(?:^|\s)@\d{2}[\/.]\d{2}\s+\d{2}:\d{2}(?=\s|$)/g, "")
    .replace(/(?:^|\s)@\d{8}(?=\s|$)/g, "")
    .replace(/(?:^|\s)@\d{4}(?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractReminderTasks(content: string, filePath: string): ReminderTask[] {
  const lines = content.split("\n");
  const projectStack: { indent: number; name: string }[] = [];
  const reminders: ReminderTask[] = [];

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
      dueAt,
    });
  }

  return reminders;
}

function clearReminderTimer(reminder: ReminderTask) {
  if (reminder.timer) {
    clearTimeout(reminder.timer);
    reminder.timer = null;
  }
}

function broadcastUpdatedContent(content: string, filePath: string) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("editor:taskAppended", content);
  }
  const fileName = filePath.split(/[\\/]/).pop() || "Untitled";
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.webContents.send("sticker:update", content, fileName);
  }
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send("sticker:update", content, fileName);
  }
}

function markReminderTaskDone(reminder: ReminderTask) {
  if (!existsSync(reminder.filePath)) return;
  const lines = readFileSync(reminder.filePath, "utf-8").split("\n");

  let targetIndex = -1;
  if (lines[reminder.lineIndex]) {
    const current = lines[reminder.lineIndex].match(/^\s*☐\s+(.+)$/)?.[1]?.trim();
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
    const date = new Date().toISOString().slice(0, 10);
    updated += ` @done(${date})`;
  }
  lines[targetIndex] = updated;

  const content = lines.join("\n");
  writeFileSync(reminder.filePath, content, "utf-8");
  syncRemindersFromContent(content, reminder.filePath);
  broadcastUpdatedContent(content, reminder.filePath);
}

function removeReminder(reminderId: string) {
  const reminder = activeReminders.get(reminderId);
  if (!reminder) return;
  clearReminderTimer(reminder);
  activeReminders.delete(reminderId);
}

function scheduleReminder(reminderId: string, dueAt: number) {
  const reminder = activeReminders.get(reminderId);
  if (!reminder) return;
  reminder.dueAt = dueAt;
  clearReminderTimer(reminder);
  const delayMs = Math.max(0, reminder.dueAt - Date.now());
  reminder.timer = setTimeout(() => {
    fireReminder(reminderId);
  }, delayMs);
}

function getNextReminderPreview() {
  let next: ReminderTask | null = null;
  for (const reminder of activeReminders.values()) {
    if (!next || reminder.dueAt < next.dueAt) {
      next = reminder;
    }
  }
  if (!next) return null;

  const deltaMs = next.dueAt - Date.now();
  const remainingSeconds = Math.max(0, Math.ceil(deltaMs / 1000));
  return {
    id: next.id,
    projectName: next.projectName,
    taskText: cleanTaskLabel(next.taskText),
    remainingSeconds,
    dueAt: next.dueAt,
    isOverdue: deltaMs <= 0,
  };
}

function showReminderNotification(reminder: ReminderTask) {
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

  if (!Notification.isSupported()) {
    const fallbackOptions: Electron.MessageBoxSyncOptions = {
      type: "info",
      title: "任务提醒",
      message: reminder.projectName,
      detail: cleanTaskLabel(reminder.taskText),
      buttons: ["取消提醒", "已完成", "稍后提醒"],
      defaultId: 2,
      cancelId: 2,
    };
    const result = mainWindow
      ? dialog.showMessageBoxSync(mainWindow, fallbackOptions)
      : dialog.showMessageBoxSync(fallbackOptions);
    if (result === 0) onCancel();
    else if (result === 1) onComplete();
    if (!handled) scheduleReminder(reminder.id, Date.now() + REMINDER_REPEAT_MS);
    return;
  }

  const notification = new Notification({
    title: `提醒 · ${reminder.projectName}`,
    body: `${cleanTaskLabel(reminder.taskText)}\n截止时间已到`,
    actions: [
      { type: "button", text: "取消提醒" },
      { type: "button", text: "已完成" },
    ],
    closeButtonText: "稍后提醒",
    silent: false,
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
      scheduleReminder(reminder.id, Date.now() + REMINDER_REPEAT_MS);
    }
  });

  notification.show();
}

function fireReminder(reminderId: string) {
  const reminder = activeReminders.get(reminderId);
  if (!reminder) return;
  showReminderNotification(reminder);
}

function syncRemindersFromContent(content: string, filePath: string) {
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
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.close();
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

function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.focus();
    return;
  }

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  widgetWindow = new BrowserWindow({
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
    vibrancy: isMac ? "hud" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isMac) {
    widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    widgetWindow.loadURL(process.env.VITE_DEV_SERVER_URL + "/sticker.html?widget=1");
  } else {
    widgetWindow.loadFile(join(__dirname, "../dist/sticker.html"), {
      query: { widget: "1" },
    });
  }

  widgetWindow.webContents.on("did-finish-load", () => {
    if (currentFilePath && existsSync(currentFilePath)) {
      const content = readFileSync(currentFilePath, "utf-8");
      const fileName = currentFilePath.split(/[\\/]/).pop() || "Untitled";
      widgetWindow?.webContents.send("sticker:update", content, fileName);
    }
    widgetWindow?.webContents.send("sticker:lockState", stickerLocked);
  });

  widgetWindow.on("closed", () => {
    widgetWindow = null;
    mainWindow?.webContents.send("widget:visibility", false);
  });

  mainWindow?.webContents.send("widget:visibility", true);
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
    {
      label: "Show Editor",
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          createWindow();
        }
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { label: "Quick Entry", accelerator: quickEntryShortcut, click: () => toggleQuickEntry() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
    }
    mainWindow?.show();
    mainWindow?.focus();
  });
}

app.whenReady().then(() => {
  if (isMac) {
    setupMacApplicationMenu();
  }
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
  // Keep background process alive (tray + reminders) on both macOS and Windows.
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
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send("sticker:update", content, fn);
  }
  syncRemindersFromContent(content, currentFilePath);
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
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send("sticker:update", content, fn);
  }
  syncRemindersFromContent(content, currentFilePath);
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
  syncRemindersFromContent(content, currentFilePath);
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
  syncRemindersFromContent(defaultContent, currentFilePath);
  return { path: currentFilePath, content: defaultContent };
});

ipcMain.handle("file:getDefault", () => {
  const defaultPath = join(app.getPath("documents"), "tasks.todo");
  if (existsSync(defaultPath)) {
    currentFilePath = defaultPath;
    const content = readFileSync(defaultPath, "utf-8");
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
  writeFileSync(defaultPath, defaultContent, "utf-8");
  syncRemindersFromContent(defaultContent, currentFilePath);
  return { path: defaultPath, content: defaultContent };
});

ipcMain.handle("file:getCurrentPath", () => currentFilePath);
ipcMain.handle("reminder:getNext", () => getNextReminderPreview());

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
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close();
    widgetWindow = null;
    return false;
  }
  createWidgetWindow();
  return true;
});

ipcMain.handle("sticker:isVisible", () => {
  return widgetWindow !== null && !widgetWindow.isDestroyed();
});

ipcMain.handle("widget:toggle", () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close();
    widgetWindow = null;
    return false;
  }
  createWidgetWindow();
  return true;
});

ipcMain.handle("widget:isVisible", () => {
  return widgetWindow !== null && !widgetWindow.isDestroyed();
});

ipcMain.handle("sticker:setLocked", (_event, locked: boolean) => {
  stickerLocked = locked;
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.setIgnoreMouseEvents(false);
    stickerWindow.webContents.send("sticker:lockState", locked);
  }
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.setIgnoreMouseEvents(false);
    widgetWindow.webContents.send("sticker:lockState", locked);
  }
  return locked;
});

ipcMain.handle("sticker:getLocked", () => stickerLocked);

ipcMain.handle("sticker:toggleTask", (_event, lineIndex: number) => {
  if (!currentFilePath || !existsSync(currentFilePath)) return false;
  if (!Number.isInteger(lineIndex) || lineIndex < 0) return false;

  const lines = readFileSync(currentFilePath, "utf-8").split("\n");
  if (lineIndex >= lines.length) return false;

  const line = lines[lineIndex];
  const now = new Date().toISOString().slice(0, 10);

  if (line.includes("☐")) {
    let next = line.replace("☐", "✔");
    if (!next.includes("@done")) {
      next += ` @done(${now})`;
    }
    lines[lineIndex] = next;
  } else if (line.includes("✔")) {
    lines[lineIndex] = line
      .replace("✔", "☐")
      .replace(/ ?@done(\([^)]*\))?/g, "");
  } else if (line.includes("✘")) {
    lines[lineIndex] = line
      .replace("✘", "☐")
      .replace(/ ?@cancel(?:led)?(\([^)]*\))?/g, "");
  } else {
    return false;
  }

  const content = lines.join("\n");
  writeFileSync(currentFilePath, content, "utf-8");
  syncRemindersFromContent(content, currentFilePath);
  broadcastUpdatedContent(content, currentFilePath);
  return true;
});

// Back to main editor: restore main window and close sticker
ipcMain.handle("sticker:back", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.restore();
    mainWindow.focus();
  }
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close();
    widgetWindow = null;
  }
});

// Called by main renderer whenever content changes — forward to sticker
ipcMain.on("sticker:syncContent", (_event, content: string, fileName: string) => {
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.webContents.send("sticker:update", content, fileName);
  }
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send("sticker:update", content, fileName);
  }
});

// Called by main renderer whenever draft content changes — keep reminder timers in sync
ipcMain.on("reminder:syncDraft", (_event, content: string) => {
  if (!currentFilePath) return;
  syncRemindersFromContent(content, currentFilePath);
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
    syncRemindersFromContent(content, currentFilePath);

    // Notify main editor to reload content
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("editor:taskAppended", content);
    }
    // Sync to sticker
    const fn = currentFilePath.split(/[\\/]/).pop() || "Untitled";
    if (stickerWindow && !stickerWindow.isDestroyed()) {
      stickerWindow.webContents.send("sticker:update", content, fn);
    }
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send("sticker:update", content, fn);
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

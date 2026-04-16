import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

let mainWindow: BrowserWindow | null = null;
let currentFilePath: string | null = null;

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
  });
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

ipcMain.handle("file:getDefault", () => {
  const defaultPath = join(app.getPath("documents"), "tasks.todo");
  if (existsSync(defaultPath)) {
    currentFilePath = defaultPath;
    return { path: defaultPath, content: readFileSync(defaultPath, "utf-8") };
  }
  currentFilePath = defaultPath;
  const defaultContent = `My Project:
  ☐ Welcome to Todo Studio! @started
  ☐ Use ☐ for pending tasks
  ✔ Use ✔ for completed tasks @done
  ✘ Use ✘ for cancelled tasks @cancelled
  ☐ Add @tags and +projects to organize
  ☐ Nest tasks with indentation
  ☐ Press Ctrl+D to toggle task completion
  ☐ Press Ctrl+Shift+A to archive done tasks
  ☐ Due dates work too @due(2025-12-31)

Archive:
`;
  writeFileSync(defaultPath, defaultContent, "utf-8");
  return { path: defaultPath, content: defaultContent };
});

ipcMain.handle("file:getCurrentPath", () => currentFilePath);

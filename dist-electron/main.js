"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
let mainWindow = null;
let currentFilePath = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1e3,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#1e1e2e",
      symbolColor: "#cdd6f4",
      height: 36
    },
    backgroundColor: "#1e1e2e",
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
  });
}
electron.app.whenReady().then(createWindow);
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
electron.ipcMain.handle("file:getDefault", () => {
  const defaultPath = path.join(electron.app.getPath("documents"), "tasks.todo");
  if (fs.existsSync(defaultPath)) {
    currentFilePath = defaultPath;
    return { path: defaultPath, content: fs.readFileSync(defaultPath, "utf-8") };
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
  fs.writeFileSync(defaultPath, defaultContent, "utf-8");
  return { path: defaultPath, content: defaultContent };
});
electron.ipcMain.handle("file:getCurrentPath", () => currentFilePath);

"use strict";const n=require("electron"),r=require("path"),a=require("fs");let l=null,e=null,t=null,c=!1;function u(){l=new n.BrowserWindow({width:1e3,height:700,minWidth:600,minHeight:400,frame:!1,titleBarStyle:"hidden",titleBarOverlay:{color:"#1e1e2e",symbolColor:"#cdd6f4",height:36},backgroundColor:"#1e1e2e",webPreferences:{preload:r.join(__dirname,"preload.js"),contextIsolation:!0,nodeIntegration:!1}}),process.env.VITE_DEV_SERVER_URL?l.loadURL(process.env.VITE_DEV_SERVER_URL):l.loadFile(r.join(__dirname,"../dist/index.html")),l.on("closed",()=>{l=null,e&&!e.isDestroyed()&&e.close()})}function f(){if(e&&!e.isDestroyed()){e.focus();return}const{width:s,height:i}=n.screen.getPrimaryDisplay().workAreaSize;e=new n.BrowserWindow({width:320,height:480,x:s-340,y:i-520,frame:!1,alwaysOnTop:!0,transparent:!0,resizable:!0,skipTaskbar:!0,hasShadow:!1,backgroundColor:"#00000000",webPreferences:{preload:r.join(__dirname,"preload.js"),contextIsolation:!0,nodeIntegration:!1}}),process.env.VITE_DEV_SERVER_URL?e.loadURL(process.env.VITE_DEV_SERVER_URL+"/sticker.html"):e.loadFile(r.join(__dirname,"../dist/sticker.html")),e.webContents.on("did-finish-load",()=>{if(t&&a.existsSync(t)){const o=a.readFileSync(t,"utf-8"),d=t.split(/[\\/]/).pop()||"Untitled";e==null||e.webContents.send("sticker:update",o,d)}e==null||e.webContents.send("sticker:lockState",c)}),e.on("closed",()=>{e=null,l==null||l.webContents.send("sticker:visibility",!1)}),l==null||l.webContents.send("sticker:visibility",!0)}n.app.whenReady().then(u);n.app.on("window-all-closed",()=>{process.platform!=="darwin"&&n.app.quit()});n.app.on("activate",()=>{n.BrowserWindow.getAllWindows().length===0&&u()});n.ipcMain.handle("file:open",async()=>{const s=await n.dialog.showOpenDialog(l,{properties:["openFile"],filters:[{name:"Todo Files",extensions:["todo","txt","md"]},{name:"All Files",extensions:["*"]}]});if(s.canceled||s.filePaths.length===0)return null;t=s.filePaths[0];const i=a.readFileSync(t,"utf-8"),o=t.split(/[\\/]/).pop()||"Untitled";return e&&!e.isDestroyed()&&e.webContents.send("sticker:update",i,o),{path:t,content:i}});n.ipcMain.handle("file:save",async(s,i)=>{if(!t){const d=await n.dialog.showSaveDialog(l,{defaultPath:"tasks.todo",filters:[{name:"Todo Files",extensions:["todo"]},{name:"All Files",extensions:["*"]}]});if(d.canceled||!d.filePath)return null;t=d.filePath}a.writeFileSync(t,i,"utf-8");const o=t.split(/[\\/]/).pop()||"Untitled";return e&&!e.isDestroyed()&&e.webContents.send("sticker:update",i,o),t});n.ipcMain.handle("file:saveAs",async(s,i)=>{const o=await n.dialog.showSaveDialog(l,{defaultPath:t||"tasks.todo",filters:[{name:"Todo Files",extensions:["todo"]},{name:"All Files",extensions:["*"]}]});return o.canceled||!o.filePath?null:(t=o.filePath,a.writeFileSync(t,i,"utf-8"),t)});n.ipcMain.handle("file:new",async()=>{const s=await n.dialog.showSaveDialog(l,{defaultPath:r.join(n.app.getPath("documents"),"tasks.todo"),filters:[{name:"Todo Files",extensions:["todo"]},{name:"All Files",extensions:["*"]}]});if(s.canceled||!s.filePath)return null;t=s.filePath;const i="";return a.writeFileSync(t,i,"utf-8"),{path:t,content:i}});n.ipcMain.handle("file:getDefault",()=>{const s=r.join(n.app.getPath("documents"),"tasks.todo");if(a.existsSync(s))return t=s,{path:s,content:a.readFileSync(s,"utf-8")};t=s;const i=`欢迎使用 Todo Studio:
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
`;return a.writeFileSync(s,i,"utf-8"),{path:s,content:i}});n.ipcMain.handle("file:getCurrentPath",()=>t);n.ipcMain.handle("sticker:requestContent",()=>{if(t&&a.existsSync(t)){const s=a.readFileSync(t,"utf-8"),i=t.split(/[\\/]/).pop()||"Untitled";return{content:s,fileName:i}}return null});n.ipcMain.handle("sticker:toggle",()=>e&&!e.isDestroyed()?(e.close(),e=null,!1):(f(),!0));n.ipcMain.handle("sticker:isVisible",()=>e!==null&&!e.isDestroyed());n.ipcMain.handle("sticker:setLocked",(s,i)=>(c=i,e&&!e.isDestroyed()&&(e.setIgnoreMouseEvents(i,{forward:!0}),e.webContents.send("sticker:lockState",i)),i));n.ipcMain.handle("sticker:getLocked",()=>c);n.ipcMain.on("sticker:syncContent",(s,i,o)=>{e&&!e.isDestroyed()&&e.webContents.send("sticker:update",i,o)});

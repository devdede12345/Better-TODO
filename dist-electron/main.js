"use strict";const e=require("electron"),s=require("path"),o=require("fs");let i=null,n=null;function r(){i=new e.BrowserWindow({width:1e3,height:700,minWidth:600,minHeight:400,frame:!1,titleBarStyle:"hidden",titleBarOverlay:{color:"#1e1e2e",symbolColor:"#cdd6f4",height:36},backgroundColor:"#1e1e2e",webPreferences:{preload:s.join(__dirname,"preload.js"),contextIsolation:!0,nodeIntegration:!1}}),process.env.VITE_DEV_SERVER_URL?i.loadURL(process.env.VITE_DEV_SERVER_URL):i.loadFile(s.join(__dirname,"../dist/index.html")),i.on("closed",()=>{i=null})}e.app.whenReady().then(r);e.app.on("window-all-closed",()=>{process.platform!=="darwin"&&e.app.quit()});e.app.on("activate",()=>{e.BrowserWindow.getAllWindows().length===0&&r()});e.ipcMain.handle("file:open",async()=>{const t=await e.dialog.showOpenDialog(i,{properties:["openFile"],filters:[{name:"Todo Files",extensions:["todo","txt","md"]},{name:"All Files",extensions:["*"]}]});if(t.canceled||t.filePaths.length===0)return null;n=t.filePaths[0];const l=o.readFileSync(n,"utf-8");return{path:n,content:l}});e.ipcMain.handle("file:save",async(t,l)=>{if(!n){const a=await e.dialog.showSaveDialog(i,{defaultPath:"tasks.todo",filters:[{name:"Todo Files",extensions:["todo"]},{name:"All Files",extensions:["*"]}]});if(a.canceled||!a.filePath)return null;n=a.filePath}return o.writeFileSync(n,l,"utf-8"),n});e.ipcMain.handle("file:saveAs",async(t,l)=>{const a=await e.dialog.showSaveDialog(i,{defaultPath:n||"tasks.todo",filters:[{name:"Todo Files",extensions:["todo"]},{name:"All Files",extensions:["*"]}]});return a.canceled||!a.filePath?null:(n=a.filePath,o.writeFileSync(n,l,"utf-8"),n)});e.ipcMain.handle("file:new",async()=>{const t=await e.dialog.showSaveDialog(i,{defaultPath:s.join(e.app.getPath("documents"),"tasks.todo"),filters:[{name:"Todo Files",extensions:["todo"]},{name:"All Files",extensions:["*"]}]});if(t.canceled||!t.filePath)return null;n=t.filePath;const l="";return o.writeFileSync(n,l,"utf-8"),{path:n,content:l}});e.ipcMain.handle("file:getDefault",()=>{const t=s.join(e.app.getPath("documents"),"tasks.todo");if(o.existsSync(t))return n=t,{path:t,content:o.readFileSync(t,"utf-8")};n=t;const l=`欢迎使用 Todo Studio:
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
`;return o.writeFileSync(t,l,"utf-8"),{path:t,content:l}});e.ipcMain.handle("file:getCurrentPath",()=>n);

# Better TODO

  

一个极简、编辑器风格的桌面待办事项管理工具，基于 Electron + React + CodeMirror 构建。

  ![](https://img.erpweb.eu.org/imgs/2026/04/fe353cf536bceda4.png)
  

## 功能特性

  

- **编辑器体验** — 基于 CodeMirror，支持语法高亮、快捷键、搜索替换

- **任务管理** — 待办 ☐、完成 ✔、取消 ✘ 三种状态，一键切换

- **标签系统** — 支持 `@tag`、`@critical`、`@today`、`@due(日期)` 等标签

- **项目分组** — 以冒号结尾的行自动识别为项目标题

- **嵌套任务** — 通过缩进创建层级结构

- **自动保存** — 编辑后 2 秒自动保存

- **归档功能** — `Ctrl+Shift+A` 将已完成/已取消任务归档

- **Sticker 桌面便签** — 独立悬浮窗口，实时同步显示任务列表

![ZBE4lb.png](https://i.imgs.ovh/2026/04/19/ZBE4lb.png)

- **数学公式** — 支持 KaTeX 渲染

- **`.todo` 文件关联** — 安装后可直接双击打开 `.todo` 文件

  

## 快捷键

  

| 快捷键 | 功能 |
| :--- | :--- |
| `Ctrl+D` | 切换任务状态（待办 → 完成 → 取消 → 待办） |
| `Ctrl+Enter` | 在当前行下方新建任务 |
| `Ctrl+S` | 保存文件 |
| `Ctrl+Shift+S` | 另存为 |
| `Ctrl+O` | 打开文件 |
| `Ctrl+F` | 搜索 |
| `Ctrl+H` | 替换 |
| `Ctrl+Z` | 撤销 |
| `Ctrl+Shift+Z` | 重做 |
| `Ctrl+B` | 粗体 |
| `Ctrl+I` | 斜体 |
| `Ctrl+U` | 下划线 |
| `Ctrl+Shift+A` | 归档已完成/已取消任务 |

  

## Sticker 桌面便签

  

点击编辑器菜单栏中的 **Sticker** 按钮即可开启桌面便签窗口：

  

- 始终置顶，透明无边框

- 实时同步主编辑器内容

- 支持锁定模式（鼠标穿透）

- 内置 File 菜单可独立打开文件

- 点击 Back 返回主编辑器

  

## 开发

  

### 环境要求

  

- Node.js >= 18

- pnpm / npm

  

### 安装依赖

  

```bash

npm install

```

  

### 开发模式

  

```bash

npm run electron:dev

```

  

### 构建安装包

  

```bash

npm run electron:build

```

  

构建产物输出到 `release/` 目录。

- Windows：`Better TODO Setup x.x.x.exe`
- macOS：`Better TODO-x.x.x.dmg` 与 `Better TODO-x.x.x-mac.zip`

按平台单独构建：

```bash
npm run electron:build:win
npm run electron:build:mac
```

  

## 技术栈

  

- **Electron** — 桌面应用框架

- **React 18** — UI 框架

- **CodeMirror 6** — 代码编辑器引擎

- **Tailwind CSS** — 样式

- **Vite** — 构建工具

- **electron-builder** — 打包分发

- **Lucide** — 图标库

- **KaTeX** — 数学公式渲染

  

## 项目结构

  

```

├── electron/           # Electron 主进程 & preload
│   ├── main.ts         # 主进程（窗口管理、IPC、文件操作）
│   └── preload.ts      # 预加载脚本（IPC 桥接）
├── src/
│   ├── App.tsx          # 主应用组件
│   ├── components/      # React 组件（Dashboard、TodoEditor）
│   ├── editor/          # CodeMirror 扩展（语法、主题、解析器）
│   └── sticker/         # Sticker 便签窗口
├── build/              # 构建资源（图标等）
├── dist/               # Vite 构建产物
├── release/            # electron-builder 输出
└── package.json

```

  

## 许可证

  

MIT
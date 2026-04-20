export {};

interface FileResult {
  path: string;
  content: string;
}

interface ReminderPreview {
  id: string;
  projectName: string;
  taskText: string;
  remainingSeconds: number;
  dueAt: number;
  isOverdue: boolean;
}

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
}

interface FolderTree {
  rootPath: string;
  rootName: string;
  children: FileTreeNode[];
}

declare global {
  interface Window {
    electronAPI: {
      newFile: () => Promise<FileResult | null>;
      openFile: () => Promise<FileResult | null>;
      saveFile: (content: string) => Promise<string | null>;
      saveFileAs: (content: string) => Promise<string | null>;
      getDefaultFile: () => Promise<FileResult>;
      getCurrentPath: () => Promise<string | null>;
      getNextReminder: () => Promise<ReminderPreview | null>;
      reminderSnoozeNext: (delayMs: number) => Promise<boolean>;
      reminderCompleteNext: () => Promise<boolean>;
      reminderSyncDraft: (content: string) => void;
      onNativeMenuAction: (cb: (action: string) => void) => () => void;

      // Sticker
      stickerToggle: () => Promise<boolean>;
      stickerIsVisible: () => Promise<boolean>;
      widgetToggle: () => Promise<boolean>;
      widgetIsVisible: () => Promise<boolean>;
      stickerSetLocked: (locked: boolean) => Promise<boolean>;
      stickerGetLocked: () => Promise<boolean>;
      stickerToggleTask: (lineIndex: number) => Promise<boolean>;
      stickerDeleteTask: (lineIndex: number) => Promise<boolean>;
      stickerAddTask: (text: string) => Promise<boolean>;
      stickerSyncContent: (content: string, fileName: string) => void;
      stickerRequestContent: () => Promise<{ content: string; fileName: string } | null>;
      stickerBack: () => Promise<void>;
      onStickerUpdate: (cb: (content: string, fileName: string) => void) => () => void;
      onStickerLockState: (cb: (locked: boolean) => void) => () => void;
      onStickerVisibility: (cb: (visible: boolean) => void) => () => void;
      onWidgetVisibility: (cb: (visible: boolean) => void) => () => void;

      // Quick Entry
      quickEntrySubmit: (text: string) => Promise<void>;
      quickEntryHide: () => Promise<void>;
      onQuickEntryShow: (cb: () => void) => () => void;
      onTaskAppended: (cb: (task: string) => void) => () => void;

      // Explorer
      explorerOpenFolder: () => Promise<FolderTree | null>;
      explorerReadDir: (rootPath: string) => Promise<FolderTree | null>;
      explorerOpenFileByPath: (filePath: string) => Promise<FileResult | null>;

      // System settings
      systemGetSettings: () => Promise<{ autoLaunch: boolean; minimizeToTray: boolean }>;
      systemSetAutoLaunch: (enabled: boolean) => Promise<boolean>;
      systemSetMinimizeToTray: (enabled: boolean) => Promise<boolean>;
    };
  }
}

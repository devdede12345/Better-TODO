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

      // Sticker
      stickerToggle: () => Promise<boolean>;
      stickerIsVisible: () => Promise<boolean>;
      stickerSetLocked: (locked: boolean) => Promise<boolean>;
      stickerGetLocked: () => Promise<boolean>;
      stickerSyncContent: (content: string, fileName: string) => void;
      stickerRequestContent: () => Promise<{ content: string; fileName: string } | null>;
      stickerBack: () => Promise<void>;
      onStickerUpdate: (cb: (content: string, fileName: string) => void) => () => void;
      onStickerLockState: (cb: (locked: boolean) => void) => () => void;
      onStickerVisibility: (cb: (visible: boolean) => void) => () => void;

      // Quick Entry
      quickEntrySubmit: (text: string) => Promise<void>;
      quickEntryHide: () => Promise<void>;
      onQuickEntryShow: (cb: () => void) => () => void;
      onTaskAppended: (cb: (task: string) => void) => () => void;
    };
  }
}

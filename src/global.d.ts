export {};

interface FileResult {
  path: string;
  content: string;
}

declare global {
  interface Window {
    electronAPI: {
      openFile: () => Promise<FileResult | null>;
      saveFile: (content: string) => Promise<string | null>;
      saveFileAs: (content: string) => Promise<string | null>;
      getDefaultFile: () => Promise<FileResult>;
      getCurrentPath: () => Promise<string | null>;
    };
  }
}

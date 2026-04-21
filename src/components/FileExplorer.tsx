import { useState, useCallback, useEffect, useRef } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  File,
  FolderPlus,
  RefreshCw,
  PanelLeftClose,
} from "lucide-react";

interface FileExplorerProps {
  currentFilePath: string | null;
  onOpenFile: (filePath: string, content: string) => void;
  onClose: () => void;
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

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "todo" || ext === "txt" || ext === "md") {
    return <FileText size={14} className="text-editor-accent shrink-0" />;
  }
  return <File size={14} className="text-editor-muted shrink-0" />;
}

function TreeNode({
  node,
  depth,
  currentFilePath,
  onFileClick,
}: {
  node: FileTreeNode;
  depth: number;
  currentFilePath: string | null;
  onFileClick: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isActive = !node.isDirectory && node.path === currentFilePath;
  const paddingLeft = 8 + depth * 16;

  if (node.isDirectory) {
    return (
      <div>
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center w-full gap-1 py-[3px] pr-2 text-[12px] text-editor-subtext hover:text-editor-text hover:bg-editor-border/40 transition-colors cursor-pointer"
          style={{ paddingLeft }}
        >
          {expanded ? (
            <ChevronDown size={14} className="shrink-0 text-editor-muted" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-editor-muted" />
          )}
          {expanded ? (
            <FolderOpen size={14} className="shrink-0 text-editor-yellow" />
          ) : (
            <Folder size={14} className="shrink-0 text-editor-yellow" />
          )}
          <span className="truncate ml-0.5 font-medium">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child: FileTreeNode) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                currentFilePath={currentFilePath}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onFileClick(node.path)}
      className={`flex items-center w-full gap-1 py-[3px] pr-2 text-[12px] transition-colors cursor-pointer ${
        isActive
          ? "bg-editor-accent/15 text-editor-accent"
          : "text-editor-subtext hover:text-editor-text hover:bg-editor-border/40"
      }`}
      style={{ paddingLeft: paddingLeft + 14 }}
      title={node.path}
    >
      {getFileIcon(node.name)}
      <span className="truncate ml-0.5">{node.name}</span>
    </button>
  );
}

export default function FileExplorer({ currentFilePath, onOpenFile, onClose }: FileExplorerProps) {
  const [folderTree, setFolderTree] = useState<FolderTree | null>(() => {
    const saved = localStorage.getItem("explorer-folder");
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Persist the open folder path
  useEffect(() => {
    if (folderTree) {
      localStorage.setItem("explorer-folder", JSON.stringify({ rootPath: folderTree.rootPath, rootName: folderTree.rootName, children: [] }));
    }
  }, [folderTree?.rootPath]);

  // On mount, reload the saved folder
  useEffect(() => {
    const saved = localStorage.getItem("explorer-folder");
    if (!saved) return;
    try {
      const { rootPath } = JSON.parse(saved);
      if (rootPath && window.electronAPI?.explorerReadDir) {
        window.electronAPI.explorerReadDir(rootPath).then((tree) => {
          if (tree) setFolderTree(tree);
        });
      }
    } catch { /* ignore */ }
  }, []);

  const handleOpenFolder = useCallback(async () => {
    if (!window.electronAPI?.explorerOpenFolder) return;
    setLoading(true);
    const tree = await window.electronAPI.explorerOpenFolder();
    setLoading(false);
    if (tree) setFolderTree(tree);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!folderTree || !window.electronAPI?.explorerReadDir) return;
    setLoading(true);
    const tree = await window.electronAPI.explorerReadDir(folderTree.rootPath);
    setLoading(false);
    if (tree) setFolderTree(tree);
  }, [folderTree]);

  const handleFileClick = useCallback(
    async (filePath: string) => {
      if (!window.electronAPI?.explorerOpenFileByPath) return;
      const result = await window.electronAPI.explorerOpenFileByPath(filePath);
      if (result) {
        onOpenFile(result.path, result.content);
      }
    },
    [onOpenFile]
  );

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full border-r border-editor-border bg-editor-bg select-none"
      style={{ width: 240, minWidth: 180, maxWidth: 400 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-editor-border shrink-0">
        <span className="text-[11px] font-semibold text-editor-muted uppercase tracking-wider">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleOpenFolder}
            className="p-1 rounded hover:bg-editor-border/60 transition-colors"
            title="Open Folder"
          >
            <FolderPlus size={14} className="text-editor-subtext" />
          </button>
          {folderTree && (
            <button
              onClick={handleRefresh}
              className="p-1 rounded hover:bg-editor-border/60 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className={`text-editor-subtext ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-editor-border/60 transition-colors"
            title="Close Sidebar"
          >
            <PanelLeftClose size={14} className="text-editor-subtext" />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {!folderTree ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-3">
            <Folder size={32} className="text-editor-muted/50" />
            <p className="text-[11px] text-editor-muted leading-relaxed">
              No folder opened yet
            </p>
            <button
              onClick={handleOpenFolder}
              className="px-3 py-1.5 text-[11px] rounded-md bg-editor-accent/15 text-editor-accent hover:bg-editor-accent/25 transition-colors"
            >
              Open Folder
            </button>
          </div>
        ) : (
          <div>
            {/* Root folder header */}
            <div className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-editor-text uppercase tracking-wide">
              <FolderOpen size={14} className="text-editor-yellow shrink-0" />
              <span className="truncate">{folderTree.rootName}</span>
            </div>
            {folderTree.children.map((node: FileTreeNode) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                currentFilePath={currentFilePath}
                onFileClick={handleFileClick}
              />
            ))}
            {folderTree.children.length === 0 && (
              <p className="px-4 py-2 text-[11px] text-editor-muted italic">
                Empty folder
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

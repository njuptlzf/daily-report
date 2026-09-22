/**
 * File and folder suggesters with hierarchical loading.
 * Shows only one level at a time; click to enter subfolders.
 */

import { App, SuggestModal, TFile, TFolder } from "obsidian";

/**
 * Refresh suggestions by clearing input and triggering event.
 */
function refreshSuggestions(modal: SuggestModal<string>): void {
  const input = modal.inputEl;
  if (input) {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/**
 * File suggester for selecting template files from the vault.
 * Hierarchical: shows files in current folder, click folder to enter.
 */
export class TemplateFileSuggester extends SuggestModal<string> {
  private onSelect: (file: TFile) => void;
  private currentFolder: string = "";

  constructor(
    app: App,
    onSelect: (file: TFile) => void
  ) {
    super(app);
    this.onSelect = onSelect;
    this.limit = 100;
    this.emptyStateText = "当前目录没有 Markdown 文件";

    this.setPlaceholder("输入文件名或 / 进入目录...");

    this.setInstructions([
      { command: "↑↓", purpose: "选择" },
      { command: "Enter", purpose: "选择/进入" },
      { command: "../", purpose: "返回上级" },
      { command: "Esc", purpose: "取消" },
    ]);
  }

  getSuggestions(query: string): string[] {
    const folder = this.currentFolder;
    const queryLower = query.toLowerCase();

    // Support ".." to go up
    if (queryLower === "..") {
      return [".."];
    }

    // Support "/" prefix to enter subfolder
    if (queryLower.startsWith("/")) {
      const subfolderName = query.substring(1);
      const subfolder = this.app.vault.getAbstractFileByPath(
        folder ? `${folder}/${subfolderName}` : subfolderName
      );
      if (subfolder && subfolder instanceof TFolder) {
        return [subfolderName];
      }
      return [];
    }

    // List files in current folder
    const allFiles = this.app.vault.getMarkdownFiles();
    const results: string[] = [];

    for (const file of allFiles) {
      const parts = file.path.split("/");
      const folderParts = parts.slice(0, -1);
      const fileFolder = folderParts.join("/");

      if (fileFolder === folder) {
        const fileName = parts[parts.length - 1];
        if (
          !queryLower ||
          fileName.toLowerCase().includes(queryLower)
        ) {
          results.push(fileName);
        }
      }
    }

    // Also list subfolders
    const allFolders = this.app.vault.getAllFolders();
    for (const dir of allFolders) {
      const dirPath = dir.path;
      const dirParts = dirPath.split("/");
      const dirFolder = dirParts.slice(0, -1).join("/");
      const dirName = dirParts[dirParts.length - 1];

      if (dirFolder === folder) {
        if (!queryLower || dirName.toLowerCase().includes(queryLower)) {
          results.push(dirName + "/");
        }
      }
    }

    return results;
  }

  renderSuggestion(item: string, el: HTMLElement): void {
    if (item === "..") {
      el.createEl("div", { text: "📁 ..", cls: "suggestion-item-folder" });
    } else if (item.endsWith("/")) {
      el.createEl("div", { text: "📁 " + item, cls: "suggestion-item-folder" });
    } else {
      el.createEl("div", { text: "📄 " + item, cls: "suggestion-item-file" });
    }
  }

  onChooseSuggestion(
    item: string,
    _evt: MouseEvent | KeyboardEvent
  ): void {
    if (item === "..") {
      // Go up one level
      if (this.currentFolder) {
        const parts = this.currentFolder.split("/");
        parts.pop();
        this.currentFolder = parts.join("/");
      }
      refreshSuggestions(this);
      return;
    }

    if (item.endsWith("/")) {
      // Enter subfolder
      const folderName = item.substring(0, item.length - 1);
      this.currentFolder = this.currentFolder
        ? `${this.currentFolder}/${folderName}`
        : folderName;
      refreshSuggestions(this);
      return;
    }

    // Select file
    const filePath = this.currentFolder
      ? `${this.currentFolder}/${item}`
      : item;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      this.onSelect(file);
      this.close();
    }
  }
}

/**
 * Validate that a file exists and is a markdown file.
 * Returns an error message if validation fails, null otherwise.
 */
export function validateTemplateFile(
  app: App,
  filePath: string
): string | null {
  if (!filePath || filePath.trim() === "") {
    return "模板文件路径不能为空";
  }

  const file = app.vault.getAbstractFileByPath(filePath);

  if (!file) {
    return `文件不存在: ${filePath}`;
  }

  if (!(file instanceof TFile)) {
    return `路径不是文件: ${filePath}`;
  }

  if (!filePath.endsWith(".md")) {
    return `模板文件必须是 Markdown 文件: ${filePath}`;
  }

  return null;
}

/**
 * Folder suggester for selecting parent folder from the vault.
 * Hierarchical: shows folders in current path, click to enter.
 */
export class FolderSuggester extends SuggestModal<string> {
  private onSelect: (folder: string) => void;
  private currentPath: string = "";
  private rootMode: boolean = false;

  constructor(
    app: App,
    onSelect: (folder: string) => void,
    options?: { rootMode?: boolean }
  ) {
    super(app);
    this.onSelect = onSelect;
    this.rootMode = options?.rootMode ?? false;
    this.limit = 100;
    this.emptyStateText = "当前路径没有子目录";

    this.setPlaceholder("输入目录名或 / 进入目录...");

    this.setInstructions([
      { command: "↑↓", purpose: "选择" },
      { command: "Enter", purpose: "选择/进入" },
      { command: "../", purpose: "返回上级" },
      { command: "Esc", purpose: "取消" },
    ]);
  }

  getSuggestions(query: string): string[] {
    const path = this.currentPath;
    const queryLower = query.toLowerCase();

    // Support ".." to go up
    if (queryLower === "..") {
      return [".."];
    }

    // Support "/" prefix to enter subfolder
    if (queryLower.startsWith("/")) {
      const subfolderName = query.substring(1);
      const subfolder = this.app.vault.getAbstractFileByPath(
        path ? `${path}/${subfolderName}` : subfolderName
      );
      if (subfolder && subfolder instanceof TFolder) {
        return [subfolderName];
      }
      return [];
    }

    const results: string[] = [];

    // Add "select current folder" option (filtered by query)
    const currentLabel = path ? path : "(根目录)";
    if (!queryLower || currentLabel.toLowerCase().includes(queryLower)) {
      results.push("✓ " + currentLabel);
    }

    // List subfolders
    const allFolders = this.app.vault.getAllFolders();
    for (const dir of allFolders) {
      const dirPath = dir.path;
      const dirParts = dirPath.split("/");
      const dirParent = dirParts.slice(0, -1).join("/");
      const dirName = dirParts[dirParts.length - 1];

      if (dirParent === path) {
        if (!queryLower || dirName.toLowerCase().includes(queryLower)) {
          results.push(dirName);
        }
      }
    }

    return results;
  }

  renderSuggestion(item: string, el: HTMLElement): void {
    if (item === "..") {
      el.createEl("div", { text: "📁 ..", cls: "suggestion-item-folder" });
    } else if (item.startsWith("✓ ")) {
      el.createEl("div", { text: "✅ " + item.substring(2), cls: "suggestion-item-select" });
    } else {
      el.createEl("div", { text: "📁 " + item, cls: "suggestion-item-folder" });
    }
  }

  onChooseSuggestion(
    item: string,
    _evt: MouseEvent | KeyboardEvent
  ): void {
    if (item === "..") {
      // Go up one level
      if (this.currentPath) {
        const parts = this.currentPath.split("/");
        parts.pop();
        this.currentPath = parts.join("/");
      }
      refreshSuggestions(this);
      return;
    }

    if (item.startsWith("✓ ")) {
      // Select current folder
      this.onSelect(this.currentPath);
      this.close();
      return;
    }

    // Enter subfolder
    const newPath = this.currentPath
      ? `${this.currentPath}/${item}`
      : item;
    this.currentPath = newPath;
    refreshSuggestions(this);
  }

  /**
   * Get the selected folder path.
   */
  getSelectedPath(): string {
    return this.currentPath;
  }
}

/**
 * Validate that a folder path is valid for daily notes parent folder.
 * Returns an error message if validation fails, null otherwise.
 */
export function validateParentFolder(
  _app: App,
  folderPath: string
): string | null {
  if (!folderPath || folderPath.trim() === "") {
    return null; // Empty means root, which is valid
  }

  // Check if folder exists or can be created
  const file = _app.vault.getAbstractFileByPath(folderPath);
  if (file) {
    // Folder exists, check if it's actually a folder
    if (file instanceof TFile) {
      return `路径是文件而不是目录: ${folderPath}`;
    }
  }

  return null;
}

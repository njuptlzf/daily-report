/**
 * File and folder suggesters with hierarchical loading.
 * Shows only one level at a time; click a folder to enter it.
 *
 * Key detail: Obsidian's SuggestModal.selectSuggestion closes the modal after
 * onChooseSuggestion. Navigation (enter / go up) must NOT close, so we override
 * selectSuggestion and only delegate to super for terminal selections.
 */

import { App, SuggestModal, TFile } from "obsidian";
import { t } from "./i18n";

/**
 * Refresh suggestions by clearing input and triggering the input event.
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
 * Hierarchical: shows files in the current folder; a trailing "/" entry is a
 * folder to enter.
 */
export class TemplateFileSuggester extends SuggestModal<string> {
  private onSelect: (file: TFile) => void;
  private currentFolder: string = "";

  constructor(app: App, onSelect: (file: TFile) => void) {
    super(app);
    this.onSelect = onSelect;
    this.limit = 100;
    this.emptyStateText = t("suggest.file.empty");
    this.setPlaceholder(t("suggest.file.placeholder"));
    this.setInstructions([
      { command: "↑↓", purpose: t("suggest.instr.select") },
      { command: "Enter", purpose: t("suggest.instr.enter") },
      { command: "../", purpose: t("suggest.instr.up") },
      { command: "Esc", purpose: t("suggest.instr.cancel") },
    ]);
  }

  /** Navigate without closing; only a real file selection closes. */
  selectSuggestion(item: string, evt: MouseEvent | KeyboardEvent): void {
    if (item === "..") {
      const parts = this.currentFolder.split("/");
      parts.pop();
      this.currentFolder = parts.join("/");
      refreshSuggestions(this);
      return;
    }
    if (item.endsWith("/")) {
      const name = item.slice(0, -1);
      this.currentFolder = this.currentFolder
        ? `${this.currentFolder}/${name}`
        : name;
      refreshSuggestions(this);
      return;
    }
    super.selectSuggestion(item, evt);
  }

  getSuggestions(query: string): string[] {
    const folder = this.currentFolder;
    const queryLower = query.toLowerCase();
    const results: string[] = [];

    if (folder) {
      results.push("..");
    }

    for (const file of this.app.vault.getMarkdownFiles()) {
      const parts = file.path.split("/");
      const fileFolder = parts.slice(0, -1).join("/");
      if (fileFolder !== folder) continue;
      const fileName = parts[parts.length - 1];
      if (!queryLower || fileName.toLowerCase().includes(queryLower)) {
        results.push(fileName);
      }
    }

    for (const dir of this.app.vault.getAllFolders()) {
      const dirParts = dir.path.split("/");
      const dirParent = dirParts.slice(0, -1).join("/");
      const dirName = dirParts[dirParts.length - 1];
      if (dirParent !== folder) continue;
      if (!queryLower || dirName.toLowerCase().includes(queryLower)) {
        results.push(dirName + "/");
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

  onChooseSuggestion(item: string, _evt: MouseEvent | KeyboardEvent): void {
    const filePath = this.currentFolder ? `${this.currentFolder}/${item}` : item;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      this.onSelect(file);
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
    return t("validate.file.empty");
  }
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!file) {
    return t("validate.file.notFound", { path: filePath });
  }
  if (!(file instanceof TFile)) {
    return t("validate.file.notFile", { path: filePath });
  }
  if (!filePath.endsWith(".md")) {
    return t("validate.file.notMd", { path: filePath });
  }
  return null;
}

/**
 * Folder suggester for selecting a parent folder from the vault.
 * The "✓" row selects the current folder; other rows enter subfolders.
 */
export class FolderSuggester extends SuggestModal<string> {
  private onSelect: (folder: string) => void;
  private currentPath: string = "";

  constructor(
    app: App,
    onSelect: (folder: string) => void,
    _options?: { rootMode?: boolean }
  ) {
    super(app);
    this.onSelect = onSelect;
    this.limit = 100;
    this.emptyStateText = t("suggest.folder.empty");
    this.setPlaceholder(t("suggest.folder.placeholder"));
    this.setInstructions([
      { command: "↑↓", purpose: t("suggest.instr.select") },
      { command: "Enter", purpose: t("suggest.instr.enter") },
      { command: "../", purpose: t("suggest.instr.up") },
      { command: "Esc", purpose: t("suggest.instr.cancel") },
    ]);
  }

  /** Navigate without closing; only the "✓" row selects and closes. */
  selectSuggestion(item: string, evt: MouseEvent | KeyboardEvent): void {
    if (item === "..") {
      const parts = this.currentPath.split("/");
      parts.pop();
      this.currentPath = parts.join("/");
      refreshSuggestions(this);
      return;
    }
    if (item.startsWith("✓ ")) {
      super.selectSuggestion(item, evt);
      return;
    }
    this.currentPath = this.currentPath
      ? `${this.currentPath}/${item}`
      : item;
    refreshSuggestions(this);
  }

  getSuggestions(query: string): string[] {
    const path = this.currentPath;
    const queryLower = query.toLowerCase();
    const results: string[] = [];

    const currentLabel = path ? path : t("suggest.root");
    if (!queryLower || currentLabel.toLowerCase().includes(queryLower)) {
      results.push("✓ " + currentLabel);
    }

    if (path) {
      results.push("..");
    }

    for (const dir of this.app.vault.getAllFolders()) {
      const dirParts = dir.path.split("/");
      const dirParent = dirParts.slice(0, -1).join("/");
      const dirName = dirParts[dirParts.length - 1];
      if (dirParent !== path) continue;
      if (!queryLower || dirName.toLowerCase().includes(queryLower)) {
        results.push(dirName);
      }
    }

    return results;
  }

  renderSuggestion(item: string, el: HTMLElement): void {
    if (item === "..") {
      el.createEl("div", { text: "📁 ..", cls: "suggestion-item-folder" });
    } else if (item.startsWith("✓ ")) {
      el.createEl("div", {
        text: "✅ " + item.substring(2),
        cls: "suggestion-item-select",
      });
    } else {
      el.createEl("div", { text: "📁 " + item, cls: "suggestion-item-folder" });
    }
  }

  onChooseSuggestion(item: string, _evt: MouseEvent | KeyboardEvent): void {
    if (item.startsWith("✓ ")) {
      this.onSelect(this.currentPath);
    }
  }

  /** Get the selected folder path. */
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
  const file = _app.vault.getAbstractFileByPath(folderPath);
  if (file && file instanceof TFile) {
    return t("validate.folder.isFile", { path: folderPath });
  }
  return null;
}

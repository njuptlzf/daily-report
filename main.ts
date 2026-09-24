/**
 * Daily Report - Obsidian Plugin
 *
 * A daily notes plugin with:
 *   - Dynamic directory path (Luxon date format)
 *   - Template rendering with date placeholders
 *   - Task carry-over from yesterday's note
 *   - Section-level status confirmation
 *
 * Workflow when creating a daily note:
 *   1. Compute today's note path from date + directory/filename patterns
 *   2. If note exists, open it
 *   3. If not, create it:
 *      a. Read template, render date placeholders
 *      b. Read yesterday's note
 *      c. If yesterday has pending sections, show confirmation modal
 *      d. Apply user's status decisions to yesterday's note
 *      e. Carry over pending sections (with unchecked tasks) into today's note
 *      f. Save both notes
 *      g. Open today's note
 */

import {
  Plugin,
  Notice,
  TFile,
  Command,
} from "obsidian";
import { DateTime } from "luxon";
import { DailyReportSettings, DEFAULT_SETTINGS } from "./src/settings";
import { DailyReportSettingTab } from "./src/settings-tab";
import { computeDailyNotePath, renderTemplate } from "./src/daily-note";
import { SectionStatus } from "./src/section-parser";
import {
  analyzeSectionsForConfirmation,
  carryOver,
} from "./src/carry-over";
import {
  SectionConfirmModal,
  GapChoiceModal,
  type GapChoice,
} from "./src/section-confirm";
import { t, setLocale } from "./src/i18n";

/** Extract a human-readable message from an unknown thrown value. */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default class DailyReportPlugin extends Plugin {
  settings: DailyReportSettings = { ...DEFAULT_SETTINGS };
  private createCmd?: Command;
  private openCmd?: Command;

  async onload(): Promise<void> {
    try {
      await this.loadSettings();
      setLocale(this.settings.language);

      // Register settings tab
      this.addSettingTab(new DailyReportSettingTab(this.app, this));

      // Register commands
      this.registerCommands();

      // Add ribbon icon (sidebar icon)
      this.addRibbonIcon(
        "file-plus",
        t("cmd.create.name"),
        () => {
          void this.createDailyNote();
        }
      );

      // Status notice
      new Notice(t("notice.loaded"));
    } catch (e) {
      console.error("[daily-report] onload failed:", e);
      throw e;
    }
  }

  onunload(): void {
    // Cleanup if needed
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<DailyReportSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private registerCommands(): void {
    // Command 1: Create daily note
    this.createCmd = this.addCommand({
      id: "create-daily-note",
      name: t("cmd.create.name"),
      callback: async () => {
        await this.createDailyNote();
      },
    });

    // Command 2: Open daily note
    this.openCmd = this.addCommand({
      id: "open-daily-note",
      name: t("cmd.open.name"),
      callback: async () => {
        await this.openDailyNote();
      },
    });
  }

  /**
   * Re-apply localized names to the registered commands after a language
   * change, so the command palette reflects it without a reload.
   */
  refreshCommandNames(): void {
    if (this.createCmd) this.createCmd.name = t("cmd.create.name");
    if (this.openCmd) this.openCmd.name = t("cmd.open.name");
  }

  /**
   * Create today's daily note.
   * This is the main workflow that combines template rendering,
   * task carry-over, and section confirmation.
   */
  async createDailyNote(): Promise<void> {
    const today = DateTime.now();
    const todayPath = this.computePath(today);

    // Check if today's note already exists
    const existingFile = this.findFile(todayPath);
    if (existingFile) {
      new Notice(t("notice.exists"));
      await this.openFile(existingFile);
      return;
    }

    // Find the most recent previous report (walk back up to a year).
    let sourceFile: TFile | null = null;
    let sourceMarkdown = "";
    let sourceOffset = 0;
    for (let offset = 1; offset <= 366; offset++) {
      const day = today.minus({ days: offset });
      const f = this.findFile(this.computePath(day));
      if (f) {
        sourceFile = f;
        try {
          sourceMarkdown = await this.app.vault.read(f);
        } catch (e: unknown) {
          new Notice(t("error.readYesterday", { msg: errorMessage(e) }));
          sourceMarkdown = "";
        }
        sourceOffset = offset;
        break;
      }
    }

    const hasTemplate = !!this.settings.templatePath.trim();

    let todayMarkdown = "";
    let updatedSource = sourceMarkdown;
    let writeBack = false;

    if (sourceMarkdown) {
      let useTemplate = false;
      let decisions = new Map<string, SectionStatus>();

      // Gap since the last report: ask carry vs template.
      if (sourceOffset > 1) {
        const gap = await this.showGapModal(sourceOffset);
        if (gap === "cancel") return;
        if (gap === "template") useTemplate = true;
      }

      if (!useTemplate && this.settings.confirmBeforeCreate) {
        const requirements = analyzeSectionsForConfirmation(sourceMarkdown);
        if (requirements.length > 0) {
          const res = await this.showConfirmationModal(requirements);
          if (res.mode === "cancel") return;
          if (res.mode === "template") useTemplate = true;
          else decisions = res.decisions;
        }
      }

      if (useTemplate) {
        // Start from template (blank if none): the source note stays untouched.
        todayMarkdown = await this.renderTemplateOrEmpty();
      } else {
        const result = carryOver(
          sourceMarkdown,
          "",
          decisions,
          this.settings.deleteCompletedTasks
        );
        todayMarkdown = result.todayMarkdown;
        updatedSource = result.yesterdayMarkdown;
        writeBack = decisions.size > 0;
      }
    } else {
      // No previous report at all: first day uses the template (blank if none).
      todayMarkdown = hasTemplate ? await this.renderTemplateOrEmpty() : "";
    }

    // Save today's note
    try {
      const newFile = await this.createFile(`${todayPath}.md`, todayMarkdown);
      new Notice(t("notice.created"));
      await this.openFile(newFile);
    } catch (e: unknown) {
      new Notice(t("error.createNote", { msg: errorMessage(e) }));
      return;
    }

    // Write status markers back to the source note (rollover mode only)
    if (writeBack && sourceFile) {
      try {
        await this.app.vault.process(sourceFile, () => updatedSource);
        new Notice(t("notice.statusUpdated"));
      } catch (e: unknown) {
        new Notice(t("error.updateYesterday", { msg: errorMessage(e) }));
      }
    }
  }

  /**
   * Open today's daily note.
   * If it doesn't exist, create it.
   */
  async openDailyNote(): Promise<void> {
    const today = DateTime.now();
    const todayPath = this.computePath(today);

    const existingFile = this.findFile(todayPath);
    if (existingFile) {
      await this.openFile(existingFile);
    } else {
      await this.createDailyNote();
    }
  }

  /**
   * Compute the daily note path for a given date.
   */
  private computePath(date: DateTime): string {
    const fullFormat = this.settings.dailyPathFormat;
    const lastSlash = fullFormat.lastIndexOf("/");
    const dirPattern = lastSlash > 0 ? fullFormat.substring(0, lastSlash) : "";
    const filePattern = lastSlash > 0 ? fullFormat.substring(lastSlash + 1) : fullFormat;

    const basePath = computeDailyNotePath(date, dirPattern, filePattern);
    const parentFolder = this.settings.dailyParentFolder;
    if (!parentFolder || !parentFolder.trim()) return basePath;
    return `${parentFolder}/${basePath}`;
  }

  /**
   * Read and render the template file.
   */
  async readTemplate(): Promise<string> {
    const templatePath = this.settings.templatePath;
    const templateFile = this.app.vault.getAbstractFileByPath(templatePath);

    if (!templateFile) {
      throw new Error(t("error.templateMissing", { path: templatePath }));
    }

    if (!(templateFile instanceof TFile)) {
      throw new Error(t("error.templateNotFile", { path: templatePath }));
    }

    const rawTemplate = await this.app.vault.read(templateFile);
    const rendered = renderTemplate(rawTemplate, DateTime.now());

    return rendered;
  }

  /** Render the template, or return "" (with a notice) if it can't be read. */
  private async renderTemplateOrEmpty(): Promise<string> {
    try {
      return await this.readTemplate();
    } catch (e: unknown) {
      new Notice(t("error.readTemplate", { msg: errorMessage(e) }));
      return "";
    }
  }

  /**
   * Find a file by path (without .md extension).
   */
  private findFile(pathWithoutExt: string): TFile | null {
    const fullPath = `${pathWithoutExt}.md`;
    const file = this.app.vault.getAbstractFileByPath(fullPath);
    if (file instanceof TFile) {
      return file;
    }
    return null;
  }

  /**
   * Create a new markdown file, creating parent directories if needed.
   */
  async createFile(path: string, content: string): Promise<TFile> {
    // Create parent directories if they don't exist
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash > 0) {
      const dirPath = path.substring(0, lastSlash);
      await this.ensureFolderExists(dirPath);
    }
    return this.app.vault.create(path, content);
  }

  /**
   * Recursively create a folder and all its parent folders.
   */
  async ensureFolderExists(path: string): Promise<void> {
    if (!path) return;

    // Check if folder already exists
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing) return;

    // Create parent folder first
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash > 0) {
      const parentPath = path.substring(0, lastSlash);
      await this.ensureFolderExists(parentPath);
    }

    // Create this folder
    try {
      await this.app.vault.createFolder(path);
    } catch (e: unknown) {
      if (!errorMessage(e).includes("already exists")) {
        throw e;
      }
    }
  }

  /**
   * Open a file in the active view.
   */
  async openFile(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }

  /**
   * Show the section confirmation modal and return the user's outcome.
   */
  async showConfirmationModal(
    sections: import("./src/carry-over").SectionInfo[]
  ): Promise<import("./src/section-confirm").ConfirmResult> {
    return new Promise((resolve) => {
      const modal = new SectionConfirmModal(
        this.app,
        sections,
        this,
        (result) => resolve(result)
      );
      modal.open();
    });
  }

  /**
   * Ask the user how to proceed when there is a gap since the last report.
   */
  async showGapModal(days: number): Promise<GapChoice> {
    return new Promise((resolve) => {
      const modal = new GapChoiceModal(this.app, days, (choice) => resolve(choice));
      modal.open();
    });
  }
}

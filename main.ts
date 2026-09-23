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
import { SectionConfirmModal } from "./src/section-confirm";
import { t, setLocale } from "./src/i18n";

/** Extract a human-readable message from an unknown thrown value. */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export default class DailyReportPlugin extends Plugin {
  settings: DailyReportSettings = { ...DEFAULT_SETTINGS };

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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private registerCommands(): void {
    // Command 1: Create daily note
    this.addCommand({
      id: "create-daily-note",
      name: t("cmd.create.name"),
      callback: async () => {
        await this.createDailyNote();
      },
    });

    // Command 2: Open daily note
    this.addCommand({
      id: "open-daily-note",
      name: t("cmd.open.name"),
      callback: async () => {
        await this.openDailyNote();
      },
    });
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

    // Step 1: Read and render template
    let todayTemplateMarkdown = "";
    try {
      todayTemplateMarkdown = await this.readTemplate();
    } catch (e: unknown) {
      new Notice(t("error.readTemplate", { msg: errorMessage(e) }));
      todayTemplateMarkdown = "";
    }

    // Step 2: Read yesterday's note
    const yesterday = today.minus({ days: 1 });
    const yesterdayPath = this.computePath(yesterday);
    let yesterdayMarkdown = "";
    let yesterdayFile: TFile | null = null;

    try {
      yesterdayFile = this.findFile(yesterdayPath);
      if (yesterdayFile) {
        yesterdayMarkdown = await this.app.vault.read(yesterdayFile);
      }
    } catch (e: unknown) {
      new Notice(t("error.readYesterday", { msg: errorMessage(e) }));
      yesterdayMarkdown = "";
    }

    // Step 3: Section confirmation (if enabled and yesterday has sections)
    const decisions = new Map<string, SectionStatus>();

    if (
      this.settings.confirmBeforeCreate &&
      yesterdayMarkdown &&
      yesterdayMarkdown.length > 0
    ) {
      const requirements = analyzeSectionsForConfirmation(
        yesterdayMarkdown
      );

      if (requirements.length > 0) {
        const userDecisions = await this.showConfirmationModal(
          requirements
        );
        if (userDecisions) {
          for (const [title, status] of userDecisions) {
            decisions.set(title, status);
          }
        }
      }
    }

    // Step 4: Carry over pending sections
    const result = carryOver(
      yesterdayMarkdown,
      todayTemplateMarkdown,
      decisions,
      this.settings.deleteCompletedTasks
    );

    // Step 5: Save today's note
    try {
      const newFile = await this.createFile(
        `${todayPath}.md`,
        result.todayMarkdown
      );
      new Notice(t("notice.created"));
      await this.openFile(newFile);
    } catch (e: unknown) {
      new Notice(t("error.createNote", { msg: errorMessage(e) }));
    }

    // Step 6: Save yesterday's note with updated statuses
    if (yesterdayFile && result.appliedStatuses.size > 0) {
      try {
        await this.app.vault.process(yesterdayFile, () => {
          return result.yesterdayMarkdown;
        });
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
   * Show the section confirmation modal and return user decisions.
   */
  async showConfirmationModal(
    sections: import("./src/carry-over").SectionInfo[]
  ): Promise<Map<string, SectionStatus> | null> {
    return new Promise((resolve) => {
      const modal = new SectionConfirmModal(this.app, sections, (decisions) => {
        resolve(decisions);
      });
      modal.open();
    });
  }
}

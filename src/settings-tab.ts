/**
 * Settings tab for the Daily Report plugin.
 *
 * Rendering is imperative (display()). The declarative getSettingDefinitions()
 * path was dropped: it ran during Obsidian's startup settings-search indexing,
 * where eager DOM work crashed plugin load, and it could not render rich help.
 *
 * All UI text goes through i18n's t(); the long help lives in a modal.
 */

import {
  App,
  Component,
  MarkdownRenderer,
  Modal,
  PluginSettingTab,
  Setting,
  TFile,
  Notice,
} from "obsidian";
import { DateTime } from "luxon";
import type DailyReportPlugin from "../main";
import { DEFAULT_SETTINGS } from "./settings";
import {
  TemplateFileSuggester,
  validateTemplateFile,
  FolderSuggester,
} from "./file-suggester";
import { formatDate } from "./daily-note";
import { t, setLocale, helpMarkdown, type LanguageSetting } from "./i18n";

/** Modal that renders the plugin's Markdown help in the active locale. */
class HelpModal extends Modal {
  constructor(app: App, private component: Component) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("dr-help-modal");
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: t("help.title") });
    const body = this.contentEl.createDiv({ cls: "dr-doc" });
    void MarkdownRenderer.render(this.app, helpMarkdown(), body, "", this.component);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class DailyReportSettingTab extends PluginSettingTab {
  plugin: DailyReportPlugin;

  constructor(app: App, plugin: DailyReportPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private renderFormatPreview(format: string): string {
    const now = DateTime.now();
    return formatDate(now, format);
  }

  /**
   * Append a live "current preview" line to a setting's description area,
   * keeping the setting's own name and description intact.
   */
  private addPreviewToSetting(setting: Setting, format: string): HTMLElement {
    const descEl = setting.descEl;
    if (!descEl) return document.createEl("code");

    const previewEl = descEl.createDiv({ cls: "setting-item-info-preview" });
    previewEl.append(t("settings.format.preview"));
    const codeEl = previewEl.createEl("code", {
      text: this.renderFormatPreview(format),
    });
    codeEl.addClass("setting-item-info-preview-value");
    return codeEl;
  }

  /** Update a preview code element with a new format. */
  private updatePreview(codeEl: HTMLElement, format: string): void {
    codeEl.textContent = this.renderFormatPreview(format);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName(t("settings.heading")).setHeading();

    // Language
    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((dd) =>
        dd
          .addOption("auto", t("settings.language.auto"))
          .addOption("en", t("settings.language.en"))
          .addOption("zh", t("settings.language.zh"))
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as LanguageSetting;
            await this.plugin.saveSettings();
            setLocale(this.plugin.settings.language);
            this.plugin.refreshCommandNames();
            this.display();
          })
      );

    // Parent folder with folder picker
    new Setting(containerEl)
      .setName(t("settings.folder.name"))
      .setDesc(t("settings.folder.desc"))
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dailyParentFolder)
          .setValue(this.plugin.settings.dailyParentFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyParentFolder = value;
            await this.plugin.saveSettings();
          })
      )
      .addButton((btn) => {
        btn.setButtonText(t("settings.folder.pick")).setCta().onClick(() => {
          const suggester = new FolderSuggester(
            this.app,
            (folder: string) => {
              this.plugin.settings.dailyParentFolder = folder;
              void this.plugin.saveSettings();
              this.display();
            }
          );
          suggester.open();
        });
      });

    // Path format with live preview (single field, / separates directories)
    const pathSetting = new Setting(containerEl)
      .setName(t("settings.format.name"))
      .setDesc(t("settings.format.desc"))
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dailyPathFormat)
          .setValue(this.plugin.settings.dailyPathFormat)
          .onChange(async (value) => {
            this.plugin.settings.dailyPathFormat = value;
            await this.plugin.saveSettings();
          })
      );

    // Add preview to the path setting
    const pathPreviewEl = this.addPreviewToSetting(
      pathSetting,
      this.plugin.settings.dailyPathFormat
    );

    // Update preview on input without re-render
    const pathInputEl = pathSetting.controlEl.querySelector("input");
    if (pathInputEl) {
      pathInputEl.addEventListener("input", () => {
        this.updatePreview(pathPreviewEl, pathInputEl.value);
      });
    }

    // Template file with file picker
    new Setting(containerEl)
      .setName(t("settings.template.name"))
      .setDesc(t("settings.template.desc"))
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.templatePath)
          .setValue(this.plugin.settings.templatePath)
          .onChange(async (value) => {
            if (!value.trim()) {
              // Empty template path is allowed: the template is simply unused.
              this.plugin.settings.templatePath = "";
              await this.plugin.saveSettings();
              return;
            }
            const error = validateTemplateFile(this.app, value);
            if (error) {
              new Notice(error, 5000);
              return;
            }
            this.plugin.settings.templatePath = value;
            await this.plugin.saveSettings();
          })
      )
      .addButton((btn) => {
        btn.setButtonText(t("settings.template.pick")).setCta().onClick(() => {
          const suggester = new TemplateFileSuggester(
            this.app,
            (file: TFile) => {
              const error = validateTemplateFile(this.app, file.path);
              if (error) {
                new Notice(error, 5000);
                return;
              }
              this.plugin.settings.templatePath = file.path;
              void this.plugin.saveSettings();
              this.display();
            }
          );
          suggester.open();
        });
      });

    // Confirm before create
    new Setting(containerEl)
      .setName(t("settings.confirm.name"))
      .setDesc(t("settings.confirm.desc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.confirmBeforeCreate).onChange(
          async (value) => {
            this.plugin.settings.confirmBeforeCreate = value;
            await this.plugin.saveSettings();
          }
        )
      );

    // Delete completed tasks
    new Setting(containerEl)
      .setName(t("settings.delete.name"))
      .setDesc(t("settings.delete.desc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.deleteCompletedTasks).onChange(
          async (value) => {
            this.plugin.settings.deleteCompletedTasks = value;
            await this.plugin.saveSettings();
          }
        )
      );

    // Help, opened in a modal so the settings page stays clean and aligned
    new Setting(containerEl)
      .setName(t("settings.help.name"))
      .setDesc(t("settings.help.desc"))
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.help.view"))
          .setCta()
          .onClick(() => {
            new HelpModal(this.app, this.plugin).open();
          })
      );

    new Setting(containerEl).setName(t("settings.commands.heading")).setHeading();

    new Setting(containerEl)
      .setName(t("cmd.create.name"))
      .setDesc(t("cmd.create.desc"));

    new Setting(containerEl)
      .setName(t("cmd.open.name"))
      .setDesc(t("cmd.open.desc"));
  }
}

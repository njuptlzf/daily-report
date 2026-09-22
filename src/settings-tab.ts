/**
 * Settings tab for the Daily Report plugin.
 */

import { App, PluginSettingTab, Setting, TFile, Notice } from "obsidian";
import { DateTime } from "luxon";
import type DailyReportPlugin from "../main";
import { DEFAULT_SETTINGS } from "./settings";
import {
  TemplateFileSuggester,
  validateTemplateFile,
  FolderSuggester,
} from "./file-suggester";
import { formatDate } from "./daily-note";

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
   * Simple markdown-like renderer for settings descriptions.
   * Returns a DocumentFragment with rendered elements.
   * Supports: line breaks, **bold**, ~~strikethrough~~, and code blocks.
   */
  private renderMarkdown(text: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const lines = text.split("\n");
    let inCodeBlock = false;
    let codeContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Handle code block start/end
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          // End of code block
          const pre = document.createElement("pre");
          const code = document.createElement("code");
          code.textContent = codeContent.join("\n");
          pre.appendChild(code);
          fragment.appendChild(pre);
          inCodeBlock = false;
          codeContent = [];
        } else {
          // Start of code block
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }

      // Process inline formatting
      const span = document.createElement("span");
      let remaining = line;

      while (remaining.length > 0) {
        // Check for bold
        const boldMatch = remaining.match(/^\*\*([^*]+)\*\*(.*)/);
        if (boldMatch) {
          const strong = document.createElement("strong");
          strong.textContent = boldMatch[1];
          span.appendChild(strong);
          remaining = boldMatch[2];
          continue;
        }

        // Check for strikethrough
        const delMatch = remaining.match(/^~~([^~]+)~~(.*)/);
        if (delMatch) {
          const del = document.createElement("del");
          del.textContent = delMatch[1];
          span.appendChild(del);
          remaining = delMatch[2];
          continue;
        }

        // Plain text
        if (remaining.length > 0) {
          span.appendChild(document.createTextNode(remaining));
          remaining = "";
        }
      }

      fragment.appendChild(span);
      if (i < lines.length - 1) {
        fragment.appendChild(document.createElement("br"));
      }
    }

    return fragment;
  }

  /**
   * Add a live preview element to a setting's description area.
   * Returns the code element so onChange can update it without re-render.
   */
  private addPreviewToSetting(setting: Setting, format: string): HTMLElement {
    const infoEl = setting.infoEl;
    if (!infoEl) return document.createElement("code");

    // Clear existing content and rebuild
    infoEl.empty();
    infoEl.append(
      "Luxon 日期格式，用 / 分隔目录层级，[] 包裹字面文本。 当前预览: "
    );
    const codeEl = infoEl.createEl("code", {
      text: this.renderFormatPreview(format),
    });
    codeEl.addClass("setting-item-info-preview-value");
    return codeEl;
  }

  /**
   * Update a preview code element with a new format.
   */
  private updatePreview(codeEl: HTMLElement, format: string): void {
    codeEl.textContent = this.renderFormatPreview(format);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("插件设置").setHeading();

    // Parent folder with folder picker
    new Setting(containerEl)
      .setName("日志存放位置")
      .setDesc(
        "新日志文件的父目录路径。点击按钮从 Vault 中选择目录，或手动输入路径。"
      )
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
        btn.setButtonText("选择目录...").setCta().onClick(() => {
          const suggester = new FolderSuggester(
            this.app,
            (folder: string) => {
              this.plugin.settings.dailyParentFolder = folder;
              this.plugin.saveSettings();
              this.display();
            }
          );
          suggester.open();
        });
      });

    // Path format with live preview (single field, / separates directories)
    const pathSetting = new Setting(containerEl)
      .setName("日志文件名格式")
      .setDesc("Luxon 日期格式，用 / 分隔目录层级，[] 包裹字面文本。")
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
        const value = pathInputEl.value;
        this.updatePreview(pathPreviewEl, value);
      });
    }

    // Template file with file picker
    new Setting(containerEl)
      .setName("模板文件")
      .setDesc(
        "点击按钮从 Vault 中选择模板文件。模板支持日期占位符: " +
          "**date:FORMAT**、${date:FORMAT}、{{date:FORMAT}}"
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.templatePath)
          .setValue(this.plugin.settings.templatePath)
          .onChange(async (value) => {
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
        btn.setButtonText("选择文件...").setCta().onClick(() => {
          const suggester = new TemplateFileSuggester(
            this.app,
            (file: TFile) => {
              const error = validateTemplateFile(this.app, file.path);
              if (error) {
                new Notice(error, 5000);
                return;
              }
              this.plugin.settings.templatePath = file.path;
              this.plugin.saveSettings();
              this.display();
            }
          );
          suggester.open();
        });
      });

    // Confirm before create
    new Setting(containerEl)
      .setName("创建前确认章节状态")
      .setDesc("创建新日志前，弹窗询问昨日各章节的需求状态（是否闭环）。")
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
      .setName("结转时删除已完成任务")
      .setDesc(
        "结转时将昨日已完成的任务（- [x]）从新日志中移除。关闭则保留已完成任务作为历史记录。"
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.deleteCompletedTasks).onChange(
          async (value) => {
            this.plugin.settings.deleteCompletedTasks = value;
            await this.plugin.saveSettings();
          }
        )
      );

    new Setting(containerEl).setName("模板结构说明").setHeading();

    // 模板章节结构
    new Setting(containerEl)
      .setName("模板章节结构")
      .setDesc(this.renderMarkdown(
        "```" +
        "\n## 固定章节标题（模板固定，每天保留）" +
        "\n  ### 具体需求标题（可能跨天结转）" +
        "\n    #### 子任务/问题标题（清晰边界）" +
        "\n      - 内容..." +
        "\n      - [ ] 可选的任务标记" +
        "\n```"
      ));

    // 需求状态标记
    new Setting(containerEl)
      .setName("需求状态标记")
      .setDesc(this.renderMarkdown(
        "**做完了（不结转）**：" +
        "\n  - ~~需求标题~~ （删除线，推荐）" +
        "\n  - ## 需求标题 <!-- req-status: done -->" +
        "\n\n**不做了（取消，不结转）**：" +
        "\n  - ## 需求标题 <!-- req-status: cancelled -->" +
        "\n\n**验证中（结转）**：" +
        "\n  - ## 需求标题 <!-- req-status: verifying -->" +
        "\n\n**进行中（结转）**：" +
        "\n  - ## 需求标题 （无标记，默认）" +
        "\n  - ## 需求标题 <!-- req-status: pending -->" +
        "\n\n**自动完成**：如果所有 #### 都完成了，需求自动标记为 done。" +
        "\n\n**注意**：删除线只能表示「做完了」，无法表示「不做了」。" +
        "\n如果要取消需求，必须用 HTML 注释标记 cancelled。"
      ));

    new Setting(containerEl).setName("命令").setHeading();

    new Setting(containerEl)
      .setName("创建今日日志")
      .setDesc("创建今日日志，包含模板内容、昨日未完成任务结转、章节状态确认。");

    new Setting(containerEl)
      .setName("打开今日日志")
      .setDesc("打开今日日志文件（如果存在），不存在则创建。");
  }
}

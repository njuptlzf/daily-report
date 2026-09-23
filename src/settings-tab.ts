/**
 * Settings tab for the Daily Report plugin.
 *
 * Rendering is imperative (display()). The declarative getSettingDefinitions()
 * path was dropped: it ran during Obsidian's startup settings-search indexing,
 * where eager DOM work crashed plugin load, and it could not render rich
 * multi-line help. display() only runs when the settings panel opens, so DOM
 * helpers and MarkdownRenderer are safe there.
 */

import { App, MarkdownRenderer, PluginSettingTab, Setting, TFile, Notice } from "obsidian";
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
   * Append a live "current preview" line to a setting's description area,
   * keeping the setting's own name and description intact.
   */
  private addPreviewToSetting(setting: Setting, format: string): HTMLElement {
    const descEl = setting.descEl;
    if (!descEl) return document.createEl("code");

    const previewEl = descEl.createDiv({ cls: "setting-item-info-preview" });
    previewEl.append("当前预览: ");
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

  /** Render a titled block of Markdown help into the settings container. */
  private addDoc(title: string, markdown: string): void {
    const { containerEl } = this;
    containerEl.createEl("div", { text: title, cls: "dr-doc-title" });
    const holder = containerEl.createDiv({ cls: "dr-doc" });
    void MarkdownRenderer.render(this.app, markdown, holder, "", this.plugin);
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
              void this.plugin.saveSettings();
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
        this.updatePreview(pathPreviewEl, pathInputEl.value);
      });
    }

    // Template file with file picker
    new Setting(containerEl)
      .setName("模板文件")
      .setDesc(
        "点击按钮从 Vault 中选择模板文件。模板支持日期占位符（见下方「使用说明」）。"
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
              void this.plugin.saveSettings();
              this.display();
            }
          );
          suggester.open();
        });
      });

    // Confirm before create
    new Setting(containerEl)
      .setName("创建前确认章节状态")
      .setDesc("创建新日志前，弹窗询问昨日各需求的状态（是否闭环）。")
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

    new Setting(containerEl).setName("使用说明").setHeading();

    this.addDoc(
      "工作流程",
      "当你点「创建今日日志」时，插件按下面的流程工作：\n" +
        "\n" +
        "1. 用「日志文件名格式」算出今天日志的路径；\n" +
        "2. 读取「模板文件」，把日期占位符替换成今天的日期；\n" +
        "3. 读取昨天的日志，解析出其中的 `###` 需求；\n" +
        "4. 弹窗让你确认每个需求的结转状态；\n" +
        "5. 把「未完结」的需求（连同未勾选的任务）结转进今天对应的固定章节；\n" +
        "6. 把确认后的状态写回昨天的日志，然后保存并打开今天的日志。"
    );

    this.addDoc(
      "标题层级（引擎的基础）",
      "引擎**完全基于标题层级**运行，不同层级职责不同：\n" +
        "\n" +
        "```text\n" +
        "#     日志标题（固定，不结转、不打标记）\n" +
        "##    固定分类章节（每天从模板保留，作为需求的容器；不结转、不打标记）\n" +
        "###   需求（结转与确认的基本单位，打 req-status 标记）\n" +
        "####  子任务 / 问题（归属其上的 ### 需求，打 req-status 标记）\n" +
        "- [ ] 任务（可选的待办勾选框，挂在任意标题之下）\n" +
        "```\n" +
        "\n" +
        "- 结转只发生在 `###`（及其 `####`）上；`#` 和 `##` 是每天固定保留的骨架。\n" +
        "- `- [ ]` 是**可选**的：一个 `###` 需求可以直接写内容、或拆成若干 `####` 子任务、或两者都有。"
    );

    this.addDoc(
      "四种结转状态",
      "每个 `###` 需求 / `####` 子任务都有四种状态（用 `<!-- req-status: 状态 -->` 标记，完成时也可用删除线）：\n" +
        "\n" +
        "| 状态 | 含义 | 是否结转到今天 |\n" +
        "| --- | --- | --- |\n" +
        "| `pending` 进行中 | 默认值，**没有标记就视为进行中** | 是 |\n" +
        "| `verifying` 验证中 | 已做完、等待验证 | 是 |\n" +
        "| `done` 已完成 | 需求已闭环 | 否 |\n" +
        "| `cancelled` 已取消 | 不再做 | 否 |\n" +
        "\n" +
        "标记只写在 `###` 与 `####` 上，固定的 `#` / `##` 不写。"
    );

    this.addDoc(
      "确认弹窗规则",
      "弹窗**只列出昨天的 `###` 需求**（`#` / `##` 不会出现）：\n" +
        "\n" +
        "- 给某需求选「已完成 / 已取消」→ 它下面的 `####` 子任务自动收起、不再询问、也不结转；\n" +
        "- 给某需求选「进行中 / 验证中」→ 展开它的 `####` 子任务，逐个确认结转状态；\n" +
        "- 「跳过」= 全部保持进行中；「取消」= 放弃本次创建。\n" +
        "\n" +
        "目的：**任务全部打勾 ≠ 需求已闭环**，是否闭环必须由你确认。"
    );

    this.addDoc(
      "任务勾选与删除",
      "- 未勾选的 `- [ ]` 任务一定会结转到今天；\n" +
        "- 已勾选的 `- [x]` 任务是否保留，由上面的「结转时删除已完成任务」开关决定：开启则从新日志移除，关闭则作为历史保留。"
    );

    this.addDoc(
      "第一天没有标记怎么办",
      "**第一天不需要按模板写标记。** 没有标记的标题一律按「进行中」处理；当你第一次在弹窗里确认结转状态后，插件才会把 `<!-- req-status: ... -->` 写回昨天的日志，从第二天起标记就自动齐全了。"
    );

    this.addDoc(
      "日期占位符与路径格式",
      "**模板里的日期占位符**（三种写法等价，会被替换成按 Luxon 格式渲染的日期）：\n" +
        "\n" +
        "```text\n" +
        "**date:YYYY-MM-DD**\n" +
        "${date:YYYY-MM-DD}\n" +
        "{{date:YYYY-MM-DD}}\n" +
        "```\n" +
        "\n" +
        "**「日志文件名格式」** 也用 Luxon 格式：用 `/` 分隔目录层级，用 `[]` 包裹字面文本。\n" +
        "例如 `GGGG/MM/[W]WW/MMDD` 会生成形如 `2026/09/W39/0923` 的路径。"
    );

    new Setting(containerEl).setName("命令").setHeading();

    new Setting(containerEl)
      .setName("创建今日日志")
      .setDesc("创建今日日志，包含模板内容、昨日未完成任务结转、章节状态确认。");

    new Setting(containerEl)
      .setName("打开今日日志")
      .setDesc("打开今日日志文件（如果存在），不存在则创建。");
  }
}

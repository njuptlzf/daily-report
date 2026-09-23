/**
 * Lightweight i18n for the Daily Report plugin.
 *
 * Obsidian exposes the app UI language via the public `getLanguage()` API
 * (since 1.8.7) but provides no translation framework for plugin strings, so
 * we keep our own dictionary. Default locale follows the app; users can force
 * English or Chinese in settings.
 */

import { getLanguage } from "obsidian";

export type Locale = "en" | "zh";
export type LanguageSetting = "auto" | "en" | "zh";

const en: Record<string, string> = {
  // Commands / ribbon
  "cmd.create.name": "Create today's note",
  "cmd.create.desc": "Create today's note with template content, carry-over of unfinished tasks, and section status confirmation.",
  "cmd.open.name": "Open today's note",
  "cmd.open.desc": "Open today's note if it exists, otherwise create it.",

  // Notices / errors
  "notice.loaded": "Daily Report plugin loaded",
  "notice.exists": "Today's note already exists, opening...",
  "notice.created": "Today's note created",
  "notice.statusUpdated": "Yesterday's note statuses updated",
  "error.readTemplate": "Cannot read template file: {msg}\nCreating an empty note.",
  "error.readYesterday": "Cannot read yesterday's note: {msg}\nSkipping carry-over.",
  "error.createNote": "Cannot create today's note: {msg}",
  "error.updateYesterday": "Cannot update yesterday's note: {msg}",
  "error.templateMissing": "Template file not found: {path}",
  "error.templateNotFile": "Template path is not a file: {path}",

  // Confirmation modal
  "modal.title": "Confirm yesterday's section status",
  "modal.intro": "The requirements below come from yesterday's note. Choose Done if a requirement is closed — its subtasks are then skipped; choose In progress or Verifying to keep it and confirm each subtask's carry-over status.",
  "modal.progress": "Tasks: {done}/{total}",
  "modal.subtasksLabel": "Subtask carry-over status:",
  "modal.inSection": "Under {title}",
  "modal.expand": "Show content",
  "modal.collapse": "Hide content",
  "tip.pending": "Still in progress — carried to today together with its unchecked tasks.",
  "tip.verifying": "Finished but awaiting verification — carried to today.",
  "tip.done": "Requirement closed — the whole section (including its #### subtasks) is dropped and not carried over.",
  "tip.cancelled": "No longer doing it — the whole section is dropped and not carried over.",
  "modal.confirm": "Confirm",
  "modal.skip": "Skip (keep all in progress)",
  "modal.cancel": "Cancel",
  "modal.pickStatus": "Carry-over status",
  "modal.apply": "Apply",
  "status.pending": "In progress",
  "status.verifying": "Verifying",
  "status.done": "Done",
  "status.cancelled": "Cancelled",

  // Suggesters
  "suggest.file.empty": "No Markdown files in this folder",
  "suggest.file.placeholder": "Type a file name, or / to enter a folder...",
  "suggest.folder.empty": "No subfolders in this path",
  "suggest.folder.placeholder": "Type a folder name, or / to enter...",
  "suggest.instr.select": "Select",
  "suggest.instr.enter": "Select / enter",
  "suggest.instr.up": "Go up",
  "suggest.instr.cancel": "Cancel",
  "suggest.root": "(root)",
  "validate.file.empty": "Template path cannot be empty",
  "validate.file.notFound": "File not found: {path}",
  "validate.file.notFile": "Path is not a file: {path}",
  "validate.file.notMd": "Template must be a Markdown file: {path}",
  "validate.folder.isFile": "Path is a file, not a folder: {path}",

  // Settings
  "settings.heading": "Plugin settings",
  "settings.folder.name": "Note location",
  "settings.folder.desc": "Parent folder for new notes. Click the button to pick a folder from the vault, or type a path.",
  "settings.folder.pick": "Choose folder...",
  "settings.format.name": "Note path format",
  "settings.format.desc": "Luxon date format; / separates folder levels, [] wraps literal text.",
  "settings.format.preview": "Preview: ",
  "settings.template.name": "Template file",
  "settings.template.desc": "Click the button to pick a template file from the vault. Templates support date placeholders (see Help).",
  "settings.template.pick": "Choose file...",
  "settings.confirm.name": "Confirm sections before creating",
  "settings.confirm.desc": "Before creating a note, ask for each requirement's status (whether it is closed).",
  "settings.delete.name": "Delete completed tasks on carry-over",
  "settings.delete.desc": "Remove yesterday's completed tasks (- [x]) from the new note. If off, keep them as history.",
  "settings.language.name": "Language",
  "settings.language.desc": "UI language. 'Follow app' uses Obsidian's language setting.",
  "settings.language.auto": "Follow app",
  "settings.language.en": "English",
  "settings.language.zh": "中文",
  "settings.help.name": "Help",
  "settings.help.desc": "Full guide: workflow, heading levels, the four carry-over statuses, and the confirmation dialog.",
  "settings.help.view": "View",
  "settings.commands.heading": "Commands",
  "help.title": "Daily Report Help",
};

const zh: Record<string, string> = {
  "cmd.create.name": "创建今日日志",
  "cmd.create.desc": "创建今日日志，包含模板内容、昨日未完成任务结转、章节状态确认。",
  "cmd.open.name": "打开今日日志",
  "cmd.open.desc": "打开今日日志文件（如果存在），不存在则创建。",

  "notice.loaded": "Daily Report 插件已加载",
  "notice.exists": "今日日志已存在，正在打开...",
  "notice.created": "今日日志已创建",
  "notice.statusUpdated": "昨日日志状态已更新",
  "error.readTemplate": "无法读取模板文件: {msg}\n将创建空日志。",
  "error.readYesterday": "无法读取昨日日志: {msg}\n将跳过任务结转。",
  "error.createNote": "无法创建今日日志: {msg}",
  "error.updateYesterday": "无法更新昨日日志: {msg}",
  "error.templateMissing": "模板文件不存在: {path}",
  "error.templateNotFile": "模板路径不是文件: {path}",

  "modal.title": "确认昨日章节状态",
  "modal.intro": "以下需求来自昨日日志。若需求已闭环请选择「已完成」，不再处理其子任务；若仍在进行请选择「进行中」或「验证中」，再逐项确认其子任务的结转状态。",
  "modal.progress": "任务完成度: {done}/{total}",
  "modal.subtasksLabel": "子任务结转状态：",
  "modal.inSection": "在 {title} 下",
  "modal.expand": "展开内容",
  "modal.collapse": "收起内容",
  "tip.pending": "仍在进行——连同未勾选任务一起结转到今天。",
  "tip.verifying": "已做完、等待验证——结转到今天。",
  "tip.done": "需求已闭环——整个章节（含其 #### 子任务）被去掉，不再结转到今天。",
  "tip.cancelled": "不再做——整个章节被去掉，不再结转到今天。",
  "modal.confirm": "确认",
  "modal.skip": "跳过（全部保持进行中）",
  "modal.cancel": "取消",
  "modal.pickStatus": "结转状态",
  "modal.apply": "确定",
  "status.pending": "进行中",
  "status.verifying": "验证中",
  "status.done": "已完成",
  "status.cancelled": "已取消",

  "suggest.file.empty": "当前目录没有 Markdown 文件",
  "suggest.file.placeholder": "输入文件名或 / 进入目录...",
  "suggest.folder.empty": "当前路径没有子目录",
  "suggest.folder.placeholder": "输入目录名或 / 进入目录...",
  "suggest.instr.select": "选择",
  "suggest.instr.enter": "选择/进入",
  "suggest.instr.up": "返回上级",
  "suggest.instr.cancel": "取消",
  "suggest.root": "(根目录)",
  "validate.file.empty": "模板文件路径不能为空",
  "validate.file.notFound": "文件不存在: {path}",
  "validate.file.notFile": "路径不是文件: {path}",
  "validate.file.notMd": "模板文件必须是 Markdown 文件: {path}",
  "validate.folder.isFile": "路径是文件而不是目录: {path}",

  "settings.heading": "插件设置",
  "settings.folder.name": "日志存放位置",
  "settings.folder.desc": "新日志文件的父目录路径。点击按钮从 Vault 中选择目录，或手动输入路径。",
  "settings.folder.pick": "选择目录...",
  "settings.format.name": "日志文件名格式",
  "settings.format.desc": "Luxon 日期格式，用 / 分隔目录层级，[] 包裹字面文本。",
  "settings.format.preview": "当前预览: ",
  "settings.template.name": "模板文件",
  "settings.template.desc": "点击按钮从 Vault 中选择模板文件。模板支持日期占位符（见「使用说明」）。",
  "settings.template.pick": "选择文件...",
  "settings.confirm.name": "创建前确认章节状态",
  "settings.confirm.desc": "创建新日志前，弹窗询问昨日各需求的状态（是否闭环）。",
  "settings.delete.name": "结转时删除已完成任务",
  "settings.delete.desc": "结转时将昨日已完成的任务（- [x]）从新日志中移除。关闭则保留已完成任务作为历史记录。",
  "settings.language.name": "语言",
  "settings.language.desc": "界面语言。「跟随应用」读取 Obsidian 的语言设置。",
  "settings.language.auto": "跟随应用",
  "settings.language.en": "English",
  "settings.language.zh": "中文",
  "settings.help.name": "使用说明",
  "settings.help.desc": "插件工作流程、标题层级、四种结转状态与弹窗规则的完整说明。",
  "settings.help.view": "查看",
  "settings.commands.heading": "命令",
  "help.title": "Daily Report 使用说明",
};

const dict: Record<Locale, Record<string, string>> = { en, zh };

let current: Locale = "en";

/** Detect the locale from Obsidian's app language (getLanguage, since 1.8.7). */
export function detectLocale(): Locale {
  try {
    const l = getLanguage();
    return l && l.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}

/** Resolve the active locale from the user's language preference. */
export function setLocale(pref: LanguageSetting): void {
  current = pref === "auto" ? detectLocale() : pref;
}

export function getLocale(): Locale {
  return current;
}

/** Translate a key, optionally interpolating {name} tokens. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = dict[current][key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

const HELP_EN = [
  "## Workflow",
  "",
  "When you run \"Create today's note\", the plugin does the following:",
  "",
  "1. Computes today's note path from the \"Note path format\";",
  "2. Reads the \"Template file\" and replaces date placeholders with today's date;",
  "3. Reads yesterday's note and parses its `###` requirements;",
  "4. Opens a dialog for you to confirm each requirement's carry-over status;",
  "5. Carries \"unfinished\" requirements (with unchecked tasks) into today's matching fixed section;",
  "6. Writes the confirmed statuses back into yesterday's note, then saves and opens today's note.",
  "",
  "## Heading levels (the engine's basis)",
  "",
  "The engine works **entirely on heading levels**; each level has a distinct role:",
  "",
  "```text",
  "#     Note title (fixed; never carried, never marked)",
  "##    Fixed category section (kept from the template every day; a container for requirements; never carried, never marked)",
  "###   Requirement (the unit of carry-over and confirmation; gets a req-status marker)",
  "####  Subtask / issue (belongs to its ### requirement; gets a req-status marker)",
  "- [ ] Task (an optional checkbox, under any heading)",
  "```",
  "",
  "- Carry-over only happens on `###` (and their `####`); `#` and `##` are a fixed daily skeleton.",
  "- `- [ ]` is **optional**: a `###` requirement can hold plain content, split into several `####` subtasks, or both.",
  "",
  "## The four carry-over statuses",
  "",
  "Every `###` requirement / `####` subtask has one of four statuses (marked with `<!-- req-status: status -->`, or a strikethrough when done):",
  "",
  "| Status | Meaning | Carried to today |",
  "| --- | --- | --- |",
  "| `pending` In progress | Default; **no marker means in progress** | Yes |",
  "| `verifying` Verifying | Finished, awaiting verification | Yes |",
  "| `done` Done | Requirement closed | No |",
  "| `cancelled` Cancelled | No longer doing it | No |",
  "",
  "Markers are written only on `###` and `####`, never on the fixed `#` / `##`.",
  "",
  "## Confirmation dialog rules",
  "",
  "The dialog **lists only yesterday's `###` requirements** (`#` / `##` never appear):",
  "",
  "- Choosing Done / Cancelled for a requirement collapses its `####` subtasks — they are not asked and not carried;",
  "- Choosing In progress / Verifying expands its `####` subtasks so you can confirm each;",
  "- \"Skip\" keeps everything in progress; \"Cancel\" aborts creation.",
  "",
  "The point: **all tasks checked ≠ requirement closed** — only you can confirm closure.",
  "",
  "## Task checkboxes and deletion",
  "",
  "- Unchecked `- [ ]` tasks are always carried to today;",
  "- Whether checked `- [x]` tasks are kept is controlled by the \"Delete completed tasks on carry-over\" setting: on removes them from the new note, off keeps them as history.",
  "",
  "## No markers on the first day?",
  "",
  "**You do not need to write markers on day one.** Untitled/ unmarked headings are treated as \"In progress\"; only after you first confirm statuses in the dialog does the plugin write `<!-- req-status: ... -->` back into yesterday's note, so from day two the markers are complete automatically.",
  "",
  "## Date placeholders and path format",
  "",
  "**Date placeholders in the template** (three equivalent forms, replaced with a Luxon-formatted date):",
  "",
  "```text",
  "**date:YYYY-MM-DD**",
  "${date:YYYY-MM-DD}",
  "{{date:YYYY-MM-DD}}",
  "```",
  "",
  "The **\"Note path format\"** also uses Luxon: `/` separates folder levels, `[]` wraps literals.",
  "For example `GGGG/MM/[W]WW/MMDD` produces a path like `2026/09/W39/0923`.",
].join("\n");

const HELP_ZH = [
  "## 工作流程",
  "",
  "当你点「创建今日日志」时，插件按下面的流程工作：",
  "",
  "1. 用「日志文件名格式」算出今天日志的路径；",
  "2. 读取「模板文件」，把日期占位符替换成今天的日期；",
  "3. 读取昨天的日志，解析出其中的 `###` 需求；",
  "4. 弹窗让你确认每个需求的结转状态；",
  "5. 把「未完结」的需求（连同未勾选的任务）结转进今天对应的固定章节；",
  "6. 把确认后的状态写回昨天的日志，然后保存并打开今天的日志。",
  "",
  "## 标题层级（引擎的基础）",
  "",
  "引擎**完全基于标题层级**运行，不同层级职责不同：",
  "",
  "```text",
  "#     日志标题（固定，不结转、不打标记）",
  "##    固定分类章节（每天从模板保留，作为需求的容器；不结转、不打标记）",
  "###   需求（结转与确认的基本单位，打 req-status 标记）",
  "####  子任务 / 问题（归属其上的 ### 需求，打 req-status 标记）",
  "- [ ] 任务（可选的待办勾选框，挂在任意标题之下）",
  "```",
  "",
  "- 结转只发生在 `###`（及其 `####`）上；`#` 和 `##` 是每天固定保留的骨架。",
  "- `- [ ]` 是**可选**的：一个 `###` 需求可以直接写内容、或拆成若干 `####` 子任务、或两者都有。",
  "",
  "## 四种结转状态",
  "",
  "每个 `###` 需求 / `####` 子任务都有四种状态（用 `<!-- req-status: 状态 -->` 标记，完成时也可用删除线）：",
  "",
  "| 状态 | 含义 | 是否结转到今天 |",
  "| --- | --- | --- |",
  "| `pending` 进行中 | 默认值，**没有标记就视为进行中** | 是 |",
  "| `verifying` 验证中 | 已做完、等待验证 | 是 |",
  "| `done` 已完成 | 需求已闭环 | 否 |",
  "| `cancelled` 已取消 | 不再做 | 否 |",
  "",
  "标记只写在 `###` 与 `####` 上，固定的 `#` / `##` 不写。",
  "",
  "## 确认弹窗规则",
  "",
  "弹窗**只列出昨天的 `###` 需求**（`#` / `##` 不会出现）：",
  "",
  "- 给某需求选「已完成 / 已取消」→ 它下面的 `####` 子任务自动收起、不再询问、也不结转；",
  "- 给某需求选「进行中 / 验证中」→ 展开它的 `####` 子任务，逐个确认结转状态；",
  "- 「跳过」= 全部保持进行中；「取消」= 放弃本次创建。",
  "",
  "目的：**任务全部打勾 ≠ 需求已闭环**，是否闭环必须由你确认。",
  "",
  "## 任务勾选与删除",
  "",
  "- 未勾选的 `- [ ]` 任务一定会结转到今天；",
  "- 已勾选的 `- [x]` 任务是否保留，由「结转时删除已完成任务」开关决定：开启则从新日志移除，关闭则作为历史保留。",
  "",
  "## 第一天没有标记怎么办",
  "",
  "**第一天不需要按模板写标记。** 没有标记的标题一律按「进行中」处理；当你第一次在弹窗里确认结转状态后，插件才会把 `<!-- req-status: ... -->` 写回昨天的日志，从第二天起标记就自动齐全了。",
  "",
  "## 日期占位符与路径格式",
  "",
  "**模板里的日期占位符**（三种写法等价，会被替换成按 Luxon 格式渲染的日期）：",
  "",
  "```text",
  "**date:YYYY-MM-DD**",
  "${date:YYYY-MM-DD}",
  "{{date:YYYY-MM-DD}}",
  "```",
  "",
  "**「日志文件名格式」** 也用 Luxon 格式：用 `/` 分隔目录层级，用 `[]` 包裹字面文本。",
  "例如 `GGGG/MM/[W]WW/MMDD` 会生成形如 `2026/09/W39/0923` 的路径。",
].join("\n");

/** The help document in the active locale. */
export function helpMarkdown(): string {
  return current === "zh" ? HELP_ZH : HELP_EN;
}

/**
 * Section status confirmation modal.
 *
 * When creating a daily note, yesterday's ### requirements that are still open
 * are presented for a status decision. A requirement's #### subtasks are shown
 * only while the requirement stays open; closing the requirement collapses
 * (and ignores) its subtasks, reducing the number of choices.
 */

import { App, Modal, Setting } from "obsidian";
import { SectionInfo } from "./carry-over";

export type StatusDecision = "pending" | "verifying" | "done" | "cancelled";

const STATUSES: { value: StatusDecision; label: string }[] = [
  { value: "pending", label: "进行中" },
  { value: "verifying", label: "验证中" },
  { value: "done", label: "已完成" },
  { value: "cancelled", label: "已取消" },
];

function isTerminal(status: StatusDecision): boolean {
  return status === "done" || status === "cancelled";
}

export class SectionConfirmModal extends Modal {
  private onComplete: ((decisions: Map<string, StatusDecision>) => void) | null;
  /** title -> the currently selected status for that row */
  private selected = new Map<string, StatusDecision>();

  constructor(
    app: App,
    private sections: SectionInfo[],
    onComplete: (decisions: Map<string, StatusDecision>) => void
  ) {
    super(app);
    this.onComplete = onComplete;
  }

  /** Render one row of status radios for a section or subtask. */
  private renderRadioGroup(
    container: HTMLElement,
    title: string,
    initial: StatusDecision,
    onChange?: (status: StatusDecision) => void
  ): void {
    this.selected.set(title, initial);

    const optionsDiv = container.createDiv({ cls: "section-status-options" });
    for (const status of STATUSES) {
      const labelEl = optionsDiv.createEl("label", { cls: "status-option" });
      const input = labelEl.createEl("input", {
        type: "radio",
        value: status.value,
      }) as HTMLInputElement;
      input.checked = status.value === initial;
      input.addEventListener("change", () => {
        if (!input.checked) return;
        this.selected.set(title, status.value);
        onChange?.(status.value);
      });
      labelEl.createSpan({ text: status.label });
    }
  }

  onOpen(): void {
    const { contentEl, titleEl, modalEl } = this;

    titleEl.setText("确认昨日章节状态");
    modalEl.addClass("section-confirm-modal");

    contentEl.createEl("p", {
      text:
        "以下需求来自昨日日志。若需求已闭环请选择「已完成」，不再处理其子任务；" +
        "若仍在进行请选择「进行中」或「验证中」，再逐项确认其子任务的结转状态。",
    });

    for (const info of this.sections) {
      const row = contentEl.createDiv({
        cls: "section-confirm-row status-" + info.status,
      });

      row.createDiv({ cls: "section-title", text: "### " + info.title });
      row.createDiv({
        cls: "section-progress",
        text: `任务完成度: ${info.completedTasks}/${info.totalTasks}`,
      });

      // Subtasks container: visible only while the requirement stays open.
      const subtasksEl = row.createDiv({ cls: "section-confirm-subtasks" });
      if (info.children.length > 0) {
        subtasksEl.createDiv({
          cls: "section-subtasks-label",
          text: "子任务结转状态：",
        });
        for (const child of info.children) {
          const childRow = subtasksEl.createDiv({
            cls: "section-confirm-subtask",
          });
          childRow.createDiv({
            cls: "section-subtask-title",
            text: `#### ${child.title} （${child.completedTasks}/${child.totalTasks}）`,
          });
          this.renderRadioGroup(childRow, child.title, child.status);
        }
      } else {
        subtasksEl.addClass("is-hidden");
      }

      this.renderRadioGroup(row, info.title, info.status, (status) => {
        row.className = `section-confirm-row status-${status}`;
        // Collapse subtasks when the requirement is closed.
        if (isTerminal(status)) {
          subtasksEl.addClass("is-hidden");
        } else {
          subtasksEl.removeClass("is-hidden");
        }
      });
    }

    new Setting(contentEl)
      .setName("")
      .addButton((btn) =>
        btn.setButtonText("确认").setCta().onClick(() => {
          this.onComplete?.(this.collectDecisions());
          this.close();
        })
      );

    new Setting(contentEl)
      .setName("")
      .addButton((btn) =>
        btn.setButtonText("跳过（全部保持进行中）").onClick(() => {
          for (const info of this.sections) {
            this.selected.set(info.title, "pending");
            for (const child of info.children) {
              this.selected.set(child.title, "pending");
            }
          }
          this.onComplete?.(this.collectDecisions());
          this.close();
        })
      );

    new Setting(contentEl)
      .setName("")
      .addButton((btn) =>
        btn.setButtonText("取消").onClick(() => {
          this.onComplete = null;
          this.close();
        })
      );
  }

  /**
   * Build the decision map. A closed requirement contributes only its own
   * status; its subtasks are ignored. An open requirement contributes its
   * status plus each subtask's status.
   */
  private collectDecisions(): Map<string, StatusDecision> {
    const decisions = new Map<string, StatusDecision>();
    for (const info of this.sections) {
      const status = this.selected.get(info.title) ?? info.status;
      decisions.set(info.title, status);
      if (!isTerminal(status)) {
        for (const child of info.children) {
          decisions.set(
            child.title,
            this.selected.get(child.title) ?? child.status
          );
        }
      }
    }
    return decisions;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

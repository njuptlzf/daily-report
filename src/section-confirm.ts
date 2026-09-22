/**
 * Section status confirmation modal.
 *
 * When creating a daily note, if yesterday's note has sections that need
 * status confirmation (all tasks done, but requirement not confirmed),
 * this modal asks the user to decide the status for each section.
 */

import { App, Modal, Setting } from "obsidian";
import { SectionInfo } from "./carry-over";

export type StatusDecision = "pending" | "verifying" | "done" | "cancelled";

/**
 * Modal that lets the user confirm the status of each pending section
 * from yesterday's note.
 */
export class SectionConfirmModal extends Modal {
  private decisions: Map<string, StatusDecision> = new Map();
  private onComplete: ((decisions: Map<string, StatusDecision>) => void) | null =
    null;
  private radioGroups: Map<string, HTMLInputElement[]> = new Map();

  constructor(
    app: App,
    private sections: SectionInfo[],
    onComplete: (decisions: Map<string, StatusDecision>) => void
  ) {
    super(app);
    this.onComplete = onComplete;
  }

  onOpen(): void {
    const { contentEl, titleEl, modalEl } = this;

    titleEl.setText("确认昨日章节状态");
    modalEl.addClass("section-confirm-modal");

    contentEl.createEl("p", {
      text:
        "以下章节来自昨日日志，需要确认其需求状态。" +
        "如果所有任务已完成且需求已闭环，请选择「已完成」；" +
        "如果需求已取消，请选择「已取消」；" +
        "如果需求仍在进行中，请选择「进行中」。",
    });

    // For each section that needs confirmation
    for (const info of this.sections) {
      if (!info.needsConfirm) continue;

      const row = contentEl.createDiv({ cls: "section-confirm-row status-pending" });

      // Section title
      const titleEl = row.createDiv({ cls: "section-title" });
      titleEl.setText("#".repeat(info.level) + " " + info.title);

      // Progress info
      row.createDiv({
        cls: "section-progress",
        text: `任务完成度: ${info.completedTasks}/${info.totalTasks}`,
      });

      // Radio buttons for status
      const optionsDiv = row.createDiv({ cls: "section-status-options" });
      const radios: HTMLInputElement[] = [];

      const statuses: { value: StatusDecision; label: string }[] = [
        { value: "pending", label: "进行中" },
        { value: "verifying", label: "验证中" },
        { value: "done", label: "已完成" },
        { value: "cancelled", label: "已取消" },
      ];

      for (const status of statuses) {
        const labelEl = optionsDiv.createEl("label") as HTMLElement;
      labelEl.className = "status-option";
        const input = labelEl.createEl("input", {
          type: "radio",
          value: status.value,
        }) as HTMLInputElement;
        input.setAttribute("name", `status-${info.title}`);
        input.addEventListener("change", () => {
          if (input.checked) {
            this.decisions.set(info.title, status.value);
            // Update row border color
            row.className = `section-confirm-row status-${status.value}`;
          }
        });
        labelEl.createSpan({ text: status.label });
        radios.push(input);

        // Default: pending
        if (status.value === "pending") {
          input.checked = true;
          this.decisions.set(info.title, "pending");
        }
      }

      this.radioGroups.set(info.title, radios);
    }

    // If no sections need confirmation, just close
    if (this.sections.filter((s) => s.needsConfirm).length === 0) {
      this.onComplete?.(this.decisions);
      this.close();
      return;
    }

    // Buttons
    new Setting(contentEl).setName("").addButton((btn) => {
      btn.setButtonText("确认")
        .setCta()
        .onClick(() => {
          this.onComplete?.(this.decisions);
          this.close();
        });
    });

    new Setting(contentEl).setName("").addButton((btn) => {
      btn.setButtonText("跳过（全部保持进行中）")
        .onClick(() => {
          // Default all to pending
          for (const info of this.sections) {
            if (info.needsConfirm) {
              this.decisions.set(info.title, "pending");
            }
          }
          this.onComplete?.(this.decisions);
          this.close();
        });
    });

    new Setting(contentEl).setName("").addButton((btn) => {
      btn.setButtonText("取消")
        .onClick(() => {
          this.onComplete = null;
          this.close();
        });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

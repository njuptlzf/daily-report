/**
 * Section status confirmation modal.
 *
 * The main modal lists yesterday's open ### requirements as collapsed rows
 * ("> ### title"). Clicking a row opens a detail popup that renders the
 * requirement's full original markdown (### + body + #### children, styled),
 * with the carry-over status pinned at the bottom so it stays visible while the
 * content scrolls. Status is single-select; each option shows an instant CSS
 * tooltip explaining how the section flows after the choice.
 */

import {
  App,
  Component,
  MarkdownRenderer,
  Modal,
  Setting,
  setIcon,
} from "obsidian";
import { SectionInfo } from "./carry-over";
import { t } from "./i18n";

export type StatusDecision = "pending" | "verifying" | "done" | "cancelled";

const STATUS_VALUES: StatusDecision[] = [
  "pending",
  "verifying",
  "done",
  "cancelled",
];

const STATUS_ICONS: Record<StatusDecision, string> = {
  pending: "loader",
  verifying: "eye",
  done: "check",
  cancelled: "x",
};

/** Detail popup: rendered requirement content + pinned single-select status. */
class RequirementDetailModal extends Modal {
  private chosen: StatusDecision;

  constructor(
    app: App,
    private info: SectionInfo,
    private component: Component,
    initial: StatusDecision,
    private onPick: (status: StatusDecision) => void
  ) {
    super(app);
    this.chosen = initial;
  }

  onOpen(): void {
    this.modalEl.addClass("sc-detail-modal");
    const { contentEl } = this;
    contentEl.empty();

    this.titleEl.setText("### " + this.info.title);

    // Scrollable rendered original content.
    const body = contentEl.createDiv({ cls: "sc-detail-body" });
    if (this.info.parentTitle) {
      body.createDiv({
        cls: "sc-detail-parent",
        text: "## " + this.info.parentTitle,
      });
    }
    const md = body.createDiv({ cls: "sc-detail-md" });
    void MarkdownRenderer.render(
      this.app,
      this.info.fullMarkdown,
      md,
      "",
      this.component
    );

    // Pinned footer: single-select status + apply.
    const footer = contentEl.createDiv({ cls: "sc-detail-footer" });
    footer.createDiv({
      cls: "sc-detail-footer-label",
      text: t("modal.pickStatus"),
    });
    const optionsDiv = footer.createDiv({ cls: "section-status-options" });
    const groupName = "sc-status-" + Math.random().toString(36).slice(2);
    for (const value of STATUS_VALUES) {
      const labelEl = optionsDiv.createEl("label", { cls: "status-option tip" });
      labelEl.setAttribute("data-tip", t(`tip.${value}`));
      const iconEl = labelEl.createSpan({ cls: `status-icon status-icon-${value}` });
      setIcon(iconEl, STATUS_ICONS[value]);
      const input = labelEl.createEl("input", {
        type: "radio",
        value,
      }) as HTMLInputElement;
      input.name = groupName;
      input.checked = value === this.chosen;
      input.addEventListener("change", () => {
        if (input.checked) this.chosen = value;
      });
      labelEl.createSpan({ text: t(`status.${value}`) });
    }
    const apply = footer.createEl("button", { cls: "mod-cta" });
    apply.setText(t("modal.apply"));
    apply.addEventListener("click", () => {
      this.onPick(this.chosen);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class SectionConfirmModal extends Modal {
  private onComplete: ((decisions: Map<string, StatusDecision>) => void) | null;
  /** title -> the currently selected status for that requirement */
  private selected = new Map<string, StatusDecision>();

  constructor(
    app: App,
    private sections: SectionInfo[],
    private component: Component,
    onComplete: (decisions: Map<string, StatusDecision>) => void
  ) {
    super(app);
    this.onComplete = onComplete;
  }

  onOpen(): void {
    const { contentEl, titleEl, modalEl } = this;

    titleEl.setText(t("modal.title"));
    modalEl.addClass("section-confirm-modal");
    contentEl.createEl("p", { text: t("modal.intro") });

    for (const info of this.sections) {
      this.selected.set(info.title, info.status);

      const row = contentEl.createDiv({
        cls: "section-confirm-row status-" + info.status,
      });
      const header = row.createDiv({ cls: "sc-row-header" });
      const chev = header.createSpan({ cls: "sc-chevron" });
      setIcon(chev, "chevron-right");
      header.createSpan({ cls: "section-title", text: "### " + info.title });
      const chip = header.createSpan({
        cls: "sc-chip status-" + info.status,
        text: t(`status.${info.status}`),
      });
      header.createSpan({
        cls: "sc-progress",
        text: `${info.completedTasks}/${info.totalTasks}`,
      });

      row.addEventListener("click", () => {
        new RequirementDetailModal(
          this.app,
          info,
          this.component,
          this.selected.get(info.title) ?? info.status,
          (status) => {
            this.selected.set(info.title, status);
            chip.textContent = t(`status.${status}`);
            chip.className = "sc-chip status-" + status;
            row.className = "section-confirm-row status-" + status;
          }
        ).open();
      });
    }

    new Setting(contentEl)
      .setName("")
      .addButton((btn) =>
        btn.setButtonText(t("modal.confirm")).setCta().onClick(() => {
          this.onComplete?.(this.collectDecisions());
          this.close();
        })
      );

    new Setting(contentEl)
      .setName("")
      .addButton((btn) =>
        btn.setButtonText(t("modal.skip")).onClick(() => {
          for (const info of this.sections) {
            this.selected.set(info.title, "pending");
          }
          this.onComplete?.(this.collectDecisions());
          this.close();
        })
      );

    new Setting(contentEl)
      .setName("")
      .addButton((btn) =>
        btn.setButtonText(t("modal.cancel")).onClick(() => {
          this.onComplete = null;
          this.close();
        })
      );
  }

  /** One decision per ### requirement; #### subtasks follow their note status. */
  private collectDecisions(): Map<string, StatusDecision> {
    const decisions = new Map<string, StatusDecision>();
    for (const info of this.sections) {
      decisions.set(info.title, this.selected.get(info.title) ?? info.status);
    }
    return decisions;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

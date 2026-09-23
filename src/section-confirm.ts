/**
 * Section status confirmation modal.
 *
 * Main modal lists yesterday's open ### requirements. Each row shows its parent
 * "## section" as a small line, a clickable "> ### title" (opens a detail popup
 * with the rendered original content), a task count, and an inline status
 * dropdown so the carry-over status can be set without opening the detail.
 *
 * The detail popup renders the requirement's context in document order
 * (# -> ## -> ### -> ####) and pins the single-select status at the bottom.
 * Status options use instant CSS tooltips.
 */

import {
  App,
  Component,
  DropdownComponent,
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

function isTerminalStatus(status: StatusDecision): boolean {
  return status === "done" || status === "cancelled";
}

/** Build the requirement's markdown in document order: ## -> ### -> ####. */
function orderedContext(info: SectionInfo): string {
  const parts: string[] = [];
  if (info.parentTitle) parts.push("## " + info.parentTitle);
  parts.push(info.fullMarkdown);
  return parts.join("\n\n");
}

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
    this.titleEl.setText(this.info.title);

    // Scrollable rendered original content, in heading order.
    const body = contentEl.createDiv({ cls: "sc-detail-body" });
    const md = body.createDiv({ cls: "sc-detail-md" });
    void MarkdownRenderer.render(
      this.app,
      orderedContext(this.info),
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
      const input = labelEl.createEl("input", {
        type: "radio",
        value,
      }) as HTMLInputElement;
      input.name = groupName;
      input.checked = value === this.chosen;
      input.addEventListener("change", () => {
        if (input.checked) this.chosen = value;
      });
      const iconEl = labelEl.createSpan({ cls: `status-icon status-icon-${value}` });
      setIcon(iconEl, STATUS_ICONS[value]);
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

/** Review popup: shows before -> after status per requirement, second confirm. */
class ReviewChangesModal extends Modal {
  constructor(
    app: App,
    private sections: SectionInfo[],
    private decisions: Map<string, StatusDecision>,
    private onApply: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("sc-review-modal");
    this.titleEl.setText(t("review.title"));
    const { contentEl } = this;
    contentEl.empty();

    const changed = this.sections.filter(
      (s) => (this.decisions.get(s.title) ?? s.status) !== s.status
    ).length;
    contentEl.createDiv({
      cls: "sc-review-summary",
      text: t("review.summary", { changed, total: this.sections.length }),
    });

    const list = contentEl.createDiv({ cls: "sc-review-list" });
    for (const info of this.sections) {
      const next = this.decisions.get(info.title) ?? info.status;
      const isChanged = next !== info.status;
      const item = list.createDiv({
        cls: "sc-review-item" + (isChanged ? " is-changed" : ""),
      });
      item.createSpan({ cls: "sc-review-title", text: "### " + info.title });
      const trans = item.createSpan({ cls: "sc-review-trans" });
      trans.createSpan({ cls: "sc-review-old", text: t(`status.${info.status}`) });
      trans.createSpan({ cls: "sc-review-arrow", text: " → " });
      trans.createSpan({
        cls: "sc-review-new status-" + next,
        text: t(`status.${next}`),
      });
      item.createSpan({
        cls: "sc-review-effect",
        text: isTerminalStatus(next) ? t("review.willDrop") : t("review.willCarry"),
      });
    }

    new Setting(contentEl)
      .setName("")
      .addButton((btn) =>
        btn.setButtonText(t("review.back")).onClick(() => this.close())
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("review.apply"))
          .setCta()
          .onClick(() => {
            this.onApply();
            this.close();
          })
      );
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
      if (info.parentTitle) {
        row.createDiv({ cls: "sc-parent-line", text: "## " + info.parentTitle });
      }

      const header = row.createDiv({ cls: "sc-row-header" });

      // Clickable title opens the detail popup (reading content is optional).
      const clickable = header.createDiv({ cls: "sc-row-click" });
      const chev = clickable.createSpan({ cls: "sc-chevron" });
      setIcon(chev, "chevron-right");
      clickable.createSpan({ cls: "section-title", text: "### " + info.title });

      header.createSpan({
        cls: "sc-progress",
        text: `${info.completedTasks}/${info.totalTasks}`,
      });

      const selectHost = header.createDiv({ cls: "sc-status-select" });
      const dd = new DropdownComponent(selectHost);
      for (const value of STATUS_VALUES) {
        dd.addOption(value, t(`status.${value}`));
      }

      const setStatus = (status: StatusDecision) => {
        this.selected.set(info.title, status);
        row.className = "section-confirm-row status-" + status;
        dd.setValue(status);
      };

      dd.setValue(info.status).onChange((value) => {
        setStatus(value as StatusDecision);
      });

      clickable.addEventListener("click", () => {
        new RequirementDetailModal(
          this.app,
          info,
          this.component,
          this.selected.get(info.title) ?? info.status,
          setStatus
        ).open();
      });
    }

    new Setting(contentEl)
      .setName("")
      .addButton((btn) =>
        btn.setButtonText(t("modal.confirm")).setCta().onClick(() => {
          const decisions = this.collectDecisions();
          new ReviewChangesModal(this.app, this.sections, decisions, () => {
            this.onComplete?.(decisions);
            this.close();
          }).open();
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

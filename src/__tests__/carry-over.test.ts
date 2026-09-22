import { describe, it, expect } from "vitest";
import {
  analyzeSectionsForConfirmation,
  getSectionsToCarryOver,
  extractFilteredSectionMarkdown,
  applyStatusDecisions,
  carryOver,
} from "../carry-over";
import { parseSections, SectionStatus } from "../section-parser";

describe("analyzeSectionsForConfirmation", () => {
  it("returns sections that need confirmation", () => {
    const markdown =
      "## Section A <!-- req-status: pending -->\n" +
      "- [x] Done task\n" +
      "\n" +
      "## Section B <!-- req-status: pending -->\n" +
      "- [ ] Pending task\n" +
      "\n" +
      "## Section C <!-- req-status: done -->\n" +
      "- [x] Done task";

    const info = analyzeSectionsForConfirmation(markdown);
    // Section A needs confirmation (all tasks done, pending status)
    // Section B does NOT need confirmation (has pending tasks)
    // Section C is already done, should be skipped
    const needsConfirm = info.filter((i) => i.needsConfirm);
    expect(needsConfirm).toHaveLength(1);
    expect(needsConfirm[0].title).toBe("Section A");
  });

  it("reports task counts correctly", () => {
    const markdown =
      "## Section A <!-- req-status: pending -->\n" +
      "- [x] Done 1\n" +
      "- [x] Done 2\n" +
      "- [ ] Pending 1";

    const info = analyzeSectionsForConfirmation(markdown);
    const sectionA = info.find((i) => i.title === "Section A");
    expect(sectionA).toBeDefined();
    expect(sectionA!.totalTasks).toBe(3);
    expect(sectionA!.completedTasks).toBe(2);
    expect(sectionA!.pendingTasks).toBe(1);
    expect(sectionA!.needsConfirm).toBe(false); // Has pending tasks
  });

  it("handles sections with no tasks", () => {
    const markdown = "## Empty Section <!-- req-status: pending -->\nNo tasks here";

    const info = analyzeSectionsForConfirmation(markdown);
    expect(info).toHaveLength(1);
    expect(info[0].needsConfirm).toBe(true);
    expect(info[0].totalTasks).toBe(0);
  });
});

describe("getSectionsToCarryOver", () => {
  it("carries over pending sections with unchecked tasks", () => {
    const markdown =
      "## Section A <!-- req-status: pending -->\n" +
      "- [ ] Task 1\n" +
      "\n" +
      "## Section B <!-- req-status: pending -->\n" +
      "- [x] Done task";

    const sections = getSectionsToCarryOver(markdown, new Map());
    // Section A has unchecked tasks → carry over
    // Section B has no unchecked tasks but is pending → carry over (user will confirm)
    expect(sections).toHaveLength(2);
  });

  it("skips done sections", () => {
    const markdown =
      "## Section A <!-- req-status: pending -->\n" +
      "- [ ] Task 1\n" +
      "\n" +
      "## Section B <!-- req-status: done -->\n" +
      "- [ ] Task 2";

    const sections = getSectionsToCarryOver(markdown, new Map());
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Section A");
  });

  it("skips cancelled sections", () => {
    const markdown =
      "## Section A <!-- req-status: cancelled -->\n" +
      "- [ ] Task 1";

    const sections = getSectionsToCarryOver(markdown, new Map());
    expect(sections).toHaveLength(0);
  });

  it("applies user decisions", () => {
    const markdown =
      "## Section A <!-- req-status: pending -->\n" +
      "- [x] Done task";

    const decisions = new Map<string, SectionStatus>([
      ["Section A", "done"],
    ]);
    const sections = getSectionsToCarryOver(markdown, decisions);
    // Section A was marked done, should not be carried over
    expect(sections).toHaveLength(0);
  });
});

describe("extractFilteredSectionMarkdown", () => {
  it("keeps all tasks when deleteCompleted is false", () => {
    const markdown =
      "## Section\n- [ ] Pending task\n- [x] Done task";
    const sections = parseSections(markdown);
    const extracted = extractFilteredSectionMarkdown(
      markdown,
      sections[0],
      false
    );
    expect(extracted).toContain("- [ ] Pending task");
    expect(extracted).toContain("- [x] Done task");
  });

  it("removes completed tasks when deleteCompleted is true", () => {
    const markdown =
      "## Section\n- [ ] Pending task\n- [x] Done task";
    const sections = parseSections(markdown);
    const extracted = extractFilteredSectionMarkdown(
      markdown,
      sections[0],
      true
    );
    expect(extracted).toContain("- [ ] Pending task");
    expect(extracted).not.toContain("- [x] Done task");
  });
});

describe("applyStatusDecisions", () => {
  it("updates section status markers", () => {
    const markdown =
      "## Section A <!-- req-status: pending -->\n" +
      "- [x] Done task";

    const decisions = new Map<string, SectionStatus>([
      ["Section A", "done"],
    ]);
    const updated = applyStatusDecisions(markdown, decisions);
    expect(updated).toContain("~~Section A~~");
    expect(updated).not.toContain("<!-- req-status: pending -->");
  });

  it("returns original markdown when no decisions", () => {
    const markdown = "## Section\nContent";
    const updated = applyStatusDecisions(markdown, new Map());
    expect(updated).toBe(markdown);
  });
});

describe("carryOver", () => {
  it("merges pending sections into template", () => {
    const yesterday =
      "## Section A <!-- req-status: pending -->\n" +
      "- [ ] Task 1\n" +
      "- [ ] Task 2";

    const template =
      "# Today\n\n" +
      "## Section A <!-- req-status: pending -->\n" +
      "Placeholder content";

    const decisions = new Map<string, SectionStatus>();
    const result = carryOver(yesterday, template, decisions, false);

    // Today's note should contain the template content and the carried-over tasks
    expect(result.todayMarkdown).toContain("# Today");
    expect(result.todayMarkdown).toContain("Placeholder content");
    expect(result.todayMarkdown).toContain("- [ ] Task 1");
    expect(result.todayMarkdown).toContain("- [ ] Task 2");
  });

  it("does not carry over done sections", () => {
    const yesterday =
      "## Section A <!-- req-status: done -->\n" +
      "- [x] Done task";

    const template = "# Today\n\nSome template";

    const decisions = new Map<string, SectionStatus>();
    const result = carryOver(yesterday, template, decisions, false);

    expect(result.todayMarkdown).toBe("# Today\n\nSome template");
  });

  it("handles empty yesterday markdown", () => {
    const template = "# Today\n\nSome template";

    const decisions = new Map<string, SectionStatus>();
    const result = carryOver("", template, decisions, false);

    expect(result.todayMarkdown).toBe("# Today\n\nSome template");
  });

  it("tracks applied statuses", () => {
    const yesterday =
      "## Section A <!-- req-status: pending -->\n" +
      "- [x] Done task";

    const template = "# Today";

    const decisions = new Map<string, SectionStatus>([
      ["Section A", "done"],
    ]);
    const result = carryOver(yesterday, template, decisions, false);

    expect(result.appliedStatuses.get("Section A")).toBe("done");
    expect(result.yesterdayMarkdown).toContain("~~Section A~~");
  });

  it("deletes completed tasks when deleteCompleted is true", () => {
    const yesterday =
      "## Section A <!-- req-status: pending -->\n" +
      "- [ ] Pending task\n" +
      "- [x] Done task";

    const template = "# Today";

    const decisions = new Map<string, SectionStatus>();
    const result = carryOver(yesterday, template, decisions, true);

    expect(result.todayMarkdown).toContain("- [ ] Pending task");
    expect(result.todayMarkdown).not.toContain("- [x] Done task");
  });
});

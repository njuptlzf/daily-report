import { describe, it, expect } from "vitest";
import {
  analyzeSectionsForConfirmation,
  rolloverMarkdown,
  applyStatusDecisions,
  carryOver,
} from "../carry-over";
import { SectionStatus } from "../section-parser";

// A realistic note: # and ## are fixed skeleton; ### are requirements;
// #### are subtasks.
const YESTERDAY = [
  "# 日报",
  "",
  "## 今日AI",
  "",
  "### 需求A <!-- req-status: pending -->",
  "- [x] 任务1",
  "",
  "### 需求B",
  "#### 子任务B1",
  "- [ ] 未完成",
  "",
  "## 其他",
  "",
  "### 需求C <!-- req-status: done -->",
  "- [x] 完成",
].join("\n");

describe("analyzeSectionsForConfirmation", () => {
  it("returns only ### requirements, never # or ##", () => {
    const info = analyzeSectionsForConfirmation(YESTERDAY);
    const titles = info.map((i) => i.title);
    expect(titles).toContain("需求A");
    expect(titles).toContain("需求B");
    expect(titles).not.toContain("日报"); // #
    expect(titles).not.toContain("今日AI"); // ##
    expect(titles).not.toContain("子任务B1"); // #### is a child, not a root
  });

  it("skips terminal requirements", () => {
    const info = analyzeSectionsForConfirmation(YESTERDAY);
    expect(info.map((i) => i.title)).not.toContain("需求C");
  });

  it("attaches non-terminal #### children and records the parent ##", () => {
    const info = analyzeSectionsForConfirmation(YESTERDAY);
    const reqB = info.find((i) => i.title === "需求B")!;
    expect(reqB.parentTitle).toBe("今日AI");
    expect(reqB.rootTitle).toBe("日报"); // top-level # for ordered context
    expect(reqB.children.map((c) => c.title)).toContain("子任务B1");
    // 需求A has no #### children
    const reqA = info.find((i) => i.title === "需求A")!;
    expect(reqA.children).toHaveLength(0);
  });

  it("captures the raw content between heading levels for the preview", () => {
    const info = analyzeSectionsForConfirmation(YESTERDAY);
    // 需求A owns the "- [x] 任务1" line directly under its heading.
    expect(info.find((i) => i.title === "需求A")!.content).toContain("- [x] 任务1");
    // 需求B's own body is empty (its content lives under the #### child).
    expect(info.find((i) => i.title === "需求B")!.content).toBe("");
    // The #### child carries its own body.
    const sub = info.find((i) => i.title === "需求B")!.children[0];
    expect(sub.content).toContain("- [ ] 未完成");
    // The requirement's full block (detail popup source) includes its #### child.
    expect(info.find((i) => i.title === "需求B")!.fullMarkdown).toContain("#### 子任务B1");
  });

  it("marks a requirement as needing confirmation only when all tasks are done", () => {
    const info = analyzeSectionsForConfirmation(YESTERDAY);
    expect(info.find((i) => i.title === "需求A")!.needsConfirm).toBe(true);
    expect(info.find((i) => i.title === "需求B")!.needsConfirm).toBe(false);
  });

  it("treats a first-day note without markers as pending", () => {
    const noMarkers = "## 今日AI\n\n### 需求X\n- [ ] 任务";
    const info = analyzeSectionsForConfirmation(noMarkers);
    expect(info).toHaveLength(1);
    expect(info[0].status).toBe("pending");
  });
});

describe("applyStatusDecisions", () => {
  it("writes markers on ### but never on the fixed ## skeleton", () => {
    const decisions = new Map<string, SectionStatus>([
      ["需求A", "done"],
      ["今日AI", "done"], // a ## must be ignored even if a decision targets it
    ]);
    const updated = applyStatusDecisions(YESTERDAY, decisions);
    expect(updated).toContain("### ~~需求A~~");
    expect(updated).toContain("## 今日AI"); // unchanged, no marker/strikethrough
    expect(updated).not.toContain("~~今日AI~~");
  });

  it("leaves a pending requirement unmarked (pending is the default)", () => {
    const decisions = new Map<string, SectionStatus>([["需求B", "pending"]]);
    const updated = applyStatusDecisions(YESTERDAY, decisions);
    const lineB = updated.split("\n").find((l) => l.startsWith("### 需求B"));
    expect(lineB).toBe("### 需求B"); // no marker written
  });

  it("strips a legacy pending marker back to a clean heading", () => {
    // 需求A already carries "<!-- req-status: pending -->" in the fixture.
    const decisions = new Map<string, SectionStatus>([["需求A", "pending"]]);
    const updated = applyStatusDecisions(YESTERDAY, decisions);
    expect(updated).toContain("### 需求A");
    expect(updated).not.toContain("req-status: pending");
  });

  it("returns the original markdown when there are no decisions", () => {
    expect(applyStatusDecisions(YESTERDAY, new Map())).toBe(YESTERDAY);
  });
});

describe("rolloverMarkdown", () => {
  it("keeps the # / ## skeleton and open requirements, drops closed ones", () => {
    const out = rolloverMarkdown(YESTERDAY, new Map(), false);
    expect(out).toContain("# 日报");
    expect(out).toContain("## 今日AI");
    expect(out).toContain("### 需求A");
    expect(out).toContain("### 需求B");
    expect(out).toContain("#### 子任务B1");
    // 需求C is done -> not carried
    expect(out).not.toContain("需求C");
  });

  it("drops a requirement the user closed", () => {
    const decisions = new Map<string, SectionStatus>([["需求A", "done"]]);
    const out = rolloverMarkdown(YESTERDAY, decisions, false);
    expect(out).not.toContain("### 需求A");
    expect(out).toContain("### 需求B");
  });

  it("drops a #### subtask the user closed but keeps its parent", () => {
    const decisions = new Map<string, SectionStatus>([
      ["需求B", "pending"],
      ["子任务B1", "cancelled"],
    ]);
    const out = rolloverMarkdown(YESTERDAY, decisions, false);
    expect(out).toContain("### 需求B");
    expect(out).not.toContain("#### 子任务B1");
  });

  it("removes completed tasks when deleteCompleted is true", () => {
    const out = rolloverMarkdown(YESTERDAY, new Map(), true);
    expect(out).not.toContain("- [x] 任务1");
    expect(out).toContain("- [ ] 未完成");
  });
});

describe("carryOver", () => {
  it("rollover mode: drops closed requirement today, writes marker to yesterday", () => {
    const decisions = new Map<string, SectionStatus>([["需求A", "done"]]);
    const result = carryOver(YESTERDAY, "", decisions, false);
    expect(result.appliedStatuses.get("需求A")).toBe("done");
    // Today (rollover) drops the now-closed 需求A.
    expect(result.todayMarkdown).not.toContain("### 需求A");
    // Yesterday gets the done marker.
    expect(result.yesterdayMarkdown).toContain("### ~~需求A~~");
  });

  it("Skip (no decisions) preserves a verifying marker and leaves yesterday untouched", () => {
    const yesterday =
      "## 今日AI\n\n### 需求V <!-- req-status: verifying -->\n- [x] 做完";
    const result = carryOver(yesterday, "", new Map(), false);
    expect(result.yesterdayMarkdown).toBe(yesterday);
    expect(result.todayMarkdown).toContain(
      "### 需求V <!-- req-status: verifying -->"
    );
  });

  it("first day (no yesterday) uses the template", () => {
    const result = carryOver("", "# Today", new Map(), false);
    expect(result.todayMarkdown).toBe("# Today");
  });
});

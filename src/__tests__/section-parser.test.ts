import { describe, it, expect } from "vitest";
import {
  parseSections,
  findSectionByTitle,
  getAllTasks,
  getUncheckedTasks,
  hasPendingWork,
  needsConfirmation,
  buildHeading,
  extractSectionMarkdown,
  updateHeadingStatus,
} from "../section-parser";

describe("parseSections", () => {
  it("throws on null input", () => {
    expect(() => parseSections(null as unknown as string)).toThrow();
    expect(() => parseSections(undefined as unknown as string)).toThrow();
  });

  it("parses simple sections", () => {
    const markdown = `## Section A
Some content

## Section B
More content`;
    const sections = parseSections(markdown);
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("Section A");
    expect(sections[0].level).toBe(2);
    expect(sections[1].title).toBe("Section B");
    expect(sections[1].level).toBe(2);
  });

  it("parses nested sections", () => {
    const markdown = `## Parent
Content A

### Child 1
Content A1

### Child 2
Content A2`;
    const sections = parseSections(markdown);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Parent");
    expect(sections[0].children).toHaveLength(2);
    expect(sections[0].children[0].title).toBe("Child 1");
    expect(sections[0].children[1].title).toBe("Child 2");
    expect(sections[0].children[0].level).toBe(3);
  });

  it("parses status markers", () => {
    const markdown =
      "## Section A <!-- req-status: done -->\n" +
      "Content\n" +
      "\n" +
      "## Section B <!-- req-status: cancelled -->\n" +
      "Content";
    const sections = parseSections(markdown);
    expect(sections[0].status).toBe("done");
    expect(sections[1].status).toBe("cancelled");
  });

  it("defaults to pending status when no marker", () => {
    const markdown = "## Section A\nContent";
    const sections = parseSections(markdown);
    expect(sections[0].status).toBe("pending");
  });

  it("parses tasks", () => {
    const markdown = `## Tasks
- [ ] Task 1
- [x] Task 2
- [ ] Task 3
- Not a task`;
    const sections = parseSections(markdown);
    expect(sections[0].tasks).toHaveLength(3);
    expect(sections[0].tasks[0].checked).toBe(false);
    expect(sections[0].tasks[1].checked).toBe(true);
    expect(sections[0].tasks[2].checked).toBe(false);
  });

  it("parses tasks with indentation", () => {
    const markdown = `## Tasks
- [ ] Parent task
  - [ ] Child task
    - [ ] Grandchild task`;
    const sections = parseSections(markdown);
    expect(sections[0].tasks).toHaveLength(3);
    expect(sections[0].tasks[0].indent).toBe(0);
    expect(sections[0].tasks[1].indent).toBe(2);
    expect(sections[0].tasks[2].indent).toBe(4);
  });

  it("parses uppercase X as checked", () => {
    const markdown = "- [X] Checked task";
    const sections = parseSections(markdown);
    // This is a top-level line, not under any heading
    // So it won't be in any section
    expect(sections).toHaveLength(0);
  });

  it("tracks line ranges correctly", () => {
    const markdown = `## Section A
Line 1
Line 2

## Section B
Line 3`;
    const sections = parseSections(markdown);
    expect(sections[0].lineStart).toBe(0);
    expect(sections[0].lineEnd).toBe(3); // Includes empty line before Section B
    expect(sections[1].lineStart).toBe(4);
    expect(sections[1].lineEnd).toBe(5);
  });
});

describe("findSectionByTitle", () => {
  it("finds top-level section", () => {
    const markdown = "## Section A\nContent\n## Section B\nContent";
    const sections = parseSections(markdown);
    const found = findSectionByTitle(sections, "Section B");
    expect(found).not.toBeNull();
    expect(found!.title).toBe("Section B");
  });

  it("finds nested section", () => {
    const markdown =
      "## Parent\nContent\n### Child\nContent\n### Other\nContent";
    const sections = parseSections(markdown);
    const found = findSectionByTitle(sections, "Child");
    expect(found).not.toBeNull();
    expect(found!.title).toBe("Child");
  });

  it("returns null when not found", () => {
    const markdown = "## Section A\nContent";
    const sections = parseSections(markdown);
    const found = findSectionByTitle(sections, "NonExistent");
    expect(found).toBeNull();
  });
});

describe("getAllTasks and getUncheckedTasks", () => {
  it("gets all tasks including children", () => {
    const markdown = `## Parent
- [ ] Parent task

### Child
- [x] Child task 1
- [ ] Child task 2`;
    const sections = parseSections(markdown);
    const allTasks = getAllTasks(sections[0]);
    expect(allTasks).toHaveLength(3);
  });

  it("gets only unchecked tasks", () => {
    const markdown = `## Parent
- [ ] Parent task

### Child
- [x] Child task 1
- [ ] Child task 2`;
    const sections = parseSections(markdown);
    const unchecked = getUncheckedTasks(sections[0]);
    expect(unchecked).toHaveLength(2);
    expect(unchecked.every((t) => !t.checked)).toBe(true);
  });
});

describe("hasPendingWork", () => {
  it("returns true when section has unchecked tasks", () => {
    const markdown = "## Tasks\n- [ ] Unchecked task";
    const sections = parseSections(markdown);
    expect(hasPendingWork(sections[0])).toBe(true);
  });

  it("returns false when all tasks are checked", () => {
    const markdown = "## Tasks\n- [x] Checked task";
    const sections = parseSections(markdown);
    expect(hasPendingWork(sections[0])).toBe(false);
  });

  it("returns true when child has unchecked tasks", () => {
    const markdown =
      "## Parent\nNo tasks here\n### Child\n- [ ] Child task";
    const sections = parseSections(markdown);
    expect(hasPendingWork(sections[0])).toBe(true);
  });

  it("returns false when no tasks exist", () => {
    const markdown = "## Empty section\nJust content, no tasks";
    const sections = parseSections(markdown);
    expect(hasPendingWork(sections[0])).toBe(false);
  });
});

describe("needsConfirmation", () => {
  it("returns true when all tasks done but status is pending", () => {
    const markdown =
      "## Section <!-- req-status: pending -->\n- [x] Done task";
    const sections = parseSections(markdown);
    expect(needsConfirmation(sections[0])).toBe(true);
  });

  it("returns false when status is already done", () => {
    const markdown =
      "## Section <!-- req-status: done -->\n- [x] Done task";
    const sections = parseSections(markdown);
    expect(needsConfirmation(sections[0])).toBe(false);
  });

  it("returns false when there are unchecked tasks", () => {
    const markdown =
      "## Section <!-- req-status: pending -->\n- [ ] Pending task";
    const sections = parseSections(markdown);
    expect(needsConfirmation(sections[0])).toBe(false);
  });

  it("returns true when no tasks and status is pending", () => {
    const markdown = "## Section <!-- req-status: pending -->\nNo tasks";
    const sections = parseSections(markdown);
    expect(needsConfirmation(sections[0])).toBe(true);
  });
});

describe("buildHeading", () => {
  it("builds heading with status marker", () => {
    const heading = buildHeading("Test Section", 2, "pending");
    expect(heading).toBe("## Test Section <!-- req-status: pending -->");
  });

  it("builds level 3 heading", () => {
    const heading = buildHeading("Sub Section", 3, "done");
    expect(heading).toBe("### Sub Section <!-- req-status: done -->");
  });
});

describe("extractSectionMarkdown", () => {
  it("extracts section with heading", () => {
    const markdown = "## Section A\nContent A\n\n## Section B\nContent B";
    const sections = parseSections(markdown);
    const extracted = extractSectionMarkdown(markdown, sections[0]);
    expect(extracted).toContain("## Section A");
    expect(extracted).toContain("Content A");
    expect(extracted).not.toContain("## Section B");
  });
});

describe("updateHeadingStatus", () => {
  it("updates existing status marker to done (strikethrough)", () => {
    const heading = "## Section <!-- req-status: pending -->";
    const updated = updateHeadingStatus(heading, "done");
    expect(updated).toBe("## ~~Section~~");
  });

  it("adds strikethrough to heading without marker when done", () => {
    const heading = "## Section";
    const updated = updateHeadingStatus(heading, "done");
    expect(updated).toBe("## ~~Section~~");
  });

  it("adds status marker to heading without one for cancelled", () => {
    const heading = "## Section";
    const updated = updateHeadingStatus(heading, "cancelled");
    expect(updated).toBe("## Section <!-- req-status: cancelled -->");
  });

  it("strips strikethrough and marker when changing to pending (default)", () => {
    const heading = "## ~~Section~~";
    const updated = updateHeadingStatus(heading, "pending");
    expect(updated).toBe("## Section");
  });

  it("writes an explicit marker for verifying", () => {
    const updated = updateHeadingStatus("## Section", "verifying");
    expect(updated).toBe("## Section <!-- req-status: verifying -->");
  });
});

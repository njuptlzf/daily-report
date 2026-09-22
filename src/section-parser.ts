/**
 * Markdown section and task parser.
 *
 * Parses markdown into a tree of sections (## / ### headings).
 * Each section tracks:
 *   - Its heading text, level, and title
 *   - Its status (pending / done / cancelled) via HTML comment marker
 *   - Tasks directly under it (- [ ] / - [x])
 *   - Child sections (nested headings)
 *   - Line range in the original markdown
 */

export type SectionStatus = "pending" | "verifying" | "done" | "cancelled";

export interface Task {
  /** Full line text, e.g. "- [ ] Fix the bug" */
  text: string;
  /** true if checked (- [x]), false if unchecked (- [ ]). */
  checked: boolean;
  /** Number of leading spaces (indentation). */
  indent: number;
  /** Line number in the original markdown (0-based). */
  line: number;
}

export interface Section {
  /** Full heading line, e.g. "## 客户问题 <!-- req-status: pending -->" */
  heading: string;
  /** Heading text without the status marker, e.g. "## 客户问题" */
  headingText: string;
  /** Heading level (2 for ##, 3 for ###, etc.) */
  level: number;
  /** Title without # and status marker, e.g. "客户问题" */
  title: string;
  /** Section status: pending (default), done, or cancelled */
  status: SectionStatus;
  /** Tasks directly under this heading (not in children). */
  tasks: Task[];
  /** Nested sections (deeper headings). */
  children: Section[];
  /** Line number of the heading (0-based). */
  lineStart: number;
  /** Line number of the last line in this section, including children (0-based). */
  lineEnd: number;
}

/** Pattern matching markdown headings: #, ##, ###, etc. */
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;

/** Pattern matching the status marker: <!-- req-status: pending --> */
const STATUS_MARKER_PATTERN = /<!--\s*req-status:\s*(pending|verifying|done|cancelled)\s*-->/i;

/** Pattern matching strikethrough in heading: ~~title~~ */
const STRIKETHROUGH_PATTERN = /^~~(.+?)~~$/;

/** Pattern matching task lines: - [ ] or - [x] with optional leading whitespace */
const TASK_PATTERN = /^(\s*)- \[([ xX])\]\s*(.*)$/;

/**
 * Parse markdown into a tree of sections.
 *
 * @param markdown - The markdown text to parse
 * @returns An array of top-level sections
 *
 * @throws {Error} If the input is null or undefined
 */
export function parseSections(markdown: string): Section[] {
  if (markdown == null) {
    throw new Error("parseSections: markdown must not be null or undefined");
  }

  const lines = markdown.split("\n");
  const root: Section = {
    heading: "",
    headingText: "",
    level: 0,
    title: "",
    status: "pending",
    tasks: [],
    children: [],
    lineStart: 0,
    lineEnd: lines.length - 1,
  };
  const stack: Section[] = [root];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(HEADING_PATTERN);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const rawTitle = headingMatch[2].trim();

      // Parse status from HTML comment
      let status: SectionStatus;
      let title: string;

      const statusMatch = rawTitle.match(STATUS_MARKER_PATTERN);
      if (statusMatch) {
        status = statusMatch[1].toLowerCase() as SectionStatus;
        title = rawTitle.replace(STATUS_MARKER_PATTERN, "").trim();
      } else {
        // Check for strikethrough as done marker: ~~title~~ or ~~title
        const strikeMatch = rawTitle.match(STRIKETHROUGH_PATTERN);
        if (strikeMatch) {
          status = "done";
          title = (strikeMatch[1] || strikeMatch[2]).trim();
        } else {
          status = "pending";
          title = rawTitle;
        }
      }

      const section: Section = {
        heading: line,
        headingText: title,
        level,
        title,
        status,
        tasks: [],
        children: [],
        lineStart: i,
        lineEnd: i,
      };

      // Pop stack until we find a parent with a lower level
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- stack.length > 1 guarantees pop() returns a defined Section
        const popped = stack.pop()!;
        popped.lineEnd = i - 1;
      }

      // Add as child of the current top of stack
      const parent = stack[stack.length - 1];
      parent.children.push(section);
      stack.push(section);
    } else {
      // Non-heading line: update current section's lineEnd and check for tasks
      const current = stack[stack.length - 1];
      if (current !== root) {
        current.lineEnd = i;
      }

      const taskMatch = line.match(TASK_PATTERN);
      if (taskMatch) {
        current.tasks.push({
          text: line,
          checked: taskMatch[2].toLowerCase() === "x",
          indent: taskMatch[1].length,
          line: i,
        });
      }
    }
  }

  // Update lineEnd for remaining sections in stack
  for (let i = stack.length - 1; i > 0; i--) {
    stack[i].lineEnd = lines.length - 1;
  }

  return root.children;
}

/**
 * Recursively find a section by title.
 *
 * @param sections - Array of sections to search
 * @param title - The title to search for (case-sensitive)
 * @returns The matching section, or null if not found
 */
export function findSectionByTitle(
  sections: Section[],
  title: string
): Section | null {
  for (const section of sections) {
    if (section.title === title) return section;
    const found = findSectionByTitle(section.children, title);
    if (found) return found;
  }
  return null;
}

/**
 * Get all tasks (including nested) from a section, recursively.
 */
export function getAllTasks(section: Section): Task[] {
  const tasks = [...section.tasks];
  for (const child of section.children) {
    tasks.push(...getAllTasks(child));
  }
  return tasks;
}

/**
 * Get all unchecked tasks from a section, recursively.
 */
export function getUncheckedTasks(section: Section): Task[] {
  return getAllTasks(section).filter((t) => !t.checked);
}

/**
 * Check if a section has any pending work (unchecked tasks directly or in children).
 */
export function hasPendingWork(section: Section): boolean {
  if (section.tasks.some((t) => !t.checked)) return true;
  return section.children.some((child) => hasPendingWork(child));
}

/**
 * Check if a section needs status confirmation.
 * A section needs confirmation if:
 *   - Its status is "pending" or "verifying"
 *   - It has no pending work (no unchecked tasks)
 *
 * This is the case where all tasks are done, but we need to confirm
 * whether the requirement (section) itself is closed.
 */
export function needsConfirmation(section: Section): boolean {
  return (section.status === "pending" || section.status === "verifying") &&
    !hasPendingWork(section);
}

/**
 * Check if all #### subsections (level 4) under a section are completed.
 * A subsection is considered completed if its status is "done" or "cancelled".
 *
 * @param section - The section to check (typically ### level)
 * @returns true if all #### subsections are done/cancelled, false otherwise
 */
export function allSubsectionsCompleted(section: Section): boolean {
  // Find all direct children that are #### (level 4)
  const subsections = section.children.filter((child) => child.level === 4);

  // If no subsections, return true (nothing to check)
  if (subsections.length === 0) return true;

  // All subsections must be done or cancelled
  return subsections.every((sub) =>
    sub.status === "done" || sub.status === "cancelled"
  );
}

/**
 * Check if any #### subsection has pending work.
 * Returns true if there's at least one subsection that is not done/cancelled.
 */
export function hasPendingSubsections(section: Section): boolean {
  const subsections = section.children.filter((child) => child.level === 4);

  if (subsections.length === 0) return false;

  // Any subsection that is not done/cancelled means there's pending work
  return subsections.some((sub) =>
    sub.status === "pending" || sub.status === "verifying"
  );
}

/**
 * Build the heading text with a status marker.
 *
 * @param title - The section title
 * @param level - The heading level (2 for ##, 3 for ###, etc.)
 * @param status - The section status
 * @returns The full heading line, e.g. "## 客户问题 <!-- req-status: pending -->"
 */
export function buildHeading(
  title: string,
  level: number,
  status: SectionStatus
): string {
  const hashes = "#".repeat(level);
  return `${hashes} ${title} <!-- req-status: ${status} -->`;
}

/**
 * Extract the raw markdown of a section from the original markdown.
 * This includes the heading, all content, and all children.
 *
 * @param markdown - The original markdown text
 * @param section - The section to extract
 * @returns The markdown text of the section
 */
export function extractSectionMarkdown(
  markdown: string,
  section: Section
): string {
  const lines = markdown.split("\n");
  return lines.slice(section.lineStart, section.lineEnd + 1).join("\n");
}

/**
 * Update the status marker in a heading.
 * - "done": adds strikethrough ~~title~~
 * - "pending": removes strikethrough and adds pending marker
 * - "cancelled": removes strikethrough and adds cancelled marker
 *
 * @param heading - The original heading text
 * @param newStatus - The new status
 * @returns The updated heading with the new status
 */
export function updateHeadingStatus(
  heading: string,
  newStatus: SectionStatus
): string {
  // First, remove any existing status markers and strikethrough
  let cleanHeading = heading
    .replace(STATUS_MARKER_PATTERN, "")
    .replace(/^(\s*#+\s*)~~(.+?)~~\s*$/, "$1$2");

  // Remove trailing whitespace
  cleanHeading = cleanHeading.replace(/\s+$/, "");

  if (newStatus === "done") {
    // Add strikethrough to the title
    return cleanHeading.replace(/^(\s*#+\s*)(.+)$/, "$1~~$2~~");
  } else {
    // Add status marker for pending/cancelled
    return `${cleanHeading} <!-- req-status: ${newStatus} -->`;
  }
}

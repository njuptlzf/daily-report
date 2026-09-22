/**
 * Task carry-over logic.
 *
 * When creating today's daily note, this module:
 *   1. Parses yesterday's note to find sections with pending work
 *   2. Determines which sections need status confirmation
 *   3. Carries over pending sections (with unchecked tasks) into today's template
 *   4. Updates yesterday's note with confirmed statuses
 */

import {
  Section,
  SectionStatus,
  parseSections,
  findSectionByTitle,
  updateHeadingStatus,
  hasPendingWork,
  needsConfirmation,
  getUncheckedTasks,
  allSubsectionsCompleted,
  hasPendingSubsections,
} from "./section-parser";

export interface SectionInfo {
  /** The section title (without heading markers and status) */
  title: string;
  /** The section level (2 for ##, 3 for ###) */
  level: number;
  /** Total number of tasks in this section (including children) */
  totalTasks: number;
  /** Number of checked (completed) tasks */
  completedTasks: number;
  /** Number of unchecked (incomplete) tasks */
  pendingTasks: number;
  /** Whether this section needs status confirmation */
  needsConfirm: boolean;
  /** The original section status */
  status: SectionStatus;
}

export interface CarryOverResult {
  /** The merged markdown for today's note */
  todayMarkdown: string;
  /** Updated markdown for yesterday's note (with status changes) */
  yesterdayMarkdown: string;
  /** Status decisions that were applied */
  appliedStatuses: Map<string, SectionStatus>;
}

/**
 * Analyze yesterday's sections to determine which need confirmation.
 *
 * @param yesterdayMarkdown - Yesterday's note markdown
 * @returns Array of section info for sections that need confirmation
 */
export function analyzeSectionsForConfirmation(
  yesterdayMarkdown: string
): SectionInfo[] {
  const sections = parseSections(yesterdayMarkdown);
  const result: SectionInfo[] = [];

  function walk(sections: Section[]): void {
    for (const section of sections) {
      if (section.status === "done" || section.status === "cancelled") {
        continue; // Skip already-decided sections
      }

      const allTasks = getUncheckedTasks(section);
      const totalTasks = section.tasks.length + countChildTasks(section);
      const pendingTasks = allTasks.length;
      const completedTasks = totalTasks - pendingTasks;

      result.push({
        title: section.title,
        level: section.level,
        totalTasks,
        completedTasks,
        pendingTasks,
        needsConfirm: needsConfirmation(section),
        status: section.status,
      });

      walk(section.children);
    }
  }

  walk(sections);
  return result;
}

function countChildTasks(section: Section): number {
  let count = 0;
  for (const child of section.children) {
    count += child.tasks.length + countChildTasks(child);
  }
  return count;
}

/**
 * Determine which sections from yesterday should be carried over to today.
 *
 * A section is carried over if:
 *   - Its status is "pending" (after applying user decisions)
 *   - It has unchecked tasks, OR
 *   - It has no tasks but was kept as pending (user confirmed it's still active)
 *
 * @param yesterdayMarkdown - Yesterday's note markdown
 * @param decisions - Map of section title → new status (from user confirmation)
 * @returns Array of section titles that should be carried over
 */
export function getSectionsToCarryOver(
  yesterdayMarkdown: string,
  decisions: Map<string, SectionStatus>
): Section[] {
  const sections = parseSections(yesterdayMarkdown);
  const result: Section[] = [];

  function walk(sections: Section[]): void {
    for (const section of sections) {
      // Apply user decision if available
      const decision = decisions.get(section.title);
      if (decision !== undefined) {
        section.status = decision;
      }

      // Skip sections that are done or cancelled
      if (section.status === "done" || section.status === "cancelled") {
        continue;
      }

      // NEW: If pending/verifying and has #### subsections, check if all are done
      const hasSubsections = section.children.some((child) => child.level === 4);
      if ((section.status === "pending" || section.status === "verifying") &&
          hasSubsections && allSubsectionsCompleted(section)) {
        // All #### subsections completed, auto-mark as done
        section.status = "done";
        continue;
      }

      // Check if this section or any child has pending work
      if (hasPendingWork(section) || hasPendingSubsections(section)) {
        result.push(section);
        walk(section.children);
      } else {
        // No pending work, but status is pending
        // This means the user confirmed it's still active
        result.push(section);
        walk(section.children);
      }
    }
  }

  walk(sections);
  return result;
}

/**
 * Extract the markdown content for a section, with only unchecked tasks.
 * Completed tasks (- [x]) are removed.
 *
 * @param markdown - Original markdown
 * @param section - The section to extract
 * @param deleteCompleted - Whether to remove completed tasks
 * @returns The filtered markdown
 */
export function extractFilteredSectionMarkdown(
  markdown: string,
  section: Section,
  deleteCompleted: boolean
): string {
  const lines = markdown.split("\n");
  const sectionLines = lines.slice(section.lineStart, section.lineEnd + 1);

  if (!deleteCompleted) {
    // Keep everything, including completed tasks
    return sectionLines.join("\n");
  }

  // Filter out completed tasks
  const filteredLines = sectionLines.filter((line) => {
    const taskMatch = line.match(/^(\s*)- \[([ xX])\]\s*(.*)$/);
    if (taskMatch && taskMatch[2].toLowerCase() === "x") {
      return false; // Skip completed tasks
    }
    return true;
  });

  return filteredLines.join("\n");
}

/**
 * Merge yesterday's carried-over sections into today's template.
 *
 * For each carried-over section:
 *   - If a matching section exists in today's template, insert the unchecked tasks
 *     at the end of that section's content
 *   - If no matching section exists, append the entire section at the end
 *
 * @param todayTemplateMarkdown - Today's template (with rendered date placeholders)
 * @param yesterdayMarkdown - Yesterday's note markdown
 * @param decisions - User's status decisions for yesterday's sections
 * @param deleteCompleted - Whether to remove completed tasks from carried-over content
 * @returns The merged markdown for today's note
 */
export function mergeSections(
  todayTemplateMarkdown: string,
  yesterdayMarkdown: string,
  decisions: Map<string, SectionStatus>,
  deleteCompleted: boolean
): string {
  // Get sections to carry over from yesterday
  const sectionsToCarry = getSectionsToCarryOver(yesterdayMarkdown, decisions);

  if (sectionsToCarry.length === 0) {
    return todayTemplateMarkdown;
  }

  // Parse today's template sections
  const todaySections = parseSections(todayTemplateMarkdown);

  // Build a map of today's sections by title for quick lookup
  const todaySectionMap = new Map<string, Section>();
  function indexSections(sections: Section[]): void {
    for (const section of sections) {
      todaySectionMap.set(section.title, section);
      indexSections(section.children);
    }
  }
  indexSections(todaySections);

  // Work with line arrays for insertion
  const todayLines = todayTemplateMarkdown.split("\n");

  // Track insertion points (line index → content to insert)
  // We process from bottom to top to avoid index shifts
  interface Insertion {
    line: number;
    content: string;
  }
  const insertions: Insertion[] = [];

  for (const carriedSection of sectionsToCarry) {
    // Get the filtered markdown of this section
    const filteredMarkdown = extractFilteredSectionMarkdown(
      yesterdayMarkdown,
      carriedSection,
      deleteCompleted
    );

    // Try to find a matching section in today's template
    const matchingSection = findSectionByTitle(todaySections, carriedSection.title);

    if (matchingSection) {
      // Insert at the end of the matching section (before the next heading)
      const insertLine = matchingSection.lineEnd;
      insertions.push({
        line: insertLine + 1,
        content: filteredMarkdown,
      });
    } else {
      // No matching section: append at the end
      insertions.push({
        line: todayLines.length,
        content: filteredMarkdown,
      });
    }
  }

  // Sort insertions from bottom to top
  insertions.sort((a, b) => b.line - a.line);

  // Apply insertions
  for (const insertion of insertions) {
    // Don't duplicate if the content is already in today's note
    // (This can happen if we're re-running the carry-over)
    const lines = todayLines.join("\n");
    if (lines.includes(insertion.content)) {
      continue;
    }

    // Insert the content
    todayLines.splice(insertion.line, 0, "", ...insertion.content.split("\n"));
  }

  return todayLines.join("\n");
}

/**
 * Apply user status decisions to yesterday's note and return the updated markdown.
 *
 * @param yesterdayMarkdown - Yesterday's note markdown
 * @param decisions - Map of section title → new status
 * @returns The updated markdown with new status markers
 */
export function applyStatusDecisions(
  yesterdayMarkdown: string,
  decisions: Map<string, SectionStatus>
): string {
  if (decisions.size === 0) {
    return yesterdayMarkdown;
  }

  const lines = yesterdayMarkdown.split("\n");
  const sections = parseSections(yesterdayMarkdown);

  // Build a map of section title → section object for quick lookup
  const sectionMap = new Map<string, Section>();
  function indexSections(sections: Section[]): void {
    for (const section of sections) {
      sectionMap.set(section.title, section);
      indexSections(section.children);
    }
  }
  indexSections(sections);

  // Update headings in the lines
  for (const [title, newStatus] of decisions) {
    const section = sectionMap.get(title);
    if (section) {
      const updatedHeading = updateHeadingStatus(
        section.heading,
        newStatus
      );
      lines[section.lineStart] = updatedHeading;
    }
  }

  return lines.join("\n");
}

/**
 * Full carry-over workflow.
 *
 * This is the main entry point for the carry-over feature.
 * It:
 *   1. Analyzes yesterday's sections
 *   2. Applies user status decisions
 *   3. Carries over pending sections into today's template
 *   4. Returns both today's note and updated yesterday's note
 *
 * @param yesterdayMarkdown - Yesterday's note markdown (or empty string)
 * @param todayTemplateMarkdown - Today's template with rendered date placeholders
 * @param decisions - User's status decisions (section title → new status)
 * @param deleteCompleted - Whether to remove completed tasks from carried-over content
 * @returns Carry-over result with both notes' markdown
 */
export function carryOver(
  yesterdayMarkdown: string,
  todayTemplateMarkdown: string,
  decisions: Map<string, SectionStatus>,
  deleteCompleted: boolean
): CarryOverResult {
  // Apply status decisions to yesterday's note
  const updatedYesterday = applyStatusDecisions(
    yesterdayMarkdown,
    decisions
  );

  // Merge sections into today's template
  const todayMarkdown = mergeSections(
    todayTemplateMarkdown,
    yesterdayMarkdown,
    decisions,
    deleteCompleted
  );

  return {
    todayMarkdown,
    yesterdayMarkdown: updatedYesterday,
    appliedStatuses: new Map(decisions),
  };
}

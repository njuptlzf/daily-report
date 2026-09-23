/**
 * Task carry-over logic.
 *
 * Template hierarchy:
 *   #   / ##   -> fixed skeleton, never carried, never marked
 *   ###        -> requirement, the unit of carry-over and confirmation
 *   ####       -> subtask, only asked when its ### is not terminal
 *
 * When creating today's note, this module:
 *   1. Parses yesterday's note into ### requirements (with their #### children)
 *   2. Applies the user's status decisions
 *   3. Carries non-terminal requirements (and their non-terminal subtasks) into
 *      today's note, under the matching fixed ## section
 *   4. Writes status markers back into yesterday's note (### and #### only)
 */

import {
  Section,
  SectionStatus,
  parseSections,
  getAllTasks,
  needsConfirmation,
  updateHeadingStatus,
} from "./section-parser";

export interface SubtaskInfo {
  title: string;
  status: SectionStatus;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  /** Raw markdown body between this #### heading and its first child (or end). */
  content: string;
}

export interface SectionInfo {
  /** The ### requirement title */
  title: string;
  /** Heading level (always 3 for a requirement) */
  level: number;
  /** The fixed ## section this requirement belongs to */
  parentTitle: string;
  /** Total number of tasks in this requirement (including #### children) */
  totalTasks: number;
  /** Number of checked (completed) tasks */
  completedTasks: number;
  /** Number of unchecked (incomplete) tasks */
  pendingTasks: number;
  /** Whether all tasks are done but the requirement is not yet closed */
  needsConfirm: boolean;
  /** The current (pre-decision) status */
  status: SectionStatus;
  /** Raw markdown body between the ### heading and its first #### child */
  content: string;
  /** Full raw markdown of the requirement block (### heading + body + #### children) */
  fullMarkdown: string;
  /** Non-terminal #### children, asked only while this ### stays open */
  children: SubtaskInfo[];
}

export interface CarryOverResult {
  /** The merged markdown for today's note */
  todayMarkdown: string;
  /** Updated markdown for yesterday's note (with status markers) */
  yesterdayMarkdown: string;
  /** Status decisions that were applied */
  appliedStatuses: Map<string, SectionStatus>;
}

function isTerminal(status: SectionStatus): boolean {
  return status === "done" || status === "cancelled";
}

function effectiveStatus(
  section: Section,
  decisions: Map<string, SectionStatus>
): SectionStatus {
  return decisions.get(section.title) ?? section.status;
}

function countTasks(section: Section): {
  total: number;
  completed: number;
  pending: number;
} {
  const all = getAllTasks(section);
  const pending = all.filter((t) => !t.checked).length;
  return { total: all.length, completed: all.length - pending, pending };
}

/**
 * The raw markdown belonging directly to a section: the lines after its heading
 * up to (but excluding) its first child heading. This is the "content between
 * the heading levels" the confirmation dialog lets the user peek at.
 */
function ownContent(mdLines: string[], section: Section): string {
  const firstChildStart = section.children.length
    ? Math.min(...section.children.map((c) => c.lineStart))
    : section.lineEnd + 1;
  return mdLines.slice(section.lineStart + 1, firstChildStart).join("\n").trim();
}

function toSubtaskInfo(child: Section, mdLines: string[]): SubtaskInfo {
  const c = countTasks(child);
  return {
    title: child.title,
    status: child.status,
    totalTasks: c.total,
    completedTasks: c.completed,
    pendingTasks: c.pending,
    content: ownContent(mdLines, child),
  };
}

/**
 * Collect the ### requirements from yesterday's note that still need a status
 * decision. Fixed # / ## headings are never returned. A requirement's ####
 * children are attached so the UI can ask about them only when the requirement
 * itself is kept open.
 */
export function analyzeSectionsForConfirmation(
  yesterdayMarkdown: string
): SectionInfo[] {
  const sections = parseSections(yesterdayMarkdown);
  const mdLines = yesterdayMarkdown.split("\n");
  const result: SectionInfo[] = [];

  function walk(nodes: Section[], parentTitle: string): void {
    for (const node of nodes) {
      if (node.level === 3) {
        if (isTerminal(node.status)) continue; // already closed, skip
        const c = countTasks(node);
        result.push({
          title: node.title,
          level: node.level,
          parentTitle,
          totalTasks: c.total,
          completedTasks: c.completed,
          pendingTasks: c.pending,
          needsConfirm: needsConfirmation(node),
          status: node.status,
          content: ownContent(mdLines, node),
          fullMarkdown: mdLines.slice(node.lineStart, node.lineEnd + 1).join("\n"),
          children: node.children
            .filter((ch) => ch.level === 4 && !isTerminal(ch.status))
            .map((ch) => toSubtaskInfo(ch, mdLines)),
        });
      } else {
        // Descend through # and ## to reach the ### requirements.
        walk(node.children, node.level === 2 ? node.title : parentTitle);
      }
    }
  }

  walk(sections, "");
  return result;
}

/**
 * Render the markdown block of a carried-over ### requirement: its heading with
 * the effective status marker, its own tasks, and only its non-terminal ####
 * children. Completed tasks are optionally removed.
 */
function renderRequirementBlock(
  lines: string[],
  req: Section,
  decisions: Map<string, SectionStatus>,
  deleteCompleted: boolean
): string[] {
  const drop = new Set<number>();
  for (const child of req.children) {
    if (child.level === 4 && isTerminal(effectiveStatus(child, decisions))) {
      for (let i = child.lineStart; i <= child.lineEnd; i++) drop.add(i);
    }
  }

  const out: string[] = [];
  for (let i = req.lineStart; i <= req.lineEnd; i++) {
    if (drop.has(i)) continue;
    let line = lines[i];

    if (i === req.lineStart) {
      line = updateHeadingStatus(line, effectiveStatus(req, decisions));
    } else {
      const child = req.children.find(
        (c) => c.level === 4 && c.lineStart === i
      );
      if (child) line = updateHeadingStatus(line, effectiveStatus(child, decisions));
    }

    if (deleteCompleted && /^\s*- \[[xX]\]/.test(line)) continue;
    out.push(line);
  }
  return out;
}

/**
 * Merge yesterday's carried-over requirements into today's template, placing
 * each under the fixed ## section it came from.
 */
export function mergeSections(
  todayTemplateMarkdown: string,
  yesterdayMarkdown: string,
  decisions: Map<string, SectionStatus>,
  deleteCompleted: boolean
): string {
  if (!yesterdayMarkdown) return todayTemplateMarkdown;

  const yLines = yesterdayMarkdown.split("\n");
  const ySections = parseSections(yesterdayMarkdown);

  const requirements: { req: Section; parent: string }[] = [];
  function walk(nodes: Section[], parent: string): void {
    for (const node of nodes) {
      if (node.level === 3) {
        if (!isTerminal(effectiveStatus(node, decisions))) {
          requirements.push({ req: node, parent });
        }
      } else {
        walk(node.children, node.level === 2 ? node.title : parent);
      }
    }
  }
  walk(ySections, "");

  if (requirements.length === 0) return todayTemplateMarkdown;

  const todayLines = todayTemplateMarkdown.split("\n");
  const todaySections = parseSections(todayTemplateMarkdown);

  const headingEnd = new Map<string, number>();
  for (const node of todaySections) {
    if (node.level === 2) headingEnd.set(node.title, node.lineEnd);
  }

  interface Insertion {
    line: number;
    text: string;
  }
  const insertions: Insertion[] = [];
  const orphans: string[] = [];

  for (const { req, parent } of requirements) {
    const block = renderRequirementBlock(
      yLines,
      req,
      decisions,
      deleteCompleted
    ).join("\n");
    const end = parent ? headingEnd.get(parent) : undefined;
    if (end !== undefined) {
      insertions.push({ line: end + 1, text: block });
    } else {
      orphans.push(block);
    }
  }

  // Apply from bottom to top so earlier line indices stay valid.
  insertions.sort((a, b) => b.line - a.line);
  for (const ins of insertions) {
    todayLines.splice(ins.line, 0, "", ...ins.text.split("\n"));
  }

  let result = todayLines.join("\n");
  if (orphans.length > 0) {
    result += "\n\n" + orphans.join("\n\n");
  }
  return result;
}

/**
 * Write status markers into yesterday's note. Only ### and #### headings are
 * touched; fixed # / ## skeleton headings are never marked.
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

  function walk(nodes: Section[]): void {
    for (const node of nodes) {
      const target =
        node.level >= 3 ? decisions.get(node.title) : undefined;
      if (target !== undefined) {
        lines[node.lineStart] = updateHeadingStatus(node.heading, target);
      }
      walk(node.children);
    }
  }
  walk(sections);

  return lines.join("\n");
}

/**
 * Full carry-over workflow.
 *
 * @param yesterdayMarkdown - Yesterday's note markdown (or empty string)
 * @param todayTemplateMarkdown - Today's template with rendered date placeholders
 * @param decisions - User's status decisions (section title -> new status)
 * @param deleteCompleted - Whether to remove completed tasks from carried-over content
 * @returns Carry-over result with both notes' markdown
 */
export function carryOver(
  yesterdayMarkdown: string,
  todayTemplateMarkdown: string,
  decisions: Map<string, SectionStatus>,
  deleteCompleted: boolean
): CarryOverResult {
  const updatedYesterday = applyStatusDecisions(yesterdayMarkdown, decisions);
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

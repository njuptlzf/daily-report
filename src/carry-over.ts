/**
 * Task carry-over logic.
 *
 * Template hierarchy:
 *   #   / ##   -> fixed skeleton, never marked
 *   ###        -> requirement, the unit of carry-over and confirmation
 *   ####       -> subtask, belongs to its ### requirement
 *
 * Two modes when creating today's note:
 *   - There IS a previous day's note: today = a rollover of yesterday's note
 *     with closed (done/cancelled) requirements removed and the user's status
 *     decisions applied. The template is NOT merged in this case.
 *   - There is NO previous note (first day): today = the template (if set).
 *
 * Status markers are written back into yesterday's note for ### / #### only.
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
  /** The top-level # title this requirement is under (for ordered context) */
  rootTitle: string;
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
  /** The markdown for today's note */
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
 * up to (but excluding) its first child heading.
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

  function walk(nodes: Section[], parentTitle: string, rootTitle: string): void {
    for (const node of nodes) {
      if (node.level === 3) {
        if (isTerminal(node.status)) continue; // already closed, skip
        const c = countTasks(node);
        result.push({
          title: node.title,
          level: node.level,
          parentTitle,
          rootTitle,
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
        walk(
          node.children,
          node.level === 2 ? node.title : parentTitle,
          node.level === 1 ? node.title : rootTitle
        );
      }
    }
  }

  walk(sections, "", "");
  return result;
}

/**
 * Recursively render a node for the rollover: keep # / ## skeleton always; for
 * ### / ####, drop the whole subtree when its effective status is terminal,
 * otherwise emit its heading (with the updated marker) + own content + kept
 * children. Completed tasks are optionally removed.
 */
function renderNode(
  lines: string[],
  node: Section,
  decisions: Map<string, SectionStatus>,
  deleteCompleted: boolean
): string[] {
  const isRequirement = node.level >= 3;
  const status = isRequirement ? effectiveStatus(node, decisions) : node.status;
  if (isRequirement && isTerminal(status)) return []; // drop closed subtree

  const out: string[] = [];
  out.push(
    isRequirement
      ? updateHeadingStatus(lines[node.lineStart], status)
      : lines[node.lineStart]
  );

  const firstChild = node.children.length
    ? Math.min(...node.children.map((c) => c.lineStart))
    : node.lineEnd + 1;
  for (let i = node.lineStart + 1; i < firstChild; i++) {
    const line = lines[i];
    if (deleteCompleted && /^\s*- \[[xX]\]/.test(line)) continue;
    out.push(line);
  }

  for (const child of node.children) {
    out.push(...renderNode(lines, child, decisions, deleteCompleted));
  }
  return out;
}

/**
 * Build today's note from yesterday's note: same structure, minus closed
 * requirements, with the user's decisions applied as markers.
 */
export function rolloverMarkdown(
  yesterdayMarkdown: string,
  decisions: Map<string, SectionStatus>,
  deleteCompleted: boolean
): string {
  const lines = yesterdayMarkdown.split("\n");
  const sections = parseSections(yesterdayMarkdown);

  // Preserve any content before the first heading (e.g. frontmatter).
  const firstStart = sections.length ? sections[0].lineStart : lines.length;
  const out: string[] = lines.slice(0, firstStart);
  for (const node of sections) {
    out.push(...renderNode(lines, node, decisions, deleteCompleted));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
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
 * @param yesterdayMarkdown - Yesterday's note markdown (empty on the first day)
 * @param todayTemplateMarkdown - Rendered template (used only when there is no
 *   previous note, i.e. the first day)
 * @param decisions - User's status decisions (section title -> new status)
 * @param deleteCompleted - Whether to remove completed tasks from carried-over content
 */
export function carryOver(
  yesterdayMarkdown: string,
  todayTemplateMarkdown: string,
  decisions: Map<string, SectionStatus>,
  deleteCompleted: boolean
): CarryOverResult {
  const updatedYesterday = applyStatusDecisions(yesterdayMarkdown, decisions);
  const todayMarkdown = yesterdayMarkdown
    ? rolloverMarkdown(yesterdayMarkdown, decisions, deleteCompleted)
    : todayTemplateMarkdown;

  return {
    todayMarkdown,
    yesterdayMarkdown: updatedYesterday,
    appliedStatuses: new Map(decisions),
  };
}

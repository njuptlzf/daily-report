/**
 * File-link migration for daily-note rollover.
 *
 * Daily notes live in date-based folders (default `YYYY/MM/[W]WW/MMDD`), so a
 * relative link such as `![](assets/image.png)` in yesterday's note resolves
 * against yesterday's folder. When its content is carried into today's note in
 * a different folder, the very same relative link now points at a file that
 * does not exist there and the image breaks.
 *
 * The fix: rewrite relative vault-file links into vault-absolute paths, which
 * keep pointing at the original attachment no matter where the note moves.
 * External URLs, data URIs, pure anchors/block refs, code blocks and already
 * absolute links are left untouched.
 *
 * This module is intentionally side-effect free so it can be unit tested; the
 * caller only needs to feed in the source note's vault path.
 */

export type LinkKind = "markdown" | "wikilink";

export interface RewrittenLink {
  /** The link exactly as it appeared in the source markdown. */
  original: string;
  /** The rewritten link. */
  rewritten: string;
  /** Raw target before resolution (e.g. `assets/image.png`). */
  rawTarget: string;
  /** Vault-absolute path the target was resolved to. */
  vaultPath: string;
  kind: LinkKind;
}

export interface RewriteResult {
  markdown: string;
  /** Rewritten links, in their original order of appearance. */
  links: RewrittenLink[];
}

/** Markdown inline link / image: `[text](target)` / `![alt](target)`. */
const MD_LINK_RE = /(!?)\[([^\]\n]*)\]\(([^)\n]*)\)/g;
/** Wiki link: `[[target|alias]]` / `![[target#heading]]`. */
const WIKI_LINK_RE = /(!?)\[\[([^\]\n]+)\]\]/g;

/** True for targets that do not point at a file inside the vault. */
function isNonFileTarget(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  // URI scheme: http:, https:, mailto:, data:, obsidian:, ...
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return true;
  // Protocol-relative URL, pure anchor, block reference
  if (t.startsWith("//") || t.startsWith("#") || t.startsWith("^")) return true;
  return false;
}

/**
 * Replace fenced code blocks and inline code with same-length whitespace.
 * Keeping the exact length preserves the offsets needed for rewriting.
 */
function maskCode(markdown: string): string {
  let inFence = false;
  let fence = "";
  return markdown
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      const marker = /^(```|~~~)/.exec(trimmed);
      if (marker) {
        if (!inFence) {
          inFence = true;
          fence = marker[0];
        } else if (marker[0] === fence) {
          inFence = false;
          fence = "";
        }
        return " ".repeat(line.length);
      }
      if (inFence) return " ".repeat(line.length);
      return line.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
    })
    .join("\n");
}

/** Split a markdown destination into its target and any trailing title text. */
function splitMarkdownDest(raw: string): {
  target: string;
  suffix: string;
  angle: boolean;
} {
  const s = raw.trim();
  if (s.startsWith("<")) {
    const end = s.indexOf(">");
    if (end > 0) {
      return { target: s.slice(1, end), suffix: s.slice(end + 1), angle: true };
    }
  }
  const m = /^(\S+)([\s\S]*)$/.exec(s);
  return m
    ? { target: m[1], suffix: m[2], angle: false }
    : { target: s, suffix: "", angle: false };
}

/** Split a wiki target into the path and trailing `#heading` / `|alias`. */
function splitWikiTarget(raw: string): { target: string; suffix: string } {
  const hash = raw.indexOf("#");
  const pipe = raw.indexOf("|");
  let cut = raw.length;
  if (hash >= 0) cut = Math.min(cut, hash);
  if (pipe >= 0) cut = Math.min(cut, pipe);
  return { target: raw.slice(0, cut), suffix: raw.slice(cut) };
}

/** Normalize a vault path, resolving `.`/`..` and clamping at the root. */
export function normalizeVaultPath(path: string): string {
  const parts: string[] = [];
  for (const seg of path.replace(/\\/g, "/").split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (parts.length) parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("/");
}

/**
 * Resolve a link target against the note that contains it. A vault-absolute
 * target (leading `/`) stays absolute, without the leading slash.
 */
export function resolveVaultPath(
  target: string,
  sourceNotePath: string
): string {
  const t = target.replace(/\\/g, "/");
  const notePath = sourceNotePath.replace(/\\/g, "/");
  if (t.startsWith("/")) return normalizeVaultPath(t.slice(1));
  const slash = notePath.lastIndexOf("/");
  const dir = slash >= 0 ? notePath.slice(0, slash) : "";
  return normalizeVaultPath(dir ? `${dir}/${t}` : t);
}

interface Replacement {
  start: number;
  end: number;
  text: string;
  meta: RewrittenLink;
}

/** Iterate all regex matches (ES2018 target: no String.matchAll). */
function forEachMatch(
  re: RegExp,
  text: string,
  cb: (m: RegExpExecArray) => void
): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    cb(m);
    if (m[0].length === 0) re.lastIndex++;
  }
}

/**
 * Rewrite relative file links in `markdown` to vault-absolute paths, using
 * `sourceNotePath` (the note the content came from) as the resolution base.
 * Nothing else in the note is modified.
 */
export function rewriteRelativeLinks(
  markdown: string,
  sourceNotePath: string
): RewriteResult {
  const mask = maskCode(markdown);
  const replacements: Replacement[] = [];

  const isEscaped = (index: number): boolean =>
    index > 0 && mask[index - 1] === "\\";

  // Relative markdown links: ![](assets/a.png) -> ![](/vault/dir/assets/a.png)
  forEachMatch(MD_LINK_RE, mask, (m) => {
    const start = m.index;
    if (isEscaped(start)) return;
    const { target, suffix, angle } = splitMarkdownDest(m[3]);
    if (isNonFileTarget(target) || target.startsWith("/")) return;
    const vaultPath = resolveVaultPath(target, sourceNotePath);
    if (!vaultPath) return;
    // Keep <...> wrapping when the original target used it (paths with spaces).
    const dest = `/${vaultPath}`;
    const rewritten = `${m[1]}[${m[2]}](${angle ? `<${dest}>` : dest}${suffix})`;
    replacements.push({
      start,
      end: start + m[0].length,
      text: rewritten,
      meta: {
        original: markdown.slice(start, start + m[0].length),
        rewritten,
        rawTarget: target,
        vaultPath,
        kind: "markdown",
      },
    });
  });

  // Relative wiki links with an explicit path: [[../assets/a.png|300]].
  // Bare filenames ([[a.png]]) resolve globally in Obsidian and are left alone.
  forEachMatch(WIKI_LINK_RE, mask, (m) => {
    const start = m.index;
    if (isEscaped(start)) return;
    const { target, suffix } = splitWikiTarget(m[2]);
    if (isNonFileTarget(target) || target.startsWith("/")) return;
    if (!target.includes("/")) return;
    const vaultPath = resolveVaultPath(target, sourceNotePath);
    if (!vaultPath) return;
    const rewritten = `${m[1]}[[${vaultPath}${suffix}]]`;
    replacements.push({
      start,
      end: start + m[0].length,
      text: rewritten,
      meta: {
        original: markdown.slice(start, start + m[0].length),
        rewritten,
        rawTarget: target,
        vaultPath,
        kind: "wikilink",
      },
    });
  });

  // Replace from the end so earlier offsets stay valid.
  replacements.sort((a, b) => b.start - a.start);
  let out = markdown;
  for (const r of replacements) {
    out = out.slice(0, r.start) + r.text + out.slice(r.end);
  }

  return { markdown: out, links: replacements.map((r) => r.meta).reverse() };
}

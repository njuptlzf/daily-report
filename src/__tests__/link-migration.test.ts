import { describe, it, expect } from "vitest";
import {
  normalizeVaultPath,
  resolveVaultPath,
  rewriteRelativeLinks,
} from "../link-migration";
import { rolloverMarkdown } from "../carry-over";

// A note from the default path format: YYYY/MM/[W]WW/MMDD
const SOURCE = "daily/2026/10/第44周/1028.md";
const PREFIX = "daily/2026/10/第44周";

describe("normalizeVaultPath", () => {
  it("collapses . and .. segments", () => {
    expect(normalizeVaultPath("a/b/../c/./d")).toBe("a/c/d");
  });

  it("clamps .. at the vault root", () => {
    expect(normalizeVaultPath("../../assets/x.png")).toBe("assets/x.png");
  });

  it("treats backslashes as separators", () => {
    expect(normalizeVaultPath("a\\b\\c")).toBe("a/b/c");
  });
});

describe("resolveVaultPath", () => {
  it("resolves a relative target against the source note's folder", () => {
    expect(resolveVaultPath("assets/image.png", SOURCE)).toBe(
      `${PREFIX}/assets/image.png`
    );
  });

  it("resolves parent-relative targets", () => {
    expect(resolveVaultPath("../shared/banner.png", SOURCE)).toBe(
      "daily/2026/10/shared/banner.png"
    );
  });

  it("keeps vault-absolute targets absolute", () => {
    expect(resolveVaultPath("/attachments/a.png", SOURCE)).toBe(
      "attachments/a.png"
    );
  });

  it("handles a note at the vault root", () => {
    expect(resolveVaultPath("assets/a.png", "note.md")).toBe("assets/a.png");
  });
});

describe("rewriteRelativeLinks", () => {
  it("rewrites an image link carried from a daily note in another folder", () => {
    const yesterday =
      "## 团队任务\n\n### 测试图片保存\n![](assets/image.png)\n";
    const rolled = rolloverMarkdown(yesterday, new Map(), false);
    const { markdown, links } = rewriteRelativeLinks(rolled, SOURCE);
    expect(markdown).toContain(
      `![](/daily/2026/10/第44周/assets/image.png)`
    );
    expect(markdown).not.toContain("![](assets/image.png)");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      rawTarget: "assets/image.png",
      vaultPath: `${PREFIX}/assets/image.png`,
      kind: "markdown",
    });
  });

  it("rewrites file links while keeping link text and titles", () => {
    const md = '[说明](docs/a.md) ![图](img/a.png "一张图")';
    const out = rewriteRelativeLinks(md, SOURCE).markdown;
    expect(out).toBe(
      `[说明](/daily/2026/10/第44周/docs/a.md) ![图](/daily/2026/10/第44周/img/a.png "一张图")`
    );
  });

  it("keeps <...> wrapping for targets containing spaces", () => {
    const md = '![图](<assets/my image.png> "title")';
    const out = rewriteRelativeLinks(md, SOURCE).markdown;
    expect(out).toBe(
      `![图](</daily/2026/10/第44周/assets/my image.png> "title")`
    );
  });

  it("leaves URLs, data URIs, mail links, anchors and absolute vault links unchanged", () => {
    const md = [
      "![](https://example.com/a.png)",
      "![](data:image/png;base64,AAAA)",
      "[mail](mailto:a@b.com)",
      "[](/attachments/a.png)",
      "[](#heading)",
    ].join("\n");
    const result = rewriteRelativeLinks(md, SOURCE);
    expect(result.markdown).toBe(md);
    expect(result.links).toHaveLength(0);
  });

  it("ignores links inside fenced code blocks and inline code", () => {
    const md = [
      "```markdown",
      "![](assets/in-fence.png)",
      "```",
      "",
      "这里 `![](assets/inline.png)` 不该动",
      "",
      "![](assets/real.png)",
    ].join("\n");
    const out = rewriteRelativeLinks(md, SOURCE).markdown;
    expect(out).toContain("![](assets/in-fence.png)");
    expect(out).toContain("![](assets/inline.png)");
    expect(out).toContain(`![](/daily/2026/10/第44周/assets/real.png)`);
  });

  it("ignores escaped links", () => {
    const md = "\\![](assets/escaped.png)";
    expect(rewriteRelativeLinks(md, SOURCE).markdown).toBe(md);
  });

  it("rewrites relative wiki links but leaves bare filenames alone", () => {
    const md = [
      "![[../assets/a.png|300]]",
      "[[assets/b.png]]",
      "[[c.png]]",
      "![[assets/d.png#heading]]",
    ].join("\n");
    const out = rewriteRelativeLinks(md, SOURCE).markdown;
    expect(out).toContain("![[daily/2026/10/assets/a.png|300]]");
    expect(out).toContain("[[daily/2026/10/第44周/assets/b.png]]");
    expect(out).toContain("[[c.png]]");
    expect(out).toContain(
      "![[daily/2026/10/第44周/assets/d.png#heading]]"
    );
  });

  it("handles several links whose replacements change length", () => {
    const md = "![](a.png) 和 [](b/c.png)";
    const { markdown, links } = rewriteRelativeLinks(md, SOURCE);
    expect(markdown).toBe(
      `![](/daily/2026/10/第44周/a.png) 和 [](/daily/2026/10/第44周/b/c.png)`
    );
    expect(links.map((l) => l.rawTarget)).toEqual(["a.png", "b/c.png"]);
  });

  it("returns the original text when there is nothing to rewrite", () => {
    const md = "# 日报\n\n### 需求\n- [ ] 任务\n";
    const result = rewriteRelativeLinks(md, SOURCE);
    expect(result.markdown).toBe(md);
    expect(result.links).toEqual([]);
  });
});

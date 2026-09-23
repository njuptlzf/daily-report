import { describe, it, expect } from "vitest";
import { TemplateFileSuggester, FolderSuggester } from "../file-suggester";
// Import the mock classes directly so tsc uses their (1-arg) constructors and
// the runtime instanceof checks match the classes the suggester sees via the
// "obsidian" alias.
import { TFile, TFolder } from "../__mocks__/obsidian";

// Fake vault with a small tree:
//   welcome.md
//   daily/欢迎.md
//   daily/sub/a.md
function makeApp() {
  const files = [
    new TFile("welcome.md"),
    new TFile("daily/欢迎.md"),
    new TFile("daily/sub/a.md"),
  ];
  const folders = [new TFolder("daily"), new TFolder("daily/sub")];
  const all = [...files, ...folders];
  return {
    vault: {
      getMarkdownFiles: () => files,
      getAllFolders: () => folders,
      getAbstractFileByPath: (p: string) =>
        all.find((f) => f.path === p) ?? null,
    },
  } as any;
}

const evt = {} as MouseEvent;
const closedOf = (s: object) => (s as any).closed as boolean;

describe("TemplateFileSuggester", () => {
  it("lists files and folders at root", () => {
    const s = new TemplateFileSuggester(makeApp(), () => {});
    const items = s.getSuggestions("");
    expect(items).toContain("welcome.md");
    expect(items).toContain("daily/");
    expect(items).not.toContain("..");
  });

  it("entering a folder does NOT close the modal and shows its contents", () => {
    const s = new TemplateFileSuggester(makeApp(), () => {});
    s.selectSuggestion("daily/", evt);
    expect(closedOf(s)).toBe(false); // regression: it used to close on navigation
    const items = s.getSuggestions("");
    expect(items).toContain("欢迎.md");
    expect(items).toContain("sub/");
    expect(items).toContain("..");
  });

  it("selecting a file calls onSelect with the full path and closes", () => {
    let selected: TFile | null = null;
    const s = new TemplateFileSuggester(makeApp(), (f) => { selected = f; });
    s.selectSuggestion("daily/", evt);
    s.selectSuggestion("欢迎.md", evt);
    expect(selected).not.toBeNull();
    expect(selected!.path).toBe("daily/欢迎.md");
    expect(closedOf(s)).toBe(true);
  });
});

describe("FolderSuggester", () => {
  it("offers a select-current row and subfolders at root", () => {
    const s = new FolderSuggester(makeApp(), () => {});
    const items = s.getSuggestions("");
    expect(items).toContain("✓ (root)");
    expect(items).toContain("daily");
  });

  it("entering a folder does NOT close and updates the current row", () => {
    const s = new FolderSuggester(makeApp(), () => {});
    s.selectSuggestion("daily", evt);
    expect(closedOf(s)).toBe(false);
    const items = s.getSuggestions("");
    expect(items).toContain("✓ daily");
    expect(items).toContain("sub");
  });

  it("choosing the ✓ row selects the current path and closes", () => {
    let chosen: string | null = null;
    const s = new FolderSuggester(makeApp(), (f) => { chosen = f; });
    s.selectSuggestion("daily", evt);
    s.selectSuggestion("✓ daily", evt);
    expect(chosen).toBe("daily");
    expect(closedOf(s)).toBe(true);
  });

  it("choosing ✓ at root selects the root (empty path)", () => {
    let chosen: string | null = null;
    const s = new FolderSuggester(makeApp(), (f) => { chosen = f; });
    s.selectSuggestion("✓ (root)", evt);
    expect(chosen).toBe("");
    expect(closedOf(s)).toBe(true);
  });
});

// Mock of obsidian module for testing
// Exports minimal stubs for the parts we use
import { DateTime } from "luxon";

export { DateTime };

export function getLanguage(): string {
  return "en";
}

export class App {
  vault!: any;
  workspace!: any;
}

export class Plugin {
  app!: object;
  constructor() {}
  addCommand() {}
  addSettingTab() {}
  registerCommand() {}
  addRibbonIcon() {}
  async loadSettings() {}
  async saveSettings() {}
}

export class Notice {
  constructor() {}
}

export class TFile {
  path: string;
  basename: string;
  constructor(path: string) {
    this.path = path;
    this.basename = path.split("/").pop() || path;
  }
}

export class TFolder {
  path: string;
  name: string;
  constructor(path: string) {
    this.path = path;
    this.name = path.split("/").pop() || path;
  }
}

export class Modal {
  contentEl!: HTMLElement;
  titleEl!: HTMLElement;
  modalEl!: HTMLElement;
  constructor() {}
  onOpen() {}
  onClose() {}
  open() {}
  close() {}
}

export abstract class SuggestModal<T> {
  app: any;
  limit = 0;
  emptyStateText = "";
  closed = false;
  inputEl: any = {
    value: "",
    addEventListener() {},
    dispatchEvent() { return true; },
  };
  constructor(app: any) {
    this.app = app;
  }
  setPlaceholder(_s: string) {}
  setInstructions(_i: unknown) {}
  open() {
    this.closed = false;
  }
  close() {
    this.closed = true;
  }
  // Base behavior: choose then close. Subclasses override to avoid closing
  // on navigation and delegate here for terminal selections.
  selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent) {
    this.onChooseSuggestion(value, evt);
    this.close();
  }
  abstract getSuggestions(query: string): T[];
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;
}

export class Setting {
  setName() { return this; }
  setDesc() { return this; }
  setHeading() { return this; }
  addText() { return this; }
  addToggle() { return this; }
  addDropdown() { return this; }
  addButton() { return this; }
}

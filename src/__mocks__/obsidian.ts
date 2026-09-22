// Mock of obsidian module for testing
// Exports minimal stubs for the parts we use
import { DateTime } from "luxon";

export { DateTime };

export class App {
  vault!: object;
  workspace!: object;
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
  app!: object;
  limit!: number;
  emptyStateText!: string;
  constructor() {}
  setPlaceholder() {}
  setInstructions() {}
  open() {}
  close() {}
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
  addButton() { return this; }
}

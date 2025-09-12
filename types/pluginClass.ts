import type { PluginAPI } from './pluginAPI';
import type { Status } from './status';

export interface PluginClass {
  onLoad(api: PluginAPI): void;
  onUnload(): void;
  onPageMatch(url: string): void | null;
  trackProgress(url: string): Status | null;
  insertCustomDiv(div: string): HTMLElement | null;
}

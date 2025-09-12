export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon?: string;
  entryPoint: string;
  permissions: string[];
  contexts: ('background' | 'popup' | 'content')[];
  urls: string[];
}

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an ExtensionPlugins system for Tsukime, a browser extension plugin architecture that allows creating modular plugins for different streaming services. Plugins can track progress, interact with web pages, and provide custom UI elements.

## Development Commands

- **Install dependencies**: `bun install`
- **Run the project**: `bun run index.ts`
- **TypeScript type checking**: `bun run typecheck`
- **Lint code**: `bun run lint`
- **Lint and fix issues**: `bun run lint:fix`
- **Format code**: `bun run format`
- **Check formatting**: `bun run format:check`

## Runtime Environment

- Uses **Bun** runtime (not Node.js) - follow the cursor rules in `.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc`
- TypeScript with ESNext target and strict mode enabled
- Module system uses "Preserve" mode for bundler compatibility
- Chrome extension APIs available via `@types/chrome`

## Plugin Architecture

### Core Types

Located in `types/` directory:

- `PluginManifest` - Plugin metadata (id, name, version, permissions, contexts, URLs)
- `PluginClass` - Main plugin interface with lifecycle methods:
  - `onLoad(api: PluginAPI)` - Initialize plugin with API access
  - `onUnload()` - Cleanup when plugin is disabled
  - `onPageMatch(url: string)` - Called when URL matches plugin's patterns
  - `trackProgress(url: string)` - Return progress status for current page
  - `insertCustomDiv(url: string)` - Insert custom UI elements
- `PluginAPI` - Extension APIs available to plugins (storage, tabs, runtime messaging)
- `Status` - Progress tracking data structure (title, progress, finished, time)

### Plugin Structure

Each plugin is a directory in `plugins/` containing:

- `plugin.json` - Manifest file with metadata and configuration
- `plugin.ts` - Main plugin implementation extending `PluginClass`
- Additional assets (icons, etc.)

### Plugin Development Pattern

1. Create plugin manifest defining permissions, contexts, and URL patterns
2. Implement `PluginClass` interface with required lifecycle methods
3. Use `PluginAPI` for extension capabilities (storage, messaging, tab interaction)
4. Export a `createPlugin(manifest)` factory function
5. Handle page matching and progress tracking for specific streaming services

### Example Plugin Structure (Crunchyroll)

The Crunchyroll plugin demonstrates:

- Video element detection with multiple selectors
- Episode metadata extraction from DOM
- Progress tracking with video time events
- Custom progress UI injection using shared extension divs
- Data persistence via extension storage API
- Inter-plugin messaging for status updates

## Browser Extension Integration

- Plugins run in content script context
- Access to Chrome extension APIs via `PluginAPI` wrapper
- Shared progress UI elements managed by main extension
- Storage scoped by plugin ID and series/episode data
- Real-time progress updates via runtime messaging

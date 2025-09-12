#!/usr/bin/env bun
/* eslint-env node */
/* global Bun, process */

import { readdir, mkdir, copyFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const PLUGINS_DIR = './plugins';
const DIST_DIR = './dist/plugins';

async function buildPlugins() {
  console.log('🚀 Building plugins...');

  // Create dist directory
  await mkdir(DIST_DIR, { recursive: true });

  // Get all plugin directories
  const pluginDirs = await readdir(PLUGINS_DIR, { withFileTypes: true });
  const plugins = pluginDirs
    .filter(dir => dir.isDirectory())
    .map(dir => dir.name);

  const registry = {
    plugins: [],
    buildTime: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || 'local',
  };

  for (const pluginName of plugins) {
    const pluginDir = join(PLUGINS_DIR, pluginName);
    const outputDir = join(DIST_DIR, pluginName);

    console.log(`📦 Building plugin: ${pluginName}`);

    // Create plugin output directory
    await mkdir(outputDir, { recursive: true });

    // Copy plugin.json manifest
    const manifestPath = join(pluginDir, 'plugin.json');
    if (existsSync(manifestPath)) {
      await copyFile(manifestPath, join(outputDir, 'plugin.json'));
      registry.plugins.push(pluginName);
    }

    // Copy assets (icons, etc.)
    const assetExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.ico'];
    const dirContents = await readdir(pluginDir);

    for (const file of dirContents) {
      const ext = file.substring(file.lastIndexOf('.')).toLowerCase();
      if (assetExtensions.includes(ext)) {
        await copyFile(join(pluginDir, file), join(outputDir, file));
        console.log(`  📋 Copied asset: ${file}`);
      }
    }

    // Compile TypeScript plugin to JavaScript
    const tsPath = join(pluginDir, 'plugin.ts');
    if (existsSync(tsPath)) {
      console.log(`  🔨 Compiling TypeScript: ${tsPath}`);

      const result = await Bun.build({
        entrypoints: [tsPath],
        outdir: outputDir,
        target: 'browser',
        format: 'esm',
        minify: true,
        naming: 'plugin.js',
      });

      if (result.success) {
        console.log(`  ✅ Successfully compiled plugin: ${pluginName}`);
      } else {
        console.error(`  ❌ Failed to compile plugin: ${pluginName}`);
        result.logs.forEach(log => console.error(`    ${log.message}`));
      }
    }
  }

  // Create plugin registry
  await writeFile(
    join(DIST_DIR, 'registry.json'),
    JSON.stringify(registry, null, 2)
  );

  console.log(`✨ Build complete! ${plugins.length} plugins built.`);
  console.log(`📁 Output directory: ${DIST_DIR}`);
}

// Run the build
buildPlugins().catch(error => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});

// @ts-check
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

/** Copy WASM grammars from tree-sitter-wasms and web-tree-sitter */
function copyWasmFiles() {
  const grammarsOutDir = join(__dirname, 'out', 'grammars');
  mkdirSync(grammarsOutDir, { recursive: true });

  // Copy tree-sitter.wasm (core runtime)
  const treeSitterWasm = join(__dirname, 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm');
  if (existsSync(treeSitterWasm)) {
    copyFileSync(treeSitterWasm, join(__dirname, 'out', 'tree-sitter.wasm'));
    console.log('✓ Copied tree-sitter.wasm');
  } else {
    console.warn('⚠ tree-sitter.wasm not found — parser will fail at runtime');
  }

  // Copy language grammar WASMs
  const wasmsDir = join(__dirname, 'node_modules', 'tree-sitter-wasms', 'out');
  if (existsSync(wasmsDir)) {
    const files = readdirSync(wasmsDir).filter(f => f.endsWith('.wasm'));
    for (const file of files) {
      copyFileSync(join(wasmsDir, file), join(grammarsOutDir, file));
    }
    console.log(`✓ Copied ${files.length} grammar WASM files`);
  } else {
    console.warn('⚠ tree-sitter-wasms/out not found — grammars will be unavailable');
  }

  // Copy media files
  const mediaOutDir = join(__dirname, 'out', 'media');
  mkdirSync(mediaOutDir, { recursive: true });
  const mediaSrcDir = join(__dirname, 'media');
  if (existsSync(mediaSrcDir)) {
    const mediaFiles = readdirSync(mediaSrcDir).filter(f => f.endsWith('.css') || f.endsWith('.js'));
    for (const file of mediaFiles) {
      copyFileSync(join(mediaSrcDir, file), join(mediaOutDir, file));
    }
    if (mediaFiles.length > 0) {
      console.log(`✓ Copied ${mediaFiles.length} media files`);
    }
  }
}

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
  treeShaking: true,
  // web-tree-sitter loads WASM at runtime, so mark it external
  // and let Node resolve it from the bundled output
  plugins: [],
};

async function main() {
  copyWasmFiles();

  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('👀 Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('✅ Build complete');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

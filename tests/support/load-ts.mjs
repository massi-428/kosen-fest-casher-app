import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
const require = createRequire(import.meta.url);
export function createLoader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    file = resolve(file);
    if (cache.has(file)) return cache.get(file);
    const compiled = { exports: {} };
    cache.set(file, compiled.exports);
    const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', js)(name => {
      if (name in mocks) return mocks[name];
      if (name === 'next/server') return { NextResponse: Response };
      if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
      if (name.startsWith('.')) return load(resolve(dirname(file), name + '.ts'));
      return require(name);
    }, compiled, compiled.exports);
    cache.set(file, compiled.exports);
    return compiled.exports;
  }
  return load;
}

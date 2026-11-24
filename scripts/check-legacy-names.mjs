/**
 * While legacy screens are being replaced: fail if frontend/legacy/*.js uses a name that is not declared,
 * for example a helper removed during migration while a remaining legacy screen still calls it.
 * Only "cannot find name" diagnostics are reported; the legacy code is not otherwise type-checked.
 */
import { readdirSync } from 'node:fs';
import ts from 'typescript';

const files = readdirSync('frontend/legacy').filter(name => name.endsWith('.js')).map(name => `frontend/legacy/${name}`);
const program = ts.createProgram(files, {
  allowJs: true, checkJs: true, noEmit: true, types: [],
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts']
});
const missing = ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.code === 2304 || diagnostic.code === 2552);
for (const diagnostic of missing) {
  const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  console.error(`${diagnostic.file.fileName}:${line + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
}
if (missing.length) process.exit(1);
console.log(`Legacy names resolved in ${files.length} files.`);

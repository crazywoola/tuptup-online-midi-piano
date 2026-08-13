import { readFile } from "node:fs/promises";
import ts from "typescript";

async function transpileTypescriptModule(fileUrl, cache) {
  const key = fileUrl.href;
  if (cache.has(key)) return cache.get(key);
  let source = await readFile(fileUrl, "utf8");
  const imports = [...source.matchAll(/(?:from\s+|import\s+)["'](\.[^"']+)["']/g)];
  for (const match of imports) {
    const specifier = match[1];
    const dependencyUrl = new URL(specifier.endsWith(".ts") ? specifier : `${specifier}.ts`, fileUrl);
    const dependencyDataUrl = await transpileTypescriptModule(dependencyUrl, cache);
    source = source.replaceAll(`"${specifier}"`, `"${dependencyDataUrl}"`).replaceAll(`'${specifier}'`, `'${dependencyDataUrl}'`);
  }
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: fileUrl.pathname,
    reportDiagnostics: true,
  });
  const errors = diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ?? [];
  if (errors.length) throw new Error(ts.formatDiagnostics(errors, { getCanonicalFileName: (name) => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" }));
  const dataUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
  cache.set(key, dataUrl);
  return dataUrl;
}

export async function importTypescriptModule(fileUrl) {
  return import(await transpileTypescriptModule(fileUrl, new Map()));
}

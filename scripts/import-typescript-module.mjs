import { readFile } from "node:fs/promises";
import ts from "typescript";

export async function importTypescriptModule(fileUrl) {
  const source = await readFile(fileUrl, "utf8");
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
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

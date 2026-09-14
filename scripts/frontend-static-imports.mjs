import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

export function collectModuleSpecifiers(content, fileName = 'source.ts') {
  const kind = fileName.endsWith('.tsx') || fileName.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, kind);
  const specifiers = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length >= 1) {
      if (!ts.isStringLiteralLike(node.arguments[0])) throw new Error(`Unverifiable non-literal dynamic import in ${fileName}`);
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

export function crossFeatureInternalImports(filePath, frontendRootPath, content) {
  const sourceParts = relative(frontendRootPath, filePath).split('/');
  if (sourceParts[0] !== 'features') return [];
  const violations = [];
  for (const specifier of collectModuleSpecifiers(content, filePath)) {
    if (!specifier.startsWith('.')) continue;
    const targetParts = relative(frontendRootPath, resolve(dirname(filePath), specifier)).split('/');
    if (targetParts[0] !== 'features' || targetParts[1] === sourceParts[1] || targetParts[2] === 'public') continue;
    violations.push({ specifier, targetFeature: targetParts[1] });
  }
  return violations;
}

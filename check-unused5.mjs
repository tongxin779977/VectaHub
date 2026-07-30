import ts from 'typescript';
import fs from 'fs';

// Deep scan: find ALL unused local variables including inside function bodies
const file = process.argv[2];
const sourceText = fs.readFileSync(file, 'utf-8');
const isJS = file.endsWith('.js');
const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, isJS ? ts.ScriptKind.JS : ts.ScriptKind.TS);

// Use the checker approach: collect all bindings and all references
const bindings = []; // {name, line, kind, exported}
const refs = new Set();

function visit(node, isExportedCtx = false) {
  // Track export status
  const isExported = isExportedCtx || (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);
  
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (clause) {
      if (clause.name) bindings.push({ name: clause.name.text, line: sourceFile.getLineAndCharacterOfPosition(clause.getStart()).line + 1, kind: 'import' });
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          bindings.push({ name: el.name.text, line: sourceFile.getLineAndCharacterOfPosition(el.getStart()).line + 1, kind: 'import' });
        }
      }
    }
    return;
  }
  
  // Variable declarations
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    bindings.push({ name: node.name.text, line: sourceFile.getLineAndCharacterOfPosition(node.name.getStart()).line + 1, kind: 'var', exported: isExported });
  }
  
  // Function declarations
  if (ts.isFunctionDeclaration(node) && node.name) {
    bindings.push({ name: node.name.text, line: sourceFile.getLineAndCharacterOfPosition(node.name.getStart()).line + 1, kind: 'function', exported: isExported });
  }
  
  // Parameters - track them too
  if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
    // Don't report params starting with _
    if (!node.name.text.startsWith('_')) {
      bindings.push({ name: node.name.text, line: sourceFile.getLineAndCharacterOfPosition(node.name.getStart()).line + 1, kind: 'param' });
    }
  }
  
  // Binding elements (destructuring)
  if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
    if (!node.name.text.startsWith('_')) {
      bindings.push({ name: node.name.text, line: sourceFile.getLineAndCharacterOfPosition(node.name.getStart()).line + 1, kind: 'binding' });
    }
  }
  
  // Collect references (identifiers that are NOT declaration names)
  if (ts.isIdentifier(node)) {
    const parent = node.parent;
    let isDecl = false;
    if (ts.isImportSpecifier(parent) && parent.name === node) isDecl = true;
    if (ts.isVariableDeclaration(parent) && parent.name === node) isDecl = true;
    if (ts.isFunctionDeclaration(parent) && parent.name === node) isDecl = true;
    if (ts.isParameter(parent) && parent.name === node) isDecl = true;
    if (ts.isBindingElement(parent) && parent.name === node) isDecl = true;
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
      // This is a property access like obj.name - the name is not a reference to a variable called "name"
      // But the expression (obj) IS a reference
    }
    if (!isDecl) {
      refs.add(node.text);
    }
  }
  
  ts.forEachChild(node, child => visit(child, isExported));
}

ts.forEachChild(sourceFile, visit);

const unused = bindings.filter(b => !refs.has(b.name) && !b.exported);
if (unused.length > 0) {
  console.log(`${file}:`);
  for (const u of unused) {
    console.log(`  line ${u.line}: unused ${u.kind}: ${u.name}`);
  }
} else {
  console.log(`${file}: no unused locals found`);
}

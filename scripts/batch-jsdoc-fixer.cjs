#!/usr/bin/env node
/**
 * Batch JSDoc Fixer — safe, inline approach.
 * Processes each file independently, adding JSDoc to public exports and methods.
 * Uses bottom-up splice to avoid line shift issues.
 * 
 * Usage: node scripts/batch-jsdoc-fixer.cjs [subdir]
 *   subdir: optional, e.g., "a2a", "app" — processes just that subdirectory
 */

const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function getSourceFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!e.name.startsWith('__') && !e.name.startsWith('.') && e.name !== 'node_modules') {
        files.push(...getSourceFiles(p));
      }
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') && !e.name.endsWith('.test.ts')) {
      files.push(p);
    }
  }
  return files;
}

function findMissingJSDoc(content, sourceFile) {
  const missing = [];

  function visit(node) {
    // Top-level exports
    if (node.parent && ts.isSourceFile(node.parent)) {
      const flags = ts.getCombinedModifierFlags(node);
      if ((flags & ts.ModifierFlags.Export) !== 0 && node.name) {
        if ([ts.SyntaxKind.ClassDeclaration, ts.SyntaxKind.InterfaceDeclaration, ts.SyntaxKind.TypeAliasDeclaration, ts.SyntaxKind.EnumDeclaration, ts.SyntaxKind.FunctionDeclaration].includes(node.kind)) {
          const leading = content.substring(node.getFullStart(), node.getStart());
          if (!leading.includes('/**')) {
            const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            missing.push({ line: pos.line + 1, name: node.name.text, kind: ts.SyntaxKind[node.kind] });
          }
        }
      }

      // VariableStatement
      if (node.kind === ts.SyntaxKind.VariableStatement) {
        const flags = ts.getCombinedModifierFlags(node);
        if ((flags & ts.ModifierFlags.Export) !== 0) {
          const leading = content.substring(node.getFullStart(), node.getStart());
          if (!leading.includes('/**')) {
            const varName = node.declarationList.declarations[0]?.name?.text;
            if (varName) {
              const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
              missing.push({ line: pos.line + 1, name: varName, kind: 'VariableStatement' });
            }
          }
        }
      }
    }

    // Class members
    if (node.kind === ts.SyntaxKind.ClassDeclaration) {
      const flags = ts.getCombinedModifierFlags(node);
      if ((flags & ts.ModifierFlags.Export) !== 0) {
        const className = node.name?.text;
        if (node.members) {
          for (const member of node.members) {
            const mName = member.name ? member.name.text : null;
            if (!mName) continue;
            const mFlags = ts.getCombinedModifierFlags(member);
            if (mFlags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue;

            const memberKinds = [ts.SyntaxKind.MethodDeclaration, ts.SyntaxKind.GetAccessor, ts.SyntaxKind.SetAccessor, ts.SyntaxKind.PropertyDeclaration];
            if (memberKinds.includes(member.kind) && mName !== 'constructor') {
              const leading = content.substring(member.getFullStart(), member.getStart());
              if (!leading.includes('/**')) {
                const pos = sourceFile.getLineAndCharacterOfPosition(member.getStart());
                missing.push({ line: pos.line + 1, name: className + '.' + mName, kind: ts.SyntaxKind[member.kind] });
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return missing;
}

function generateJSDoc(name, kind, lineContent) {
  const indent = lineContent.match(/^(\s*)/)[1];
  const shortName = name.includes('.') ? name.split('.').pop() : name;
  const cleanName = shortName.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  const capitalName = shortName.charAt(0).toUpperCase() + shortName.slice(1).replace(/([A-Z])/g, ' $1').trim().toLowerCase();

  let desc = shortName + '.';
  switch (kind) {
    case 'ClassDeclaration':
      desc = cleanName.charAt(0).toUpperCase() + cleanName.slice(1) + ' class.';
      break;
    case 'InterfaceDeclaration':
      desc = cleanName.charAt(0).toUpperCase() + cleanName.slice(1) + ' interface.';
      break;
    case 'TypeAliasDeclaration':
      desc = shortName + ' type definition.';
      break;
    case 'EnumDeclaration':
      desc = cleanName.charAt(0).toUpperCase() + cleanName.slice(1) + ' enum.';
      break;
    case 'FunctionDeclaration':
      desc = capitalName + ' function.';
      break;
    case 'MethodDeclaration':
      if (shortName.startsWith('get') && shortName.length > 3) desc = 'Gets the ' + shortName[3].toLowerCase() + shortName.slice(4).replace(/([A-Z])/g, ' $1').trim().toLowerCase() + '.';
      else if (shortName.startsWith('set') && shortName.length > 3) desc = 'Sets the ' + shortName[3].toLowerCase() + shortName.slice(4).replace(/([A-Z])/g, ' $1').trim().toLowerCase() + '.';
      else if (shortName.startsWith('is') && shortName.length > 3) desc = 'Checks whether ' + shortName[2].toLowerCase() + shortName.slice(3).replace(/([A-Z])/g, ' $1').trim().toLowerCase() + '.';
      else if (shortName.startsWith('has') && shortName.length > 3) desc = 'Checks whether ' + shortName[3].toLowerCase() + shortName.slice(4).replace(/([A-Z])/g, ' $1').trim().toLowerCase() + ' exists.';
      else desc = capitalName + '.';
      break;
    case 'GetAccessor':
      desc = 'Gets the ' + cleanName + '.';
      break;
    case 'SetAccessor':
      desc = 'Sets the ' + cleanName + '.';
      break;
    case 'PropertyDeclaration':
      desc = shortName + ' property.';
      break;
    case 'VariableStatement':
      desc = shortName + ' constant.';
      break;
  }

  return indent + '/**\n' + indent + ' * ' + desc + '\n' + indent + ' */';
}

function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const sourceFile = ts.createSourceFile(path.basename(filePath), content, ts.ScriptTarget.Latest, true);

  const missing = findMissingJSDoc(content, sourceFile);
  if (missing.length === 0) return 0;

  // Sort by line DESCENDING (bottom-up)
  missing.sort((a, b) => b.line - a.line);

  // Verify no duplicate lines
  const linesSet = new Set(missing.map(m => m.line));
  if (linesSet.size !== missing.length) {
    // Deduplicate by keeping only the first occurrence at each line
    const seen = new Set();
    const deduped = missing.filter(m => {
      if (seen.has(m.line)) { console.error('  WARN: duplicate line ' + m.line + ' in ' + path.relative(SRC, filePath)); return false; }
      seen.add(m.line);
      return true;
    });
    missing.length = 0;
    missing.push(...deduped);
  }

  for (const item of missing) {
    const idx = item.line - 1;
    if (idx < 0 || idx >= lines.length) {
      console.error('  ERROR: invalid line ' + item.line + ' for ' + path.relative(SRC, filePath));
      continue;
    }
    const jsdoc = generateJSDoc(item.name, item.kind, lines[idx]);
    lines.splice(idx, 0, jsdoc);
  }

  fs.writeFileSync(filePath, lines.join('\n'));
  return missing.length;
}

// Main
const targetSubdir = process.argv[2] || '';
const targetDir = targetSubdir ? path.join(SRC, targetSubdir) : SRC;

if (!fs.statSync(targetDir).isDirectory()) {
  console.error('Not a directory: ' + targetDir);
  process.exit(1);
}

const files = getSourceFiles(targetDir);
let totalAdded = 0;
let filesChanged = 0;
const results = [];

for (const file of files) {
  const added = fixFile(file);
  if (added > 0) {
    filesChanged++;
    totalAdded += added;
    results.push({ file: path.relative(SRC, file), added });
  }
}

// Summary by directory
const byDir = {};
for (const r of results) {
  const dir = r.file.split('/')[0];
  if (!byDir[dir]) byDir[dir] = { files: 0, items: 0 };
  byDir[dir].files++;
  byDir[dir].items += r.added;
}

console.log(JSON.stringify({
  target: targetSubdir || 'all',
  filesScanned: files.length,
  filesChanged,
  totalJSDocsAdded: totalAdded,
  byDirectory: byDir,
  details: results,
}, null, 2));

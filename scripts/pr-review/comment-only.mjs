import ts from "typescript";

// Compare parsed token leaves as well as tree shape: parsing preserves ASI and TSX context,
// while token text retains literal and type changes. Parse errors cannot prove equivalence.
export function commentOnly(before, after, path) {
  if (typeof before !== "string" || typeof after !== "string" || !/\.tsx?$/.test(path)) return false;
  // Directive comments can affect compilation or bundling even when syntax trees match.
  const directive =
    /\/\/\/|\/\/[^\r\n]*[@#]|\/\*[\s\S]*?[@#]|(?:webpack|vite|rollup|turbopack|esbuild|istanbul|sourceMappingURL|sourceURL)[\w-]*\s*[:=-]/i;
  if (before !== after && (directive.test(before) || directive.test(after))) return false;
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const signature = (source) => {
    const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
    if (tree.parseDiagnostics.length) return null;
    const visit = (node) => {
      const children = node.getChildren(tree);
      return children.length ? [node.kind, children.map(visit)] : [node.kind, node.getText(tree)];
    };
    return JSON.stringify(visit(tree));
  };
  try {
    const first = signature(before);
    return first !== null && first === signature(after);
  } catch {
    return false;
  }
}

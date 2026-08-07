import type { OutputAsset, OutputChunk, Plugin } from "vite";

export type CssClassObfuscatorOptions = {
  /** Prefix for generated class names. */
  prefix?: string;
  /** Class names to leave untouched. */
  exclude?: string[];
  /** Emit `css-class-map.json` next to other build assets. */
  emitMap?: boolean;
  /** Log remap stats. Default: true. */
  verbose?: boolean;
};

const CLASS_IN_SELECTOR =
  /\.(-?(?:[_a-zA-Z]|\\[0-9a-fA-F]{1,6}\s?|\\.)(?:[_a-zA-Z0-9-]|\\[0-9a-fA-F]{1,6}\s?|\\.)*)/g;

function unescapeCssIdent(name: string): string {
  return name
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/\\(.)/g, "$1");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toName(index: number, prefix: string): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${prefix}${out}`;
}

function collectClasses(css: string): Set<string> {
  const found = new Set<string>();
  for (const match of css.matchAll(CLASS_IN_SELECTOR)) {
    found.add(unescapeCssIdent(match[1]));
  }
  return found;
}

/** Skip atomic roots like `menu` / `hud` — they collide with app state & UI copy. */
function isObfuscatableClass(name: string): boolean {
  return name.includes("-") || name.includes("__");
}

function rewriteCss(css: string, map: Map<string, string>): string {
  return css.replace(CLASS_IN_SELECTOR, (full, raw: string) => {
    const key = unescapeCssIdent(raw);
    const next = map.get(key);
    return next ? `.${next}` : full;
  });
}

function remapMappedTokens(text: string, map: Map<string, string>): string {
  const entries = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
  const tokenRe = new RegExp(
    `(?<![\\w-])(?:${entries.map(([from]) => escapeRegex(from)).join("|")})(?![\\w-])`,
    "g",
  );
  return text.replace(tokenRe, (token) => map.get(token) ?? token);
}

function looksLikeClassList(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  // CSS class tokens only — rejects prose like "Quit to menu" (capital Q).
  return (
    words.length > 0 &&
    words.every(
      (word) => /^[a-z][a-z0-9_-]*$/i.test(word) && word === word.toLowerCase(),
    )
  );
}

function remapClassTokens(text: string, map: Map<string, string>): string {
  if (!text || map.size === 0) return text;

  // DebugPanel builds HTML strings with class="…".
  const out = text.replace(
    /\bclass\s*=\s*("([^"]*)"|'([^']*)')/g,
    (_full, _quoted: string, double?: string, single?: string) => {
      const value = double ?? single ?? "";
      const quote = double !== undefined ? '"' : "'";
      return `class=${quote}${remapMappedTokens(value, map)}${quote}`;
    },
  );

  if (out !== text) return out;
  if (!looksLikeClassList(out)) return out;
  return remapMappedTokens(out, map);
}

function readString(
  code: string,
  start: number,
  quote: '"' | "'",
): { end: number; raw: string } {
  let i = start + 1;
  let raw = "";
  while (i < code.length) {
    const c = code[i];
    if (c === "\\") {
      raw += c + (code[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (c === quote) {
      return { end: i + 1, raw };
    }
    raw += c;
    i += 1;
  }
  return { end: code.length, raw };
}

function rewriteTemplate(
  code: string,
  start: number,
  map: Map<string, string>,
  rewriteExpr: (expr: string) => string,
): { end: number; text: string } {
  let i = start + 1;
  let out = "`";
  let staticPart = "";

  const flushStatic = () => {
    out += remapClassTokens(staticPart, map);
    staticPart = "";
  };

  while (i < code.length) {
    const c = code[i];
    if (c === "\\") {
      staticPart += c + (code[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (c === "`") {
      flushStatic();
      out += "`";
      return { end: i + 1, text: out };
    }
    if (c === "$" && code[i + 1] === "{") {
      flushStatic();
      let depth = 1;
      let j = i + 2;
      let expr = "";
      while (j < code.length && depth > 0) {
        const inner = code[j];
        if (inner === '"' || inner === "'") {
          const str = readString(code, j, inner);
          expr += code.slice(j, str.end);
          j = str.end;
          continue;
        }
        if (inner === "`") {
          const nested = rewriteTemplate(code, j, map, rewriteExpr);
          expr += nested.text;
          j = nested.end;
          continue;
        }
        if (inner === "{") depth += 1;
        else if (inner === "}") {
          depth -= 1;
          if (depth === 0) {
            j += 1;
            break;
          }
        }
        expr += inner;
        j += 1;
      }
      out += `\${${rewriteExpr(expr)}}`;
      i = j;
      continue;
    }
    staticPart += c;
    i += 1;
  }

  flushStatic();
  return { end: code.length, text: out };
}

/** Rewrite class tokens only inside JS string & template literals. */
function rewriteJsStrings(code: string, map: Map<string, string>): string {
  if (map.size === 0) return code;

  const rewriteExpr = (expr: string): string => rewriteJsStrings(expr, map);

  let out = "";
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '"' || ch === "'") {
      const str = readString(code, i, ch);
      out += ch + remapClassTokens(str.raw, map) + ch;
      i = str.end;
      continue;
    }
    if (ch === "`") {
      const tpl = rewriteTemplate(code, i, map, rewriteExpr);
      out += tpl.text;
      i = tpl.end;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** True when the chunk includes first-party modules (never vendor-only). */
function isAppChunk(chunk: OutputChunk): boolean {
  return Object.keys(chunk.modules).some((id) => {
    const norm = id.replace(/\\/g, "/");
    return (
      norm.includes("/src/") ||
      norm.includes("/vite/") ||
      // Rolldown may expose bare project-relative ids.
      norm.startsWith("src/")
    );
  });
}

/**
 * Production-only CSS class mangler.
 *
 * `postcss-obfuscator` copies rewritten sources to `out/` while Vite still
 * bundles `src/`, so CSS/JS get out of sync. This plugin remaps class names in
 * the final CSS + JS assets instead (Lightning CSS still minifies).
 *
 * Vendor chunks (react/three/…) are never rewritten — their minified strings
 * confuse the literal scanner and can emit invalid JS (black screen).
 */
export function cssClassObfuscator(
  options: CssClassObfuscatorOptions = {},
): Plugin {
  const prefix = options.prefix ?? "_";
  const exclude = new Set(options.exclude ?? []);
  const emitMap = options.emitMap ?? false;
  const verbose = options.verbose ?? true;

  return {
    name: "css-class-obfuscator",
    apply: "build",
    enforce: "post",
    generateBundle(_opts, bundle) {
      const cssAssets: OutputAsset[] = [];
      const jsChunks: OutputChunk[] = [];

      for (const item of Object.values(bundle)) {
        if (item.type === "asset" && item.fileName.endsWith(".css")) {
          cssAssets.push(item);
        } else if (
          item.type === "chunk" &&
          item.fileName.endsWith(".js") &&
          isAppChunk(item)
        ) {
          jsChunks.push(item);
        }
      }

      const classes = new Set<string>();
      for (const asset of cssAssets) {
        const source =
          typeof asset.source === "string"
            ? asset.source
            : new TextDecoder().decode(asset.source);
        for (const name of collectClasses(source)) {
          if (!exclude.has(name) && isObfuscatableClass(name)) {
            classes.add(name);
          }
        }
      }

      const sorted = [...classes].sort();
      const map = new Map<string, string>();
      sorted.forEach((name, index) => {
        map.set(name, toName(index, prefix));
      });

      if (map.size === 0) return;

      for (const asset of cssAssets) {
        const source =
          typeof asset.source === "string"
            ? asset.source
            : new TextDecoder().decode(asset.source);
        asset.source = rewriteCss(source, map);
      }

      for (const chunk of jsChunks) {
        chunk.code = rewriteJsStrings(chunk.code, map);
      }

      if (emitMap) {
        this.emitFile({
          type: "asset",
          fileName: "css-class-map.json",
          source: `${JSON.stringify(Object.fromEntries(map), null, 2)}\n`,
        });
      }

      if (verbose) {
        console.log(
          `[css-class-obfuscator] remapped ${map.size} classes across ${cssAssets.length} CSS + ${jsChunks.length} app JS assets`,
        );
      }
    },
  };
}

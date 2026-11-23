"use client";

// Safe math expression evaluator for LLM-generated scene specs.
// ASCII only, explicit `*` required. Variables: x, y (t reserved for future use).
// No eval / no Function constructor — recursive-descent parser over an allowlist.

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  exp: Math.exp,
  log: Math.log,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token =
  | { kind: "num"; value: number }
  | { kind: "name"; value: string }
  | { kind: "op"; value: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
      continue;
    }
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      const match = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
      if (!match) throw new Error(`bad number at ${i}`);
      tokens.push({ kind: "num", value: parseFloat(match[0]) });
      i += match[0].length;
      continue;
    }
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      const match = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(src.slice(i));
      const name = match![0].toLowerCase();
      tokens.push({ kind: "name", value: name });
      i += match![0].length;
      continue;
    }
    if ("+-*/^%(),".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    throw new Error(`unexpected character '${ch}' at ${i}`);
  }
  return tokens;
}

export type Env = { x: number; y: number; t?: number };

export function compileExpr(src: string): (env: Env) => number {
  if (!/^[0-9a-zA-Z_+\-*/^%().,\s]*$/.test(src)) {
    throw new Error("expression uses characters outside the allowed set");
  }
  const tokens = tokenize(src);
  if (tokens.length === 0) throw new Error("empty expression");
  let pos = 0;

  const peek = (): Token | null => tokens[pos] ?? null;
  const eat = (value?: string): Token => {
    const token = tokens[pos];
    if (!token || (value !== undefined && (token.kind !== "op" || token.value !== value))) {
      throw new Error(`expected '${value ?? "token"}' at position ${pos}`);
    }
    pos++;
    return token;
  };

  // Grammar: expr := term (('+'|'-') term)*
  function parseExpr(env: Env): number {
    let value = parseTerm(env);
    for (;;) {
      const token = peek();
      if (token?.kind === "op" && (token.value === "+" || token.value === "-")) {
        pos++;
        const rhs = parseTerm(env);
        value = token.value === "+" ? value + rhs : value - rhs;
      } else return value;
    }
  }

  function parseTerm(env: Env): number {
    let value = parseFactor(env);
    for (;;) {
      const token = peek();
      if (token?.kind === "op" && (token.value === "*" || token.value === "/" || token.value === "%")) {
        pos++;
        const rhs = parseFactor(env);
        if (token.value === "*") value = value * rhs;
        else if (token.value === "/") value = value / rhs;
        else value = value % rhs;
      } else return value;
    }
  }

  // Factor binds more tightly than unary signs, and exponentiation remains right-associative.
  // This makes -x^2 evaluate as -(x^2), while still accepting x^-2.
  function parseFactor(env: Env): number {
    const base = parsePrimary(env);
    const token = peek();
    if (token?.kind === "op" && token.value === "^") {
      pos++;
      return Math.pow(base, parseUnary(env));
    }
    return base;
  }

  function parseUnary(env: Env): number {
    const token = peek();
    if (token?.kind === "op" && (token.value === "+" || token.value === "-")) {
      pos++;
      const value = parseUnary(env);
      return token.value === "-" ? -value : value;
    }
    return parseFactor(env);
  }

  function parsePrimary(env: Env): number {
    const token = eat();
    if (token.kind === "num") return token.value;
    if (token.kind === "name") {
      const next = peek();
      if (next?.kind === "op" && next.value === "(") {
        pos++;
        const fn = FUNCTIONS[token.value];
        if (!fn) throw new Error(`unknown function '${token.value}'`);
        const args: number[] = [];
        if (!(peek()?.kind === "op" && peek()!.value === ")")) {
          for (;;) {
            args.push(parseExpr(env));
            const sep = peek();
            if (sep?.kind === "op" && sep.value === ",") {
              pos++;
              continue;
            }
            break;
          }
        }
        eat(")");
        return fn(...args);
      }
      if (token.value === "x") return env.x;
      if (token.value === "y") return env.y;
      if (token.value === "t") return env.t ?? 0;
      if (token.value in CONSTANTS) return CONSTANTS[token.value]!;
      throw new Error(`unknown identifier '${token.value}'`);
    }
    if (token.kind === "op" && token.value === "(") {
      const value = parseExpr(env);
      eat(")");
      return value;
    }
    throw new Error(`unexpected token at position ${pos}`);
  }

  return (env: Env) => {
    pos = 0;
    const value = parseExpr(env);
    if (pos !== tokens.length) throw new Error(`trailing input at position ${pos}`);
    return value;
  };
}

export function isValidExpr(src: string): boolean {
  try {
    const fn = compileExpr(src);
    const probe = fn({ x: 0.5, y: -0.5, t: 0 });
    return Number.isFinite(probe);
  } catch {
    return false;
  }
}

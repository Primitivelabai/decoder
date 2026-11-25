/**
 * Sandboxed Declarative Expression & Math Runtime.
 * Zero eval() or new Function() — uses a pure recursive-descent parser & AST evaluator.
 */

export type EvalContext = {
  vars: Record<string, number>;
  tables?: Record<string, Array<[number, number]>>;
};

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma' };

const CONSTANTS: Record<string, number> = {
  PI: Math.PI,
  TAU: Math.PI * 2,
  E: Math.E,
  true: 1,
  false: 0,
};

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  asin: (x) => Math.asin(x),
  acos: (x) => Math.acos(x),
  atan: (x) => Math.atan(x),
  atan2: (y, x) => Math.atan2(y, x),
  abs: (x) => Math.abs(x),
  sqrt: (x) => Math.sqrt(x),
  pow: (a, b) => Math.pow(a, b),
  exp: (x) => Math.exp(x),
  log: (x) => Math.log(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x) => Math.round(x),
  sign: (x) => Math.sign(x),
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  smoothstep: (edge0, edge1, x) => {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  },
  step: (edge, x) => (x < edge ? 0 : 1),
  pulse: (x, center, width) => {
    const d = Math.abs(x - center);
    return d < width ? 1 - d / width : 0;
  },
  mod: (a, b) => ((a % b) + b) % b,
  deg2rad: (d) => (d * Math.PI) / 180,
  rad2deg: (r) => (r * 180) / Math.PI,
  if: (cond, a, b) => (cond !== 0 ? a : b),
  // Slider-crank exact kinematics helper: returns piston displacement from TDC (0..2*r)
  sliderCrank: (theta, r, l) => {
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const underRoot = l * l - r * r * sinT * sinT;
    return r + l - (r * cosT + Math.sqrt(underRoot));
  },
  // Connecting rod swing angle (radians)
  conrodAngle: (theta, r, l) => {
    const ratio = (r * Math.sin(theta)) / l;
    return Math.asin(ratio);
  },
};

export type ASTNode =
  | { kind: 'literal'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'unary'; op: string; arg: ASTNode }
  | { kind: 'binary'; op: string; left: ASTNode; right: ASTNode }
  | { kind: 'call'; name: string; args: ASTNode[] };

export function tokenizeExpression(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < expr.length && /[0-9.eE+-]/.test(expr[i])) {
        if ((expr[i] === '+' || expr[i] === '-') && !/[eE]/.test(expr[i - 1] ?? '')) {
          break;
        }
        numStr += expr[i++];
      }
      const val = Number(numStr);
      if (!Number.isFinite(val)) {
        throw new Error(`Invalid numeric literal "${numStr}"`);
      }
      tokens.push({ type: 'num', value: val });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i++];
      }
      tokens.push({ type: 'ident', value: ident });
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i++;
      continue;
    }
    // Multi-char operators
    const two = expr.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||', '**'].includes(two)) {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }
    if ('+-*/%^<>!'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${ch}" in expression "${expr}"`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  parse(): ASTNode {
    if (this.tokens.length === 0) {
      throw new Error('Empty expression');
    }
    const node = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new Error('Unexpected trailing tokens in expression');
    }
    return node;
  }

  private parseOr(): ASTNode {
    let left = this.parseAnd();
    while (this.peek()?.type === 'op' && (this.peek() as { value: string }).value === '||') {
      this.consume();
      left = { kind: 'binary', op: '||', left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): ASTNode {
    let left = this.parseEquality();
    while (this.peek()?.type === 'op' && (this.peek() as { value: string }).value === '&&') {
      this.consume();
      left = { kind: 'binary', op: '&&', left, right: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): ASTNode {
    let left = this.parseComparison();
    while (this.peek()?.type === 'op' && ['==', '!='].includes((this.peek() as { value: string }).value)) {
      const op = (this.consume() as { value: string }).value;
      left = { kind: 'binary', op, left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): ASTNode {
    let left = this.parseAddSub();
    while (this.peek()?.type === 'op' && ['<', '>', '<=', '>='].includes((this.peek() as { value: string }).value)) {
      const op = (this.consume() as { value: string }).value;
      left = { kind: 'binary', op, left, right: this.parseAddSub() };
    }
    return left;
  }

  private parseAddSub(): ASTNode {
    let left = this.parseMulDiv();
    while (this.peek()?.type === 'op' && ['+', '-'].includes((this.peek() as { value: string }).value)) {
      const op = (this.consume() as { value: string }).value;
      left = { kind: 'binary', op, left, right: this.parseMulDiv() };
    }
    return left;
  }

  private parseMulDiv(): ASTNode {
    let left = this.parseUnary();
    while (this.peek()?.type === 'op' && ['*', '/', '%'].includes((this.peek() as { value: string }).value)) {
      const op = (this.consume() as { value: string }).value;
      left = { kind: 'binary', op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parsePower(): ASTNode {
    let left = this.parsePrimary();
    if (this.peek()?.type === 'op' && ['^', '**'].includes((this.peek() as { value: string }).value)) {
      const op = (this.consume() as { value: string }).value;
      return { kind: 'binary', op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): ASTNode {
    if (this.peek()?.type === 'op' && ['+', '-', '!'].includes((this.peek() as { value: string }).value)) {
      const op = (this.consume() as { value: string }).value;
      return { kind: 'unary', op, arg: this.parseUnary() };
    }
    return this.parsePower();
  }

  private parsePrimary(): ASTNode {
    const tok = this.peek();
    if (!tok) {
      throw new Error('Unexpected end of expression');
    }
    if (tok.type === 'num') {
      this.consume();
      return { kind: 'literal', value: tok.value };
    }
    if (tok.type === 'ident') {
      this.consume();
      const next = this.peek();
      if (next?.type === 'paren' && next.value === '(') {
        this.consume(); // '('
        const args: ASTNode[] = [];
        if (!(this.peek()?.type === 'paren' && (this.peek() as { value: string }).value === ')')) {
          args.push(this.parseOr());
          while (this.peek()?.type === 'comma') {
            this.consume();
            args.push(this.parseOr());
          }
        }
        const close = this.peek();
        if (close?.type !== 'paren' || close.value !== ')') {
          throw new Error(`Expected ')' after arguments to ${tok.value}`);
        }
        this.consume();
        return { kind: 'call', name: tok.value, args };
      }
      return { kind: 'var', name: tok.value };
    }
    if (tok.type === 'paren' && tok.value === '(') {
      this.consume();
      const inner = this.parseOr();
      const close = this.peek();
      if (close?.type !== 'paren' || close.value !== ')') {
        throw new Error("Expected closing ')'");
      }
      this.consume();
      return inner;
    }
    throw new Error(`Unexpected token ${JSON.stringify(tok)}`);
  }
}

const AST_CACHE = new Map<string, ASTNode>();

export function compileExpression(expr: string): ASTNode {
  const cached = AST_CACHE.get(expr);
  if (cached) return cached;
  const ast = new Parser(tokenizeExpression(expr)).parse();
  checkUnknownFunctions(ast);
  if (AST_CACHE.size >= 4096) AST_CACHE.delete(AST_CACHE.keys().next().value!);
  AST_CACHE.set(expr, ast);
  return ast;
}

export function validateExpressionSyntax(expr: string): { valid: boolean; error?: string } {
  try {
    const ast = compileExpression(expr);
    checkUnknownFunctions(ast);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const ARITY: Record<string, number> = {
  sin: 1,
  cos: 1,
  tan: 1,
  asin: 1,
  acos: 1,
  atan: 1,
  atan2: 2,
  abs: 1,
  sqrt: 1,
  pow: 2,
  exp: 1,
  log: 1,
  floor: 1,
  ceil: 1,
  round: 1,
  sign: 1,
  min: -1,
  max: -1,
  clamp: 3,
  lerp: 3,
  smoothstep: 3,
  step: 2,
  pulse: 3,
  mod: 2,
  deg2rad: 1,
  rad2deg: 1,
  if: 3,
  sliderCrank: 3,
  conrodAngle: 3,
  lookup: 2,
};
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function checkUnknownFunctions(node: ASTNode): void {
  if (node.kind === 'call') {
    if (!own(ARITY, node.name)) throw new Error(`Unknown function "${node.name}"`);
    const n = ARITY[node.name];
    if (n === -1 ? node.args.length < 1 : node.args.length !== n) {
      throw new Error(`Invalid argument count for ${node.name}`);
    }
    if (node.name === 'lookup' && node.args[0].kind !== 'var') throw new Error('lookup requires a table identifier');
    node.args.forEach(checkUnknownFunctions);
  } else if (node.kind === 'binary') {
    checkUnknownFunctions(node.left);
    checkUnknownFunctions(node.right);
  } else if (node.kind === 'unary') checkUnknownFunctions(node.arg);
}

/** Validate names independently of evaluation, including inactive branches. */
export function validateExpressionReferences(
  expr: string,
  variables: ReadonlySet<string>,
  tables: ReadonlySet<string> = new Set(),
): void {
  function walk(node: ASTNode): void {
    if (node.kind === 'var' && !variables.has(node.name) && !own(CONSTANTS, node.name))
      throw new Error(`Unknown variable "${node.name}"`);
    if (node.kind === 'binary') {
      walk(node.left);
      walk(node.right);
    }
    if (node.kind === 'unary') walk(node.arg);
    if (node.kind === 'call') {
      if (node.name === 'lookup') {
        const table = node.args[0];
        if (table.kind !== 'var' || !tables.has(table.name)) throw new Error('Unknown lookup table');
        walk(node.args[1]);
      } else node.args.forEach(walk);
    }
  }
  walk(compileExpression(expr));
}

function evalLookup(table: Array<[number, number]>, x: number): number {
  if (!table || table.length === 0) throw new Error('Empty lookup table');
  if (table.some(([x, y], i) => !Number.isFinite(x) || !Number.isFinite(y) || (i > 0 && x <= table[i - 1][0])))
    throw new Error('Lookup table must be finite and strictly ascending');
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i];
    const [x1, y1] = table[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0 || 1);
      return y0 + (y1 - y0) * t;
    }
  }
  return table[table.length - 1][1];
}

export function evaluateAST(node: ASTNode, ctx: EvalContext): number {
  const result = evaluateNode(node, ctx);
  if (!Number.isFinite(result)) throw new Error('Non-finite expression result');
  return result;
}

function evaluateNode(node: ASTNode, ctx: EvalContext): number {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'var': {
      if (own(ctx.vars, node.name)) return ctx.vars[node.name];
      if (own(CONSTANTS, node.name)) return CONSTANTS[node.name];
      throw new Error(`Unknown variable "${node.name}"`);
    }
    case 'unary': {
      const v = evaluateAST(node.arg, ctx);
      if (node.op === '-') return -v;
      if (node.op === '+') return v;
      if (node.op === '!') return v === 0 ? 1 : 0;
      return v;
    }
    case 'binary': {
      const l = evaluateAST(node.left, ctx);
      if (node.op === '&&' && l === 0) return 0;
      if (node.op === '||' && l !== 0) return 1;
      const r = evaluateAST(node.right, ctx);
      switch (node.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return l / r;
        case '%':
          return l % r;
        case '^':
        case '**':
          return Math.pow(l, r);
        case '<':
          return l < r ? 1 : 0;
        case '>':
          return l > r ? 1 : 0;
        case '<=':
          return l <= r ? 1 : 0;
        case '>=':
          return l >= r ? 1 : 0;
        case '==':
          return Math.abs(l - r) < 1e-9 ? 1 : 0;
        case '!=':
          return Math.abs(l - r) >= 1e-9 ? 1 : 0;
        case '&&':
          return l !== 0 && r !== 0 ? 1 : 0;
        case '||':
          return l !== 0 || r !== 0 ? 1 : 0;
        default:
          return 0;
      }
    }
    case 'call': {
      if (node.name === 'lookup') {
        if (node.args.length >= 2 && node.args[0].kind === 'var') {
          const name = node.args[0].name;
          const table = ctx.tables && own(ctx.tables, name) ? ctx.tables[name] : undefined;
          const x = evaluateAST(node.args[1], ctx);
          if (!table) throw new Error(`Unknown lookup table "${name}"`);
          return evalLookup(table, x);
        }
        throw new Error('Invalid lookup expression');
      }
      if (node.name === 'if') return evaluateAST(node.args[evaluateAST(node.args[0], ctx) !== 0 ? 1 : 2], ctx);
      const fn = FUNCTIONS[node.name];
      if (!own(FUNCTIONS, node.name)) throw new Error(`Unknown function "${node.name}"`);
      const args = node.args.map((a) => evaluateAST(a, ctx));
      const res = fn(...args);
      return res;
    }
  }
}

export function evaluateExpression(expr: string, ctx: EvalContext): number {
  const ast = compileExpression(expr);
  const res = evaluateAST(ast, ctx);
  return res;
}

export function convertUnit(value: number, from: string, to: string): number {
  if (from === to) return value;
  const factorsToMeters: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, um: 1e-6 };
  if (from in factorsToMeters && to in factorsToMeters) {
    return (value * factorsToMeters[from]) / factorsToMeters[to];
  }
  const factorsToPa: Record<string, number> = { Pa: 1, kPa: 1e3, bar: 1e5, MPa: 1e6 };
  if (from in factorsToPa && to in factorsToPa) {
    return (value * factorsToPa[from]) / factorsToPa[to];
  }
  if (from === 'C' && to === 'K') return value + 273.15;
  if (from === 'K' && to === 'C') return value - 273.15;
  if (from === 'deg' && to === 'rad') return (value * Math.PI) / 180;
  if (from === 'rad' && to === 'deg') return (value * 180) / Math.PI;
  return value;
}

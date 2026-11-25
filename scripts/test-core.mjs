// Core regression checks: compiles the engine with TypeScript alone (no bundler)
// and exercises the expression evaluator, runtime integration and built-in exhibits.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCES = [
  'src/engine/expressions.ts',
  'src/engine/runtime.ts',
  'src/engine/relationships.ts',
  'src/engine/spatial.ts',
  'src/projects/index.ts',
];

const tsc = join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc');
const outDir = mkdtempSync(join(tmpdir(), 'decoder-core-'));

try {
  const compile = spawnSync(
    process.execPath,
    [
      tsc,
      '--ignoreConfig',
      '--target',
      'ES2022',
      '--module',
      'commonjs',
      '--moduleResolution',
      'bundler',
      '--skipLibCheck',
      '--outDir',
      outDir,
      ...SOURCES,
    ],
    { stdio: 'inherit' },
  );
  if (compile.status !== 0) throw new Error('Core TypeScript compilation failed');
  writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');

  const require = createRequire(join(outDir, 'package.json'));
  const {
    evaluateExpression: evaluate,
    validateExpressionSyntax: validateSyntax,
    validateExpressionReferences: validateReferences,
  } = require('./engine/expressions.js');
  const { DecoderRuntime } = require('./engine/runtime.js');
  const { BUILTIN_EXHIBITS } = require('./projects/index.js');

  let checks = 0;
  const check = (name, fn) => {
    fn();
    checks++;
    console.log(`PASS ${name}`);
  };

  check('invalid arithmetic, variables, function arguments and nested errors', () => {
    for (const expr of [
      '1/0',
      'sqrt(-1)',
      '2+typo',
      'sin()',
      'min()',
      '0*(1/0)',
      'lookup(missing,0)',
      'constructor(1)',
    ]) {
      assert.throws(() => evaluate(expr, { vars: {} }), undefined, expr);
    }
    assert.equal(validateSyntax('sin()').valid, false);
  });

  check('precedence and lazy branches', () => {
    const cases = [
      ['-2^2', -4],
      ['2^-2', 0.25],
      ['2^3^2', 512],
      ['if(0,1/0,7)', 7],
      ['0&&(1/0)', 0],
      ['1||(1/0)', 1],
    ];
    for (const [expr, expected] of cases) assert.equal(evaluate(expr, { vars: {} }), expected, expr);
  });

  check('static references including inactive branches', () => {
    assert.throws(() => validateReferences('if(0,typo,1)', new Set()));
    assert.throws(() => validateReferences('lookup(missing,1)', new Set()));
    validateReferences('lookup(table,x)+PI', new Set(['x']), new Set(['table']));
  });

  /** A minimal project whose only dynamics are the given ODEs. */
  const odeProject = (odes) => ({
    ...structuredClone(BUILTIN_EXHIBITS[0]),
    parameters: [],
    behaviours: [],
    effects: [],
    relationships: [],
    simulation: {
      level: 'D',
      cycleDuration: 2,
      loop: false,
      assumptions: [],
      variables: {},
      odes,
      outputs: odes.map((o) => ({ id: o.variable, label: o.variable, expression: o.variable, unit: 'unitless' })),
    },
  });

  check('direct seek, sequential stepping, rewind and zero time', () => {
    const project = odeProject([{ variable: 'y', initialValue: 0, derivativeExpr: '1' }]);
    const direct = new DecoderRuntime(project);
    assert.equal(direct.evaluate(0, {}).outputs[0].value, 0);
    assert.ok(Math.abs(direct.evaluate(1, {}).outputs[0].value - 1) < 1e-10);
    assert.ok(Math.abs(direct.evaluate(0.25, {}).outputs[0].value - 0.25) < 1e-10);

    const stepped = new DecoderRuntime(project);
    for (let i = 0; i <= 100; i++) stepped.evaluate(i / 100, {});
    assert.ok(Math.abs(stepped.evaluate(1, {}).outputs[0].value - 1) < 1e-10);
  });

  check('coupled oscillator midpoint accuracy', () => {
    const project = odeProject([
      { variable: 'x', initialValue: 1, derivativeExpr: 'v' },
      { variable: 'v', initialValue: 0, derivativeExpr: '-x' },
    ]);
    const state = new DecoderRuntime(project).evaluate(1, {});
    assert.ok(Math.abs(state.variables.x - Math.cos(1)) < 1e-4);
    assert.ok(Math.abs(state.variables.v + Math.sin(1)) < 1e-4);
  });

  check('state machine direct seek', () => {
    const project = odeProject([]);
    project.simulation.stateMachines = [
      {
        id: 'test',
        initialState: 'off',
        states: ['off', 'on'],
        transitions: [{ from: 'off', to: 'on', condition: 't>=0.5' }],
      },
    ];
    const runtime = new DecoderRuntime(project);
    assert.equal(runtime.evaluate(0, {}).states.test, 'off');
    assert.equal(runtime.evaluate(1, {}).states.test, 'on');
    assert.equal(runtime.evaluate(0.25, {}).states.test, 'off');
  });

  let samples = 0;
  for (const project of BUILTIN_EXHIBITS) {
    check(`built-in exhibit ${project.id}`, () => {
      const runtime = new DecoderRuntime(project);
      const params = runtime.getDefaultParameters();
      for (let i = 0; i <= 120; i++) {
        const state = runtime.evaluate((project.simulation.cycleDuration * i) / 120, params);
        assert.ok(state.outputs.every((o) => Number.isFinite(o.value)));
        samples++;
      }

      const names = new Set([
        't',
        'localTime',
        'phase',
        'cycleDuration',
        'cycleAngleDeg',
        'cycleAngleRad',
        'ambientTempC',
        'gravity',
        ...project.parameters.map((p) => p.id),
        ...(project.simulation.odes ?? []).map((o) => o.variable),
      ]);
      for (const machine of project.simulation.stateMachines ?? []) {
        names.add(`state_${machine.id}`);
        for (const state of machine.states) names.add(`is_${machine.id}_${state}`);
      }
      const tables = new Set(Object.keys(project.simulation.lookupTables ?? {}));
      for (const [name, expr] of Object.entries(project.simulation.variables)) {
        validateReferences(expr, names, tables);
        names.add(name);
      }

      const expressions = [
        ...project.simulation.outputs.map((o) => o.expression),
        ...project.behaviours.map((b) => b.expression),
        ...project.relationships.flatMap((r) => [r.activeExpr, r.quantityExpr]),
        ...project.effects.flatMap((e) => [e.intensityExpr, e.speedExpr]),
        ...(project.simulation.odes ?? []).map((o) => o.derivativeExpr),
        ...(project.simulation.stateMachines ?? []).flatMap((m) => m.transitions.map((t) => t.condition)),
      ];
      for (const expr of expressions) if (expr !== undefined) validateReferences(expr, names, tables);
    });
  }

  console.log(`${checks} checks passed; ${samples} exhibit samples evaluated.`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

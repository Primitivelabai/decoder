import assert from 'node:assert/strict';
import test from 'node:test';
import { convertUnit, evaluateExpression, validateExpressionSyntax } from './expressions';
import { GeometryKernel } from './geometry';
import { MATERIAL_PRESET_DEFAULTS, MaterialLibrary } from './materials';
import { computeCausalGraphLayout, traceComponentRelationships } from './relationships';
import { DecoderRuntime } from './runtime';
import { buildExplosionPlan, computeHierarchicalExplosionOffset, resolveLabelOverlaps } from './spatial';
import { DecoderSDK } from '../sdk/index';
import { BUILTIN_EXHIBITS } from '../projects/index';

test('sandboxed expression evaluator handles math, kinematics, and blocks invalid syntax', () => {
  const val = evaluateExpression('2 + 3 * sin(PI / 2) + clamp(15, 0, 10)', { vars: {} });
  assert.equal(val, 15);

  const disp0 = evaluateExpression('sliderCrank(0, 0.24, 0.68)', { vars: {} });
  assert.ok(Math.abs(disp0) < 1e-6, 'TDC displacement should be 0');

  const disp180 = evaluateExpression('sliderCrank(PI, 0.24, 0.68)', { vars: {} });
  assert.ok(Math.abs(disp180 - 0.48) < 1e-6, 'BDC displacement should equal 2*r = 0.48');

  const bad = validateExpressionSyntax('2 + unknownFn(5)');
  assert.equal(bad.valid, false);
});

test('unit conversions convert pressure, length, and temperature accurately', () => {
  assert.equal(convertUnit(9, 'bar', 'kPa'), 900);
  assert.equal(convertUnit(25, 'mm', 'm'), 0.025);
  assert.ok(Math.abs(convertUnit(100, 'C', 'K') - 373.15) < 1e-6);
});

test('all 7 demonstration exhibits pass formal schema, validation, simulation, SVG illustration, and export checks', () => {
  assert.equal(BUILTIN_EXHIBITS.length, 7, 'Expected 6 core exhibits + 1 mechanical pencil generalisation test');
  const sdk = new DecoderSDK();

  for (const project of BUILTIN_EXHIBITS) {
    const report = sdk.validate(project);
    assert.equal(
      report.valid,
      true,
      `Exhibit "${project.id}" failed validation: ${JSON.stringify(report.issues.filter((i) => i.severity === 'error'))}`,
    );
    assert.ok(report.stats.evidenceCoverage === 1, `Exhibit "${project.id}" missing evidence on components`);

    const info = sdk.inspect(project);
    assert.ok(info.diagnostics.triangleCount > 100, `Exhibit "${project.id}" should produce substantial 3D geometry`);
    assert.ok(info.disassemblyOrder.length === project.components.length);

    // Simulation evaluation at two phases
    const s0 = sdk.simulateStep(project, 0);
    const sHalf = sdk.simulateStep(project, project.simulation.cycleDuration * 0.5);
    assert.ok(s0.outputs.length >= 2);
    assert.ok(sHalf.outputs.every((o) => Number.isFinite(o.value)));

    // Technical illustration SVG
    const svg = sdk.renderIllustrationSVG(project, {
      aesthetic: 'patent',
      projection: 'axonometric',
      explosion: 0.25,
      showCallouts: true,
      showPartsList: true,
    });
    assert.ok(svg.startsWith('<svg') && svg.includes('PARTS SCHEDULE'));

    // Standalone HTML package
    const html = sdk.exportFormat(project, 'html');
    assert.ok(html.includes('decoder-project-data') && html.includes(project.title));

    // OBJ & STEP export
    const obj = sdk.exportFormat(project, 'obj');
    assert.ok(obj.includes('v ') && obj.includes('f '));
    const step = sdk.exportFormat(project, 'step');
    assert.ok(step.includes('ISO-10303-21;') && step.includes('AP214_CD_MIM_LF'));
  }

  sdk.dispose();
});

test('industrial procedural primitives and construction modifiers build clean meshes with normals and UVs', () => {
  const kernel = new GeometryKernel();
  const primitives = [
    { type: 'fastener' as const, params: { radius: 0.025, headHeight: 0.024, length: 0.06 } },
    { type: 'flange' as const, params: { outerRadius: 0.28, innerRadius: 0.1, thickness: 0.055, bolts: 6 } },
    { type: 'gasket_ring' as const, params: { radius: 0.24, tube: 0.016, segments: 44 } },
    { type: 'vascular_branch' as const, params: { length: 0.9, radius: 0.09, branches: 3 } },
  ];

  for (const spec of primitives) {
    const geo = kernel.buildGeometry({
      type: spec.type,
      params: spec.params,
      modifiers: [
        { kind: 'fasteners', radius: 0.22, count: 4 },
        { kind: 'gasket', radius: 0.2, depth: 0.012 },
        { kind: 'knurling', radius: 0.16, count: 8 },
        { kind: 'seam', radius: 0.18 },
        { kind: 'ribs', radius: 0.19, count: 4, length: 0.25 },
      ],
    });
    assert.ok(geo.attributes.position && geo.attributes.position.count > 24, `${spec.type} should have vertices`);
    assert.ok(geo.attributes.normal, `${spec.type} should compute vertex normals`);
    assert.ok(geo.attributes.uv, `${spec.type} should have UV coordinates`);
  }

  kernel.dispose();
});

test('material library initializes physically plausible presets including abs_plastic and silicone', () => {
  assert.ok(MATERIAL_PRESET_DEFAULTS.abs_plastic);
  assert.ok(MATERIAL_PRESET_DEFAULTS.silicone);

  const lib = new MaterialLibrary(false, 4);
  const absMat = lib.getMaterial({ id: 'abs', name: 'ABS Housing', preset: 'abs_plastic' });
  const silMat = lib.getMaterial({ id: 'sil', name: 'Silicone Seal', preset: 'silicone' });
  const glassMat = lib.getMaterial({ id: 'gls', name: 'Borosilicate', preset: 'glass' });
  assert.equal(absMat.metalness, 0);
  assert.ok(absMat.clearcoat > 0);
  assert.ok(silMat.roughness > 0.4);
  assert.ok(glassMat.transmission > 0.8 && glassMat.ior >= 1.45);
  lib.dispose();
});

test('hierarchical explosion separates subsystems and components coherently', () => {
  const espresso = BUILTIN_EXHIBITS[0];
  const plan = buildExplosionPlan(espresso);
  assert.ok(Object.keys(plan.subsystems).length >= 3);

  const boiler = espresso.components.find((c) => c.id === 'brass_boiler')!;
  const off0 = computeHierarchicalExplosionOffset(boiler, 0, plan);
  const off1 = computeHierarchicalExplosionOffset(boiler, 1, plan);
  assert.deepEqual(off0, [0, 0, 0]);
  assert.ok(Math.hypot(off1[0], off1[1], off1[2]) > 0.5);
});

test('relationship tracer and causal graph layout detect upstream, downstream, stages, and non-overlapping node cards', () => {
  const espresso = BUILTIN_EXHIBITS[0];
  const trace = traceComponentRelationships(espresso, 'brass_boiler');
  assert.ok(trace.upstreamIds.has('vibratory_pump'));
  assert.ok(trace.downstreamIds.has('espresso_cup'));
  assert.ok(trace.feedbackCycles.length >= 1, 'Espresso machine should detect puck->pump feedback cycle');

  for (const project of BUILTIN_EXHIBITS) {
    const layout = computeCausalGraphLayout(project, 'all', 680, 390);
    assert.ok(layout.nodes.length >= 6, `${project.id} should layout rich graph nodes`);
    assert.ok(layout.edges.length >= 8, `${project.id} should expose >= 8 causal relationships`);
    assert.ok(layout.maxRank >= 2, `${project.id} causal graph should span at least 3 stages`);
    assert.ok(
      layout.edges.some((e) => e.isFeedback),
      `${project.id} should identify at least one feedback/cyclic return edge`,
    );
    assert.ok(
      layout.edges.some((e) => Boolean(e.relationship.mechanism)),
      `${project.id} relationships should carry physical mechanism explanations`,
    );
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        const overlaps = Math.abs(a.x - b.x) < 142 && Math.abs(a.y - b.y) < 46;
        assert.equal(overlaps, false, `${project.id} graph cards "${a.label}" and "${b.label}" overlap`);
      }
    }
  }
});

test('label overlap solver eliminates intersecting bounding boxes', () => {
  const overlapping = [
    { id: 'a', x: 200, y: 200, width: 60, height: 24 },
    { id: 'b', x: 205, y: 204, width: 60, height: 24 },
  ];
  const resolved = resolveLabelOverlaps(overlapping, 800, 600, 30);
  const dy = Math.abs(resolved[0].y - resolved[1].y);
  assert.ok(dy >= 24, `Expected separated labels, got dy=${dy}`);
});

test('four-stroke engine synchronizes piston and valves over 720 degrees', () => {
  const engine = BUILTIN_EXHIBITS.find((p) => p.id === 'four_stroke_engine')!;
  const rt = new DecoderRuntime(engine);
  const s = rt.evaluate(1.5, { throttleRpm: 320, engineLoad: 0.25 }, 0.016);
  assert.ok(s.variables.cycle720 >= 0 && s.variables.cycle720 < 720);
  assert.ok(s.transforms.piston?.position_y !== undefined);
  assert.ok(s.transforms.connecting_rod?.rotation_z !== undefined);
});

test('validation catches broken references, negative dimensions, and invalid expressions', () => {
  const sdk = new DecoderSDK();
  const proj = sdk.initProject('broken_test', 'Broken Test');
  proj.components[0].materialId = 'non_existent_material';
  proj.components[0].geometry!.params.width = -5;
  proj.behaviours[0].expression = 'badFunc(10)';
  const report = sdk.validate(proj);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((i) => i.code === 'MISSING_MATERIAL'));
  assert.ok(report.issues.some((i) => i.code === 'INVALID_GEOMETRY_DIMENSION'));
  assert.ok(report.issues.some((i) => i.code === 'INVALID_EXPRESSION'));
  sdk.dispose();
});

test('rejects invalid numeric results and checks actual direct SDK time', () => {
  for (const e of ['1/0', 'sqrt(-1)', '2+typo', 'sin()']) assert.throws(() => evaluateExpression(e, { vars: {} }));
  assert.equal(evaluateExpression('-2^2', { vars: {} }), -4);
  const p = structuredClone(BUILTIN_EXHIBITS[0]);
  p.parameters = [];
  p.behaviours = [];
  p.effects = [];
  p.relationships = [];
  p.simulation = {
    level: 'D',
    cycleDuration: 2,
    loop: false,
    assumptions: [],
    variables: {},
    odes: [{ variable: 'y', initialValue: 0, derivativeExpr: '1' }],
    outputs: [{ id: 'y', label: 'y', expression: 'y', unit: 'unitless' }],
  };
  const sdk = new DecoderSDK();
  assert.ok(Math.abs(sdk.simulateStep(p, 1).outputs[0].value - 1) < 1e-10);
  sdk.dispose();
});

test('validation rejects unsupported evidence and unknown references; HTML safely embeds input', () => {
  const sdk = new DecoderSDK();
  const p = structuredClone(BUILTIN_EXHIBITS[0]);
  p.components[0].evidence = { classification: 'documented' };
  assert.ok(sdk.validate(p).issues.some((i) => i.code === 'MISSING_EVIDENCE_SOURCE'));
  p.components[0].evidence = { classification: 'inferred' };
  p.simulation.outputs[0].expression = 'if(0,typo,1)';
  assert.ok(sdk.validate(p).issues.some((i) => i.code === 'INVALID_EXPRESSION_REFERENCE'));
  p.simulation.outputs[0].expression = '1';
  p.title = '</script><script>alert(123)</script>';
  const html = sdk.exportFormat(p, 'html');
  assert.ok(!html.includes(p.title));
  assert.ok(html.includes('decoder-project-data'));
  assert.ok(!html.includes('https://cdn.'));
  sdk.dispose();
});

test('technical illustrations are well-formed SVG markup for every aesthetic', () => {
  const sdk = new DecoderSDK();
  const project = structuredClone(BUILTIN_EXHIBITS[0]);
  project.title = 'Quotes " & <tags> in a title';
  const aesthetics = [
    'patent',
    'museum_plate',
    'industrial_manual',
    'scientific_journal',
    'minimal_editorial',
    'technical_atlas',
  ] as const;
  const wellFormedTag = /^<\/?[A-Za-z][\w:-]*(\s+[\w:-]+="[^"<]*")*\s*\/?>$/;
  for (const aesthetic of aesthetics) {
    const svg = sdk.renderIllustrationSVG(project, {
      aesthetic,
      projection: 'axonometric',
      explosion: 0.25,
      showCallouts: true,
      showPartsList: true,
    });
    for (const tag of svg.match(/<[^>]*>/g) ?? []) {
      assert.match(tag, wellFormedTag, `${aesthetic}: malformed tag ${tag.slice(0, 120)}`);
    }
    assert.doesNotMatch(
      svg,
      /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/,
      `${aesthetic}: unescaped ampersand`,
    );
  }
});

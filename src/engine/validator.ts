import { validateExpressionSyntax, validateExpressionReferences } from './expressions';
import { validateSchema } from './schema';
import { computeWorldPositionMap, estimateGeometryLocalBounds } from './spatial';
import type { DecoderProject, ValidationIssue, ValidationReport } from './types';

function isFiniteVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

export function validateProject(project: DecoderProject): ValidationReport {
  const issues: ValidationIssue[] = [];

  // 1. Formal JSON Schema validation
  for (const err of validateSchema(project)) {
    issues.push({
      code: 'SCHEMA_VIOLATION',
      severity: 'error',
      path: err.path,
      message: err.message,
      repairHint: 'Ensure all required .decoder.json top-level fields and component schemas conform to v1.0.0.',
    });
  }

  if (issues.length)
    return {
      valid: false,
      errorCount: issues.length,
      warningCount: 0,
      infoCount: 0,
      issues,
      stats: {
        componentCount: 0,
        relationshipCount: 0,
        evidenceCoverage: 0,
        effectCount: 0,
        chapterCount: 0,
        parameterCount: 0,
      },
    };
  const evidenceItems = [
    { evidence: project.evidenceSummary, path: '/evidenceSummary' },
    ...project.components.map((c) => ({ evidence: c.evidence, path: `/components/${c.id}/evidence` })),
    ...project.relationships.map((r) => ({ evidence: r.evidence, path: `/relationships/${r.id}/evidence` })),
  ];
  for (const { evidence, path } of evidenceItems) {
    if (!evidence?.classification)
      issues.push({
        code: 'MISSING_EVIDENCE',
        severity: 'error',
        path,
        message: 'Evidence classification is required.',
      });
    else if (
      ['documented', 'observed'].includes(evidence.classification) &&
      !evidence.sources?.some((source) => typeof source === 'string' && source.trim().length > 0)
    )
      issues.push({
        code: 'MISSING_EVIDENCE_SOURCE',
        severity: 'error',
        path,
        message: 'Observed and documented claims require a source or measurement reference.',
      });
    else if (
      evidence.classification === 'illustrative' &&
      !evidence.assumptions?.some((a) => typeof a === 'string' && a.trim())
    )
      issues.push({
        code: 'MISSING_EVIDENCE_ASSUMPTIONS',
        severity: 'warning',
        path,
        message: 'Illustrative claims should describe their simplifying assumptions.',
      });
  }
  const componentIds = new Set<string>();
  const materialIds = new Set<string>(project.materials.map((m) => m.id));
  const paramIds = new Set<string>(project.parameters.map((p) => p.id));

  // 2. Check duplicate component IDs & validate each component
  for (const comp of project.components) {
    if (componentIds.has(comp.id)) {
      issues.push({
        code: 'DUPLICATE_COMPONENT_ID',
        severity: 'error',
        path: `/components/${comp.id}`,
        componentId: comp.id,
        message: `Duplicate component identifier "${comp.id}".`,
        repairHint: 'Assign a unique stable ID to each component.',
      });
    }
    componentIds.add(comp.id);

    if (comp.materialId && !materialIds.has(comp.materialId)) {
      issues.push({
        code: 'MISSING_MATERIAL',
        severity: 'error',
        path: `/components/${comp.id}/materialId`,
        componentId: comp.id,
        message: `Component "${comp.name}" references unknown material "${comp.materialId}".`,
        repairHint: 'Add the material to project.materials or reference an existing materialId.',
      });
    }

    // Validate transform finiteness
    if (comp.transform?.position && !isFiniteVec3(comp.transform.position)) {
      issues.push({
        code: 'INVALID_TRANSFORM',
        severity: 'error',
        path: `/components/${comp.id}/transform/position`,
        componentId: comp.id,
        message: `Non-finite position vector on "${comp.name}".`,
      });
    }
    if (comp.transform?.rotation && !isFiniteVec3(comp.transform.rotation)) {
      issues.push({
        code: 'INVALID_TRANSFORM',
        severity: 'error',
        path: `/components/${comp.id}/transform/rotation`,
        componentId: comp.id,
        message: `Non-finite rotation vector on "${comp.name}".`,
      });
    }
    if (comp.transform?.scale && (!isFiniteVec3(comp.transform.scale) || comp.transform.scale.some((s) => s === 0))) {
      issues.push({
        code: 'INVALID_SCALE',
        severity: 'error',
        path: `/components/${comp.id}/transform/scale`,
        componentId: comp.id,
        message: `Zero or non-finite scale vector on "${comp.name}".`,
      });
    }

    // Validate geometry numeric parameters
    if (comp.geometry) {
      for (const [pk, pv] of Object.entries(comp.geometry.params)) {
        if (typeof pv === 'number') {
          if (!Number.isFinite(pv)) {
            issues.push({
              code: 'NON_FINITE_GEOMETRY_PARAM',
              severity: 'error',
              path: `/components/${comp.id}/geometry/params/${pk}`,
              componentId: comp.id,
              message: `Geometry parameter "${pk}" is non-finite on "${comp.name}".`,
            });
          } else if (
            ['width', 'height', 'depth', 'radius', 'outerRadius', 'length', 'thickness', 'teeth', 'module'].includes(
              pk,
            ) &&
            pv <= 0
          ) {
            issues.push({
              code: 'INVALID_GEOMETRY_DIMENSION',
              severity: 'error',
              path: `/components/${comp.id}/geometry/params/${pk}`,
              componentId: comp.id,
              message: `Dimension "${pk}" must be > 0 (got ${pv}) on "${comp.name}".`,
              repairHint: `Set ${pk} to a positive physical dimension.`,
            });
          }
        }
      }
    }

    // Evidence classification check
    if (!comp.evidence?.classification) {
      issues.push({
        code: 'MISSING_EVIDENCE_CLASSIFICATION',
        severity: 'warning',
        path: `/components/${comp.id}/evidence`,
        componentId: comp.id,
        message: `Component "${comp.name}" is missing an evidence classification.`,
      });
    }
  }

  // 3. Parent hierarchy & cycle detection
  const byId = new Map(project.components.map((c) => [c.id, c]));
  for (const comp of project.components) {
    if (comp.parentId && !byId.has(comp.parentId)) {
      issues.push({
        code: 'BROKEN_PARENT_REFERENCE',
        severity: 'error',
        path: `/components/${comp.id}/parentId`,
        componentId: comp.id,
        message: `Component "${comp.name}" references non-existent parentId "${comp.parentId}".`,
      });
    }
    // Check cycle
    const seen = new Set<string>([comp.id]);
    let curr = comp.parentId;
    while (curr) {
      if (seen.has(curr)) {
        issues.push({
          code: 'HIERARCHY_CYCLE',
          severity: 'error',
          path: `/components/${comp.id}/parentId`,
          componentId: comp.id,
          message: `Parent hierarchy cycle detected involving "${comp.id}".`,
        });
        break;
      }
      seen.add(curr);
      curr = byId.get(curr)?.parentId ?? null;
    }

    // Attachment target checks
    for (const att of comp.attachments ?? []) {
      if (att.targetComponentId && !byId.has(att.targetComponentId)) {
        issues.push({
          code: 'BROKEN_ATTACHMENT_TARGET',
          severity: 'warning',
          path: `/components/${comp.id}/attachments/${att.id}`,
          componentId: comp.id,
          message: `Attachment "${att.label}" points to unknown component "${att.targetComponentId}".`,
        });
      }
    }
  }

  // 4. Relationships
  for (const rel of project.relationships) {
    if (!componentIds.has(rel.sourceId)) {
      issues.push({
        code: 'INVALID_RELATIONSHIP_SOURCE',
        severity: 'error',
        path: `/relationships/${rel.id}/sourceId`,
        message: `Relationship "${rel.label}" sourceId "${rel.sourceId}" does not exist.`,
      });
    }
    if (!componentIds.has(rel.targetId)) {
      issues.push({
        code: 'INVALID_RELATIONSHIP_TARGET',
        severity: 'error',
        path: `/relationships/${rel.id}/targetId`,
        message: `Relationship "${rel.label}" targetId "${rel.targetId}" does not exist.`,
      });
    }
    if (rel.quantityExpr) {
      const check = validateExpressionSyntax(rel.quantityExpr);
      if (!check.valid) {
        issues.push({
          code: 'INVALID_EXPRESSION',
          severity: 'error',
          path: `/relationships/${rel.id}/quantityExpr`,
          message: `Invalid expression in relationship "${rel.id}": ${check.error}`,
        });
      }
    }
  }

  // 5. Simulation expressions & parameters
  for (const p of project.parameters) {
    if (p.control === 'slider' || p.control === 'number') {
      if (p.min !== undefined && p.max !== undefined && p.min >= p.max) {
        issues.push({
          code: 'INVALID_PARAMETER_RANGE',
          severity: 'error',
          path: `/parameters/${p.id}`,
          message: `Parameter "${p.label}" has min (${p.min}) >= max (${p.max}).`,
        });
      }
      if (!p.unit) {
        issues.push({
          code: 'MISSING_UNIT',
          severity: 'warning',
          path: `/parameters/${p.id}/unit`,
          message: `Numeric parameter "${p.label}" should declare a unit.`,
        });
      }
    }
  }

  for (const [varName, expr] of Object.entries(project.simulation.variables)) {
    const check = validateExpressionSyntax(expr);
    if (!check.valid) {
      issues.push({
        code: 'INVALID_EXPRESSION',
        severity: 'error',
        path: `/simulation/variables/${varName}`,
        message: `Invalid expression for variable "${varName}": ${check.error}`,
      });
    }
  }

  for (const beh of project.behaviours) {
    if (!componentIds.has(beh.componentId)) {
      issues.push({
        code: 'BROKEN_BEHAVIOUR_TARGET',
        severity: 'error',
        path: `/behaviours/${beh.id}/componentId`,
        componentId: beh.componentId,
        message: `Behaviour "${beh.id}" targets unknown component "${beh.componentId}".`,
      });
    }
    const check = validateExpressionSyntax(beh.expression);
    if (!check.valid) {
      issues.push({
        code: 'INVALID_EXPRESSION',
        severity: 'error',
        path: `/behaviours/${beh.id}/expression`,
        componentId: beh.componentId,
        message: `Invalid behaviour expression "${beh.expression}": ${check.error}`,
      });
    }
  }

  // Static reference checks cover all expression-bearing fields, including inactive branches.
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
  ]);
  const tables = new Set(Object.keys(project.simulation.lookupTables ?? {}));
  const declare = (name: string, path: string) => {
    if (names.has(name) || ['__proto__', 'constructor', 'prototype', 'PI', 'E', 'TAU'].includes(name))
      issues.push({
        code: 'DUPLICATE_SIMULATION_NAME',
        severity: 'error',
        path,
        message: `Reserved or duplicate simulation name: ${name}`,
      });
    names.add(name);
  };
  for (const ode of project.simulation.odes ?? []) declare(ode.variable, `/simulation/odes/${ode.variable}`);
  for (const sm of project.simulation.stateMachines ?? []) {
    declare(`state_${sm.id}`, `/simulation/stateMachines/${sm.id}`);
    for (const state of sm.states) declare(`is_${sm.id}_${state}`, `/simulation/stateMachines/${sm.id}`);
    if (
      !sm.states.includes(sm.initialState) ||
      sm.transitions.some((tr) => !sm.states.includes(tr.to) || (tr.from !== '*' && !sm.states.includes(tr.from)))
    )
      issues.push({
        code: 'INVALID_STATE_MACHINE',
        severity: 'error',
        path: `/simulation/stateMachines/${sm.id}`,
        message: 'Unknown state in initial state or transition.',
      });
  }
  const checkRefs = (expression: string | undefined, path: string) => {
    if (expression === undefined) return;
    try {
      validateExpressionReferences(expression, names, tables);
    } catch (error) {
      issues.push({
        code: 'INVALID_EXPRESSION_REFERENCE',
        severity: 'error',
        path,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
  for (const [name, expr] of Object.entries(project.simulation.variables)) {
    checkRefs(expr, `/simulation/variables/${name}`);
    declare(name, `/simulation/variables/${name}`);
  }
  for (const ode of project.simulation.odes ?? []) checkRefs(ode.derivativeExpr, `/simulation/odes/${ode.variable}`);
  for (const sm of project.simulation.stateMachines ?? [])
    for (const tr of sm.transitions) checkRefs(tr.condition, `/simulation/stateMachines/${sm.id}/transitions`);
  for (const out of project.simulation.outputs) checkRefs(out.expression, `/simulation/outputs/${out.id}`);
  for (const rel of project.relationships) {
    checkRefs(rel.quantityExpr, `/relationships/${rel.id}/quantityExpr`);
    checkRefs(rel.activeExpr, `/relationships/${rel.id}/activeExpr`);
  }
  for (const eff of project.effects) {
    checkRefs(eff.intensityExpr, `/effects/${eff.id}/intensityExpr`);
    checkRefs(eff.speedExpr, `/effects/${eff.id}/speedExpr`);
  }
  for (const beh of project.behaviours) checkRefs(beh.expression, `/behaviours/${beh.id}/expression`);

  // 6. Chapter integrity
  for (const ch of project.chapters) {
    for (const cid of [...(ch.visibleComponentIds ?? []), ...(ch.highlightedComponentIds ?? [])]) {
      if (!componentIds.has(cid)) {
        issues.push({
          code: 'BROKEN_CHAPTER_COMPONENT',
          severity: 'warning',
          path: `/chapters/${ch.id}`,
          message: `Chapter "${ch.title}" references unknown component "${cid}".`,
        });
      }
    }
    for (const pk of Object.keys(ch.parameterOverrides ?? {})) {
      if (!paramIds.has(pk)) {
        issues.push({
          code: 'BROKEN_CHAPTER_PARAM',
          severity: 'warning',
          path: `/chapters/${ch.id}/parameterOverrides/${pk}`,
          message: `Chapter "${ch.title}" overrides unknown parameter "${pk}".`,
        });
      }
    }
  }

  // 7. Spatial sanity: check floating/isolated components & camera framing
  const worldPos = computeWorldPositionMap(project);
  const camPos = project.defaultCamera.position;
  const camTgt = project.defaultCamera.target;
  if (Math.hypot(camPos[0] - camTgt[0], camPos[1] - camTgt[1], camPos[2] - camTgt[2]) < 0.2) {
    issues.push({
      code: 'POOR_CAMERA_FRAMING',
      severity: 'warning',
      path: '/defaultCamera',
      message: 'Default camera position is too close to the camera target.',
    });
  }

  // Informational overlap check for non-nested opaque siblings
  const boundsList = project.components
    .filter((c) => c.geometry && c.layer !== 'fluid')
    .map((c) => {
      const wp = worldPos[c.id];
      const lb = estimateGeometryLocalBounds(c);
      return {
        comp: c,
        min: [wp[0] + lb.min[0], wp[1] + lb.min[1], wp[2] + lb.min[2]],
        max: [wp[0] + lb.max[0], wp[1] + lb.max[1], wp[2] + lb.max[2]],
      };
    });

  if (boundsList.length > 1) {
    // Check if any component is completely detached very far from assembly centroid
    const avgX = boundsList.reduce((s, b) => s + (b.min[0] + b.max[0]) / 2, 0) / boundsList.length;
    const avgY = boundsList.reduce((s, b) => s + (b.min[1] + b.max[1]) / 2, 0) / boundsList.length;
    const avgZ = boundsList.reduce((s, b) => s + (b.min[2] + b.max[2]) / 2, 0) / boundsList.length;
    for (const b of boundsList) {
      const cx = (b.min[0] + b.max[0]) / 2;
      const cy = (b.min[1] + b.max[1]) / 2;
      const cz = (b.min[2] + b.max[2]) / 2;
      if (Math.hypot(cx - avgX, cy - avgY, cz - avgZ) > 25) {
        issues.push({
          code: 'FAR_FLOATING_COMPONENT',
          severity: 'warning',
          path: `/components/${b.comp.id}/transform`,
          componentId: b.comp.id,
          message: `Component "${b.comp.name}" is positioned unusually far from the main assembly.`,
        });
      }
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;
  const withEvidence = project.components.filter((c) => Boolean(c.evidence?.classification)).length;

  return {
    valid: errorCount === 0,
    errorCount,
    warningCount,
    infoCount,
    issues,
    stats: {
      componentCount: project.components.length,
      relationshipCount: project.relationships.length,
      effectCount: project.effects.length,
      chapterCount: project.chapters.length,
      parameterCount: project.parameters.length,
      evidenceCoverage: project.components.length > 0 ? withEvidence / project.components.length : 1,
    },
  };
}

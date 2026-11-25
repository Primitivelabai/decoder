/**
 * Decoder SDK
 * Allows external tools and scripts to create,
 * validate, inspect, simulate, illustrate, and package Decoder exhibits without UI dependencies.
 */

import { exportOBJ, exportSTEP, exportSTL, exportSVG, packageStandaloneHtml } from '../engine/exporters';
import { GeometryKernel, computeSceneDiagnostics } from '../engine/geometry';
import { generateTechnicalIllustrationSVG, type IllustrationOptions } from '../engine/illustration';
import { traceComponentRelationships } from '../engine/relationships';
import { DecoderRuntime } from '../engine/runtime';
import { DECODER_JSON_SCHEMA, createProjectTemplate } from '../engine/schema';
import { buildExplosionPlan, computeModelBounds } from '../engine/spatial';
import type { DecoderProject, EvaluatedSimulationState, SceneDiagnostics, ValidationReport } from '../engine/types';
import { validateProject } from '../engine/validator';

export const GEOMETRY_VOCABULARY = [
  'box',
  'rounded_box',
  'cylinder',
  'tapered_cylinder',
  'sphere',
  'ellipsoid',
  'cone',
  'torus',
  'tube',
  'hollow_vessel',
  'dome',
  'extrude',
  'revolve',
  'loft',
  'sweep',
  'thin_shell',
  'rib',
  'gear',
  'thread',
  'spring',
  'bearing',
  'pipe_network',
  'flexible_hose',
  'layered_surface',
  'branching_structure',
  'custom_mesh',
  'instanced',
  // Parameterized domain generators
  'piston_cylinder',
  'gear_train',
  'pump_unit',
  'electric_motor',
  'circuit_board',
  'heat_exchanger',
  'hydraulic_manifold',
  'vascular_branch',
  'molecular_lattice',
  'processor_die',
] as const;

export const MATERIAL_PRESETS = [
  'polished_metal',
  'brushed_steel',
  'cast_aluminium',
  'brass',
  'copper',
  'chrome',
  'ceramic',
  'glass',
  'translucent_plastic',
  'rubber',
  'painted_surface',
  'carbon_fibre',
  'wood',
  'stone',
  'organic_tissue',
  'semiconductor',
  'water_fluid',
] as const;

export const EFFECT_TYPES = [
  'liquid_flow',
  'steam_vapour',
  'smoke',
  'combustion',
  'heat_gradient',
  'thermal_diffusion',
  'electrical_current',
  'electromagnetic_field',
  'signal_pulse',
  'pressure_wave',
  'particles',
  'airflow',
  'magnetic_field',
  'optical_ray',
  'material_transport',
  'chemical_gradient',
  'cellular_activity',
] as const;

export class DecoderSDK {
  private readonly kernel = new GeometryKernel();

  getSchema() {
    return DECODER_JSON_SCHEMA;
  }

  initProject(id: string, title: string): DecoderProject {
    return createProjectTemplate(id, title);
  }

  validate(project: DecoderProject): ValidationReport {
    return validateProject(project);
  }

  inspect(project: DecoderProject): {
    validation: ValidationReport;
    diagnostics: SceneDiagnostics;
    bounds: ReturnType<typeof computeModelBounds>;
    disassemblyOrder: string[];
    subsystems: string[];
  } {
    const validation = validateProject(project);
    const diagnostics = computeSceneDiagnostics(project, this.kernel);
    const bounds = computeModelBounds(project);
    const plan = buildExplosionPlan(project);
    return {
      validation,
      diagnostics,
      bounds,
      disassemblyOrder: plan.order,
      subsystems: Object.keys(plan.subsystems),
    };
  }

  simulateStep(
    project: DecoderProject,
    timeSec: number,
    parameterOverrides: Record<string, number | boolean | string> = {},
  ): EvaluatedSimulationState {
    const runtime = new DecoderRuntime(project);
    const params = { ...runtime.getDefaultParameters(), ...parameterOverrides };
    return runtime.evaluate(timeSec, params);
  }

  traceRelationships(project: DecoderProject, componentId: string) {
    return traceComponentRelationships(project, componentId);
  }

  renderIllustrationSVG(project: DecoderProject, options: IllustrationOptions): string {
    return generateTechnicalIllustrationSVG(project, this.kernel, options);
  }

  exportFormat(project: DecoderProject, format: 'json' | 'svg' | 'obj' | 'stl' | 'step' | 'html'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(project, null, 2);
      case 'svg':
        return exportSVG(project, this.kernel);
      case 'obj':
        return exportOBJ(project, this.kernel);
      case 'stl':
        return exportSTL(project, this.kernel);
      case 'step':
        return exportSTEP(project, this.kernel);
      case 'html':
        return packageStandaloneHtml(project, this.kernel);
    }
  }

  dispose(): void {
    this.kernel.dispose();
  }
}

export * from '../engine/types';
export { validateProject } from '../engine/validator';
export { DECODER_JSON_SCHEMA, createProjectTemplate } from '../engine/schema';
export { evaluateExpression, validateExpressionSyntax } from '../engine/expressions';

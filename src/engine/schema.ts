import Ajv, { type ValidateFunction } from 'ajv';
import type { DecoderProject } from './types';

export const DECODER_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'DecoderProject',
  type: 'object',
  required: [
    'schemaVersion',
    'id',
    'title',
    'subtitle',
    'category',
    'unit',
    'summary',
    'lightingPreset',
    'defaultCamera',
    'materials',
    'components',
    'relationships',
    'effects',
    'simulation',
    'behaviours',
    'parameters',
    'chapters',
    'annotations',
    'evidenceSummary',
  ],
  additionalProperties: true,
  properties: {
    schemaVersion: { type: 'string', enum: ['1.0.0'] },
    id: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    subtitle: { type: 'string' },
    shortTitle: { type: 'string', minLength: 1 },
    shortSubtitle: { type: 'string' },
    subsystemLabels: { type: 'object', additionalProperties: { type: 'string', minLength: 1 } },
    category: {
      type: 'string',
      enum: ['mechanical', 'biological', 'optical', 'electronic', 'fluid', 'everyday'],
    },
    unit: { type: 'string', minLength: 1 },
    summary: { type: 'string' },
    lightingPreset: {
      type: 'string',
      enum: [
        'technical_studio',
        'museum_exhibit',
        'photographic_product',
        'clinical_illustration',
        'dark_lab',
        'white_engineering',
      ],
    },
    defaultCamera: {
      type: 'object',
      required: ['position', 'target'],
      properties: {
        position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
        target: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
        fov: { type: 'number', minimum: 10, maximum: 120 },
      },
    },
    materials: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'preset'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          preset: { type: 'string', minLength: 1 },
        },
      },
    },
    components: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'name', 'description', 'evidence'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          shortName: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          parentId: { type: ['string', 'null'] },
          materialId: { type: 'string' },
          evidence: {
            type: 'object',
            required: ['classification'],
            properties: {
              classification: {
                type: 'string',
                enum: ['observed', 'documented', 'inferred', 'illustrative', 'unknown'],
              },
            },
          },
        },
      },
    },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'type', 'sourceId', 'targetId', 'label', 'evidence'],
        properties: {
          id: { type: 'string', minLength: 1 },
          type: { type: 'string', minLength: 1 },
          sourceId: { type: 'string', minLength: 1 },
          targetId: { type: 'string', minLength: 1 },
          label: { type: 'string' },
        },
      },
    },
    effects: { type: 'array' },
    simulation: {
      type: 'object',
      required: ['level', 'cycleDuration', 'loop', 'assumptions', 'variables', 'outputs'],
      properties: {
        level: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
        cycleDuration: { type: 'number', exclusiveMinimum: 0 },
        loop: { type: 'boolean' },
        assumptions: { type: 'array', items: { type: 'string' } },
        variables: { type: 'object' },
        outputs: { type: 'array' },
      },
    },
    behaviours: { type: 'array' },
    parameters: { type: 'array' },
    chapters: { type: 'array' },
    annotations: { type: 'array' },
    evidenceSummary: {
      type: 'object',
      required: ['classification'],
    },
  },
} as const;

let compiledValidator: ValidateFunction | null = null;

export function getSchemaValidator(): ValidateFunction {
  if (!compiledValidator) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    compiledValidator = ajv.compile(DECODER_JSON_SCHEMA);
  }
  return compiledValidator;
}

export function validateSchema(project: unknown): Array<{ path: string; message: string }> {
  const validate = getSchemaValidator();
  const valid = validate(project);
  if (valid || !validate.errors) {
    return [];
  }
  return validate.errors.map((err) => ({
    path: err.instancePath || '/',
    message: `${err.message ?? 'Schema violation'}${err.params ? ` (${JSON.stringify(err.params)})` : ''}`,
  }));
}

export function createProjectTemplate(id: string, title: string): DecoderProject {
  return {
    schemaVersion: '1.0.0',
    id,
    title,
    subtitle: 'Interactive Procedural System Exhibit',
    category: 'mechanical',
    unit: 'mm',
    summary:
      'A modular Decoder exhibit constructed from parametric geometry, typed relationships, and declarative physics.',
    lightingPreset: 'technical_studio',
    defaultCamera: {
      position: [4.2, 2.8, 5.2],
      target: [0, 0.5, 0],
      fov: 38,
    },
    materials: [
      {
        id: 'mat_steel',
        name: 'Brushed Steel',
        preset: 'brushed_steel',
        color: '#aeb5bf',
        roughness: 0.3,
        metalness: 0.88,
      },
      { id: 'mat_brass', name: 'Machined Brass', preset: 'brass', color: '#d4a84f', roughness: 0.24, metalness: 0.92 },
    ],
    components: [
      {
        id: 'base_housing',
        name: 'Primary Housing',
        description: 'Structural base enclosure supporting internal sub-assemblies.',
        layer: 'casing',
        materialId: 'mat_steel',
        transform: { position: [0, 0.4, 0] },
        geometry: {
          type: 'rounded_box',
          params: { width: 2.0, height: 0.8, depth: 1.4, radius: 0.08 },
        },
        disassembly: { direction: [0, -1, 0], distance: 1.2, order: 1, subsystem: 'housing' },
        evidence: {
          classification: 'illustrative',
          assumptions: ['Procedural reference template dimensions'],
          geometryProvenance: 'procedural',
        },
      },
      {
        id: 'drive_rotor',
        name: 'Primary Rotor',
        description: 'Rotating shaft element driven by system torque.',
        parentId: 'base_housing',
        layer: 'internal',
        materialId: 'mat_brass',
        transform: { position: [0, 0.7, 0] },
        geometry: {
          type: 'gear',
          params: { teeth: 18, module: 0.045, thickness: 0.25, boreRadius: 0.14 },
        },
        disassembly: { direction: [0, 1, 0], distance: 1.4, order: 2, subsystem: 'drive' },
        evidence: {
          classification: 'illustrative',
          assumptions: ['Procedural reference gear; tooth count and module are placeholders to replace'],
          geometryProvenance: 'procedural',
        },
      },
    ],
    relationships: [
      {
        id: 'rel_support',
        type: 'torque',
        sourceId: 'base_housing',
        targetId: 'drive_rotor',
        label: 'Bearing Support & Torque',
        quantityExpr: 'rpm * 0.15',
        unit: 'Nm',
        evidence: {
          classification: 'illustrative',
          assumptions: ['Torque scales linearly with speed for demonstration'],
        },
      },
    ],
    effects: [],
    simulation: {
      level: 'A',
      cycleDuration: 6,
      loop: true,
      assumptions: ['Constant angular velocity illustrative drive'],
      variables: {
        omega: 'rpm * 2 * PI / 60',
        theta: 't * omega',
      },
      outputs: [{ id: 'out_speed', label: 'Rotational Speed', expression: 'rpm', unit: 'rpm', precision: 0 }],
    },
    behaviours: [
      {
        id: 'beh_rotor_spin',
        componentId: 'drive_rotor',
        property: 'rotation_z',
        expression: 'theta',
      },
    ],
    parameters: [
      {
        id: 'rpm',
        label: 'Drive Speed',
        control: 'slider',
        defaultValue: 30,
        min: 0,
        max: 120,
        step: 1,
        unit: 'rpm',
      },
    ],
    chapters: [
      {
        id: 'ch_overview',
        index: 1,
        title: 'System Overview',
        narration: 'Complete assembly showing the structural housing and internal rotor.',
        durationSec: 6,
        camera: { position: [4.2, 2.8, 5.2], target: [0, 0.5, 0], fov: 38 },
        explosion: 0,
        playing: true,
      },
    ],
    annotations: [],
    evidenceSummary: {
      classification: 'illustrative',
      assumptions: ['Initial template ready for domain customization'],
      simulationValidity: 'A',
    },
  };
}

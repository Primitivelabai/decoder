/** Browser entry bundled from the same viewport and simulation engine as Studio. */
import { DecoderViewport } from './renderer';
import type { DecoderProject, ParameterSpec } from './types';

type ParamValue = number | boolean | string;

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const project = JSON.parse(byId('decoder-project-data').textContent || '') as DecoderProject;
const status = byId('status');
const fallback = byId('fallback');
const play = byId<HTMLButtonElement>('play');
const timeline = byId<HTMLInputElement>('timeline');
const explosion = byId<HTMLInputElement>('explosion');
const outputs = byId('outputs');
const partInfo = byId('part');
byId('title').textContent = project.title;

let viewport: DecoderViewport | undefined;
let playing = false;

const setPlaying = (next: boolean) => {
  playing = next;
  play.textContent = playing ? 'Pause' : 'Play';
};

// The renderer pauses itself when the simulation fails.
const fail = (message: string) => {
  status.textContent = message;
  setPlaying(false);
};

function createParameterControl(
  spec: ParameterSpec,
  params: Record<string, ParamValue>,
  vp: DecoderViewport,
): HTMLElement {
  const commit = (value: ParamValue) => {
    params[spec.id] = value;
    vp.setParameters(params);
  };

  if (spec.control === 'select') {
    const select = document.createElement('select');
    for (const [index, option] of (spec.options ?? []).entries()) {
      const el = document.createElement('option');
      el.value = String(index);
      el.textContent = option.label;
      el.selected = option.value === spec.defaultValue;
      select.append(el);
    }
    select.onchange = () => commit(spec.options![Number(select.value)].value);
    return select;
  }

  const input = document.createElement('input');
  if (spec.control === 'switch' || spec.control === 'button') {
    input.type = 'checkbox';
    input.checked = Boolean(spec.defaultValue);
    input.onchange = () => commit(input.checked);
    return input;
  }

  input.type = spec.control === 'slider' ? 'range' : 'number';
  input.value = String(spec.defaultValue);
  if (spec.min !== undefined) input.min = String(spec.min);
  if (spec.max !== undefined) input.max = String(spec.max);
  input.step = String(spec.step ?? 'any');
  input.oninput = () => {
    if (Number.isFinite(input.valueAsNumber)) commit(input.valueAsNumber);
  };
  return input;
}

try {
  timeline.max = String(project.simulation.cycleDuration);
  viewport = new DecoderViewport(byId('viewport'), project, {
    onSimUpdate: (state) => {
      timeline.value = String(state.phase * project.simulation.cycleDuration);
      outputs.replaceChildren(
        ...state.outputs.map((output) => {
          const row = document.createElement('div');
          row.textContent = `${output.label}: ${output.formatted}`;
          return row;
        }),
      );
    },
    onSelectComponent: (id) => {
      const part = project.components.find((component) => component.id === id);
      partInfo.textContent = part ? `${part.name}: ${part.description ?? ''}` : 'Select a component to inspect it.';
    },
    onContextLost: () => {
      fallback.hidden = false;
      fail('Graphics context lost. Showing the technical plate.');
    },
    onContextRestored: () => {
      fallback.hidden = true;
      status.textContent = 'Graphics restored. Press Play to resume.';
    },
    onSimulationError: (message) => fail(message),
  });
  const vp = viewport;
  vp.updateState({ playing: false });
  vp.setTime(0);

  play.disabled = false;
  timeline.disabled = false;
  explosion.disabled = false;

  play.addEventListener('click', () => {
    setPlaying(!playing);
    vp.updateState({ playing });
  });
  timeline.addEventListener('input', () => {
    // Read the target first: pausing emits a simulation update that rewrites the slider.
    const target = Number(timeline.value);
    setPlaying(false);
    vp.updateState({ playing: false });
    vp.setTime(target);
  });
  explosion.addEventListener('input', () => vp.updateState({ explosion: Number(explosion.value) }));

  const params: Record<string, ParamValue> = Object.fromEntries(project.parameters.map((p) => [p.id, p.defaultValue]));
  for (const spec of project.parameters) {
    const label = document.createElement('label');
    label.textContent = `${spec.label} `;
    label.append(createParameterControl(spec, params, vp));
    byId('parameters').append(label);
  }
  status.textContent = 'Local exhibit · no network required';
} catch (error) {
  fallback.hidden = false;
  fail(`3D unavailable: ${error instanceof Error ? error.message : String(error)}`);
}

window.addEventListener('pagehide', () => viewport?.dispose());

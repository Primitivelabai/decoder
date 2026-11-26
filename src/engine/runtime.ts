import { evaluateExpression } from './expressions';
import type { BehaviourBindingKind, DecoderProject, EvaluatedSimulationState, MeasurementUnit } from './types';

export class DecoderRuntime {
  private odeState: Record<string, number> = {};
  private machineState: Record<string, string> = {};
  private lastSimTime = 0;
  private initialized = false;

  constructor(private project: DecoderProject) {
    this.reset();
  }

  setProject(project: DecoderProject): void {
    this.project = project;
    this.reset();
  }

  reset(): void {
    this.odeState = {};
    this.machineState = {};
    this.lastSimTime = 0;
    this.initialized = false;

    for (const ode of this.project.simulation.odes ?? []) {
      this.odeState[ode.variable] = ode.initialValue;
    }
    for (const sm of this.project.simulation.stateMachines ?? []) {
      this.machineState[sm.id] = sm.initialState;
    }
  }

  getDefaultParameters(): Record<string, number | boolean | string> {
    const map: Record<string, number | boolean | string> = {};
    for (const p of this.project.parameters) {
      map[p.id] = p.defaultValue;
    }
    return map;
  }

  private context(time: number, paramValues: Record<string, number | boolean | string>, odeState = this.odeState) {
    const sim = this.project.simulation;
    const cycleDur = Math.max(0.01, sim.cycleDuration || 4);
    const localTime = sim.loop ? ((time % cycleDur) + cycleDur) % cycleDur : Math.min(time, cycleDur);
    const phase = localTime / cycleDur;
    const cycleAngleDeg = phase * 360;

    const vars: Record<string, number> = Object.assign(Object.create(null), {
      t: time,
      localTime,
      phase,
      cycleDuration: cycleDur,
      cycleAngleDeg,
      cycleAngleRad: phase * Math.PI * 2,
      ambientTempC: this.project.environment?.ambientTempC ?? 22,
      gravity: this.project.environment?.gravity ?? 9.81,
    });

    // Inject parameter values as numeric variables
    for (const p of this.project.parameters) {
      const raw = paramValues[p.id] ?? p.defaultValue;
      if (typeof raw === 'number') {
        vars[p.id] = raw;
      } else if (typeof raw === 'boolean') {
        vars[p.id] = raw ? 1 : 0;
      } else {
        const parsed = Number(raw);
        const optionIndex = p.options?.findIndex((option) => option.value === raw) ?? -1;
        vars[p.id] = Number.isFinite(parsed) ? parsed : optionIndex;
        if (!Number.isFinite(parsed) && optionIndex < 0) throw new Error(`Invalid parameter ${p.id}`);
      }
    }

    for (const [key, value] of Object.entries(vars))
      if (!Number.isFinite(value)) throw new Error(`Non-finite parameter or environment value ${key}`);

    // Inject current ODE values
    for (const [k, v] of Object.entries(odeState)) {
      vars[k] = v;
    }

    // Inject state machine state as numeric index & boolean flags (state_<smId>_<stateName>)
    for (const sm of sim.stateMachines ?? []) {
      const active = this.machineState[sm.id] ?? sm.initialState;
      vars[`state_${sm.id}`] = Math.max(0, sm.states.indexOf(active));
      for (const s of sm.states) {
        vars[`is_${sm.id}_${s}`] = active === s ? 1 : 0;
      }
    }

    const ctx = { vars, tables: sim.lookupTables };

    // Evaluate simulation variables in declaration order
    for (const [varName, expr] of Object.entries(sim.variables)) {
      vars[varName] = evaluateExpression(expr, ctx);
    }

    return { vars, tables: sim.lookupTables };
  }

  /** Integrate against simulation time, never wall-clock time. Coupled midpoint RK2. */
  evaluate(
    time: number,
    paramValues: Record<string, number | boolean | string>,
    _legacyDtOverride?: number,
  ): EvaluatedSimulationState {
    if (!Number.isFinite(time) || time < 0) throw new Error('Simulation time must be finite and non-negative');
    const sim = this.project.simulation;
    const odes = sim.odes ?? [];
    const machines = sim.stateMachines ?? [];
    if (time < this.lastSimTime) this.reset();
    const transition = (at: number) => {
      const ctx = this.context(at, paramValues);
      const next = { ...this.machineState };
      for (const sm of machines) {
        const current = this.machineState[sm.id];
        for (const tr of sm.transitions) {
          if ((tr.from === current || tr.from === '*') && evaluateExpression(tr.condition, ctx) !== 0) {
            next[sm.id] = tr.to;
            break;
          }
        }
      }
      this.machineState = next;
    };
    if (odes.length || machines.length) {
      const count = Math.ceil((time - this.lastSimTime) / (1 / 120));
      if (count > 120000)
        throw new Error('Simulation seek exceeds 1000-second integration budget; advance in smaller intervals');
      if (!this.initialized) {
        transition(this.lastSimTime);
        this.initialized = true;
      }
      for (let i = 0; i < count; i++) {
        const at = this.lastSimTime;
        const h = Math.min(1 / 120, time - at);
        const c1 = this.context(at, paramValues);
        const mid = { ...this.odeState };
        for (const ode of odes)
          mid[ode.variable] = this.odeState[ode.variable] + (h / 2) * evaluateExpression(ode.derivativeExpr, c1);
        const c2 = this.context(at + h / 2, paramValues, mid);
        const next = { ...this.odeState };
        for (const ode of odes) {
          let value = this.odeState[ode.variable] + h * evaluateExpression(ode.derivativeExpr, c2);
          if (!Number.isFinite(value)) throw new Error(`Non-finite ODE ${ode.variable}`);
          if (ode.min !== undefined) value = Math.max(ode.min, value);
          if (ode.max !== undefined) value = Math.min(ode.max, value);
          next[ode.variable] = value;
        }
        this.odeState = next;
        this.lastSimTime = i === count - 1 ? time : at + h;
        transition(this.lastSimTime);
      }
    }
    this.lastSimTime = time;
    const ctx = this.context(time, paramValues);
    const vars = ctx.vars;
    const { phase, cycleAngleDeg } = vars;

    // Evaluate outputs
    const outputs = sim.outputs.map((out) => {
      const val = evaluateExpression(out.expression, ctx);
      const prec = out.precision ?? 2;
      return {
        id: out.id,
        label: out.label,
        value: val,
        unit: out.unit as MeasurementUnit,
        formatted:
          out.unit === '%'
            ? `${val.toFixed(prec)}%`
            : `${val.toFixed(prec)} ${out.unit === 'unitless' ? '' : out.unit}`.trim(),
      };
    });

    // Evaluate behaviour bindings
    const transforms: Record<string, Partial<Record<BehaviourBindingKind, number>>> = {};
    for (const b of this.project.behaviours) {
      if (!transforms[b.componentId]) transforms[b.componentId] = {};
      transforms[b.componentId][b.property] = evaluateExpression(b.expression, ctx);
    }

    // Evaluate relationship activity
    const relationshipActivity: Record<string, { active: boolean; quantity: number }> = {};
    for (const rel of this.project.relationships) {
      const active = rel.activeExpr ? evaluateExpression(rel.activeExpr, ctx) !== 0 : true;
      const quantity = rel.quantityExpr ? evaluateExpression(rel.quantityExpr, ctx) : 1;
      relationshipActivity[rel.id] = { active, quantity };
    }

    // Evaluate effect states
    const effectStates: Record<string, { intensity: number; speed: number }> = {};
    for (const eff of this.project.effects) {
      const intensity = eff.intensityExpr ? evaluateExpression(eff.intensityExpr, ctx) : 1;
      const speed = eff.speedExpr ? evaluateExpression(eff.speedExpr, ctx) : 1;
      effectStates[eff.id] = {
        intensity: Math.max(0, intensity),
        speed,
      };
    }

    return {
      time,
      phase,
      cycleAngleDeg,
      variables: vars,
      states: { ...this.machineState },
      outputs,
      transforms,
      relationshipActivity,
      effectStates,
    };
  }
}

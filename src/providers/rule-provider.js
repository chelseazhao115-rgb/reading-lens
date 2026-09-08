import { diagnose as ruleDiagnose } from '../diagnostic-engine.js';

export const ruleProvider = Object.freeze({
  id: 'rule-baseline',
  promptVersion: 'none',
  promptHash: null,
  modelVersion: 'deterministic-v3-contextual-strategy-signals',
  async diagnose(input) {
    return ruleDiagnose(input);
  }
});

const { renderLeanValueTree } = require('./renderers/leanValueTree');
const { renderProcessFlow } = require('./renderers/processFlow');
const { renderProjectPlan } = require('./renderers/projectPlan');
const { renderRiskMatrix } = require('./renderers/riskMatrix');
const { renderPlanningOnion } = require('./renderers/planningOnion');
const { renderTestingApproach } = require('./renderers/testingApproach');
const { renderIntegratedDesign } = require('./renderers/integratedDesign');

module.exports = {
  'lean-value-tree': renderLeanValueTree,
  'process-flow': renderProcessFlow,
  'project-plan': renderProjectPlan,
  'risk-matrix': renderRiskMatrix,
  'planning-onion': renderPlanningOnion,
  'testing-approach': renderTestingApproach,
  'integrated-design': renderIntegratedDesign,
};

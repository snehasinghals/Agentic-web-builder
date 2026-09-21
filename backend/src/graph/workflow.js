const path = require('path');
const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { runBuilderAgent } = require('../agents/builder');
const { runCriticAgent } = require('../agents/critic');
const { runFixerAgent } = require('../agents/fixer');
const { startPreview, triggerReload } = require('../services/previewServer');
const { getSiteIndexPath } = require('../config/paths');

// Global event bus for streaming UI status updates
let eventEmitter = null;
function setWorkflowEventEmitter(emitter) {
  eventEmitter = emitter;
}

function broadcastEvent(type, data) {
  if (eventEmitter) {
    try {
      eventEmitter.emit('workflow_event', { type, timestamp: Date.now(), data });
    } catch (e) {
      console.warn('[Workflow Event Emitter Error]', e.message);
    }
  }
}

// 1. Define the shared state schema
const AgentState = Annotation.Root({
  prompt: Annotation(),
  siteName: Annotation(),
  filePath: Annotation(),
  screenshotPath: Annotation(),
  previewUrl: Annotation(),
  report: Annotation(),
  stack: Annotation({
    reducer: (curr, update) => (update !== undefined ? update : curr),
    default: () => 'react-tailwind-cdn'
  }),
  iteration: Annotation({
    reducer: (curr, update) => (update !== undefined ? update : curr),
    default: () => 0
  }),
  maxIterations: Annotation({
    reducer: (curr, update) => (update !== undefined ? update : curr),
    default: () => 2
  }),
  status: Annotation()
});

// 2. Node: Builder Agent
async function builderNode(state) {
  console.log(`\n======================================================`);
  console.log(`[LangGraph Node: Builder] Generating initial website (stack: ${state.stack})...`);
  console.log(`======================================================`);

  broadcastEvent('node_start', { node: 'builder', message: 'Generating initial website...' });

  const result = await runBuilderAgent(state.siteName, state.prompt, state.stack);
  const filePath = getSiteIndexPath(state.siteName);

  // Start live preview server without forcing a pop-up browser if UI is active
  const preview = await startPreview(state.siteName, false);

  broadcastEvent('node_end', {
    node: 'builder',
    message: 'Initial website generated',
    previewUrl: preview.url,
    siteName: state.siteName
  });

  return {
    filePath,
    previewUrl: preview.url,
    status: 'built'
  };
}

// 3. Node: Critic Agent
async function criticNode(state) {
  if (state.iteration > 0) {
    console.log(`[Pacing] Waiting 6 seconds for token quota to reset...`);
    broadcastEvent('pacing', { message: 'Waiting 6 seconds for token quota reset...' });
    await new Promise(r => setTimeout(r, 6000));
  } else {
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n======================================================`);
  console.log(`[LangGraph Node: Critic] Auditing site (Loop ${state.iteration + 1}/${state.maxIterations})...`);
  console.log(`======================================================`);

  broadcastEvent('node_start', {
    node: 'critic',
    iteration: state.iteration + 1,
    maxIterations: state.maxIterations,
    message: `Auditing site (Loop ${state.iteration + 1}/${state.maxIterations})...`
  });

  const criticResult = await runCriticAgent(state.siteName);
  const scores = criticResult.report?.scores || {};
  console.log(`[Critic Node] Audit scores:`, scores);
  if ((criticResult.report?.runtimeErrors || []).length > 0) {
    console.warn(`[Critic Node] Runtime errors found:`, criticResult.report.runtimeErrors);
  }

  broadcastEvent('audit_scores', {
    scores,
    issues: criticResult.report?.issues || [],
    runtimeErrors: criticResult.report?.runtimeErrors || [],
    iteration: state.iteration + 1
  });

  return {
    report: criticResult.report,
    status: 'critiqued'
  };
}

// 4. Conditional Edge: Router
function shouldContinue(state) {
  const iteration = state.iteration || 0;
  const maxIterations = state.maxIterations || 2;
  const report = state.report || {};
  const scores = report.scores || {};

  const passed = report.passed === true;
  const allScoresHigh =
    (scores.performance || 0) >= 85 &&
    (scores.accessibility || 0) >= 85 &&
    (scores.bestPractices || 0) >= 85 &&
    (scores.seo || 0) >= 85;

  const noRuntimeErrors = (!report.runtimeErrors || report.runtimeErrors.length === 0);

  if ((passed || allScoresHigh) && noRuntimeErrors) {
    console.log(`\n🎉 [LangGraph Router] Quality threshold met! Completing workflow.`);
    broadcastEvent('workflow_completed', {
      reason: 'Quality threshold met (All scores >= 85 & 0 errors)',
      scores
    });
    return END;
  }

  if (iteration >= maxIterations) {
    console.log(`\n⚠️ [LangGraph Router] Maximum iterations (${maxIterations}) reached. Completing workflow.`);
    broadcastEvent('workflow_completed', {
      reason: `Maximum iterations (${maxIterations}) reached`,
      scores
    });
    return END;
  }

  console.log(`\n🔄 [LangGraph Router] Scores below target or issues detected. Routing to Fixer Agent...`);
  broadcastEvent('route_fixer', {
    message: 'Routing to Fixer Agent to resolve detected issues...',
    issuesCount: (report.issues || []).length
  });
  return 'fixer';
}

// 5. Node: Fixer Agent
async function fixerNode(state) {
  const nextIteration = (state.iteration || 0) + 1;
  console.log(`\n======================================================`);
  console.log(`[LangGraph Node: Fixer] Repairing site issues (Iteration ${nextIteration})...`);
  console.log(`======================================================`);

  broadcastEvent('node_start', {
    node: 'fixer',
    iteration: nextIteration,
    message: `Repairing site issues (Iteration ${nextIteration})...`
  });

  const issues = state.report?.issues || [];
  const runtimeErrors = state.report?.runtimeErrors || [];

  await runFixerAgent(state.siteName, issues, runtimeErrors, state.stack);

  // Trigger live preview reload so connected clients refresh
  triggerReload();

  broadcastEvent('site_reloaded', {
    message: 'Site updated and reloaded in preview iframe',
    iteration: nextIteration
  });

  return {
    iteration: nextIteration,
    status: 'fixed'
  };
}

// 6. Build and Compile the Graph
const workflow = new StateGraph(AgentState)
  .addNode('builder', builderNode)
  .addNode('critic', criticNode)
  .addNode('fixer', fixerNode)
  .addEdge(START, 'builder')
  .addEdge('builder', 'critic')
  .addConditionalEdges('critic', shouldContinue, ['fixer', END])
  .addEdge('fixer', 'critic');

const app = workflow.compile();

module.exports = { app, workflow, setWorkflowEventEmitter };
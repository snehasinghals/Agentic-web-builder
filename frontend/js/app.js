// DOM Elements
const promptInput = document.getElementById('promptInput');
const lblPromptInput = document.getElementById('lblPromptInput');
const siteNameInput = document.getElementById('siteNameInput');
const maxIterationsInput = document.getElementById('maxIterationsInput');
const iterationsCol = document.getElementById('iterationsCol');
const stackSelect = document.getElementById('stackSelect');
const stackConfigRow = document.getElementById('stackConfigRow');
const stackHint = document.getElementById('stackHint');
const btnGenerate = document.getElementById('btnGenerate');
const btnSpinner = btnGenerate.querySelector('.btn-spinner');
const btnText = btnGenerate.querySelector('.btn-text');

const postGenChoiceBanner = document.getElementById('postGenChoiceBanner');
const btnChoiceModify = document.getElementById('btnChoiceModify');
const btnChoiceNew = document.getElementById('btnChoiceNew');
const btnChoiceDeploy = document.getElementById('btnChoiceDeploy');
const deployStatus = document.getElementById('deployStatus');

const modeBadge = document.getElementById('modeBadge');
const modeText = document.getElementById('modeText');
const activeSiteTarget = document.getElementById('activeSiteTarget');

const pipelineStatusBadge = document.getElementById('pipelineStatusBadge');
const stepBuilder = document.getElementById('stepBuilder');
const subBuilder = document.getElementById('subBuilder');
const stepCritic = document.getElementById('stepCritic');
const subCritic = document.getElementById('subCritic');
const stepFixer = document.getElementById('stepFixer');
const subFixer = document.getElementById('subFixer');
const stepModifier = document.getElementById('stepModifier');
const subModifier = document.getElementById('subModifier');

const activityFeed = document.getElementById('activityFeed');
const btnClearLogs = document.getElementById('btnClearLogs');

const previewIframe = document.getElementById('previewIframe');
const previewUrlDisplay = document.getElementById('previewUrlDisplay');
const btnRefreshPreview = document.getElementById('btnRefreshPreview');
const btnExternalPreview = document.getElementById('btnExternalPreview');
const deviceFrame = document.getElementById('deviceFrame');
const frameTitle = document.getElementById('frameTitle');

const cardPerformance = document.getElementById('cardPerformance');
const valPerf = document.getElementById('valPerf');
const barPerf = document.getElementById('barPerf');

const cardAccessibility = document.getElementById('cardAccessibility');
const valA11y = document.getElementById('valA11y');
const barA11y = document.getElementById('barA11y');

const cardBestPractices = document.getElementById('cardBestPractices');
const valBP = document.getElementById('valBP');
const barBP = document.getElementById('barBP');

const cardSeo = document.getElementById('cardSeo');
const valSeo = document.getElementById('valSeo');
const barSeo = document.getElementById('barSeo');

const issuesList = document.getElementById('issuesList');

// Code editor (editable)
const codeEditor = document.getElementById('codeEditor');
const codeSiteName = document.getElementById('codeSiteName');
const btnCopyCode = document.getElementById('btnCopyCode');
const btnSaveCode = document.getElementById('btnSaveCode');
const btnResetCode = document.getElementById('btnResetCode');
const codeStatus = document.getElementById('codeStatus');

// Engagement Overlays (Idle / Build / Refine)
const idleOverlay = document.getElementById('idleOverlay');
const buildOverlay = document.getElementById('buildOverlay');
const buildHeadline = document.getElementById('buildHeadline');
const buildStatusText = document.getElementById('buildStatusText');
const buildTerminalBody = document.getElementById('buildTerminalBody');
const buildProgressSteps = document.querySelectorAll('.build-progress-step');

const refineOverlay = document.getElementById('refineOverlay');
const refineText = document.getElementById('refineText');

let buildStatusInterval = null;
let terminalTypeTimeout = null;

// Application State
let currentSite = 'site1';
let isGenerating = false;
let appMode = 'create'; // 'create' | 'modify'
let hasGeneratedOnce = false;

// Code editor state
let savedCode = '';     // last code loaded from / saved to the server
let codeDirty = false;  // true when the editor has unsaved changes

// ---------------------------------------------------------------------------
// Stack Selector — plain-language descriptions for non-developers
// ---------------------------------------------------------------------------
const STACK_DESCRIPTIONS = {
  'html-css-js': 'Interactive site with plain HTML, CSS and JavaScript. Great for landing pages, portfolios and contact forms.',
  'html-tailwind': 'Same interactive site, but styled with Tailwind CSS — a popular design system that gives a modern "SaaS" look.',
  'react-cdn': 'Built as reusable React components. Best for pages with lots of moving parts — tabs, live counters, small dashboards.',
  'react-tailwind-cdn': 'React components styled with Tailwind CSS — a modern, app-like look with component-based structure.'
};

// ---------------------------------------------------------------------------
// Engagement Overlay Content
// ---------------------------------------------------------------------------
const BUILD_STATUS_MESSAGES = [
  'Designing your layout…',
  'Picking a beautiful color scheme…',
  'Writing clean, modern code…',
  'Styling buttons, cards & sections…',
  'Adding smooth interactions…',
  'Polishing the final details…'
];

const BUILD_TERMINAL_LINES = [
  '> building header, hero & navigation…',
  '> composing feature sections…',
  '> applying responsive design…',
  '> setting up custom color scheme…',
  '> adding hover effects & animations…',
  '> optimizing for all screen sizes…'
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupDeviceSwitcher();
  setupChoiceBanner();
  setupSSE();
  setupCodeEditor();
  setupStackSelector();

  // Show a friendly idle state instead of pointing the iframe at a
  // not-yet-existing site. Real preview URL is only loaded into the
  // iframe once the first generation actually completes.
  const initialSite = siteNameInput.value.trim() || 'site1';
  currentSite = initialSite;
  activeSiteTarget.textContent = `Project: ${initialSite}`;
  previewUrlDisplay.value = `http://localhost:3456/${initialSite}/`;
  btnExternalPreview.href = previewUrlDisplay.value;
  frameTitle.textContent = `${initialSite} • Live Preview`;
  showIdleOverlay();
});

// Stack Selector — update hint text as user picks a stack
function setupStackSelector() {
  if (!stackSelect) return;
  stackSelect.addEventListener('change', () => {
    stackHint.textContent = STACK_DESCRIPTIONS[stackSelect.value] || '';
  });
}

// Tab Switcher
function setupTabs() {
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = `pane-${tab.dataset.tab}`;
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');

      // Don't overwrite the user's unsaved edits when switching tabs
      if (tab.dataset.tab === 'code' && !codeDirty && hasGeneratedOnce) {
        fetchSiteCode(currentSite);
      }

      // Click-to-code is only active while the code tab is open
      syncInspectMode();
    });
  });
}

// Device Switcher
function setupDeviceSwitcher() {
  document.querySelectorAll('.device-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const device = btn.dataset.device;
      deviceFrame.className = `device-frame ${device}`;
      frameTitle.textContent = `${currentSite} • ${device.toUpperCase()} View`;
    });
  });
}

// Setup Post-Generation Choice Banner
function setupChoiceBanner() {
  btnChoiceModify.addEventListener('click', () => {
    setMode('modify');
  });

  btnChoiceNew.addEventListener('click', () => {
    setMode('create');
  });

  if (btnChoiceDeploy) {
    btnChoiceDeploy.addEventListener('click', () => {
      deployCurrentSiteToVercel();
    });
  }
}

// Switch between 'create' and 'modify' mode
function setMode(mode) {
  appMode = mode;

  if (deployStatus) {
    deployStatus.classList.add('hidden');
    deployStatus.innerHTML = '';
  }

  if (mode === 'modify') {
    btnChoiceModify.classList.add('active');
    btnChoiceNew.classList.remove('active');

    modeBadge.className = 'mode-badge modify-mode';
    modeText.textContent = 'Edit Mode';
    activeSiteTarget.textContent = `Project: ${currentSite}`;

    lblPromptInput.innerHTML = '<span class="label-icon">✏️</span><span>Describe Your Edits for "' + currentSite + '"</span>';
    promptInput.placeholder = 'Describe the changes you want to make...';
    promptInput.value = '';

    btnText.textContent = 'Apply Changes';
    iterationsCol.style.display = 'none';
    if (stackConfigRow) stackConfigRow.style.display = 'none';

    showPipelineStep('modifier');
    logActivity('system', `Switched to Edit Mode for "${currentSite}". Describe your changes above.`);
  } else {
    btnChoiceNew.classList.add('active');
    btnChoiceModify.classList.remove('active');

    modeBadge.className = 'mode-badge';
    modeText.textContent = 'Creation Studio';

    // Auto-suggest next site name e.g. site2
    if (currentSite.startsWith('site')) {
      const num = parseInt(currentSite.replace('site', ''), 10) || 1;
      siteNameInput.value = `site${num + 1}`;
    } else {
      siteNameInput.value = `${currentSite}_new`;
    }
    currentSite = siteNameInput.value.trim();
    activeSiteTarget.textContent = `Project: ${currentSite}`;

    lblPromptInput.innerHTML = '<span class="label-icon">🪄</span><span>Describe Your Ideal Website</span>';
    promptInput.placeholder = 'Describe the website you want to build...';
    promptInput.value = '';

    btnText.textContent = 'Generate Website';
    iterationsCol.style.display = 'block';
    if (stackConfigRow) stackConfigRow.style.display = 'flex';

    showPipelineStep('standard');
    logActivity('system', `Starting fresh — new project "${currentSite}".`);

    // Fresh site slot with nothing generated yet — bring back the idle state.
    hasGeneratedOnce = false;
    hideBuildOverlay();
    hideRefineOverlay();
    showIdleOverlay();
    postGenChoiceBanner.classList.remove('visible');
  }
}

function showPipelineStep(type) {
  if (type === 'modifier') {
    stepBuilder.classList.add('hidden');
    stepCritic.classList.add('hidden');
    stepFixer.classList.add('hidden');
    stepModifier.classList.remove('hidden');
    subModifier.textContent = 'Ready to apply your custom edits...';
  } else {
    stepBuilder.classList.remove('hidden');
    stepCritic.classList.remove('hidden');
    stepFixer.classList.remove('hidden');
    stepModifier.classList.add('hidden');
    subBuilder.textContent = 'Ready to generate structure & copy';
    subCritic.textContent = 'Testing mobile layout & accessibility';
    subFixer.textContent = 'Refining visuals, contrast & styles';
  }
}

// Preview Toolbar
btnRefreshPreview.addEventListener('click', () => {
  if (previewIframe.src) {
    previewIframe.src = previewIframe.src;
    logActivity('system', 'Preview reloaded manually');
  }
});

function updatePreviewUrl(siteName) {
  currentSite = siteName;
  activeSiteTarget.textContent = `Project: ${siteName}`;
  const url = `http://localhost:3456/${siteName}/`;
  previewUrlDisplay.value = url;
  btnExternalPreview.href = url;
  previewIframe.src = url;
  frameTitle.textContent = `${siteName} • Live Preview`;
}

// Activity Logging
function logActivity(agent, message) {
  const item = document.createElement('div');
  item.className = `activity-item ${agent}`;

  const timeSpan = document.createElement('span');
  timeSpan.className = 'time';
  const now = new Date();
  timeSpan.textContent = now.toTimeString().split(' ')[0];

  const msgSpan = document.createElement('span');
  msgSpan.className = 'msg';
  msgSpan.textContent = `[${agent.toUpperCase()}] ${message}`;

  item.appendChild(timeSpan);
  item.appendChild(msgSpan);
  activityFeed.appendChild(item);
  activityFeed.scrollTop = activityFeed.scrollHeight;
}

btnClearLogs.addEventListener('click', () => {
  activityFeed.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Engagement Overlay Helpers (Idle / Build / Refine)
// ---------------------------------------------------------------------------

function showIdleOverlay() {
  idleOverlay.classList.remove('hidden');
}

function hideIdleOverlay() {
  idleOverlay.classList.add('hidden');
}

function showBuildOverlay(headline) {
  hideIdleOverlay();
  refineOverlay.classList.add('hidden');
  buildOverlay.classList.remove('hidden');
  buildHeadline.textContent = headline || 'Spinning up your website';
  setBuildProgress('plan');
  startBuildStatusCycle();
}

function hideBuildOverlay() {
  buildOverlay.classList.add('hidden');
  stopBuildStatusCycle();
}

function startBuildStatusCycle() {
  stopBuildStatusCycle();
  let i = 0;
  typeTerminalLine(BUILD_TERMINAL_LINES[0]);
  const stepOrder = ['plan', 'markup', 'style', 'polish'];
  buildStatusInterval = setInterval(() => {
    i = (i + 1) % BUILD_STATUS_MESSAGES.length;
    buildStatusText.textContent = BUILD_STATUS_MESSAGES[i];
    typeTerminalLine(BUILD_TERMINAL_LINES[i % BUILD_TERMINAL_LINES.length]);
    setBuildProgress(stepOrder[i % stepOrder.length]);
  }, 1800);
}

function stopBuildStatusCycle() {
  if (buildStatusInterval) clearInterval(buildStatusInterval);
  if (terminalTypeTimeout) clearTimeout(terminalTypeTimeout);
  buildStatusInterval = null;
  terminalTypeTimeout = null;
}

function typeTerminalLine(line) {
  if (terminalTypeTimeout) clearTimeout(terminalTypeTimeout);
  let idx = 0;
  function typeChar() {
    const cursor = document.createElement('span');
    cursor.className = 'type-cursor';
    buildTerminalBody.textContent = line.slice(0, idx);
    buildTerminalBody.appendChild(cursor);
    if (idx <= line.length) {
      idx++;
      terminalTypeTimeout = setTimeout(typeChar, 18);
    }
  }
  typeChar();
}

function setBuildProgress(activeKey) {
  const order = ['plan', 'markup', 'style', 'polish'];
  const activeIdx = order.indexOf(activeKey);
  buildProgressSteps.forEach(step => {
    const idx = order.indexOf(step.dataset.key);
    step.classList.remove('active', 'done');
    if (idx < activeIdx) step.classList.add('done');
    else if (idx === activeIdx) step.classList.add('active');
  });
}

function showRefineOverlay(text) {
  hideIdleOverlay();
  buildOverlay.classList.add('hidden');
  stopBuildStatusCycle();
  refineOverlay.classList.remove('hidden');
  refineText.textContent = text || 'Auditing your site…';
}

function updateRefineText(text) {
  refineText.textContent = text;
}

function hideRefineOverlay() {
  refineOverlay.classList.add('hidden');
}

// Real-Time Server-Sent Events (SSE)
function setupSSE() {
  const evtSource = new EventSource('/api/stream');

  evtSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      handleWorkflowEvent(payload.type, payload.data);
    } catch (e) {
      console.warn('SSE Parse error', e);
    }
  };

  evtSource.onerror = () => {
    setTimeout(setupSSE, 3000);
  };
}

function handleWorkflowEvent(type, data) {
  switch (type) {
    case 'connected':
      logActivity('system', 'Connected to real-time agent stream');
      break;

    case 'workflow_started':
      setGenerationRunning(true);
      resetPipeline();
      // Overlay is already shown optimistically on click; this keeps it in
      // sync in case the server confirms with a different headline/site.
      showBuildOverlay('Crafting Your Website');
      logActivity('system', `Building your new website "${data.siteName}"…`);
      break;

    case 'modification_started':
      setGenerationRunning(true);
      pipelineStatusBadge.textContent = 'Modifying';
      pipelineStatusBadge.className = 'status-pill active';
      stepModifier.className = 'pipe-step running';
      subModifier.textContent = 'Applying targeted edits...';
      showRefineOverlay('Applying your modifications…');
      logActivity('fixer', `Applying modifications to "${data.siteName}": "${data.prompt}"`);
      break;

    case 'node_start':
      if (data.node === 'builder') {
        stepBuilder.className = 'pipe-step running';
        subBuilder.textContent = 'Designing your layout & content…';
        logActivity('builder', 'Designing layout, content, and styling…');
      } else if (data.node === 'critic') {
        stepCritic.className = 'pipe-step running';
        subCritic.textContent = `Quality inspection (pass ${data.iteration}/${data.maxIterations})…`;
        showRefineOverlay(`Inspecting quality & accessibility (pass ${data.iteration})…`);
        logActivity('critic', `Running quality inspection (Pass ${data.iteration})…`);
      } else if (data.node === 'fixer') {
        stepFixer.className = 'pipe-step running';
        subFixer.textContent = `Auto-polishing (pass ${data.iteration})…`;
        showRefineOverlay(`Polishing design (pass ${data.iteration})…`);
        logActivity('fixer', `Polishing and fixing issues (Pass ${data.iteration})…`);
      } else if (data.node === 'modifier') {
        stepModifier.className = 'pipe-step running';
        subModifier.textContent = 'Applying your requested changes…';
        logActivity('fixer', data.message);
      }
      break;

    case 'node_end':
      if (data.node === 'builder') {
        stepBuilder.className = 'pipe-step done';
        subBuilder.textContent = 'Layout & content created ✓';
        logActivity('builder', 'Your website layout is ready!');
        hasGeneratedOnce = true;
        hideBuildOverlay();
        updatePreviewUrl(data.siteName);
      }
      break;

    case 'audit_scores':
      stepCritic.className = 'pipe-step done';
      subCritic.textContent = `Inspection pass ${data.iteration} complete ✓`;
      updateScores(data.scores);
      renderIssues(data.issues, data.runtimeErrors);
      logActivity('critic', `Health scores: Speed ${data.scores.performance} | Accessibility ${data.scores.accessibility} | Quality ${data.scores.bestPractices} | SEO ${data.scores.seo}`);
      break;

    case 'site_reloaded':
      if (appMode === 'modify') {
        stepModifier.className = 'pipe-step done';
        subModifier.textContent = 'Changes applied & preview updated ✓';
      } else {
        stepFixer.className = 'pipe-step done';
        subFixer.textContent = `Polish pass ${data.iteration || 1} applied ✓`;
      }
      logActivity('fixer', 'Live preview updated with latest improvements');
      fetchSiteCode(currentSite);
      break;

    case 'modification_finished':
      setGenerationRunning(false);
      pipelineStatusBadge.textContent = 'Done';
      pipelineStatusBadge.className = 'status-pill completed';
      hideRefineOverlay();
      logActivity('success', `✨ Your edits to "${data.siteName}" are live!`);
      fetchSiteCode(data.siteName);
      postGenChoiceBanner.classList.add('visible');
      break;

    case 'workflow_completed':
      logActivity('success', `✓ ${data.reason}`);
      break;

    case 'workflow_finished':
      setGenerationRunning(false);
      pipelineStatusBadge.textContent = 'Done';
      pipelineStatusBadge.className = 'status-pill completed';
      hasGeneratedOnce = true;
      hideBuildOverlay();
      hideRefineOverlay();
      logActivity('success', `🎉 Your website is live! (${data.iteration} polish passes applied)`);
      updateScores(data.scores);
      fetchSiteCode(data.siteName);
      updatePreviewUrl(data.siteName);
      // Show Choice Banner
      postGenChoiceBanner.classList.add('visible');
      break;

    case 'workflow_error':
      setGenerationRunning(false);
      pipelineStatusBadge.textContent = 'Error';
      pipelineStatusBadge.className = 'status-pill error';
      hideBuildOverlay();
      hideRefineOverlay();
      if (!hasGeneratedOnce) showIdleOverlay();
      logActivity('error', `Something went wrong: ${data.error}`);
      break;
  }
}

function resetPipeline() {
  pipelineStatusBadge.textContent = 'Working';
  pipelineStatusBadge.className = 'status-pill active';

  if (appMode === 'modify') {
    stepModifier.className = 'pipe-step running';
    subModifier.textContent = 'Applying your edits…';
  } else {
    stepBuilder.className = 'pipe-step';
    subBuilder.textContent = 'Designing layout…';
    stepCritic.className = 'pipe-step';
    subCritic.textContent = 'Quality check pending…';
    stepFixer.className = 'pipe-step';
    subFixer.textContent = 'Auto-polish pending…';
  }
}

function setGenerationRunning(running) {
  isGenerating = running;
  btnGenerate.disabled = running;

  // Lock the code editor while the AI is working on the site
  codeEditor.readOnly = running;
  btnSaveCode.disabled = running;
  btnResetCode.disabled = running;

  if (running) {
    btnSpinner.classList.remove('hidden');
    btnText.textContent = appMode === 'modify' ? 'Applying Changes…' : 'Building Your Site…';
  } else {
    btnSpinner.classList.add('hidden');
    btnText.textContent = appMode === 'modify' ? 'Apply Changes' : 'Generate Website';
  }

  // Click-to-code is paused while the AI is working
  syncInspectMode();
}

// Update Score Cards with Colors
function updateScores(scores = {}) {
  const p = scores.performance ?? 0;
  const a = scores.accessibility ?? 0;
  const b = scores.bestPractices ?? 0;
  const s = scores.seo ?? 0;

  setScoreCard(valPerf, barPerf, cardPerformance, p);
  setScoreCard(valA11y, barA11y, cardAccessibility, a);
  setScoreCard(valBP, barBP, cardBestPractices, b);
  setScoreCard(valSeo, barSeo, cardSeo, s);
}

function setScoreCard(valEl, barEl, cardEl, score) {
  valEl.textContent = score;
  barEl.style.width = `${score}%`;

  cardEl.classList.remove('score-green', 'score-yellow', 'score-red');
  if (score >= 85) {
    cardEl.classList.add('score-green');
  } else if (score >= 60) {
    cardEl.classList.add('score-yellow');
  } else {
    cardEl.classList.add('score-red');
  }
}

function renderIssues(issues = [], runtimeErrors = []) {
  if (issues.length === 0 && runtimeErrors.length === 0) {
    issuesList.innerHTML = '<div class="empty-state">🎉 All quality standards met! Zero issues detected.</div>';
    return;
  }

  let html = '';
  runtimeErrors.forEach(err => {
    html += `
      <div class="issue-card" style="border-left-color: var(--color-red);">
        <div class="category" style="color: var(--color-red);">Runtime Error</div>
        <div class="problem">${escapeHtml(err)}</div>
      </div>`;
  });

  issues.forEach(iss => {
    html += `
      <div class="issue-card">
        <div class="category">${escapeHtml(iss.category || 'Issue')}</div>
        <div class="problem">${escapeHtml(iss.problem)}</div>
        <div class="suggestion">${escapeHtml(iss.suggestion)}</div>
      </div>`;
  });

  issuesList.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Editable Code Editor
// ---------------------------------------------------------------------------
function setCodeStatus(message, type = '') {
  codeStatus.textContent = message;
  codeStatus.className = `code-status ${type}`.trim();
}

// Fetch generated code from the server into the editor
async function fetchSiteCode(siteName) {
  codeSiteName.textContent = `${siteName} / index.html`;
  try {
    const res = await fetch(`/api/site/${encodeURIComponent(siteName)}/code`);
    if (res.ok) {
      const data = await res.json();
      codeEditor.value = data.code;
      savedCode = codeEditor.value; // textarea normalizes line endings
    } else {
      codeEditor.value = '// Website code not yet generated for this site.';
      savedCode = codeEditor.value;
    }
  } catch (e) {
    codeEditor.value = '// Unable to load code.';
    savedCode = codeEditor.value;
  }
  codeDirty = false;
  setCodeStatus('');
}

// Save edited code -> server -> live preview reload
async function saveCode() {
  const code = codeEditor.value;

  if (isGenerating) {
    setCodeStatus('Please wait for the AI to finish before saving.', 'error');
    return;
  }
  if (!code.trim()) {
    setCodeStatus('Code is empty — nothing to save.', 'error');
    return;
  }
  if (!hasGeneratedOnce && !codeDirty && code === savedCode) {
    setCodeStatus('Generate a website first, then edit its code here.', 'error');
    return;
  }

  btnSaveCode.disabled = true;
  setCodeStatus('Saving…');

  try {
    const res = await fetch(`/api/site/${encodeURIComponent(currentSite)}/code`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save code');
    }

    savedCode = code;
    codeDirty = false;
    setCodeStatus('Saved ✓ Live preview updated', 'success');
    logActivity('success', `Your code edits to "${currentSite}" were applied to the live preview`);
  } catch (err) {
    setCodeStatus(err.message, 'error');
    logActivity('error', `Code save failed: ${err.message}`);
  } finally {
    btnSaveCode.disabled = isGenerating;
  }
}

function setupCodeEditor() {
  // Track unsaved changes
  codeEditor.addEventListener('input', () => {
    codeDirty = codeEditor.value !== savedCode;
    setCodeStatus(codeDirty ? 'Unsaved changes — press Save & Apply (Ctrl+S)' : '', codeDirty ? 'dirty' : '');
  });

  codeEditor.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveCode();
      return;
    }
    // Tab inserts 2 spaces instead of moving focus
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      codeEditor.setRangeText('  ', codeEditor.selectionStart, codeEditor.selectionEnd, 'end');
      codeEditor.dispatchEvent(new Event('input'));
    }
  });

  btnSaveCode.addEventListener('click', saveCode);

  btnResetCode.addEventListener('click', () => {
    codeEditor.value = savedCode;
    codeDirty = false;
    setCodeStatus('Edits discarded.');
  });

  // Copy Code
  btnCopyCode.addEventListener('click', () => {
    if (codeEditor.value) {
      navigator.clipboard.writeText(codeEditor.value).then(() => {
        const orig = btnCopyCode.innerHTML;
        btnCopyCode.textContent = 'Copied!';
        setTimeout(() => (btnCopyCode.innerHTML = orig), 2000);
      });
    }
  });
}

// Trigger Generation or Modification Request
btnGenerate.addEventListener('click', async () => {
  const prompt = promptInput.value.trim();
  const siteName = (siteNameInput.value.trim() || currentSite || 'site1').replace(/[^a-zA-Z0-9_-]/g, '');
  const maxIterations = Number(maxIterationsInput.value) || 2;
  const stack = (stackSelect && stackSelect.value) || 'react-tailwind-cdn';

  if (!prompt) {
    alert(appMode === 'modify' ? 'Please describe the modifications you want to make.' : 'Please enter a description for the website.');
    return;
  }

  // Warn before the AI overwrites unsaved manual code edits
  if (codeDirty) {
    const proceed = confirm('You have unsaved code edits. Continue and discard them?');
    if (!proceed) return;
    codeDirty = false;
  }

  currentSite = siteName;
  setGenerationRunning(true);
  resetPipeline();
  postGenChoiceBanner.classList.remove('visible');
  if (deployStatus) {
    deployStatus.classList.add('hidden');
    deployStatus.innerHTML = '';
  }

  // Show the engaging overlay INSTANTLY on click — don't wait for the SSE
  // round-trip to confirm the workflow actually started server-side.
  if (appMode === 'modify') {
    showRefineOverlay('Applying your custom edits…');
  } else {
    showBuildOverlay('Crafting Your Website');
  }

  updatePreviewUrl(siteName);

  if (appMode === 'modify') {
    // --- MODIFICATION MODE ---
    logActivity('system', `Submitting modification request for "${siteName}"...`);
    try {
      const res = await fetch('/api/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteName,
          modificationPrompt: prompt
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to apply modifications');
      }
    } catch (err) {
      logActivity('error', err.message);
      setGenerationRunning(false);
      hideRefineOverlay();
    }
  } else {
    // --- CREATION MODE ---
    logActivity('system', `Submitting new site request for "${siteName}" (stack: ${stack})...`);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, siteName, maxIterations, stack })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start generation');
      }
    } catch (err) {
      logActivity('error', err.message);
      setGenerationRunning(false);
      hideBuildOverlay();
      if (!hasGeneratedOnce) showIdleOverlay();
    }
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// One-Click Deploy to Vercel
async function deployCurrentSiteToVercel() {
  const siteName = currentSite || siteNameInput.value.trim() || 'site1';
  const deployBtnText = btnChoiceDeploy.querySelector('.deploy-btn-text');
  const deploySpinner = btnChoiceDeploy.querySelector('.deploy-spinner');

  btnChoiceDeploy.disabled = true;
  if (deploySpinner) deploySpinner.classList.remove('hidden');
  if (deployBtnText) deployBtnText.textContent = 'Publishing to Vercel...';

  deployStatus.className = 'deploy-status loading';
  deployStatus.classList.remove('hidden');
  deployStatus.innerHTML = `
    <span class="deploy-spinner"></span>
    <span>Deploying <strong>"${escapeHtml(siteName)}"</strong> to Vercel... Provisioning live URL...</span>
  `;

  logActivity('system', `Deploying "${siteName}" to Vercel...`);

  try {
    const res = await fetch('/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteName })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Deployment failed');
    }

    deployStatus.className = 'deploy-status success';
    deployStatus.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
        <div>
          <span>🚀 <strong>Live on Vercel:</strong></span><br>
          <a href="${data.url}" target="_blank" rel="noopener noreferrer">${data.url}</a>
        </div>
        <a href="${data.url}" target="_blank" rel="noopener noreferrer" class="btn-choice" style="background: rgba(16,185,129,0.25); border-color: rgba(16,185,129,0.5); color: #fff; padding: 4px 12px; font-size: 11px; text-decoration: none; white-space: nowrap;">
          Open Live Site ↗
        </a>
      </div>
    `;
    logActivity('success', `🎉 Deployed successfully! Live URL: ${data.url}`);
  } catch (err) {
    console.error('Deploy error:', err);
    deployStatus.className = 'deploy-status error';
    deployStatus.innerHTML = `
      <strong>Deployment Error:</strong> ${escapeHtml(err.message)}
    `;
    logActivity('error', `Vercel deploy failed: ${err.message}`);
  } finally {
    btnChoiceDeploy.disabled = false;
    if (deploySpinner) deploySpinner.classList.add('hidden');
    if (deployBtnText) deployBtnText.textContent = 'Publish to Vercel (Live URL)';
  }
}

// ---------------------------------------------------------------------------
// Click-to-code: while the Code tab is open, clicking anything in the
// preview jumps to that element's HTML in the editor (like DevTools)
// ---------------------------------------------------------------------------
const PREVIEW_ORIGIN = 'http://localhost:3456';
let inspectMode = false;

function sendToPreview(msg) {
  try {
    previewIframe.contentWindow.postMessage(msg, PREVIEW_ORIGIN);
  } catch (e) { /* preview not loaded yet */ }
}

function isCodeTabActive() {
  return document.getElementById('pane-code').classList.contains('active');
}

function syncInspectMode() {
  const shouldBeOn = isCodeTabActive() && hasGeneratedOnce && !isGenerating;
  const changed = shouldBeOn !== inspectMode;
  inspectMode = shouldBeOn;
  sendToPreview({ type: 'lumina-inspect', on: inspectMode });

  if (changed && inspectMode && !codeStatus.textContent) {
    setCodeStatus('Tip: click anything in the preview to jump to its code.');
  }
}

// The preview reloads after every save/edit, so re-apply the mode each time
previewIframe.addEventListener('load', syncInspectMode);

async function jumpToElementInCode(idx, tag) {
  if (isGenerating) return;

  if (codeDirty) {
    setCodeStatus('Save your edits first (Ctrl+S) so the code matches the preview, then click again.', 'error');
    return;
  }

  try {
    await fetchSiteCode(currentSite); // make sure the editor holds the current code
    const res = await fetch(`/api/site/${encodeURIComponent(currentSite)}/map`);
    if (!res.ok) throw new Error('Could not load element map');
    const { tags } = await res.json();
    const entry = tags[idx];
    if (!entry) throw new Error('Element not found in code');

    const [start, openEnd, end] = entry;
    // Big containers (sections, body): select just the opening tag
    const selEnd = (end - start > 3000) ? openEnd : end;

    codeEditor.focus();
    codeEditor.setSelectionRange(start, selEnd);

    const line = codeEditor.value.slice(0, start).split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(codeEditor).lineHeight) || 18;
    codeEditor.scrollTop = Math.max(0, line * lineHeight - codeEditor.clientHeight / 3);
    codeEditor.scrollLeft = 0;

    setCodeStatus(`Selected <${tag}> (line ${line + 1}) — edit it, then press Save & Apply`, 'success');
  } catch (err) {
    setCodeStatus(err.message, 'error');
  }
}

window.addEventListener('message', (e) => {
  if (e.origin !== PREVIEW_ORIGIN) return;
  const msg = e.data;
  if (!msg || msg.type !== 'lumina-select') return;
  jumpToElementInCode(msg.idx, msg.tag);
});
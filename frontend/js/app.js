// DOM Elements
const promptInput = document.getElementById('promptInput');
const lblPromptInput = document.getElementById('lblPromptInput');
const siteNameInput = document.getElementById('siteNameInput');
const maxIterationsInput = document.getElementById('maxIterationsInput');
const iterationsCol = document.getElementById('iterationsCol');
const stackSelect = document.getElementById('stackSelect');
const stackConfigRow = document.getElementById('stackConfigRow');
const stackHint = document.getElementById('stackHint');
const settingsAccordion = document.getElementById('settingsAccordion');
const btnGenerate = document.getElementById('btnGenerate');

const postGenChoiceBanner = document.getElementById('postGenChoiceBanner');
const btnCloseChoiceBanner = document.getElementById('btnCloseChoiceBanner');
const btnChoiceModify = document.getElementById('btnChoiceModify');
const btnChoiceNew = document.getElementById('btnChoiceNew');
const btnChoicePublish = document.getElementById('btnChoicePublish');
const btnNewSiteTop = document.getElementById('btnNewSiteTop');
const btnChoiceDeploy = document.getElementById('btnChoiceDeploy');
const deployStatus = document.getElementById('deployStatus');
const btnRepublish = document.getElementById('btnRepublish');

const deployModal = document.getElementById('deployModal');
const deployStepList = document.getElementById('deployStepList');
const deployUrlBox = document.getElementById('deployUrlBox');
const deployUrlText = document.getElementById('deployUrlText');
const btnOpenDeployUrl = document.getElementById('btnOpenDeployUrl');
const btnCopyDeployUrl = document.getElementById('btnCopyDeployUrl');
const btnDeployModalOk = document.getElementById('btnDeployModalOk');
const deployErrorBox = document.getElementById('deployErrorBox');
const deployErrorText = document.getElementById('deployErrorText');
const btnRetryDeploy = document.getElementById('btnRetryDeploy');
const btnCloseDeployError = document.getElementById('btnCloseDeployError');
const btnCloseDeployModal = document.getElementById('btnCloseDeployModal');


const modeBadge = document.getElementById('modeBadge');
const modeText = document.getElementById('modeText');
const activeSiteTarget = document.getElementById('activeSiteTarget');

const pipelineStatusBadge = document.getElementById('pipelineStatusBadge');
const aiThreadCard = document.getElementById('aiThreadCard');
const aiThreadBody = document.getElementById('aiThreadBody');

const previewIframe = document.getElementById('previewIframe');

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

const panelResizer = document.getElementById('panelResizer');
const workspaceEl = document.querySelector('.workspace');
const leftPanelEl = document.querySelector('.left-panel');

let buildStatusInterval = null;
let terminalTypeTimeout = null;

// Application State
let currentSite = 'site1';
let isGenerating = false;
let appMode = 'create'; // 'create' | 'modify'
let hasGeneratedOnce = false;
let isStopped = false;

// NEW: tracks whether the popup currently open must be resolved via a button
let choiceBannerMandatory = false;

let currentTurnEl = null;
let currentTurnSteps = [];
let currentTurnStartTime = null;

// Tracks which "bubble" in the AI thread is currently the active step,
// so audit_scores / site_reloaded events know which one to mark done.
let currentCriticKey = null;
let currentFixerKey = null;
let currentModifierKey = null;
let currentRunId = 0;

// Code editor state
let savedCode = '';     // last code loaded from / saved to the server
let codeDirty = false;  // true when the editor has unsaved changes

const DEPLOY_STEPS = [
  { key: 'prepare', label: 'Preparing your website files' },
  { key: 'upload',  label: 'Uploading to Vercel' },
  { key: 'build',   label: 'Building & optimizing' },
  { key: 'live',    label: 'Going live' }
];
let deployStepInterval = null;
let liveSiteUrls = {}; // { [siteName]: url } — persists across the session


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
// Engagement Overlay Content (canvas overlays — unchanged)
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
  setupDeployModal();
  setupSSE();
  setupCodeEditor();
  setupStackSelector();
  setupPromptEnterToSubmit();
  setupPanelResizer(); // ADD THIS LINE
  setupAppHeightFix(); // ADD THIS
  setupDrawer();          // ADD THIS

  const initialSite = siteNameInput.value.trim() || 'site1';
  currentSite = initialSite;
  activeSiteTarget.textContent = `Project: ${initialSite}`;
  previewUrlDisplay.value = `http://localhost:3456/${initialSite}/`;
  frameTitle.textContent = `${initialSite} • Live Preview`;
  showIdleOverlay();
  updateSettingsVisibility();
  openDrawer();   // ADD THIS (does nothing on desktop)

});

// ---------------------------------------------------------------------------
// Fix: Chromium on Windows doesn't always recalc 100vh/100dvh immediately
// after an OS-level window snap (split screen). We track the real height
// ourselves and force layout to re-read it.
// ---------------------------------------------------------------------------
function setAppHeight() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${h}px`);
}

function setupAppHeightFix() {
  setAppHeight();

  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', () => {
    // double rAF forces a fresh layout pass after the OS finishes resizing
    requestAnimationFrame(() => requestAnimationFrame(setAppHeight));
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppHeight);
  }
}

function setupStackSelector() {
  if (!stackSelect) return;
  stackSelect.addEventListener('change', () => {
    stackHint.textContent = STACK_DESCRIPTIONS[stackSelect.value] || '';
  });
}

function setupPromptEnterToSubmit() {
  if (!promptInput) return;
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating) {
        btnGenerate.click();
      }
    }
  });
}


function setupTabs() {
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = `pane-${tab.dataset.tab}`;
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');

      if (tab.dataset.tab === 'code' && !codeDirty && hasGeneratedOnce) {
        fetchSiteCode(currentSite);
      }

      syncInspectMode();
    });
  });
}

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

// ---------------------------------------------------------------------------
// Draggable left panel resizer
// ---------------------------------------------------------------------------
const SIDEBAR_MIN_WIDTH = 320;
const SIDEBAR_STORAGE_KEY = 'lumina-sidebar-width';
const STACK_QUERY = window.matchMedia('(max-width: 700px)'); // keep same as CSS

function isStackedLayout() {
  return STACK_QUERY.matches;
}

function clampSidebarWidth(px) {
  const maxAllowed = Math.min(window.innerWidth * 0.6, window.innerWidth - 360);
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(px, maxAllowed));
}

// Only set a CSS variable. Never touch grid-template-columns from JS.
function applySidebarWidth(px) {
  workspaceEl.style.setProperty('--sidebar-w', `${px}px`);
}

function resetSidebarWidth() {
  workspaceEl.style.removeProperty('--sidebar-w');
}

window.addEventListener('resize', () => {
  console.log('width:', window.innerWidth, 'stacked:', isStackedLayout());
});
function setupPanelResizer() {
  if (!panelResizer || !workspaceEl || !leftPanelEl) return;

  // Restore a previously saved width (desktop layout only)
  const saved = parseInt(localStorage.getItem(SIDEBAR_STORAGE_KEY), 10);
  if (saved && !isStackedLayout()) {
    applySidebarWidth(clampSidebarWidth(saved));
  }

  let dragging = false;

  function onPointerDown(e) {
    if (isStackedLayout()) return; // no dragging on the stacked mobile layout
    dragging = true;
    panelResizer.classList.add('dragging');
    document.body.classList.add('resizing-panels');
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const workspaceRect = workspaceEl.getBoundingClientRect();
    applySidebarWidth(clampSidebarWidth(clientX - workspaceRect.left));
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    panelResizer.classList.remove('dragging');
    document.body.classList.remove('resizing-panels');
    const currentWidth = Math.round(leftPanelEl.getBoundingClientRect().width);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, currentWidth);
  }

  panelResizer.addEventListener('mousedown', onPointerDown);
  panelResizer.addEventListener('touchstart', onPointerDown, { passive: false });
  document.addEventListener('mousemove', onPointerMove);
  document.addEventListener('touchmove', onPointerMove, { passive: false });
  document.addEventListener('mouseup', onPointerUp);
  document.addEventListener('touchend', onPointerUp);

    // Double-click the divider to reset to the default width
  panelResizer.addEventListener('dblclick', () => {
    resetSidebarWidth();
    localStorage.removeItem(SIDEBAR_STORAGE_KEY);
  });

  // Re-clamp on window resize (CSS ignores the variable in stacked mode)
  window.addEventListener('resize', () => {
    if (isStackedLayout()) return;
    const savedNow = parseInt(localStorage.getItem(SIDEBAR_STORAGE_KEY), 10);
    if (savedNow) applySidebarWidth(clampSidebarWidth(savedNow));
  });
}

// ---------------------------------------------------------------------------
// Drawer (narrow screens): left panel slides up over the preview
// ---------------------------------------------------------------------------
function openDrawer() {
  if (!isStackedLayout()) return;
  document.body.classList.add('drawer-open');
}

function closeDrawer() {
  document.body.classList.remove('drawer-open');
}

function setupDrawer() {
  const btnOpen = document.getElementById('btnChatToEdit');
  const btnClose = document.getElementById('btnCloseDrawer');
  const backdrop = document.getElementById('drawerBackdrop');

  if (btnOpen) btnOpen.addEventListener('click', openDrawer);
  if (btnClose) btnClose.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) closeDrawer();
  });

  // Window grew back to desktop width -> reset the drawer state
  STACK_QUERY.addEventListener('change', closeDrawer);
}

// ---------------------------------------------------------------------------
// UPDATED: Show / hide the "Your website is generated" popup.
// Supports a `mandatory` mode (no X button, no dismiss-by-clicking-outside)
// and a `stopped` mode (reworded for an interrupted generation).
// ---------------------------------------------------------------------------
function openChoiceBanner(opts = {}) {
  const titleEl = postGenChoiceBanner.querySelector('.choice-text h5');
  const subEl = postGenChoiceBanner.querySelector('.choice-text p');

  choiceBannerMandatory = !!opts.mandatory;

  if (opts.stopped) {
    titleEl.textContent = 'Generation Stopped';
    subEl.textContent = 'Your partial website was saved. What would you like to do?';
  } else {
    titleEl.textContent = 'Your Website is Generated!';
    subEl.textContent = choiceBannerMandatory
      ? 'Please choose an option below to continue.'
      : 'What would you like to do next?';
  }

  // Don't offer publishing an incomplete/stopped site.
  if (btnChoicePublish) btnChoicePublish.style.display = opts.stopped ? 'none' : '';

  // Hide the X entirely when a choice is required.
  if (btnCloseChoiceBanner) btnCloseChoiceBanner.classList.toggle('hidden', choiceBannerMandatory);

  postGenChoiceBanner.classList.toggle('mandatory', choiceBannerMandatory);
  postGenChoiceBanner.classList.add('visible');
}

function closeChoiceBanner(force = false) {
  if (choiceBannerMandatory && !force) return;
  postGenChoiceBanner.classList.remove('visible');
}

function setPublishButtonVisible(visible) {
  if (!btnChoiceDeploy) return;
  btnChoiceDeploy.classList.toggle('hidden', !visible);
  if (!visible && deployStatus) {
    deployStatus.classList.add('hidden');
    deployStatus.innerHTML = '';
  }
}

// UPDATED: forces the banner closed since this is always a real choice
function startNewWebsiteFlow() {
  setMode('create');
  closeChoiceBanner(true);
}

// UPDATED: real choices now force-close; backdrop/X clicks still route
// through the guarded closeChoiceBanner() and will no-op when mandatory
function setupChoiceBanner() {
  btnChoiceModify.addEventListener('click', () => {
    setMode('modify');
    closeChoiceBanner(true);
  });

  if (btnChoiceNew) {
    btnChoiceNew.addEventListener('click', startNewWebsiteFlow);
  }

  if (btnChoicePublish) {
    btnChoicePublish.addEventListener('click', () => {
      closeChoiceBanner(true);
      deployCurrentSiteToVercel();
    });
  }

  if (btnCloseChoiceBanner) {
    btnCloseChoiceBanner.addEventListener('click', () => {
      closeChoiceBanner(); // no-ops automatically if mandatory
    });
  }

  postGenChoiceBanner.addEventListener('click', (e) => {
    if (e.target === postGenChoiceBanner) closeChoiceBanner(); // same guard
  });

  if (btnNewSiteTop) {
    btnNewSiteTop.addEventListener('click', startNewWebsiteFlow);
  }

    if (btnChoiceDeploy) {
    btnChoiceDeploy.addEventListener('click', () => {
      const liveUrl = liveSiteUrls[currentSite];
      if (liveUrl) {
        window.open(liveUrl, '_blank', 'noopener');
      } else {
        deployCurrentSiteToVercel();
      }
    });
  }
}

function setupDeployModal() {
  btnDeployModalOk.addEventListener('click', closeDeployModal);
  btnCloseDeployModal.addEventListener('click', closeDeployModal);
  btnCloseDeployError.addEventListener('click', closeDeployModal);
  btnRetryDeploy.addEventListener('click', deployCurrentSiteToVercel);
  btnCopyDeployUrl.addEventListener('click', () => {
    navigator.clipboard.writeText(deployUrlText.textContent);
  });
  if (btnRepublish) {
    btnRepublish.addEventListener('click', () => deployCurrentSiteToVercel());
  }
}


function setMode(mode) {
  appMode = mode;

  if (mode === 'modify') {
    modeBadge.className = 'mode-badge modify-mode';
    modeText.textContent = 'Edit Mode';
    activeSiteTarget.textContent = `Project: ${currentSite}`;

    lblPromptInput.innerHTML = '<span class="label-icon">✏️</span><span>Describe Your Edits for "' + currentSite + '"</span>';
    promptInput.placeholder = 'Describe the changes you want to make...';
    promptInput.value = '';

    btnGenerate.title = 'Apply Changes';
    iterationsCol.style.display = 'none';
    if (stackConfigRow) stackConfigRow.style.display = 'none';

    resetThread(`Switched to Edit Mode for "${currentSite}". Describe your changes above and hit Apply.`);
    hideAiThreadCard();
  } else {
    modeBadge.className = 'mode-badge';
    modeText.textContent = 'Creation Studio';

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

    btnGenerate.title = 'Generate Website';
    iterationsCol.style.display = 'block';
    if (stackConfigRow) stackConfigRow.style.display = 'flex';

    resetThread(`Starting fresh — new project "${currentSite}". Describe your dream website above.`);
    hideAiThreadCard();

    hasGeneratedOnce = false;
    hideBuildOverlay();
    hideRefineOverlay();
    showIdleOverlay();
    setPublishButtonVisible(false);
    resetLiveState();
  }

  updateSettingsVisibility();
}


function updatePreviewUrl(siteName) {
  currentSite = siteName;
  activeSiteTarget.textContent = `Project: ${siteName}`;
  const url = `http://localhost:3456/${siteName}/`;
  previewIframe.src = url;
  frameTitle.textContent = `${siteName} • Live Preview`;

  if (liveSiteUrls[siteName]) reflectLiveState(liveSiteUrls[siteName]);
  else resetLiveState();
}

function setThreadStatus(state) {
  if (!pipelineStatusBadge) return;
  if (state === 'Working') {
    pipelineStatusBadge.textContent = 'Working';
    pipelineStatusBadge.className = 'status-pill active';
  } else if (state === 'Done') {
    pipelineStatusBadge.textContent = 'Done';
    pipelineStatusBadge.className = 'status-pill completed';
  } else if (state === 'Error') {
    pipelineStatusBadge.textContent = 'Error';
    pipelineStatusBadge.className = 'status-pill error';
  } else {
    pipelineStatusBadge.textContent = 'Idle';
    pipelineStatusBadge.className = 'status-pill idle';
  }
}

function showAiThreadCard() {
  if (aiThreadCard) aiThreadCard.classList.remove('hidden');
}

function hideAiThreadCard() {
  if (aiThreadCard) aiThreadCard.classList.add('hidden');
}

function resetThread(placeholderText) {
  if (!aiThreadBody) return;
  const text = placeholderText || "Describe your dream website above and hit Generate — I'll build it step by step, right here.";
  aiThreadBody.innerHTML = `<div class="ai-thread-placeholder" id="aiThreadPlaceholder">${escapeHtml(text)}</div>`;
  currentCriticKey = null;
  currentFixerKey = null;
  currentModifierKey = null;
  setThreadStatus('Idle');
}

function threadAddUserPrompt(text) {
  if (!aiThreadBody || !text) return;
  const placeholder = document.getElementById('aiThreadPlaceholder');
  if (placeholder) placeholder.remove();

  const wrap = document.createElement('div');
  wrap.className = 'ai-bubble-user';
  wrap.dataset.originalText = text;

  wrap.innerHTML = `
    <div class="user-bubble-text"></div>
    <div class="user-bubble-actions">
      <button type="button" class="thread-icon-btn" data-action="copy" title="Copy">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
    </div>
  `;

  const textEl = wrap.querySelector('.user-bubble-text');
  const actionsEl = wrap.querySelector('.user-bubble-actions');
  textEl.textContent = text;

  wrap.querySelector('[data-action="copy"]').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const textToCopy = textEl.textContent;

    const showCopiedFeedback = () => {
      const originalHtml = btn.innerHTML;
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`;
      btn.disabled = true;
      setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }, 1500);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textToCopy).then(showCopiedFeedback).catch(() => {
        fallbackCopyText(textToCopy, showCopiedFeedback);
      });
    } else {
      fallbackCopyText(textToCopy, showCopiedFeedback);
    }
  });

  aiThreadBody.appendChild(wrap);
  aiThreadBody.scrollTop = aiThreadBody.scrollHeight;
  return wrap;
}

function enterBubbleEditMode(wrap, textEl, actionsEl) {
  const beforeEdit = textEl.textContent;

  textEl.contentEditable = 'true';
  textEl.focus();
  const range = document.createRange();
  range.selectNodeContents(textEl);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  actionsEl.classList.add('editing');
  actionsEl.innerHTML = `
    <button type="button" class="btn-bubble-cancel" data-action="cancel">Cancel</button>
    <button type="button" class="btn-bubble-save" data-action="save">Save</button>
  `;

  function exitEditMode(saveIt) {
    textEl.contentEditable = 'false';
    if (saveIt) {
      const edited = textEl.textContent.trim();
      if (edited) {
        textEl.textContent = edited;
        wrap.dataset.originalText = edited;
        submitEditedPrompt(edited);
      } else {
        textEl.textContent = beforeEdit;
      }
    } else {
      textEl.textContent = beforeEdit;
    }

    actionsEl.classList.remove('editing');
    actionsEl.innerHTML = `
      <button type="button" class="thread-icon-btn" data-action="copy" title="Copy">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
      <button type="button" class="thread-icon-btn" data-action="edit" title="Edit">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
    `;

    actionsEl.querySelector('[data-action="copy"]').addEventListener('click', () => {
      navigator.clipboard.writeText(textEl.textContent);
    });
    actionsEl.querySelector('[data-action="edit"]').addEventListener('click', () => {
      enterBubbleEditMode(wrap, textEl, actionsEl);
    });
  }

  actionsEl.querySelector('[data-action="save"]').addEventListener('click', () => exitEditMode(true));
  actionsEl.querySelector('[data-action="cancel"]').addEventListener('click', () => exitEditMode(false));

  textEl.addEventListener('keydown', function handler(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      textEl.removeEventListener('keydown', handler);
      exitEditMode(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      textEl.removeEventListener('keydown', handler);
      exitEditMode(false);
    }
  });
}

function threadAddBubble(key, text) {
  if (!aiThreadBody) return;

  const existing = (currentTurnEl || aiThreadBody).querySelector(`.ai-bubble[data-key="${key}"]`);
  if (existing) {
    if (text) {
      const textEl = existing.querySelector('.ai-bubble-text');
      if (textEl) textEl.textContent = text;
    }
    return existing;
  }

  const placeholder = document.getElementById('aiThreadPlaceholder');
  if (placeholder) placeholder.remove();

  const bubble = document.createElement('div');
  bubble.className = 'ai-bubble thinking';
  bubble.dataset.key = key;
  bubble.innerHTML = `
    <div class="ai-avatar">✨</div>
    <div class="ai-bubble-content">
      <div class="ai-bubble-text">${escapeHtml(text)}</div>
      <div class="ai-typing"><span></span><span></span><span></span></div>
    </div>
  `;
  (currentTurnEl || aiThreadBody).appendChild(bubble);
  aiThreadBody.scrollTop = aiThreadBody.scrollHeight;
  return bubble;
}

function threadCompleteBubble(key, text) {
  if (!aiThreadBody) return;
  const bubble = aiThreadBody.querySelector(`.ai-bubble[data-key="${key}"]`);
  if (!bubble) return;
  bubble.classList.remove('thinking');
  bubble.classList.add('done');
  const textEl = bubble.querySelector('.ai-bubble-text');
  if (textEl && text) { textEl.textContent = text; currentTurnSteps.push(text); }
  const typingEl = bubble.querySelector('.ai-typing');
  if (typingEl) typingEl.outerHTML = '<div class="ai-check">✓</div>';
  aiThreadBody.scrollTop = aiThreadBody.scrollHeight;
}

function threadErrorBubble(key, text) {
  if (!aiThreadBody) return;
  let bubble = aiThreadBody.querySelector(`.ai-bubble[data-key="${key}"]`);
  if (!bubble) bubble = threadAddBubble(key, text);
  bubble.classList.remove('thinking');
  bubble.classList.add('error');
  const textEl = bubble.querySelector('.ai-bubble-text');
  if (textEl) { textEl.textContent = text; currentTurnSteps.push(text); }
  const typingEl = bubble.querySelector('.ai-typing');
  if (typingEl) typingEl.outerHTML = '<div class="ai-check">⚠</div>';
  aiThreadBody.scrollTop = aiThreadBody.scrollHeight;
}

function threadStopAllThinkingBubbles() {
  const scope = currentTurnEl || aiThreadBody;
  if (!scope) return;
  const thinkingBubbles = scope.querySelectorAll('.ai-bubble.thinking');
  thinkingBubbles.forEach(bubble => {
    bubble.classList.remove('thinking');
    bubble.classList.add('stopped');
    const typingEl = bubble.querySelector('.ai-typing');
    if (typingEl) typingEl.outerHTML = '<div class="ai-stop-icon">⏹</div>';
  });
}

function threadAddDone(text) {
  if (!aiThreadBody || !text) return;
  const placeholder = document.getElementById('aiThreadPlaceholder');
  if (placeholder) placeholder.remove();

  const bubble = document.createElement('div');
  bubble.className = 'ai-bubble done';
  bubble.innerHTML = `
    <div class="ai-avatar">✨</div>
    <div class="ai-bubble-content">
      <div class="ai-bubble-text">${escapeHtml(text)}</div>
      <div class="ai-check">✓</div>
    </div>
  `;
  (currentTurnEl || aiThreadBody).appendChild(bubble);
  currentTurnSteps.push(text);
  aiThreadBody.scrollTop = aiThreadBody.scrollHeight;
}

function updateSettingsVisibility() {
  if (!settingsAccordion) return;
  const shouldShow = appMode === 'create' && !hasGeneratedOnce && !isGenerating;
  settingsAccordion.classList.toggle('hidden', !shouldShow);
}

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

function beginNewAiTurn() {
  if (currentTurnEl) {
    collapseAiTurn(currentTurnEl, currentTurnSteps);
  }
  currentTurnEl = document.createElement('div');
  currentTurnEl.className = 'ai-turn active';
  aiThreadBody.appendChild(currentTurnEl);
  currentTurnSteps = [];
  currentTurnStartTime = Date.now();
}

function collapseAiTurn(turnEl, steps) {
  if (!turnEl || !turnEl.parentNode) return;
  const elapsed = currentTurnStartTime ? Math.max(1, Math.round((Date.now() - currentTurnStartTime) / 1000)) : null;
  const lastText = steps.length ? steps[steps.length - 1] : 'Done';

  const summary = document.createElement('div');
  summary.className = 'ai-turn-summary';
  summary.innerHTML = `
    <button type="button" class="ai-turn-summary-toggle">
      <span class="ai-turn-summary-text">${escapeHtml(lastText)}</span>
      <svg class="ai-turn-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </button>
    <div class="ai-turn-summary-detail hidden">
      ${elapsed ? `<div class="ai-turn-thought-time">Thought for ${elapsed}s</div>` : ''}
      <ul class="ai-turn-step-list">${steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
    </div>
  `;
  const toggle = summary.querySelector('.ai-turn-summary-toggle');
  const detail = summary.querySelector('.ai-turn-summary-detail');
  const chevron = summary.querySelector('.ai-turn-chevron');
  toggle.addEventListener('click', () => {
    const open = detail.classList.toggle('hidden');
    chevron.classList.toggle('open', !open);
  });
  turnEl.replaceWith(summary);
}

function handleWorkflowEvent(type, data) {
  if (isStopped && type !== 'connected') return;
  switch (type) {
    case 'connected':
      break;

    case 'workflow_started':
      beginNewAiTurn();
      showAiThreadCard();
      setGenerationRunning(true);
      setThreadStatus('Working');
      showBuildOverlay('Crafting Your Website');
      break;

    case 'modification_started':
      beginNewAiTurn();
      showAiThreadCard();
      setGenerationRunning(true);
      setThreadStatus('Working');
      currentModifierKey = `modifier-${currentRunId}`;
      threadAddBubble(currentModifierKey, 'Applying your requested changes…');
      showRefineOverlay('Applying your modifications…');
      break;

    case 'node_start':
      if (data.node === 'builder') {
        threadAddBubble('builder', 'Reading your idea and designing the layout, content & style…');
      } else if (data.node === 'critic') {
        currentCriticKey = `critic-${currentRunId}-${data.iteration}`;
        threadAddBubble(currentCriticKey, `Reviewing quality & accessibility (pass ${data.iteration})…`);
        showRefineOverlay(`Inspecting quality & accessibility (pass ${data.iteration})…`);
      } else if (data.node === 'fixer') {
        currentFixerKey = `fixer-${currentRunId}-${data.iteration}`;
        threadAddBubble(currentFixerKey, `Polishing the design (pass ${data.iteration})…`);
        showRefineOverlay(`Polishing design (pass ${data.iteration})…`);
      } else if (data.node === 'modifier') {
        if (!currentModifierKey) currentModifierKey = `modifier-${currentRunId}`;
        threadAddBubble(currentModifierKey, data.message || 'Applying your requested changes…');
      }
      break;

    case 'node_end':
      if (data.node === 'builder') {
        threadCompleteBubble('builder', 'Layout & content ready ✓');
        hasGeneratedOnce = true;
        hideBuildOverlay();
        updatePreviewUrl(data.siteName);
      }
      break;

    case 'audit_scores':
      if (currentCriticKey) {
        threadCompleteBubble(
          currentCriticKey,
          `Quality check done — Speed ${data.scores.performance}, Accessibility ${data.scores.accessibility}, SEO ${data.scores.seo}`
        );
      }
      updateScores(data.scores);
      renderIssues(data.issues);
      break;

    case 'site_reloaded':
      if (appMode === 'modify') {
        threadCompleteBubble(currentModifierKey || 'modifier', 'Changes applied — preview updated ✓');
      } else if (currentFixerKey) {
        threadCompleteBubble(currentFixerKey, 'Polish applied — preview updated ✓');
      }
      fetchSiteCode(currentSite);
      break;

    case 'modification_finished':
      closeDrawer();
      setGenerationRunning(false);
      setThreadStatus('Done');
      hideRefineOverlay();
      threadAddDone(`✨ Your edits to "${data.siteName}" are live!`);
      fetchSiteCode(data.siteName);
      setPublishButtonVisible(true);
      if (currentTurnEl) {
        collapseAiTurn(currentTurnEl, currentTurnSteps);
        currentTurnEl = null;
      }
      break;

    case 'workflow_completed':
      threadAddDone(data.reason);
      break;

    case 'workflow_finished':
      closeDrawer();
      setGenerationRunning(false);
      setThreadStatus('Done');
      hasGeneratedOnce = true;
      hideBuildOverlay();
      hideRefineOverlay();
      threadAddDone(`🎉 Your website is live! (${data.iteration} polish pass${data.iteration === 1 ? '' : 'es'} applied)`);
      updateScores(data.scores);
      fetchSiteCode(data.siteName);
      updatePreviewUrl(data.siteName);
      setPublishButtonVisible(true);
      openChoiceBanner({ mandatory: true });
      if (currentTurnEl) {
        collapseAiTurn(currentTurnEl, currentTurnSteps);
        currentTurnEl = null;
      }
      break;

    case 'workflow_error':
      setGenerationRunning(false);
      setThreadStatus('Error');
      hideBuildOverlay();
      hideRefineOverlay();
      if (!hasGeneratedOnce) showIdleOverlay();
      threadErrorBubble(
        appMode === 'modify' ? (currentModifierKey || 'modifier') : (currentFixerKey || currentCriticKey || 'builder'),
        `Something went wrong: ${data.error}`
      );
      break;
  }
}

function setGenerationRunning(running) {
  isGenerating = running;

  btnGenerate.classList.toggle('generating', running);
  btnGenerate.title = running
    ? (appMode === 'modify' ? 'Applying changes…' : 'Building your site…')
    : (appMode === 'modify' ? 'Apply Changes' : 'Generate Website');

  updateSettingsVisibility();

  codeEditor.readOnly = running;
  btnSaveCode.disabled = running;
  btnResetCode.disabled = running;

  syncInspectMode();
}

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

function renderIssues(issues = []) {
  if (issues.length === 0) {
    issuesList.innerHTML = '<div class="empty-state">🎉 All quality standards met! Zero issues detected.</div>';
    return;
  }

  const order = { new: 0, unresolved: 1, resolved: 2 };
  const sorted = [...issues].sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1));

  issuesList.innerHTML = sorted.map(iss => `
    <div class="issue-card status-${iss.status || 'unresolved'}">
      <div class="issue-status-badge">${(iss.status || 'unresolved').toUpperCase()}</div>
      <div class="category">${escapeHtml(iss.category || 'Issue')}</div>
      <div class="problem">${escapeHtml(iss.problem)}</div>
      ${iss.suggestion ? `<div class="suggestion">${escapeHtml(iss.suggestion)}</div>` : ''}
    </div>`).join('');
}

function setCodeStatus(message, type = '') {
  codeStatus.textContent = message;
  codeStatus.className = `code-status ${type}`.trim();
}

async function fetchSiteCode(siteName) {
  codeSiteName.textContent = `${siteName} / index.html`;
  try {
    const res = await fetch(`/api/site/${encodeURIComponent(siteName)}/code`);
    if (res.ok) {
      const data = await res.json();
      codeEditor.value = data.code;
      savedCode = codeEditor.value;
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

async function submitEditedPrompt(promptText) {
  if (!promptText || isGenerating) return;

  const siteName = currentSite || (siteNameInput.value.trim() || 'site1');
  const maxIterations = Number(maxIterationsInput.value) || 2;
  const stack = (stackSelect && stackSelect.value) || 'react-tailwind-cdn';

  if (codeDirty) {
    const proceed = confirm('You have unsaved code edits. Continue and discard them?');
    if (!proceed) return;
    codeDirty = false;
  }

  currentRunId++;
  isStopped = false;
  showAiThreadCard();
  setGenerationRunning(true);
  setThreadStatus('Working');
  closeChoiceBanner(true);

  if (appMode === 'modify') {
    showRefineOverlay('Applying your custom edits…');
  } else {
    showBuildOverlay('Crafting Your Website');
  }

  updatePreviewUrl(siteName);

  if (appMode === 'modify') {
    try {
      const res = await fetch('/api/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteName, modificationPrompt: promptText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply modifications');
    } catch (err) {
      threadErrorBubble('modifier', err.message);
      setGenerationRunning(false);
      hideRefineOverlay();
    }
  } else {
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText, siteName, maxIterations, stack })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start generation');
    } catch (err) {
      threadErrorBubble('builder', err.message);
      setGenerationRunning(false);
      hideBuildOverlay();
      if (!hasGeneratedOnce) showIdleOverlay();
    }
  }
}

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
  } catch (err) {
    setCodeStatus(err.message, 'error');
  } finally {
    btnSaveCode.disabled = isGenerating;
  }
}

function setupCodeEditor() {
  codeEditor.addEventListener('input', () => {
    codeDirty = codeEditor.value !== savedCode;
    setCodeStatus(codeDirty ? 'Unsaved changes — press Save & Apply (Ctrl+S)' : '', codeDirty ? 'dirty' : '');
  });

  codeEditor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveCode();
      return;
    }
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

    btnCopyDeployUrl.addEventListener('click', () => {
    const url = deployUrlText.textContent;
    const showCopiedFeedback = () => {
      const original = btnCopyDeployUrl.innerHTML;
      btnCopyDeployUrl.textContent = '✓';
      btnCopyDeployUrl.disabled = true;
      setTimeout(() => {
        btnCopyDeployUrl.innerHTML = original;
        btnCopyDeployUrl.disabled = false;
      }, 1500);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(showCopiedFeedback).catch(() => {
        fallbackCopyText(url, showCopiedFeedback);
      });
    } else {
      fallbackCopyText(url, showCopiedFeedback);
    }
  });
}

btnGenerate.addEventListener('click', async () => {
  if (isGenerating) {
    stopGeneration();
    return;
  }

  const prompt = promptInput.value.trim();
  const siteName = (siteNameInput.value.trim() || currentSite || 'site1').replace(/[^a-zA-Z0-9_-]/g, '');
  const maxIterations = Number(maxIterationsInput.value) || 2;
  const stack = (stackSelect && stackSelect.value) || 'react-tailwind-cdn';

  if (!prompt) {
    alert(appMode === 'modify' ? 'Please describe the modifications you want to make.' : 'Please enter a description for the website.');
    return;
  }

  if (codeDirty) {
    const proceed = confirm('You have unsaved code edits. Continue and discard them?');
    if (!proceed) return;
    codeDirty = false;
  }

  currentSite = siteName;
  currentRunId++;
  isStopped = false;
  showAiThreadCard();
  setGenerationRunning(true);

  if (appMode === 'create') {
    resetThread();
  }
  setThreadStatus('Working');
  closeChoiceBanner(true);
  threadAddUserPrompt(prompt);
  promptInput.value = '';

  if (appMode === 'modify') {
    showRefineOverlay('Applying your custom edits…');
  } else {
    showBuildOverlay('Crafting Your Website');
  }

  updatePreviewUrl(siteName);

  if (appMode === 'modify') {
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
      threadErrorBubble('modifier', err.message);
      setGenerationRunning(false);
      hideRefineOverlay();
    }
  } else {
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
      threadErrorBubble('builder', err.message);
      setGenerationRunning(false);
      hideBuildOverlay();
      if (!hasGeneratedOnce) showIdleOverlay();
    }
  }
});

function fallbackCopyText(text, onSuccess) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
    if (onSuccess) onSuccess();
  } catch (e) {
    console.warn('Copy failed', e);
  }
  document.body.removeChild(textarea);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


function renderDeploySteps(activeIdx) {
  deployStepList.innerHTML = DEPLOY_STEPS.map((s, i) => {
    const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending';
    const icon = state === 'done' ? '✓' : state === 'active'
      ? '<span class="deploy-step-spinner"></span>' : '';
    return `<li class="deploy-step ${state}"><span class="deploy-step-icon">${icon}</span>${escapeHtml(s.label)}</li>`;
  }).join('');
}

function startDeployStepCycle() {
  let i = 0;
  renderDeploySteps(0);
  deployStepInterval = setInterval(() => {
    if (i < DEPLOY_STEPS.length - 1) { i++; renderDeploySteps(i); }
  }, 1400);
}

function stopDeployStepCycle() {
  if (deployStepInterval) clearInterval(deployStepInterval);
  deployStepInterval = null;
}

function openDeployModal() {
  document.getElementById('deployModalTitle').textContent = 'Publishing Your Website';
  document.getElementById('deployModalSubtitle').textContent = 'Sit tight — this only takes a moment.';
  document.getElementById('deployModalIcon').textContent = '🚀';
  deployStepList.classList.remove('hidden');
  deployUrlBox.classList.add('hidden');
  deployErrorBox.classList.add('hidden');
  btnCloseDeployModal.classList.add('hidden'); // mandatory while working
  deployModal.classList.add('visible');
}

function showDeploySuccess(url) {
  document.getElementById('deployModalTitle').textContent = '🎉 Your Website is Live!';
  document.getElementById('deployModalSubtitle').textContent = 'Share the link below with anyone.';
  deployStepList.classList.add('hidden');
  deployUrlBox.classList.remove('hidden');
  deployUrlText.textContent = url;
  btnOpenDeployUrl.href = url;
  btnCloseDeployModal.classList.remove('hidden');
}

function showDeployError(message) {
  document.getElementById('deployModalTitle').textContent = 'Publishing Failed';
  document.getElementById('deployModalIcon').textContent = '⚠️';
  deployStepList.classList.add('hidden');
  deployErrorBox.classList.remove('hidden');
  deployErrorText.textContent = message;
  btnCloseDeployModal.classList.remove('hidden');
}

function closeDeployModal() {
  deployModal.classList.remove('visible');
}

function setLiveSiteUrl(siteName, url) {
  liveSiteUrls[siteName] = url;
  if (siteName === currentSite) reflectLiveState(url);
}

function reflectLiveState(url) {
  if (!btnChoiceDeploy) return;
  btnChoiceDeploy.classList.add('is-live');
  btnChoiceDeploy.querySelector('.deploy-btn-text').textContent = 'View Live Site ↗';
  if (btnRepublish) btnRepublish.classList.remove('hidden');
}

function resetLiveState() {
  if (!btnChoiceDeploy) return;
  btnChoiceDeploy.classList.remove('is-live');
  btnChoiceDeploy.querySelector('.deploy-btn-text').textContent = 'Publish Website (Get Live Link)';
  if (btnRepublish) btnRepublish.classList.add('hidden');
}

async function deployCurrentSiteToVercel() {
  const siteName = currentSite || siteNameInput.value.trim() || 'site1';
  openDeployModal();
  startDeployStepCycle();

  try {
    const res = await fetch('/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Publishing failed');

    stopDeployStepCycle();
    renderDeploySteps(DEPLOY_STEPS.length); // all done
    showDeploySuccess(data.url);
    setLiveSiteUrl(siteName, data.url);
  } catch (err) {
    stopDeployStepCycle();
    showDeployError(err.message);
  }
}
// ---------------------------------------------------------------------------
// UPDATED: stopGeneration() now branches on whether the builder had already
// produced a real site before the stop (hasGeneratedOnce), so a half-built
// site isn't just discarded — the user can keep editing it.
// ---------------------------------------------------------------------------
async function stopGeneration() {
  isStopped = true;

  try {
    await fetch('/api/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteName: currentSite })
    });
  } catch (e) {
    console.warn('Stop request failed', e);
  } finally {
    threadStopAllThinkingBubbles();
    setGenerationRunning(false);
    setThreadStatus('Idle');
    hideBuildOverlay();
    hideRefineOverlay();

    if (hasGeneratedOnce) {
      // A real site already exists on disk from before the stop — pull it
      // into the code tab / preview instead of treating it as lost work.
      fetchSiteCode(currentSite);
      setPublishButtonVisible(true);

      if (appMode === 'create') {
        threadAddDone('⏹ Generation stopped — your partial website was saved. Continue editing it below, or start fresh.');
        openChoiceBanner({ stopped: true }); // not mandatory — safe to dismiss
      } else {
        threadAddDone('⏹ Edit stopped — reverted to the last saved version. Keep making changes below.');
      }
    } else {
      // Nothing was ever produced — back to the idle state.
      showIdleOverlay();
      threadAddDone('⏹ Generation stopped before your website was created.');
    }
  }
}

const PREVIEW_ORIGIN = 'http://localhost:3456';
let inspectMode = false;

function sendToPreview(msg) {
  if (!hasGeneratedOnce || !previewIframe.src || previewIframe.src === 'about:blank') return;
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

previewIframe.addEventListener('load', syncInspectMode);

async function jumpToElementInCode(idx, tag,version) {
  if (isGenerating) return;

  if (codeDirty) {
    setCodeStatus('Save your edits first (Ctrl+S) so the code matches the preview, then click again.', 'error');
    return;
  }

  try {
    await fetchSiteCode(currentSite);
    const res = await fetch(`/api/site/${encodeURIComponent(currentSite)}/map`);
    if (!res.ok) throw new Error('Could not load element map');
    const { tags, version: currentVersion } = await res.json();

    // Preview is showing an older version of the file than the editor: refresh it
    if (version && currentVersion && version !== currentVersion) {
      previewIframe.src = previewIframe.src;
      setCodeStatus('Preview was out of date, so I refreshed it. Click the element again.', 'error');
      return;
    }
    const entry = tags[idx];
    if (!entry) throw new Error('Element not found in code');

    const [start, openEnd, end] = entry;
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
  jumpToElementInCode(msg.idx, msg.tag, msg.version);
});
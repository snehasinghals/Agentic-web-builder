const { ChatGroq } = require('@langchain/groq');

const DEFAULT_COOLDOWN_MS = 60 * 1000; // used when Groq doesn't say how long to wait

let pool = null;

// Built lazily so dotenv has already loaded by the time this runs
function getPool() {
  if (pool) return pool;

  const keys = [
    process.env.GROQ_API_KEY1,
    process.env.GROQ_API_KEY2,
    process.env.GROQ_API_KEY3,
    process.env.GROQ_API_KEY4,
    process.env.GROQ_API_KEY5,
    process.env.GROQ_API_KEY,
  ].filter(Boolean);

  const uniqueKeys = [...new Set(keys)];
  if (uniqueKeys.length === 0) {
    throw new Error('No Groq API keys found (GROQ_API_KEY1/2/3 or GROQ_API_KEY).');
  }

  pool = { entries: uniqueKeys.map((key, i) => ({ id: i + 1, key, blockedUntil: 0 })), current: 0 };
  return pool;
}

function isRotatable(err) {
  const status = err?.status || err?.response?.status;
  const msg = String(err?.message || '').toLowerCase();
  return (
    status === 429 || status === 401 || status === 403 || status >= 500 ||
    msg.includes('rate limit') || msg.includes('quota') ||
    msg.includes('tokens per') || msg.includes('too many requests')
  );
}

function cooldownFor(err) {
  const retryAfter = err?.headers?.['retry-after'] ?? err?.response?.headers?.['retry-after'];
  const secs = Number(retryAfter);
  return Number.isFinite(secs) && secs > 0 ? secs * 1000 : DEFAULT_COOLDOWN_MS;
}

/**
 * Calls a Groq model, switching to the next API key whenever the current one
 * hits its limit (429), is rejected (401/403) or the server errors (5xx).
 *
 * @param {Array} messages  LangChain/OpenAI-style messages
 * @param {Object} modelOptions  ChatGroq options WITHOUT apiKey (model, temperature, maxTokens...)
 */
async function invokeWithKeyRotation(messages, modelOptions) {
  const p = getPool();
  const total = p.entries.length;
  let lastErr;

  for (let attempt = 0; attempt < total; attempt++) {
    const idx = (p.current + attempt) % total;
    const entry = p.entries[idx];

    if (entry.blockedUntil > Date.now()) continue; // still cooling down

    try {
      const model = new ChatGroq({ ...modelOptions, apiKey: entry.key, maxRetries: 0 });
      const res = await model.invoke(messages);
      p.current = idx; // stick with the key that works
      return res;
    } catch (err) {
      lastErr = err;
      if (!isRotatable(err)) throw err; // e.g. bad request: another key won't help

      entry.blockedUntil = Date.now() + cooldownFor(err);
      console.warn(`[Groq] Key #${entry.id} unavailable (${err.status || ''} ${err.message}). Switching to next key...`);
    }
  }

  // Every key was blocked or failed
  const soonest = Math.min(...p.entries.map(e => e.blockedUntil));
  const waitSecs = Math.max(0, Math.ceil((soonest - Date.now()) / 1000));
  const error = new Error(`All Groq API keys are exhausted. Earliest key frees up in ~${waitSecs}s. Last error: ${lastErr?.message || 'n/a'}`);
  error.cause = lastErr;
  throw error;
}

module.exports = { invokeWithKeyRotation };
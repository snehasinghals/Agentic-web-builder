/**
 * Maps a raw backend error (Groq rate limits, network issues, etc.) to a
 * short, user-safe message. Call console.error(err) with the raw error
 * wherever this is used — this function only decides what the USER sees.
 */
function toFriendlyError(err) {
  const raw = (err && (err.message || String(err))) || '';

  // Groq rate-limit / token-quota errors (this is exactly what you hit)
  if (/rate_limit_exceeded|tokens per minute|TPM|keys are exhausted/i.test(raw)) {
    return "Our AI is handling a lot of requests right now. Please wait a few seconds and try again.";
  }

  // Request/response too large for the model
  if (/413|request too large/i.test(raw)) {
    return "Your request was a bit too large for our AI to process in one go. Please try again — it usually succeeds on retry.";
  }

  // Auth / key configuration issues
  if (/401|403|unauthorized|invalid api key/i.test(raw)) {
    return "We're having a configuration issue on our end. Please try again shortly.";
  }

  // Network / timeout issues
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|timeout/i.test(raw)) {
    return "The request timed out. Please check your connection and try again.";
  }

  // Upstream provider outage
  if (/\b5\d{2}\b|service unavailable|bad gateway/i.test(raw)) {
    return "Our AI service is temporarily unavailable. Please try again in a moment.";
  }

  // User-initiated stop — shouldn't normally reach here, but just in case
  if (/aborted by user/i.test(raw)) {
    return "Generation was stopped.";
  }

  // Fallback — never leak raw provider/stack details to the user
  return "Something went wrong while building your site. Please try again.";
}

module.exports = { toFriendlyError };
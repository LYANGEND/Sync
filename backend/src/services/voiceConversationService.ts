// ============================================================
// VOICE CONVERSATION SERVICE
// ============================================================
// Detects farewell intents so the frontend can gracefully end a voice call.

// ================================================================
// FAREWELL / CONVERSATION-END DETECTION
// ================================================================

const FAREWELL_PATTERNS = [
  // English farewells
  /\b(goodbye|good\s?bye|bye[\s-]?bye|bye|see\s?ya|see\s?you|later|take\s?care)\b/i,
  /\b(have\s?a\s?(good|nice|great|wonderful)\s?(day|night|evening|one|time|weekend))\b/i,
  // Gratitude that signals end
  /\b(thank\s?you\s*(so\s*much|very\s*much)?|thanks\s*(a\s*lot|so\s*much)?|cheers|much\s*appreciated|appreciate\s*it)\b/i,
  // "That's all" variants
  /\b(that['']?\s*s?\s*(all|it|everything)|nothing\s*(else|more)|i['']?\s*m?\s*(done|good|fine|okay|ok|set|finished))\b/i,
  // Explicit end request
  /\b(end|stop|close|exit|quit|leave)\s*(the\s*)?(call|chat|conversation|session|voice(\s*mode)?)\b/i,
  // Night sign-offs
  /\b(good\s*night|nighty?\s*night|sweet\s*dreams)\b/i,
  // Short final confirmations (only match when they ARE the whole message)
  /^\s*(ok|okay|alright|cool|great|perfect|wonderful|awesome|nice|got\s*it|no\s*that['']?\s*s?\s*(all|it))\s*[.!]?\s*$/i,
];

/**
 * Detect whether the user's message signals they want to end the conversation.
 * Returns isFarewell=true when confidence ≥ 0.6
 */
export function detectFarewell(text: string): { isFarewell: boolean; confidence: number } {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return { isFarewell: false, confidence: 0 };

  // Count how many farewell patterns match
  const matchCount = FAREWELL_PATTERNS.filter(p => p.test(normalized)).length;
  if (matchCount === 0) return { isFarewell: false, confidence: 0 };

  // Short messages with farewell signals → high confidence
  let confidence: number;
  if (normalized.length < 50) {
    confidence = Math.min(0.5 + matchCount * 0.2, 1.0);
  } else {
    // Longer messages — check if farewell is near the end
    const lastPart = normalized.slice(-60);
    const endMatch = FAREWELL_PATTERNS.filter(p => p.test(lastPart)).length;
    confidence = endMatch > 0 ? Math.min(0.4 + endMatch * 0.15, 0.85) : 0.3;
  }

  return { isFarewell: confidence >= 0.6, confidence };
}

/**
 * Check if the AI's own response is a goodbye (e.g. "Goodbye! Have a great day!")
 */
export function detectAIFarewell(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /\b(goodbye|bye|farewell|take\s*care|see\s*you|until\s*next\s*time|have\s*a\s*(good|nice|great|wonderful)\s*(day|night|evening|one))\b/i.test(normalized);
}

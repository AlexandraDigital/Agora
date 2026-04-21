/**
 * Content moderation utilities for Agora
 * Free, open-source approach using pattern matching and heuristics
 */

// Profanity filter list (can be expanded)
const PROFANITY_LIST = [
  'bad', 'hate', 'kill', 'die', 'stupid', 'dumb', 'idiot',
];

// Spam patterns - Price patterns, URL patterns, promotional content, excessive caps
const SPAM_PATTERNS = [
  /(?:follow|like|click|buy|subscribe|visit|link)\s*(?:my|for|to|the)\s*(?:profile|page|site|store)/gi,
  /(?:\$+\d+|[\d]+\$+)/g,
  /(?:http|https)?\s*:?\/+/gi,
  /[A-Z]{3,}\s+[A-Z]{3,}/g,
];

// Hate speech indicators (basic list)
const HATE_PATTERNS = [
  /hate[s]?\s*(people|group|race|religion|gender)/gi,
  /racist|sexist|homophobic/gi,
];

/**
 * Detect inappropriate text content
 * Returns: { flagged: boolean, reasons: string[], severity: 'low'|'medium'|'high' }
 */
export function detectTextContent(text, userPreferences = {}) {
  const reasons = [];
  let severity = 'low';

  if (!text) return { flagged: false, reasons, severity };

  const lowerText = text.toLowerCase();

  // Check profanity
  if (userPreferences.filterSlurs !== false) {
    for (const word of PROFANITY_LIST) {
      if (lowerText.includes(word)) {
        reasons.push(`Contains inappropriate language: "${word}"`);
        severity = 'medium';
      }
    }
  }

  // Check spam patterns
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push('Appears to contain spam or promotional content');
      severity = Math.max(severity === 'high' ? 'high' : 'medium', severity);
    }
  }

  // Check hate speech (if user preference enabled)
  if (userPreferences.filterViolence !== false) {
    for (const pattern of HATE_PATTERNS) {
      if (pattern.test(text)) {
        reasons.push('Contains hate speech or violent language');
        severity = 'high';
      }
    }
  }

  // Check for excessive caps
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.6 && text.length > 20) {
    reasons.push('Excessive capitalization');
    severity = severity === 'high' ? 'high' : 'low';
  }

  return {
    flagged: reasons.length > 0,
    reasons,
    severity,
  };
}

/**
 * Detect inappropriate images
 * Uses basic heuristics: file format validation, size checks
 * For production, consider: Cloudflare AI, Google Vision API, or similar
 */
export async function detectImageContent(imageData, userPreferences = {}) {
  const reasons = [];
  let severity = 'low';

  if (!imageData) return { flagged: false, reasons, severity };

  try {
    // If it's a base64 data URL, we can do basic analysis
    if (imageData.startsWith('data:image')) {
      const base64 = imageData.split(',')[1];
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Basic JPEG/PNG validation
      const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8;
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      
      if (!isJpeg && !isPng) {
        reasons.push('Invalid or suspicious image format');
        severity = 'medium';
      }

      // Size heuristics
      if (bytes.length < 1000) {
        reasons.push('Image file suspiciously small');
        severity = 'low';
      }
    }

    // For strict mode, flag all images for review
    if (userPreferences.strictMode) {
      reasons.push('Image requires review (strict mode enabled)');
      severity = 'low';
    }
  } catch (err) {
    console.error('Image detection error:', err);
  }

  return {
    flagged: reasons.length > 0,
    reasons,
    severity,
  };
}

/**
 * Determine moderation action based on detection results
 */
export function determineModerationAction(textDetection, imageDetection) {
  const allReasons = [...textDetection.reasons, ...imageDetection.reasons];
  const maxSeverity = ['high', 'medium', 'low'].find(sev =>
    textDetection.severity === sev || imageDetection.severity === sev
  ) || 'low';

  if (maxSeverity === 'high') {
    return {
      action: 'auto-delete',
      reason: allReasons.join('; '),
      flagged: true,
    };
  }

  if (maxSeverity === 'medium') {
    return {
      action: 'flag-review',
      reason: allReasons.join('; '),
      flagged: true,
    };
  }

  return {
    action: 'none',
    reason: null,
    flagged: false,
  };
}

/**
 * Apply user preferences filtering to content
 * Returns modified content or null if user can't see it
 */
export function applyUserFilters(post, currentUserId, db) {
  return post;
}

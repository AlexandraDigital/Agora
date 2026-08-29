/**
 * Discussion Prompt Generator
 * Generates thoughtful questions based on post content to encourage deep conversation
 */

// Question templates organized by theme
const questionTemplates = {
  personal: [
    "What aspect of this experience has stayed with you the most?",
    "How has this changed the way you think about things?",
    "What was the most surprising part of your journey here?",
    "If you could go back, what would you tell yourself at the beginning?",
    "What did you learn about yourself through this?",
  ],
  discovery: [
    "What's the most interesting implication of this discovery for you?",
    "How might this change the way people approach this problem?",
    "What question does this answer that you didn't know you had?",
    "What's the next logical step to explore based on this?",
    "How does this connect to things you already believed?",
  ],
  idea: [
    "What would be the biggest challenge in making this work?",
    "Who would benefit most from this idea, and why?",
    "What assumptions does this idea rest on?",
    "How might someone argue against this approach?",
    "What would need to be true for this to succeed?",
  ],
  question: [
    "What would your ideal answer look like?",
    "What have you already tried, and what happened?",
    "Why do you think this question matters?",
    "Who else might have insights on this?",
    "What would change if you knew the answer?",
  ],
  observation: [
    "What pattern do you see beneath this observation?",
    "Why do you think this is happening?",
    "How could someone with a different perspective view this?",
    "What would it take to change this dynamic?",
    "What does this reveal about how things actually work?",
  ],
  debate: [
    "What's the strongest version of the opposing view?",
    "Where do you think both sides might actually agree?",
    "What evidence would change your mind on this?",
    "What's one thing the other perspective gets right?",
    "How might context change which approach makes sense?",
  ],
  story: [
    "What moment in this story affected you the most?",
    "What does this story reveal about people or the world?",
    "What would you have done in that situation?",
    "How does this story connect to your own experience?",
    "What's the deeper truth this story is telling?",
  ],
  // Media-specific themes: used when the post has an attachment (audio,
  // image, video) and the caption itself gave detectTheme nothing more
  // specific to go on (e.g. "My own piano melody..." — no personal/
  // discovery/idea/etc. markers, so this fills in ahead of "general"
  // rather than after it).
  audio: [
    "What were you going for with this?",
    "What's the story behind this piece?",
    "What part of making this stands out to you?",
    "Is this part of something bigger you're working on?",
    "What should someone listen for on a first listen?",
  ],
  image: [
    "What made you want to capture this moment?",
    "What's just outside the frame here?",
    "What drew your eye to this in the first place?",
    "Is there a story behind this shot?",
    "What does this image mean to you?",
  ],
  video: [
    "What's the story behind this video?",
    "What moment in this stands out to you?",
    "What made you want to share this?",
    "Is there more to this story?",
    "What should someone pay attention to here?",
  ],
  general: [
    "What's the most interesting aspect of this to you?",
    "How does this relate to things you care about?",
    "What question does this raise for you?",
    "What's one thing you'd add to this?",
    "Why do you think this matters?",
  ],
};

// Post-attachment types that get their own template pool above when the
// caption itself is theme-neutral. Keys match post.media.type / the DB's
// mediaType column exactly, so callers can pass either through unchanged.
const MEDIA_THEMES = new Set(["audio", "image", "video"]);

/**
 * Detect the theme of a post based on its content, falling back to the
 * post's media type (if any) before landing on "general".
 */
function detectTheme(text, mediaType) {
  const hasText = !!(text && text.trim().length > 0);

  if (hasText) {
    const wordCount = text.split(/\s+/).length;

    // Personal experiences - stronger signals required
    if (/my (experience|journey|story|struggle|challenge)|(i learned|i realized|i discovered|i went through|i overcame|changed how i think)/i.test(text)) {
      return "personal";
    }

    // Single focused question (not a debate, just a question)
    if (/^\s*[^.!?]*\?/.test(text.trim()) && text.split("?").length === 2 && wordCount < 50) {
      return "question";
    }

    // Multiple questions (discussion prompt)
    if (text.split("?").length > 2) {
      return "question";
    }

    // Discoveries and research - stronger signals
    if (/(research (shows|indicates|demonstrates)|study (found|shows)|scientific evidence|data shows|turns out|fascinating fact|according to (research|studies)|experiment|findings|results)/i.test(text)) {
      return "discovery";
    }

    // Ideas and proposals - clearer indicators
    if (/(what if|imagine this|here's an idea|i propose|what about|consider this approach|should we|could we|proposal|new approach)/i.test(text)) {
      return "idea";
    }

    // Observations - stronger patterns
    if (/(i've noticed|i'm observing|i observe|i'm seeing a pattern|appears to|seems to be happening|i've been thinking about|strikes me|pattern|trend)/i.test(text)) {
      return "observation";
    }

    // Debates - stronger conflict signals (need more than just "but")
    if (/(i disagree|different view|opposing (view|side)|however, i think|on the other hand|counter to that|argument (against|for)|controversial|debate|versus)/i.test(text)) {
      return "debate";
    }

    // Stories - narrative signals (multiple story markers needed)
    const storyMarkers = (text.match(/(then|after that|next|finally|ended up|it happened|there was|suddenly|last week|this morning)/gi) || []).length;
    if (storyMarkers >= 2 && /(told|happened|experienced|lived|went through|shared|described)/i.test(text)) {
      return "story";
    }
  }

  // No caption theme matched (or there's no caption at all) — if the post
  // has an attachment, that's more specific to ask about than a fully
  // generic question, so use it before falling all the way to "general".
  if (mediaType && MEDIA_THEMES.has(mediaType)) {
    return mediaType;
  }

  return "general";
}

/**
 * Extract key concepts from post text
 */
function extractKeywords(text) {
  const keywords = [];

  // Look for emphasized words (in quotes)
  const quoted = text.match(/"([^"]+)"/g);
  if (quoted) keywords.push(...quoted.map(q => q.slice(1, -1)));

  // Look for capitalized concepts (potential proper nouns or emphasized terms)
  const capitalized = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
  if (capitalized) keywords.push(...capitalized.slice(0, 3));

  return keywords.slice(0, 2);
}

/**
 * Generate a discussion prompt based on post content.
 * mediaType is optional (post.media?.type / the DB's mediaType column —
 * "audio" | "image" | "video" | undefined) and only matters when the
 * caption itself doesn't match a more specific theme.
 */
export function generateDiscussionPrompt(postText, mediaType) {
  if ((!postText || postText.trim().length === 0) && !mediaType) {
    return "What are your thoughts on this?";
  }

  // Detect post theme
  const theme = detectTheme(postText, mediaType);
  const templatePool = questionTemplates[theme] || questionTemplates.general;

  // Pick a random question from the detected theme
  const prompt = templatePool[Math.floor(Math.random() * templatePool.length)];

  return prompt;
}

/**
 * Get multiple discussion prompts (for future use - could show alternatives)
 */
export function generateMultiplePrompts(postText, count = 3, mediaType) {
  const theme = detectTheme(postText, mediaType);
  const templatePool = questionTemplates[theme] || questionTemplates.general;
  const prompts = [];
  const used = new Set();

  while (prompts.length < count && used.size < templatePool.length) {
    const idx = Math.floor(Math.random() * templatePool.length);
    if (!used.has(idx)) {
      used.add(idx);
      prompts.push(templatePool[idx]);
    }
  }

  return prompts;
}

/**
 * Regenerate a discussion prompt (in case user wants a different question)
 */
export function regeneratePrompt(postText, previousPrompt, mediaType) {
  const theme = detectTheme(postText, mediaType);
  const templatePool = questionTemplates[theme] || questionTemplates.general;

  // Get a different question than the previous one
  let prompt;
  let attempts = 0;
  do {
    prompt = templatePool[Math.floor(Math.random() * templatePool.length)];
    attempts++;
  } while (prompt === previousPrompt && attempts < 5);

  return prompt;
}

export default {
  generateDiscussionPrompt,
  generateMultiplePrompts,
  regeneratePrompt,
};

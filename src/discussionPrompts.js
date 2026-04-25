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
  general: [
    "What's the most interesting aspect of this to you?",
    "How does this relate to things you care about?",
    "What question does this raise for you?",
    "What's one thing you'd add to this?",
    "Why do you think this matters?",
  ],
};

/**
 * Detect the theme of a post based on its content
 */
function detectTheme(text) {
  const lower = text.toLowerCase();

  // Personal experiences
  if (/i (experienced|learned|realized|discovered|found|went through|struggled|overcame)/i.test(text)) {
    return "personal";
  }

  // Discoveries and research
  if (/found that|discovered|research (shows|indicates)|study|found evidence|turns out|interesting fact/i.test(text)) {
    return "discovery";
  }

  // Ideas and proposals
  if (/(what if|imagine|should|could|idea|proposal|suggest|think we should)/i.test(text)) {
    return "idea";
  }

  // Questions
  if (/^\s*[^.!?]*\?/m.test(text) && text.split("?").length > 2) {
    return "question";
  }

  // Observations
  if (/(notice|noticed|observe|seeing|appears|seems|looks like|i've been thinking about)/i.test(text)) {
    return "observation";
  }

  // Debates or controversial topics
  if (/(but|however|disagree|different view|other hand|counter|argument|vs|versus)/i.test(text)) {
    return "debate";
  }

  // Stories
  if (/(happened|then|so|later|finally|ended up|it was|there was)/i.test(text)) {
    return "story";
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
 * Generate a discussion prompt based on post content
 */
export function generateDiscussionPrompt(postText) {
  if (!postText || postText.trim().length === 0) {
    return "What are your thoughts on this?";
  }

  // Detect post theme
  const theme = detectTheme(postText);
  const templatePool = questionTemplates[theme] || questionTemplates.general;

  // Pick a random question from the detected theme
  const prompt = templatePool[Math.floor(Math.random() * templatePool.length)];

  return prompt;
}

/**
 * Get multiple discussion prompts (for future use - could show alternatives)
 */
export function generateMultiplePrompts(postText, count = 3) {
  const theme = detectTheme(postText);
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
export function regeneratePrompt(postText, previousPrompt) {
  const theme = detectTheme(postText);
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

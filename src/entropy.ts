/**
 * Entropy check utilities for detecting concept recycling.
 */

/**
 * Tokenize text into lowercase words, strip punctuation, and remove stop words.
 * Returns deduplicated words with at least 3 characters.
 */
export function extractConcepts(text: string): string[] {
  const stopWords = new Set([
    "a",
    "an",
    "the",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "shall",
    "can",
    "to",
    "of",
    "in",
    "on",
    "at",
    "for",
    "from",
    "with",
    "by",
    "about",
    "as",
    "into",
    "through",
    "and",
    "or",
    "but",
    "not",
    "nor",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "i",
    "me",
    "you",
    "we",
    "our",
    "they",
    "them",
    "he",
    "she",
    "my",
    "your",
    "their",
    "what",
    "which",
    "who",
    "whom",
    "when",
    "where",
    "how",
    "why",
    "so",
    "if",
    "then",
    "than",
    "there",
    "here",
    "all",
    "each",
    "every",
    "both",
    "few",
    "any",
    "no",
    "more",
    "most",
    "other",
    "some",
    "such",
    "same",
    "just",
    "also",
    "very",
    "too",
    "only",
    "own",
    "up",
    "out",
    "over",
    "after",
    "before",
    "between",
    "under",
    "during",
    "without",
    "again",
    "once",
    "now",
    "even",
    "back",
    "still",
    "well",
  ]);

  if (!text) return [];

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !stopWords.has(word));

  return [...new Set(words)];
}

/**
 * Compute the overlap ratio (0.0 to 1.0) between current concepts and past realizations.
 * Past realizations are raw text strings that get concept-extracted internally.
 */
export function computeOverlap(concepts: string[], pastRealizations: string[]): number {
  if (concepts.length === 0 || !pastRealizations || pastRealizations.length === 0) {
    return 0;
  }

  const pastConcepts = new Set<string>();
  for (const realization of pastRealizations) {
    const extracted = extractConcepts(realization);
    for (const concept of extracted) {
      pastConcepts.add(concept);
    }
  }

  if (pastConcepts.size === 0) return 0;

  let matchCount = 0;
  for (const concept of concepts) {
    if (pastConcepts.has(concept)) {
      matchCount++;
    }
  }

  return matchCount / concepts.length;
}

/**
 * Identify which concepts from the current set already exist in past realizations.
 */
export function getOverlappingConcepts(
  concepts: string[],
  pastRealizations: string[]
): string[] {
  if (concepts.length === 0 || !pastRealizations || pastRealizations.length === 0) {
    return [];
  }

  const pastConcepts = new Set<string>();
  for (const realization of pastRealizations) {
    const extracted = extractConcepts(realization);
    for (const concept of extracted) {
      pastConcepts.add(concept);
    }
  }

  return concepts.filter((concept) => pastConcepts.has(concept));
}

/**
 * Compute Jaccard overlap between two sets of concept words.
 * Returns a value between 0 and 1.
 */
export function computeJaccardOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

import { Medication, MedicationCategory } from '../types';

export interface FuzzyMatchResult {
  medication: Medication;
  score: number;
  matchedFields: ('name' | 'genericName' | 'category' | 'barcode')[];
  categoryMatch?: MedicationCategory;
  isFuzzyTypo?: boolean;
}

/**
 * Calculates standard Levenshtein distance between two normalized strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prevRow: number[] = new Array(b.length + 1);
  const currRow: number[] = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j++) {
    prevRow[j] = j;
  }

  for (let i = 0; i < a.length; i++) {
    currRow[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      currRow[j + 1] = Math.min(
        currRow[j] + 1,       // insertion
        prevRow[j + 1] + 1,   // deletion
        prevRow[j] + cost     // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) {
      prevRow[j] = currRow[j];
    }
  }

  return prevRow[b.length];
}

/**
 * Checks if query characters appear sequentially within target.
 * Returns a compactness-weighted score.
 */
export function subsequenceMatch(query: string, target: string): { matches: boolean; score: number } {
  let qIdx = 0;
  let tIdx = 0;
  let score = 0;
  let consecutiveCount = 0;
  let firstMatchIdx = -1;

  while (qIdx < query.length && tIdx < target.length) {
    if (query[qIdx] === target[tIdx]) {
      if (firstMatchIdx === -1) firstMatchIdx = tIdx;
      consecutiveCount++;
      score += 15 * consecutiveCount;
      // Word boundary bonus
      if (tIdx === 0 || target[tIdx - 1] === ' ' || target[tIdx - 1] === '-' || target[tIdx - 1] === '/') {
        score += 35;
      }
      qIdx++;
    } else {
      consecutiveCount = 0;
    }
    tIdx++;
  }

  if (qIdx === query.length) {
    const span = tIdx - firstMatchIdx;
    const compactnessPenalty = Math.max(0, (span - query.length) * 2);
    return { matches: true, score: Math.max(10, score - compactnessPenalty) };
  }

  return { matches: false, score: 0 };
}

/**
 * Splits string into lowercase words/tokens without punctuation.
 */
function tokenize(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Evaluate single token fuzzy match against a list of words.
 */
function matchTokenAgainstWords(
  token: string,
  words: string[]
): { matched: boolean; score: number; isTypo: boolean } {
  let bestScore = 0;
  let matched = false;
  let isTypo = false;

  for (const word of words) {
    // 1. Exact word match
    if (word === token) {
      return { matched: true, score: 120, isTypo: false };
    }

    // 2. Word starts with token
    if (word.startsWith(token)) {
      const score = 100 - (word.length - token.length) * 2;
      if (score > bestScore) {
        bestScore = Math.max(70, score);
        matched = true;
      }
      continue;
    }

    // 3. Word contains token
    if (word.includes(token)) {
      const score = 65 - (word.length - token.length);
      if (score > bestScore) {
        bestScore = Math.max(45, score);
        matched = true;
      }
      continue;
    }

    // 4. Subsequence match within word
    if (token.length >= 3) {
      const sub = subsequenceMatch(token, word);
      if (sub.matches && sub.score > bestScore) {
        bestScore = sub.score;
        matched = true;
      }
    }

    // 5. Typo tolerance (Levenshtein distance)
    // For tokens >= 3 chars, test distance
    if (token.length >= 3) {
      // Check distance against whole word or word prefix of similar length
      const wordSlice = word.slice(0, Math.min(word.length, token.length + 1));
      const dist = levenshteinDistance(token, wordSlice);
      const maxAllowedDist = token.length <= 4 ? 1 : 2;

      if (dist <= maxAllowedDist) {
        const typoScore = 55 - dist * 15;
        if (typoScore > bestScore) {
          bestScore = typoScore;
          matched = true;
          isTypo = true;
        }
      }
    }
  }

  return { matched, score: bestScore, isTypo };
}

/**
 * Evaluates how well a medication matches a search query using fuzzy matching
 * across name, generic name, category, dosage, and barcode.
 */
export function scoreMedicationMatch(
  med: Medication,
  rawQuery: string
): FuzzyMatchResult | null {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return {
      medication: med,
      score: 0,
      matchedFields: [],
    };
  }

  const queryTokens = query.split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) {
    return { medication: med, score: 0, matchedFields: [] };
  }

  const nameLower = med.name.toLowerCase();
  const genericLower = med.genericName.toLowerCase();
  const categoryLower = med.category.toLowerCase();
  const barcodeLower = (med.barcode || '').toLowerCase();
  const dosageLower = (med.dosage || '').toLowerCase();

  const nameWords = tokenize(med.name);
  const genericWords = tokenize(med.genericName);
  const categoryWords = tokenize(med.category);
  const dosageWords = tokenize(med.dosage);

  let totalScore = 0;
  const matchedFields = new Set<'name' | 'genericName' | 'category' | 'barcode'>();
  let hasTypo = false;
  let categoryMatched: MedicationCategory | undefined = undefined;

  // Direct fast paths for entire query
  // Exact barcode match (high priority for scanning)
  if (barcodeLower && barcodeLower === query) {
    return {
      medication: med,
      score: 1000,
      matchedFields: ['barcode'],
    };
  }
  if (barcodeLower && barcodeLower.startsWith(query)) {
    totalScore += 450;
    matchedFields.add('barcode');
  }

  // Exact full name match
  if (nameLower === query) {
    totalScore += 600;
    matchedFields.add('name');
  } else if (nameLower.startsWith(query)) {
    totalScore += 450;
    matchedFields.add('name');
  } else if (nameLower.includes(query)) {
    totalScore += 300;
    matchedFields.add('name');
  }

  // Exact generic name match
  if (genericLower === query) {
    totalScore += 500;
    matchedFields.add('genericName');
  } else if (genericLower.startsWith(query)) {
    totalScore += 400;
    matchedFields.add('genericName');
  } else if (genericLower.includes(query)) {
    totalScore += 260;
    matchedFields.add('genericName');
  }

  // Exact or prefix category match
  if (categoryLower === query) {
    totalScore += 420;
    matchedFields.add('category');
    categoryMatched = med.category;
  } else if (categoryLower.startsWith(query)) {
    totalScore += 340;
    matchedFields.add('category');
    categoryMatched = med.category;
  } else if (categoryLower.includes(query)) {
    totalScore += 240;
    matchedFields.add('category');
    categoryMatched = med.category;
  }

  // Now evaluate each token in the query
  let allTokensMatched = true;

  for (const token of queryTokens) {
    let tokenMatched = false;
    let tokenBestScore = 0;

    // Check Name
    const nameMatch = matchTokenAgainstWords(token, nameWords);
    if (nameMatch.matched) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, nameMatch.score * 1.5);
      matchedFields.add('name');
      if (nameMatch.isTypo) hasTypo = true;
    }

    // Check Generic Name
    const genMatch = matchTokenAgainstWords(token, genericWords);
    if (genMatch.matched) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, genMatch.score * 1.3);
      matchedFields.add('genericName');
      if (genMatch.isTypo) hasTypo = true;
    }

    // Check Category
    const catMatch = matchTokenAgainstWords(token, categoryWords);
    if (catMatch.matched) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, catMatch.score * 1.1);
      matchedFields.add('category');
      categoryMatched = med.category;
      if (catMatch.isTypo) hasTypo = true;
    }

    // Check Dosage / Form
    const doseMatch = matchTokenAgainstWords(token, dosageWords);
    if (doseMatch.matched) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, doseMatch.score * 0.8);
    }

    // Check Barcode
    if (barcodeLower && barcodeLower.includes(token)) {
      tokenMatched = true;
      tokenBestScore = Math.max(tokenBestScore, 90);
      matchedFields.add('barcode');
    }

    // Subsequence check on full name if token is short and still not matched
    if (!tokenMatched && token.length >= 3) {
      const sub = subsequenceMatch(token, nameLower);
      if (sub.matches) {
        tokenMatched = true;
        tokenBestScore = sub.score;
        matchedFields.add('name');
      } else {
        const subGen = subsequenceMatch(token, genericLower);
        if (subGen.matches) {
          tokenMatched = true;
          tokenBestScore = subGen.score * 0.9;
          matchedFields.add('genericName');
        } else {
          const subCat = subsequenceMatch(token, categoryLower);
          if (subCat.matches) {
            tokenMatched = true;
            tokenBestScore = subCat.score * 0.8;
            matchedFields.add('category');
            categoryMatched = med.category;
          }
        }
      }
    }

    if (!tokenMatched) {
      allTokensMatched = false;
      break;
    }

    totalScore += tokenBestScore;
  }

  // If not all tokens matched, reject
  if (!allTokensMatched && totalScore < 200) {
    return null;
  }

  // Final score bonuses
  // Extra bonus if prescription or OTC status is in stock
  if (med.stock > 0) {
    totalScore += 10;
  }

  return {
    medication: med,
    score: Math.round(totalScore),
    matchedFields: Array.from(matchedFields),
    categoryMatch: categoryMatched,
    isFuzzyTypo: hasTypo,
  };
}

/**
 * Filter and rank a list of medications with fuzzy search.
 */
export function fuzzySearchMedications(
  medications: Medication[],
  query: string,
  selectedCategory: string = 'All'
): { results: Medication[]; matchDetails: Map<string, FuzzyMatchResult> } {
  const trimmed = query.trim();
  const matchDetails = new Map<string, FuzzyMatchResult>();

  // If no query, apply standard category filter and return
  if (!trimmed) {
    const results = selectedCategory === 'All'
      ? medications
      : medications.filter((m) => m.category === selectedCategory);
    return { results, matchDetails };
  }

  const scored: FuzzyMatchResult[] = [];

  for (const med of medications) {
    // If a specific category tab is selected, must match category
    if (selectedCategory !== 'All' && med.category !== selectedCategory) {
      continue;
    }

    const match = scoreMedicationMatch(med, trimmed);
    if (match && match.score > 0) {
      scored.push(match);
      matchDetails.set(med.id, match);
    }
  }

  // Sort by score descending (highest relevance first)
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Tie breaker: Alphabetical
    return a.medication.name.localeCompare(b.medication.name);
  });

  return {
    results: scored.map((s) => s.medication),
    matchDetails,
  };
}

/**
 * Find the single best medication match for Quick Add input using fuzzy matching.
 */
export function findBestQuickAddMatch(
  medications: Medication[],
  query: string
): Medication | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  let bestMed: Medication | null = null;
  let highestScore = -1;

  for (const med of medications) {
    const match = scoreMedicationMatch(med, trimmed);
    if (match && match.score > highestScore) {
      highestScore = match.score;
      bestMed = med;
    }
  }

  return highestScore > 0 ? bestMed : null;
}

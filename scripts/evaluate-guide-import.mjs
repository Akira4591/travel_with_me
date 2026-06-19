import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanGuideExtractedEvents } from '../js/guide-import-cleanup.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_INPUT = path.join(ROOT, 'tests', 'fixtures', 'guide-import-evaluation', 'cases.json');
const DEFAULT_THRESHOLDS = {
  recall: 0.85,
  falsePositiveRate: 0.15,
  dayAccuracy: 0.85,
  noteKeywordCoverage: 0.65,
  guideTypeAccuracy: 0.8,
  forbiddenHits: 0
};

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(ROOT, args.input || DEFAULT_INPUT);
const thresholds = { ...DEFAULT_THRESHOLDS, ...args.thresholds };
const cases = JSON.parse(await readFile(inputPath, 'utf8'));

if (!Array.isArray(cases) || !cases.length) {
  throw new Error(`No guide-import evaluation cases found in ${inputPath}`);
}

const caseResults = cases.map(evaluateCase);
const summary = summarize(caseResults);
const failedThresholds = getFailedThresholds(summary, thresholds);

if (args.json) {
  console.log(
    JSON.stringify(
      {
        input: path.relative(ROOT, inputPath),
        thresholds,
        summary,
        cases: caseResults
      },
      null,
      2
    )
  );
} else {
  printReport({ inputPath, thresholds, summary, caseResults, failedThresholds });
}

if (failedThresholds.length) {
  process.exitCode = 1;
}

function evaluateCase(testCase) {
  const expectedEvents = testCase.expected?.events || [];
  const actualEvents = normalizeActualEvents(testCase.modelOutput?.events || []);
  const matchedActualIndexes = new Set();
  const matched = [];
  let dayHits = 0;
  let noteKeywordHits = 0;
  let noteKeywordTotal = 0;

  for (const expected of expectedEvents) {
    const actualIndex = actualEvents.findIndex((actual, index) => {
      if (matchedActualIndexes.has(index)) return false;
      return namesMatch(expected.placeName, actual.placeName);
    });

    if (actualIndex < 0) {
      if (Array.isArray(expected.noteKeywords)) noteKeywordTotal += expected.noteKeywords.length;
      matched.push({ expected: expected.placeName, actual: null, dayOk: false, noteHits: 0 });
      continue;
    }

    matchedActualIndexes.add(actualIndex);
    const actual = actualEvents[actualIndex];
    const dayOk = normalizeDay(expected.day) === normalizeDay(actual.day);
    if (dayOk) dayHits += 1;

    const noteScore = scoreNoteKeywords(expected.noteKeywords || [], actual.note);
    noteKeywordHits += noteScore.hits;
    noteKeywordTotal += noteScore.total;

    matched.push({
      expected: expected.placeName,
      actual: actual.placeName,
      dayOk,
      noteHits: noteScore.hits,
      noteTotal: noteScore.total
    });
  }

  const falsePositiveEvents = actualEvents.filter((_, index) => !matchedActualIndexes.has(index));
  const forbiddenHits = countForbiddenHits(
    testCase.expected?.forbiddenPlaceNames || [],
    actualEvents.map(event => event.placeName)
  );
  const guideTypeOk =
    normalizeText(testCase.expected?.guideType) === normalizeText(testCase.modelOutput?.guide_type);

  return {
    id: testCase.id,
    title: testCase.title,
    expectedCount: expectedEvents.length,
    actualCount: actualEvents.length,
    matchedCount: matched.filter(item => item.actual).length,
    falsePositiveCount: falsePositiveEvents.length,
    forbiddenHits,
    guideTypeOk,
    recall: ratio(matched.filter(item => item.actual).length, expectedEvents.length),
    falsePositiveRate: ratio(falsePositiveEvents.length, Math.max(1, actualEvents.length)),
    dayAccuracy: ratio(dayHits, Math.max(1, matched.filter(item => item.actual).length)),
    noteKeywordCoverage: ratio(noteKeywordHits, Math.max(1, noteKeywordTotal)),
    missed: matched.filter(item => !item.actual).map(item => item.expected),
    falsePositiveEvents: falsePositiveEvents.map(item => item.placeName)
  };
}

function normalizeActualEvents(events) {
  return cleanGuideExtractedEvents(events)
    .map(event => ({
      placeName: String(event.place_name || event.placeName || '').trim(),
      day: normalizeDay(event.day),
      timeSlot: String(event.time_slot || event.timeSlot || '').trim(),
      note: String(event.note || '').trim()
    }))
    .filter(event => event.placeName);
}

function summarize(results) {
  const totals = results.reduce(
    (sum, item) => {
      sum.expectedCount += item.expectedCount;
      sum.actualCount += item.actualCount;
      sum.matchedCount += item.matchedCount;
      sum.falsePositiveCount += item.falsePositiveCount;
      sum.forbiddenHits += item.forbiddenHits;
      sum.guideTypeHits += item.guideTypeOk ? 1 : 0;
      return sum;
    },
    {
      caseCount: results.length,
      expectedCount: 0,
      actualCount: 0,
      matchedCount: 0,
      falsePositiveCount: 0,
      forbiddenHits: 0,
      guideTypeHits: 0
    }
  );

  return {
    ...totals,
    recall: ratio(totals.matchedCount, totals.expectedCount),
    falsePositiveRate: ratio(totals.falsePositiveCount, Math.max(1, totals.actualCount)),
    dayAccuracy: average(results.map(item => item.dayAccuracy)),
    noteKeywordCoverage: average(results.map(item => item.noteKeywordCoverage)),
    guideTypeAccuracy: ratio(totals.guideTypeHits, totals.caseCount)
  };
}

function getFailedThresholds(summary, thresholds) {
  const failures = [];
  for (const [metric, threshold] of Object.entries(thresholds)) {
    const actual = summary[metric];
    if (metric === 'falsePositiveRate' || metric === 'forbiddenHits') {
      if (actual > threshold) failures.push({ metric, actual, threshold, direction: '<=' });
    } else if (actual < threshold) {
      failures.push({ metric, actual, threshold, direction: '>=' });
    }
  }
  return failures;
}

function printReport({ inputPath, thresholds, summary, caseResults, failedThresholds }) {
  console.log(`Guide import evaluation: ${path.relative(ROOT, inputPath)}`);
  console.log('');
  console.table(
    caseResults.map(item => ({
      id: item.id,
      recall: formatPercent(item.recall),
      falsePositiveRate: formatPercent(item.falsePositiveRate),
      dayAccuracy: formatPercent(item.dayAccuracy),
      noteCoverage: formatPercent(item.noteKeywordCoverage),
      guideType: item.guideTypeOk ? 'ok' : 'fail',
      forbiddenHits: item.forbiddenHits
    }))
  );
  console.log('');
  console.table([
    {
      cases: summary.caseCount,
      expected: summary.expectedCount,
      actual: summary.actualCount,
      recall: formatPercent(summary.recall),
      falsePositiveRate: formatPercent(summary.falsePositiveRate),
      dayAccuracy: formatPercent(summary.dayAccuracy),
      noteCoverage: formatPercent(summary.noteKeywordCoverage),
      guideTypeAccuracy: formatPercent(summary.guideTypeAccuracy),
      forbiddenHits: summary.forbiddenHits
    }
  ]);

  const casesWithProblems = caseResults.filter(
    item => item.missed.length || item.falsePositiveEvents.length || item.forbiddenHits
  );
  if (casesWithProblems.length) {
    console.log('');
    console.log('Case details:');
    for (const item of casesWithProblems) {
      if (item.missed.length) console.log(`- ${item.id} missed: ${item.missed.join(', ')}`);
      if (item.falsePositiveEvents.length) {
        console.log(`- ${item.id} false positives: ${item.falsePositiveEvents.join(', ')}`);
      }
      if (item.forbiddenHits) console.log(`- ${item.id} forbidden hits: ${item.forbiddenHits}`);
    }
  }

  console.log('');
  console.log(`Thresholds: ${JSON.stringify(thresholds)}`);
  if (!failedThresholds.length) {
    console.log('Result: PASS');
    return;
  }

  console.log('Result: FAIL');
  for (const item of failedThresholds) {
    console.log(
      `- ${item.metric}: ${formatMetric(item.actual)} must be ${item.direction} ${formatMetric(item.threshold)}`
    );
  }
}

function parseArgs(argv) {
  const parsed = { thresholds: {}, json: false, input: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--input') {
      parsed.input = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--input=')) {
      parsed.input = arg.slice('--input='.length);
    } else if (arg === '--threshold') {
      Object.assign(parsed.thresholds, parseThreshold(argv[index + 1]));
      index += 1;
    } else if (arg.startsWith('--threshold=')) {
      Object.assign(parsed.thresholds, parseThreshold(arg.slice('--threshold='.length)));
    }
  }
  return parsed;
}

function parseThreshold(value = '') {
  const [key, raw] = value.split('=');
  const number = Number(raw);
  if (!key || !Number.isFinite(number)) return {};
  return { [key]: number };
}

function namesMatch(expected, actual) {
  const a = normalizePlaceName(expected);
  const b = normalizePlaceName(actual);
  if (!a || !b) return false;
  return a === b || (a.length >= 2 && b.includes(a)) || (b.length >= 2 && a.includes(b));
}

function countForbiddenHits(forbiddenNames, actualNames) {
  return forbiddenNames.reduce((count, forbidden) => {
    return count + (actualNames.some(actual => namesMatch(forbidden, actual)) ? 1 : 0);
  }, 0);
}

function scoreNoteKeywords(keywords, note) {
  const normalizedNote = normalizeText(note);
  const cleanKeywords = keywords.map(normalizeText).filter(Boolean);
  return {
    hits: cleanKeywords.filter(keyword => normalizedNote.includes(keyword)).length,
    total: cleanKeywords.length
  };
}

function normalizePlaceName(value) {
  return normalizeText(value).replace(/[·•・]/gu, '');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/gu, '')
    .replace(/[，。！？、；：,.!?;:()[\]{}"'“”‘’<>《》【】\-_/\\|]/gu, '');
}

function normalizeDay(value) {
  if (value === null || value === undefined || value === '') return null;
  const day = Number(value);
  return Number.isInteger(day) && day > 0 ? day : null;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatPercent(value) {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatMetric(value) {
  if (typeof value !== 'number') return String(value);
  if (value <= 1) return formatPercent(value);
  return String(value);
}

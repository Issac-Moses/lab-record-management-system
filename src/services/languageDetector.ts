/**
 * Language Detection Service
 * Real-time syntax pattern matching engine for Monaco Editor language auto-detection.
 */

export interface LanguageDetectionResult {
  detectedLanguage: string;
  confidence: number; // 0.0 to 1.0
  scores: Record<string, number>;
}

type Rule = {
  pattern: RegExp;
  weight: number;
};

const LANGUAGE_RULES: Record<string, Rule[]> = {
  html: [
    { pattern: /<!DOCTYPE\s+html>/i, weight: 1.0 },
    { pattern: /<\/?(html|head|body|div|span|p|a|img|table|tr|td|ul|li|h1|h2|h3|script|style|link|meta|input|form|button)\b[^>]*>/i, weight: 0.7 },
    { pattern: /\s*(class|id|href|src|style|alt|title)=["'][^"']*["']/i, weight: 0.4 },
  ],
  xml: [
    { pattern: /^<\?xml\s+version=/i, weight: 1.0 },
    { pattern: /xmlns(:[a-z0-9]+)?=["'][^"']*["']/i, weight: 0.8 },
    { pattern: /<\/[a-z0-9_-]+>/i, weight: 0.3 },
  ],
  json: [
    { pattern: /^\s*[\{\[]\s*"[a-zA-Z0-9_$-]+"\s*:/s, weight: 0.9 },
    { pattern: /:\s*("[^"]*"|\d+|true|false|null|[\{\[])/g, weight: 0.4 },
  ],
  css: [
    { pattern: /@import|@media|@keyframes|@font-face/i, weight: 0.9 },
    { pattern: /[a-z0-9_#-]+\s*\{\s*([a-z-]+:\s*[^;]+;\s*)+\}/i, weight: 0.9 },
    { pattern: /\b(margin|padding|background|color|border|font-size|display|flex|grid|position|top|left|height|width)\s*:\s*[^;]+/i, weight: 0.6 },
  ],
  sql: [
    { pattern: /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i, weight: 0.95 },
    { pattern: /\b(FROM|WHERE|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b/i, weight: 0.65 },
    { pattern: /\b(PRIMARY\s+KEY|FOREIGN\s+KEY|VARCHAR|INT|BIGINT|BOOLEAN|TIMESTAMP|NULL|NOT\s+NULL)\b/i, weight: 0.55 },
  ],
  java: [
    { pattern: /\bpublic\s+static\s+void\s+main\s*\(\s*String\s*(\[\s*\]|\.\.\.)\s+[a-zA-Z0-9_]+\s*\)/, weight: 1.0 },
    { pattern: /\bpublic\s+(final\s+)?class\s+[A-Z][a-zA-Z0-9_]*/, weight: 0.9 },
    { pattern: /\bSystem\.(out|err)\.print(ln)?\s*\(/, weight: 0.9 },
    { pattern: /\bimport\s+java\.[a-z0-9_.]+\s*;/i, weight: 0.9 },
    { pattern: /\bScanner\s+[a-zA-Z0-9_]+\s*=\s*new\s+Scanner\s*\(\s*System\.in\s*\)/, weight: 0.9 },
    { pattern: /\b(package\s+[a-z0-9_.]+;|extends\s+[A-Z]\w*|implements\s+[A-Z]\w*)/, weight: 0.7 },
  ],
  cpp: [
    { pattern: /#include\s*<[a-z0-9_.]+(.h)?>/i, weight: 0.8 },
    { pattern: /\busing\s+namespace\s+std\s*;/i, weight: 0.95 },
    { pattern: /\bstd::(cout|cin|endl|vector|string|map|unordered_map|set|pair|make_pair|unique_ptr|shared_ptr)\b/, weight: 0.9 },
    { pattern: /\b(cout\s*<<|cin\s*>>)/, weight: 0.9 },
    { pattern: /\b(template\s*<\s*typename|template\s*<\s*class|nullptr)\b/, weight: 0.8 },
  ],
  c: [
    { pattern: /#include\s*<stdio\.h>|#include\s*<stdlib\.h>|#include\s*<string\.h>/i, weight: 0.95 },
    { pattern: /\b(printf|scanf|malloc|calloc|realloc|free|fopen|fclose)\s*\(/, weight: 0.85 },
    { pattern: /\bint\s+main\s*\(\s*(void|int\s+argc\s*,\s*char\s*\*+\s*argv\s*\[\s*\])?\s*\)/, weight: 0.8 },
    { pattern: /\bstruct\s+[a-zA-Z0-9_]+\s*\{/, weight: 0.6 },
  ],
  php: [
    { pattern: /<\?php/i, weight: 1.0 },
    { pattern: /\$[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*/, weight: 0.7 },
    { pattern: /\b(echo|print_r|var_dump)\s+[^;]+;/i, weight: 0.7 },
    { pattern: /namespace\s+[a-zA-Z0-9_\\]+;/, weight: 0.8 },
  ],
  python: [
    { pattern: /\bif\s+__name__\s*==\s*['"]__main__['"]\s*:/, weight: 1.0 },
    { pattern: /\bdef\s+[a-zA-Z_]\w*\s*\(.*?\)\s*:/, weight: 0.85 },
    { pattern: /\bimport\s+[a-zA-Z0-9_, ]+|\bfrom\s+[a-zA-Z0-9_.]+\s+import/, weight: 0.75 },
    { pattern: /\b(print\s*\(|elif\s+.*?:|self\.[a-zA-Z_]|range\s*\(|enumerate\s*\(|len\s*\()/, weight: 0.65 },
    { pattern: /"""[\s\S]*?"""|'''[\s\S]*?'''/, weight: 0.6 },
  ],
  typescript: [
    { pattern: /\b(interface|type)\s+[A-Z][a-zA-Z0-9_]*/, weight: 0.95 },
    { pattern: /:\s*(string|number|boolean|any|unknown|never|void|object|Record<|Array<)[,;=\s\)]/, weight: 0.85 },
    { pattern: /\bas\s+(const|[A-Z][a-zA-Z0-9_]*)/, weight: 0.7 },
    { pattern: /\bexport\s+(interface|type|enum)\b/, weight: 0.9 },
  ],
  javascript: [
    { pattern: /\bconsole\.(log|error|warn|info)\s*\(/, weight: 0.8 },
    { pattern: /\b(const|let|var)\s+[a-zA-Z0-9_]+\s*=/, weight: 0.6 },
    { pattern: /\b(function\s+[a-zA-Z0-9_]*\s*\(|\)\s*=>\s*\{|\)\s*=>)/, weight: 0.65 },
    { pattern: /\bimport\s+.*?\s+from\s+['"][^'"]+['"]|\bexport\s+(default\s+)?(function|const|class)/, weight: 0.7 },
    { pattern: /\brequire\s*\(['"][^'"]+['"]\)/, weight: 0.7 },
    { pattern: /\bdocument\.(getElementById|querySelector|addEventListener)\b/, weight: 0.85 },
  ],
  go: [
    { pattern: /\bpackage\s+main\b/, weight: 1.0 },
    { pattern: /\bfunc\s+(main|\([a-zA-Z0-9_]+\s+\*?[a-zA-Z0-9_]+\)\s+[a-zA-Z0-9_]+)\s*\(/, weight: 0.95 },
    { pattern: /\bfmt\.(Println|Printf|Sprintf|Sprint)\s*\(/, weight: 0.9 },
    { pattern: /\bimport\s+\(\s*("[^"]+"\s*)+\)/, weight: 0.9 },
  ],
  ruby: [
    { pattern: /\bdef\s+[a-zA-Z0-9_!?]+(\(.*?\))?\s*$/, weight: 0.6 },
    { pattern: /\bputs\s+/, weight: 0.7 },
    { pattern: /\battr_(accessor|reader|writer)\b/, weight: 0.9 },
    { pattern: /\bdo\s+\|.*?\|/, weight: 0.8 },
    { pattern: /\b(elsif|unless|end)\b/, weight: 0.6 },
  ],
  bash: [
    { pattern: /^#!\/bin\/(bash|sh|zsh)/m, weight: 1.0 },
    { pattern: /\bif\s+\[\s+.*?\s+\];\s*then\b/, weight: 0.9 },
    { pattern: /\b(echo|chmod|chown|mkdir|rm -rf|grep|sed|awk|curl|wget)\b/, weight: 0.5 },
  ],
};

/**
 * Detect language from source code text using weighted pattern scoring.
 */
export function detectLanguage(
  code: string,
  options?: {
    currentLanguage?: string;
    threshold?: number;
  }
): LanguageDetectionResult {
  const currentLang = options?.currentLanguage || "python";
  const threshold = options?.threshold ?? 0.35;

  if (!code || typeof code !== "string" || code.trim().length < 8) {
    return {
      detectedLanguage: currentLang,
      confidence: 0,
      scores: {},
    };
  }

  const scores: Record<string, number> = {};

  for (const [lang, rules] of Object.entries(LANGUAGE_RULES)) {
    let score = 0;
    for (const rule of rules) {
      if (rule.pattern.test(code)) {
        score += rule.weight;
      }
    }
    if (score > 0) {
      scores[lang] = Math.round(score * 100) / 100;
    }
  }

  // TypeScript vs JavaScript refinement
  if (scores.typescript && scores.typescript > 0.5) {
    scores.javascript = (scores.javascript || 0) + scores.typescript * 0.5;
  }

  let topLanguage = currentLang;
  let maxScore = 0;
  let totalScoreSum = 0;

  for (const [lang, score] of Object.entries(scores)) {
    totalScoreSum += score;
    if (score > maxScore) {
      maxScore = score;
      topLanguage = lang;
    }
  }

  if (maxScore === 0 || totalScoreSum === 0) {
    return {
      detectedLanguage: currentLang,
      confidence: 0,
      scores: {},
    };
  }

  const confidence = Math.min(1.0, Math.round((maxScore / (totalScoreSum * 0.75)) * 100) / 100);

  if (confidence >= threshold && maxScore >= 0.6) {
    return {
      detectedLanguage: topLanguage,
      confidence,
      scores,
    };
  }

  return {
    detectedLanguage: currentLang,
    confidence,
    scores,
  };
}

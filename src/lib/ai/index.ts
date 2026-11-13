/**
 * Frontend surface for `scribe-ai` (Rust) + NLP sidecar fallbacks.
 * Prefer this barrel for AI helpers; low-level IPC stays in `@/lib/db/nlp-api`.
 */

export {
  nlpAnalyzeRevisionDiff as analyzeRevisionDiff,
  nlpBuildPrompt as buildPrompt,
  nlpCitationPack as citationPack,
  nlpDetectPii as detectPii,
  nlpExtractCommitments as extractCommitments,
  nlpExtractDecisions as extractDecisions,
  nlpExtractMentions as extractMentions,
  nlpExtractQuotes as extractQuotes,
  nlpForwardPlan as forwardPlan,
  nlpNotePulse as notePulse,
  nlpOpenLoops as openLoops,
  nlpPlanTools as planTools,
  nlpRankTasks as rankTasks,
  nlpReadingPlan as readingPlan,
  nlpRewriteQuery as rewriteQuery,
  nlpSectionSummaries as sectionSummaries,
  nlpSuggestContinuation as suggestContinuation,
  nlpSuggestTitle as suggestTitle,
  nlpTemplateFillHints as templateFillHints,
  nlpTonePack as tonePack,
  type BuildPromptResult,
  type CitationPackResult,
  type PlanToolsResult,
  type QueryRewriteResult,
  type RevisionAiReport,
} from '@/lib/db/nlp-api'

export { expandSearchQuery, searchNeedle } from '@/lib/ai/expand-search-query'

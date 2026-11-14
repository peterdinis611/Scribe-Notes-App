/**
 * Frontend surface for `scribe-ai` (Rust) + NLP sidecar fallbacks.
 * Prefer this barrel for AI helpers; low-level IPC stays in `@/lib/db/nlp-api`.
 */

export {
  nlpAnalyzeRevisionDiff as analyzeRevisionDiff,
  nlpBuildPrompt as buildPrompt,
  nlpCalendarEvents as calendarEvents,
  nlpCitationPack as citationPack,
  nlpDetectPii as detectPii,
  nlpDocumentAnalysis as documentAnalysis,
  nlpDocumentTasks as documentTasks,
  nlpExtractCommitments as extractCommitments,
  nlpExtractDecisions as extractDecisions,
  nlpExtractFlashcards as extractFlashcards,
  nlpExtractMentions as extractMentions,
  nlpExtractQuotes as extractQuotes,
  nlpExtractTakeaways as extractTakeaways,
  nlpForwardPlan as forwardPlan,
  nlpNotePulse as notePulse,
  nlpOpenLoops as openLoops,
  nlpPlanTools as planTools,
  nlpRankTasks as rankTasks,
  nlpReadingPlan as readingPlan,
  nlpRoadmap as roadmap,
  nlpRewriteQuery as rewriteQuery,
  nlpRewriteSelection as rewriteSelection,
  nlpSectionSummaries as sectionSummaries,
  nlpSimilarDocuments as similarDocuments,
  nlpSpellcheck as spellcheck,
  nlpStatus as status,
  nlpSuggestContinuation as suggestContinuation,
  nlpSuggestTags as suggestTags,
  nlpSuggestTitle as suggestTitle,
  nlpSuggestWikiLinks as suggestWikiLinks,
  nlpTemplateFillHints as templateFillHints,
  nlpTonePack as tonePack,
  nlpWritingCoach as writingCoach,
  type BuildPromptResult,
  type CitationPackResult,
  type DocumentTask,
  type NlpDocumentAnalysis,
  type NlpTemplateFillHints,
  type PlanToolsResult,
  type QueryRewriteResult,
  type RevisionAiReport,
  type SpellcheckResult,
  type WikiLinkSuggestion,
  type WritingCoachHint,
} from '@/lib/db/nlp-api'

export { expandSearchQuery, searchNeedle } from '@/lib/ai/expand-search-query'
export { prepareChatPrompt } from '@/lib/ai/chat-prompt'

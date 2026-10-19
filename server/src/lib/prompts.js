export const ANALYSIS_PROMPT_VERSION = "topic-analysis-v1";

export function buildAnalysisPrompt({ topic, ideas }) {
  return [
    "Analyze this brainstorming topic. Return only JSON matching:",
    '{"themes":["string"],"suggestions":["string"],"actionItems":[{"text":"string","priority":"low|medium|high"}]}',
    `Title: ${topic.title}`,
    `Description: ${topic.description || ""}`,
    `Goal: ${topic.goal || ""}`,
    "Ideas:",
    ...ideas.map((idea, index) => `${index + 1}. ${idea.text}`),
  ].join("\n");
}

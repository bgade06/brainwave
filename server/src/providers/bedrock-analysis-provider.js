import { AppError } from "../errors/app-error.js";

// Models sometimes wrap JSON in a ```json fence or add a lead-in sentence;
// take the outermost {...} span rather than requiring a bare JSON reply.
export function parseModelJson(text) {
  const start = text?.indexOf("{") ?? -1;
  const end = text?.lastIndexOf("}") ?? -1;
  try {
    if (start === -1 || end < start) throw new SyntaxError("No JSON object found");
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AppError(502, "AI_INVALID_RESPONSE", "The AI provider returned an invalid response");
  }
}

export class BedrockAnalysisProvider {
  constructor({ region, modelId, client }) {
    if (!modelId) throw new Error("BEDROCK_MODEL_ID is required");
    this.name = "bedrock";
    this.model = modelId;
    this.client = client;
    this.region = region;
  }

  async analyze({ prompt, signal }) {
    const { BedrockRuntimeClient, ConverseCommand } =
      await import("@aws-sdk/client-bedrock-runtime");
    const client = this.client ?? new BedrockRuntimeClient({ region: this.region });
    const response = await client.send(new ConverseCommand({
      modelId: this.model,
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: { temperature: 0.2 },
    }), { abortSignal: signal });
    const text = response.output?.message?.content?.find((part) => part.text)?.text;
    const parsed = parseModelJson(text);
    return {
      ...parsed,
      tokenUsage: {
        input: response.usage?.inputTokens ?? 0,
        output: response.usage?.outputTokens ?? 0,
      },
    };
  }
}

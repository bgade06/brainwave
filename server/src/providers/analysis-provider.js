import { z } from "zod";

export const providerOutputSchema = z.object({
  themes: z.array(z.string().trim().min(1).max(500)).max(50),
  suggestions: z.array(z.string().trim().min(1).max(5_000)).max(50),
  actionItems: z.array(z.object({
    text: z.string().trim().min(1).max(5_000),
    priority: z.enum(["low", "medium", "high"]).optional(),
  }).strict()).max(100),
  tokenUsage: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export class DeterministicAnalysisProvider {
  constructor({ model = "deterministic-test-v1", output } = {}) {
    this.name = "deterministic";
    this.model = model;
    this.output = output;
    this.calls = 0;
  }

  async analyze({ ideas }) {
    this.calls += 1;
    return this.output ?? {
      themes: ideas.length ? ["Collected ideas"] : ["Exploration"],
      suggestions: ["Review and prioritize the strongest option"],
      actionItems: [{ text: "Schedule a prioritization review", priority: "medium" }],
      tokenUsage: { input: ideas.length + 10, output: 12 },
    };
  }
}

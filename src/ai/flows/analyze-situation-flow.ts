'use server';
/**
 * @fileOverview AI Situation Analysis Flow for Emergency Responders.
 * Provides tactical advice based on emergency type and context.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AnalyzeSituationInputSchema = z.object({
  type: z.enum(['fire', 'crime', 'medical']),
  userName: z.string(),
  locationContext: z.string().optional(),
});
export type AnalyzeSituationInput = z.infer<typeof AnalyzeSituationInputSchema>;

const AnalyzeSituationOutputSchema = z.object({
  analysis: z.string().describe('Strategic tactical advice for responders.'),
  urgencyScore: z.number().describe('Urgency score from 1-10.'),
  suggestedResources: z.array(z.string()).describe('List of recommended equipment or units.'),
});
export type AnalyzeSituationOutput = z.infer<typeof AnalyzeSituationOutputSchema>;

export async function analyzeSituation(input: AnalyzeSituationInput): Promise<AnalyzeSituationOutput> {
  return analyzeSituationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeSituationPrompt',
  input: { schema: AnalyzeSituationInputSchema },
  output: { schema: AnalyzeSituationOutputSchema },
  prompt: `You are a high-level emergency dispatch strategist.
An emergency alert has been triggered:
Type: {{{type}}}
Reporter: {{{userName}}}
Location Context: {{{locationContext}}}

Analyze the situation and provide:
1. Tactical advice for the first responding units.
2. A numerical urgency score.
3. Specific resources that should be deployed immediately.

Keep the analysis concise and professional.`,
});

const analyzeSituationFlow = ai.defineFlow(
  {
    name: 'analyzeSituationFlow',
    inputSchema: AnalyzeSituationInputSchema,
    outputSchema: AnalyzeSituationOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
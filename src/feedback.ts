/* Importa as funções e bibliotecas necessárias */
import { generateObject } from 'ai';
import { z } from 'zod';
import { o3MiniModel } from './ai/providers';
import { systemPrompt } from './prompt';

/**
 * Gera feedback com base na questão do utilizador.
 *
 * Esta função utiliza um modelo de IA para formular perguntas de seguimento que ajudam a clarificar a direção da investigação.
 *
 * @param {Object} params - Parâmetros da função.
 * @param {string} params.query - A questão submetida pelo utilizador.
 * @param {number} [params.numQuestions=4] - Número máximo de perguntas a retornar.
 * @returns {Promise<string[]>} - Uma promessa que retorna um array de perguntas de seguimento.
 */
export async function generateFeedback({
  query,
  numQuestions = 4,
}: {
  query: string;
  numQuestions?: number;
}): Promise<string[]> {
  // Geração do feedback do utilizador com o modelo de IA.
  const userFeedback = await generateObject({
    model: o3MiniModel,
    system: systemPrompt(),
    prompt: `Dada a seguinte questão do utilizador, faz algumas perguntas de seguimento para clarificar a direção da investigação. Retorna um máximo de ${numQuestions} perguntas, mas podes retornar menos se a questão original estiver clara: <query>${query}</query>`,
    schema: z.object({
      questions: z
        .array(z.string())
        .describe(`Perguntas de seguimento para clarificar a direção da investigação, máximo de ${numQuestions}`),
    }),
  });

  // Seleciona e retorna até ao número máximo de perguntas definidas.
  return userFeedback.object.questions.slice(0, numQuestions);
}
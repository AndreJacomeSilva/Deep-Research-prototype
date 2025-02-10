import FirecrawlApp, { SearchResponse } from '@mendable/firecrawl-js';
import { generateObject } from 'ai';
import { compact } from 'lodash-es';
import pLimit from 'p-limit';
import { z } from 'zod';

import { o3MiniModel, trimPrompt } from './ai/providers';
import { systemPrompt } from './prompt';

/**
 * Tipo que representa os resultados da investigação.
 */
type ResearchResult = {
  learnings: string[];    // Lista de aprendizagens obtidas
  visitedUrls: string[];  // Lista de URLs visitadas
};

// Limite de concorrência para tarefas locais (não relacionado com a limitação da API)
const ConcurrencyLimit = 1;

// Inicializa o Firecrawl com a chave de API (opcional) e a URL base (opcional)
const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_KEY ?? '',
  apiUrl: process.env.FIRECRAWL_BASE_URL,
});

// Função de espera (sleep)
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Variável global para armazenar o timestamp da última chamada à API /search
let lastSearchCall = 0;
// Limitador global para as chamadas de pesquisa, garantindo que ocorram uma por vez
const searchLimiter = pLimit(1);

/**
 * Função wrapper que garante que as chamadas ao endpoint /search da API Firecrawl
 * respeitem o limite de 5 requests por minuto (ou seja, uma a cada 12 segundos).
 */
async function rateLimitedSearch(query: string, options: any) {
  return searchLimiter(async () => {
    const now = Date.now();
    const minInterval = 12_000; // 12 segundos entre chamadas
    const timeSinceLastCall = now - lastSearchCall;
    if (timeSinceLastCall < minInterval) {
      const waitTime = minInterval - timeSinceLastCall;
      console.log(`Aguardando ${waitTime}ms para não exceder o limite de /search`);
      await sleep(waitTime);
    }
    const result = await firecrawl.search(query, options);
    lastSearchCall = Date.now();
    return result;
  });
}

/**
 * Gera uma lista de consultas SERP com base no pedido do utilizador.
 *
 * @param query - Pedido do utilizador.
 * @param numQueries - Número máximo de consultas a gerar (valor padrão: 3).
 * @param learnings - Aprendizagens de pesquisas anteriores para refinar a consulta (opcional).
 * @returns Uma lista de objetos com a consulta e o objetivo da investigação.
 */
async function generateSerpQueries({
  query,
  numQueries = 3,
  learnings,
}: {
  query: string;
  numQueries?: number;
  learnings?: string[];
}) {
  const res = await generateObject({
    model: o3MiniModel,
    system: systemPrompt(),
    prompt: `Dado o seguinte pedido do utilizador, gere uma lista de consultas SERP para pesquisar o tópico. Retorna um máximo de ${numQueries} consultas, mas está à vontade para retornar menos se o pedido original for claro. Certifica-te de que cada consulta seja única e diferente entre si: <prompt>${query}</prompt>

${learnings ? `Aqui ficam apresentadas algumas aprendizagens de pesquisas anteriores, utilize-as para gerar consultas mais específicas: ${learnings.join('\n')}` : ''}`,
    schema: z.object({
      queries: z.array(
        z.object({
          query: z.string().describe('A consulta SERP'),
          researchGoal: z.string().describe(
            'Primeiro, descreva o objetivo da investigação que esta consulta pretende alcançar. Em seguida, indique como aprofundar a pesquisa uma vez obtidos os resultados, mencionando direcções adicionais para a investigação. Seja o mais específico possível, especialmente em relação às direcções adicionais.'
          ),
        })
      ).describe(`Lista de consultas SERP, com um máximo de ${numQueries}`)
    }),
  });
  console.log(`Criadas ${res.object.queries.length} consultas`, res.object.queries);

  return res.object.queries.slice(0, numQueries);
}

/**
 * Processa o resultado de uma pesquisa SERP e gera aprendizagens e perguntas de seguimento.
 *
 * @param query - A consulta SERP utilizada.
 * @param result - Resultado da pesquisa (SearchResponse).
 * @param numLearnings - Número máximo de aprendizagens a gerar (valor padrão: 3).
 * @param numFollowUpQuestions - Número máximo de perguntas de seguimento a gerar (valor padrão: 3).
 * @returns Um objeto contendo as aprendizagens e as perguntas de seguimento.
 */
async function processSerpResult({
  query,
  result,
  numLearnings = 3,
  numFollowUpQuestions = 3,
}: {
  query: string;
  result: SearchResponse;
  numLearnings?: number;
  numFollowUpQuestions?: number;
}) {
  // Remove valores nulos e limita o tamanho dos conteúdos
  const contents = compact(result.data.map(item => item.markdown)).map(content =>
    trimPrompt(content, 25_000)
  );
  console.log(`Executou a consulta "${query}", obtidos ${contents.length} conteúdos`);

  const res = await generateObject({
    model: o3MiniModel,
    abortSignal: AbortSignal.timeout(60_000),
    system: systemPrompt(),
    prompt: `Dado os seguintes conteúdos resultantes de uma pesquisa SERP para a consulta <query>${query}</query>, gere uma lista de aprendizagens extraídas desses conteúdos. Retorna um máximo de ${numLearnings} aprendizagens, mas está à vontade para retornar menos se os conteúdos forem claros. Certifica-te de que cada aprendizagem seja única e diferente entre si. As aprendizagens devem ser concisas e diretas, mas conter o máximo de detalhes e informação possível. Incluí quaisquer entidades, tais como pessoas, locais, empresas, produtos, etc., bem como quaisquer métricas exatas, números ou datas.

<contents>
${contents.map(content => `<content>\n${content}\n</content>`).join('\n')}
</contents>`,
    schema: z.object({
      learnings: z.array(z.string()).describe(`Lista de aprendizagens, com um máximo de ${numLearnings}`),
      followUpQuestions: z.array(z.string()).describe(
        `Lista de perguntas de seguimento para aprofundar a investigação, com um máximo de ${numFollowUpQuestions}`
      ),
    }),
  });
  console.log(`Geradas ${res.object.learnings.length} aprendizagens`, res.object.learnings);

  return res.object;
}

/**
 * Redige o relatório final sobre o tópico, utilizando as aprendizagens e as URLs visitadas.
 *
 * @param prompt - Pedido original do utilizador.
 * @param learnings - Lista de aprendizagens recolhidas.
 * @param visitedUrls - Lista de URLs visitadas.
 * @returns O relatório final em Markdown.
 */
export async function writeFinalReport({
  prompt,
  learnings,
  visitedUrls,
}: {
  prompt: string;
  learnings: string[];
  visitedUrls: string[];
}) {
  // Concatena as aprendizagens num único string e limita o tamanho máximo
  const learningsString = trimPrompt(
    learnings.map(learning => `<learning>\n${learning}\n</learning>`).join('\n'),
    150_000
  );

  const res = await generateObject({
    model: o3MiniModel,
    system: systemPrompt(),
    prompt: `Dado o seguinte pedido do utilizador, escreve um relatório final sobre o tópico utilizando as aprendizagens da investigação. Seja o mais detalhado possível, com o objetivo de ter 10 ou mais páginas, e inclua TODAS as aprendizagens recolhidas:

<prompt>${prompt}</prompt>

Aqui ficam listadas todas as aprendizagens recolhidas na investigação:

<learnings>
${learningsString}
</learnings>`,
    schema: z.object({
      reportMarkdown: z.string().describe('Relatório final sobre o tópico em Markdown'),
    }),
  });

  // Acrescenta uma secção para as fontes (URLs visitadas)
  const urlsSection =
    `\n\n## Fontes\n\n` + visitedUrls.map(url => `- ${url}`).join('\n');
  return res.object.reportMarkdown + urlsSection;
}

/**
 * Realiza uma investigação aprofundada utilizando um processo recursivo.
 *
 * @param query - Consulta inicial.
 * @param breadth - Número de consultas SERP a realizar na iteração actual.
 * @param depth - Nível de profundidade da investigação (número de iterações).
 * @param learnings - Aprendizagens acumuladas (opcional).
 * @param visitedUrls - URLs já visitadas (opcional).
 * @returns Um objeto contendo as aprendizagens acumuladas e as URLs visitadas.
 */
export async function deepResearch({
  query,
  breadth,
  depth,
  learnings = [],
  visitedUrls = [],
}: {
  query: string;
  breadth: number;
  depth: number;
  learnings?: string[];
  visitedUrls?: string[];
}): Promise<ResearchResult> {
  // Gera consultas SERP com base no pedido e nas aprendizagens precedentes
  const serpQueries = await generateSerpQueries({
    query,
    learnings,
    numQueries: breadth,
  });
  const limit = pLimit(ConcurrencyLimit);

  const results = await Promise.all(
    serpQueries.map(serpQuery =>
      limit(async () => {
        try {
          // Executa a pesquisa utilizando o endpoint /search da API Firecrawl, com limitação de taxa
          const result = await rateLimitedSearch(serpQuery.query, {
            timeout: 15000,
            limit: 5,
            scrapeOptions: { formats: ['markdown'] },
          });

          // Extrai URLs dos resultados da pesquisa
          const newUrls = compact(result.data.map(item => item.url));
          const newBreadth = Math.ceil(breadth / 2);
          const newDepth = depth - 1;

          // Processa os resultados para gerar aprendizagens e perguntas de seguimento
          const newLearnings = await processSerpResult({
            query: serpQuery.query,
            result,
            numFollowUpQuestions: newBreadth,
          });
          const allLearnings = [...learnings, ...newLearnings.learnings];
          const allUrls = [...visitedUrls, ...newUrls];

          if (newDepth > 0) {
            console.log(
              `A aprofundar a investigação, amplitude: ${newBreadth}, profundidade: ${newDepth}`
            );

            // Gera a próxima consulta com base no objetivo da investigação anterior e nas perguntas de seguimento
            const nextQuery = `
Objetivo da investigação anterior: ${serpQuery.researchGoal}
Perguntas de seguimento para aprofundar a investigação: ${newLearnings.followUpQuestions.map(q => `\n${q}`).join('')}
            `.trim();

            return deepResearch({
              query: nextQuery,
              breadth: newBreadth,
              depth: newDepth,
              learnings: allLearnings,
              visitedUrls: allUrls,
            });
          } else {
            return {
              learnings: allLearnings,
              visitedUrls: allUrls,
            };
          }
        } catch (e: any) {
          if (e.message && e.message.includes('Timeout')) {
            console.error(`Erro de tempo esgotado ao executar a consulta: ${serpQuery.query}: `, e);
          } else {
            console.error(`Erro ao executar a consulta: ${serpQuery.query}: `, e);
          }
          return {
            learnings: [],
            visitedUrls: [],
          };
        }
      })
    )
  );

  // Agrega os resultados, removendo duplicados, e retorna o resultado final
  return {
    learnings: [...new Set(results.flatMap(r => r.learnings))],
    visitedUrls: [...new Set(results.flatMap(r => r.visitedUrls))],
  };
}
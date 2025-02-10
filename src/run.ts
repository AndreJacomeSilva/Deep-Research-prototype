/* import dependencies */
import * as fs from 'fs/promises';
import * as readline from 'readline';

import { deepResearch, writeFinalReport } from './deep-research';
import { generateFeedback } from './feedback';

// Define ANSI color codes.
const LIGHT_BLUE = '\x1b[94m'; // light blue
const WHITE = '\x1b[97m';      // bright white
const RESET = '\x1b[0m';

// Create an interface for reading input from the standard input.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Helper function to obtain user input.
 * The prompt (question text) is displayed in light blue and then resets to white
 * so that the user's typed answer appears in white.
 *
 * @param pergunta - The question to present to the user.
 * @returns A Promise that resolves with the user's answer.
 */
function fazerPergunta(pergunta: string): Promise<string> {
  return new Promise(resolve => {
    // Here we wrap the question with LIGHT_BLUE then reset and switch to WHITE.
    const coloredPrompt = `${LIGHT_BLUE}${pergunta}${RESET}${WHITE}`;
    rl.question(coloredPrompt, resposta => {
      process.stdout.write(RESET); // Ensure the terminal is reset after input.
      resolve(resposta);
    });
  });
}

/**
 * Main function that runs the research agent.
 */
async function executar() {
  // Get the user's initial query.
  const consultaInicial = await fazerPergunta('Sobre o que gostarias de pesquisar? ');

  // Get the breadth and depth parameters for the research.
  const amplitudePesquisa =
    parseInt(
      await fazerPergunta(
        'Introduza a amplitude da pesquisa (recomendado 2-10, padrão 4): ',
      ),
      10,
    ) || 4;
  const profundidadePesquisa =
    parseInt(
      await fazerPergunta(
        'Introduza a profundidade da pesquisa (recomendado 1-5, padrão 2): ',
      ),
      10,
    ) || 2;

  console.log('A criar plano de pesquisa...');

  // Generate follow-up questions based on the initial query.
  const perguntasSeguimento = await generateFeedback({
    query: consultaInicial,
  });

  console.log(
    '\nPara compreender melhor as suas necessidades de pesquisa, por favor responda a estas perguntas de seguimento:'
  );

  // Gather answers for the follow-up questions.
  const respostas: string[] = [];
  for (const pergunta of perguntasSeguimento) {
    // Note that even here the prompt is colored.
    const resposta = await fazerPergunta(`\n${pergunta}\nA sua resposta: `);
    respostas.push(resposta);
  }

  // Combine all gathered information into a single query.
  const consultaCombinada = `
Consulta Inicial: ${consultaInicial}
Perguntas de Seguimento e Respostas:
${perguntasSeguimento.map((p, i) => `Pergunta: ${p}\nResposta: ${respostas[i]}`).join('\n')}
`;

  console.log('\nA pesquisar o seu tópico...');

  // Perform the in-depth research with the defined parameters.
  const { learnings, visitedUrls } = await deepResearch({
    query: consultaCombinada,
    breadth: amplitudePesquisa,
    depth: profundidadePesquisa,
  });

  // Display the research results.
  console.log(`\n\nAprendizagens:\n\n${learnings.join('\n')}`);
  console.log(
    `\n\nURLs visitadas (${visitedUrls.length}):\n\n${visitedUrls.join('\n')}`
  );
  console.log('A escrever o relatório final...');

  // Generate the final report based on the research.
  const relatorio = await writeFinalReport({
    prompt: consultaCombinada,
    learnings,
    visitedUrls,
  });

  // Save the final report to a file.
  await fs.writeFile('report.md', relatorio, 'utf-8');

  console.log(`\n\nRelatório Final:\n\n${relatorio}`);
  console.log('\nO relatório foi guardado em report.md');
  rl.close();
}

// Execute the main function and catch any errors.
executar().catch(console.error);
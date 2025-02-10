# Deep Research Proof-of-concept

A proof-of-concept of a workflow based on OpenAI Deep Research.

If used OpenAI o3Mini for reasoning, and firecrawl to run SERP queries.

This code is based on [David Zhang](https://github.com/dzhng) work.

## Message Flow Diagram
![Worflow](https://andrejacomesilvastorage.blob.core.windows.net/publico/images/Deep%20Research%20Workflow.png)


## Features

- **Iterative Research**: Performs deep research by iteratively generating search queries, processing results, and diving deeper based on findings.
- **Intelligent Query Generation**: Employs Large Language Models (LLMs) to create targeted search queries based on research objectives and prior discoveries.
- **Depth & Breadth Control**: Offers configurable parameters to manage the scope (breadth) and detail (depth) of the research.
- **Smart Follow-up**: Generates follow-up questions to better understand and refine research needs.
- **Comprehensive Reports**: Produces detailed markdown reports with findings and sources.

## Requirements

- Node.js environment
- API keys for:
  - Firecrawl API (for web search and content extraction)
  - OpenAI API (for o3 mini model)

## Setup

### Node.js

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Set up environment variables in a `.env.local` file:
```bash
FIRECRAWL_KEY="your_firecrawl_key"
OPENAI_KEY="your_openai_key"
```

To use local LLM, comment out `OPENAI_KEY` and instead uncomment `OPENAI_ENDPOINT` and `OPENAI_MODEL`:
- Set `OPENAI_ENDPOINT` to the address of your local server (eg."http://localhost:1234/v1")
- Set `OPENAI_MODEL` to the name of the model loaded in your local server.

## Usage

Run the research assistant:

```bash
npm start
```

You'll be prompted to:

1. Enter your research query
2. Specify research breadth (recommended: 3-10, default: 6)
3. Specify research depth (recommended: 1-5, default: 3)
4. Answer follow-up questions to refine the research direction

The system will then:

1. Generate and execute search queries
2. Process and analyze search results
3. Recursively explore deeper based on findings
4. Generate a comprehensive markdown report

The final report will be saved as `report.md` in your working directory.

### Concurrency

The code is optimized to use the free tier of [Firecrawl](https://www.firecrawl.dev/), ensuring the tool does not exceed the provided rate limitations.

## License

MIT License - feel free to use and modify as needed.

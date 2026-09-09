export const meta = {
  name: 'graphify-semantic-extraction',
  description: 'Parallel semantic extraction for graphify across 8 document chunks',
  phases: [
    { title: 'Extract', detail: 'Process document chunks in parallel' },
    { title: 'Merge', detail: 'Combine results and cache' },
  ],
};

const EXTRACTION_SPEC = `You are a graphify extraction subagent. Read the files listed and extract a knowledge graph fragment.
Output ONLY valid JSON matching the schema below - no explanation, no markdown fences, no preamble.

Files (chunk CHUNK_NUM of TOTAL_CHUNKS):
FILE_LIST

Rules:
- EXTRACTED: relationship explicit in source (import, call, citation)
- INFERRED: reasonable inference (shared data structure, implied dependency)
- AMBIGUOUS: uncertain - flag for review, do not omit

Doc/paper files: extract named concepts, entities, citations. For rationale (WHY decisions): store as rationale attribute on concept node. Use file_type:"rationale" for concept-like nodes. file_type MUST be one of: code, document, paper, image, rationale, concept.

confidence_score is REQUIRED on every edge:
- EXTRACTED edges: confidence_score = 1.0 always
- INFERRED edges: 0.95 (direct evidence), 0.85 (strong), 0.75 (reasonable), 0.65 (weak), 0.55 (speculative)
- AMBIGUOUS edges: 0.1-0.3

Node ID format: lowercase [a-z0-9_], format: {stem}_{entity} where stem is full repo-relative path, every segment joined with _. Never append chunk numbers.

Schema: {"nodes":[{"id":"path_entity","label":"Name","file_type":"document","source_file":"FILEPATH","source_location":null}],"edges":[{"source":"id","target":"id","relation":"references","confidence":"EXTRACTED","confidence_score":1.0,"source_file":"FILEPATH","weight":1.0}],"hyperedges":[],"input_tokens":0,"output_tokens":0}

Write JSON to: CHUNK_PATH`;

// Phase 1: Extract all chunks
const chunks = [
  { num: 1, suffix: 'aa' },
  { num: 2, suffix: 'ab' },
  { num: 3, suffix: 'ac' },
  { num: 4, suffix: 'ad' },
  { num: 5, suffix: 'ae' },
  { num: 6, suffix: 'af' },
  { num: 7, suffix: 'ag' },
  { num: 8, suffix: 'ah' },
];

const extractionTasks = chunks.map(({ num, suffix }) => {
  const chunkId = String(num).padStart(2, '0');
  const chunkPath = `/home/oneal/monorepo/graphify-out/.graphify_chunk_${chunkId}.json`;
  const chunkFile = `/home/oneal/monorepo/graphify-out/.chunk_split_${suffix}`;

  return () =>
    agent(
      `Extract knowledge graph from document chunk ${num}/8.

Read files listed in ${chunkFile} and extract concepts, entities, and relationships.

${EXTRACTION_SPEC.replace(/CHUNK_NUM/g, num)
  .replace(/TOTAL_CHUNKS/g, 8)
  .replace(/CHUNK_PATH/g, chunkPath)}

First, use Bash to read the file list:
cat ${chunkFile}

Then read each file and extract the graph, writing the result to ${chunkPath}`,
      {
        label: `extract-chunk-${num}`,
        phase: 'Extract',
      },
    );
});

const results = await parallel(extractionTasks);

// Phase 2: Merge
await agent(
  `Merge all graphify chunk results into one file.

1. Read all chunk files: /home/oneal/monorepo/graphify-out/.graphify_chunk_*.json
2. Merge nodes (dedupe by id), edges, hyperedges
3. Sum tokens
4. Write to /home/oneal/monorepo/graphify-out/.graphify_semantic_new.json

Schema: {"nodes":[],"edges":[],"hyperedges":[],"input_tokens":0,"output_tokens":0}`,
  {
    label: 'merge-results',
    phase: 'Merge',
  },
);

return { chunks: results.length };

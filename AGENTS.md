## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Focused AI assistance

- For code questions and fixes, inspect only the relevant functions or blocks first. Avoid loading or rewriting whole files when a focused excerpt or diff is enough.
- Keep spatial-data examples small: include at most two representative features or rows, and omit large coordinate arrays unless they are directly relevant.
- For spatial summaries or analysis, prefer aggregation and filtering in PostGIS/Django queries over sending raw feature collections or raster pixels to an AI model.
- When changing code, return and review a focused diff that preserves unrelated working-tree changes.

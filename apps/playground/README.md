# @any-harness/playground

Minimal reference harness on `@any-harness/metaharness` — e2e playground and
SDK-outreach demo. Runs one agent turn (or a REPL) through the AI SDK
`ToolLoopAgent` loop with capability injection:

- **storage** — `unstorage` fs driver at `.playground-store/`
- **secrets** — BYOK `SecretPort` over the injected env
- **bridge** — in-process demo host (`src/host.ts`) with canned extensions;
  the `list_extensions` / `get_extension` / `call_extension_tool` /
  `resolve_command` / `materialize_skill` tools read through it
- **exec** — computer-only slot, stubbed here (reports unavailability)

## Run

```bash
pnpm install
AI_BASE_URL=http://localhost:1234/v1 AI_MODEL_ID=<model> pnpm start
AI_BASE_URL=... AI_API_KEY=... AI_MODEL_ID=... pnpm start -- --prompt "list your extensions"
```

Any OpenAI-compatible endpoint works (OpenAI, Anthropic-compat gateways,
LM Studio, mocks). Try: "what extensions do you have?" — the model calls
`list_extensions` via bridge op `extensions.list`.

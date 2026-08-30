import assert from "node:assert/strict";
import test from "node:test";

test("top-level provider protocol becomes a capability when none are configured", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    {
      name: "Codex API",
      protocol: "openai_responses",
      baseUrl: "https://chatgpt.com/backend-api/codex",
      models: ["gpt-5.5"]
    }
  ]);

  assert.equal(providers?.length, 1);
  assert.deepEqual(providers[0].capabilities, [
    { baseUrl: "https://chatgpt.com/backend-api/codex", type: "openai_responses" }
  ]);
});

test("provider auto model refresh flag is parsed from camel and snake case config", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    {
      autoFetchKnownModels: ["model-a", "model-hidden"],
      autoFetchModels: true,
      baseUrl: "https://api.example.test/v1",
      models: ["model-a"],
      name: "Camel"
    },
    {
      auto_fetch_known_models: "model-b,model-hidden",
      auto_fetch_models: true,
      baseUrl: "https://api.example.test/v1",
      models: ["model-b"],
      name: "Snake"
    }
  ]);

  assert.equal(providers[0].autoFetchModels, true);
  assert.deepEqual(providers[0].autoFetchKnownModels, ["model-a", "model-hidden"]);
  assert.equal(providers[1].autoFetchModels, true);
  assert.deepEqual(providers[1].autoFetchKnownModels, ["model-b", "model-hidden"]);
});

test("explicit capabilities win over the top-level protocol", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    {
      name: "Codex API",
      protocol: "openai_responses",
      baseUrl: "https://chatgpt.com/backend-api/codex",
      capabilities: [
        { type: "openai_chat_completions", baseUrl: "https://example.com/v1" }
      ],
      models: []
    }
  ]);

  assert.deepEqual(providers[0].capabilities, [
    { baseUrl: "https://example.com/v1", endpoint: undefined, source: undefined, type: "openai_chat_completions" }
  ]);
});

test("protocol aliases are normalized", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    {
      name: "Claude Code API",
      protocol: "anthropic_messages",
      baseUrl: "https://api.anthropic.com",
      models: []
    }
  ]);

  assert.deepEqual(providers[0].capabilities, [
    { baseUrl: "https://api.anthropic.com", type: "anthropic_messages" }
  ]);
});

test("unknown or missing protocol yields no synthesized capability", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    { name: "DeepInfra", api_base_url: "https://api.deepinfra.com/v1/openai", models: [] },
    { name: "Mystery", protocol: "carrier_pigeon", baseUrl: "https://example.com", models: [] }
  ]);

  assert.equal(providers[0].capabilities, undefined);
  assert.equal(providers[1].capabilities, undefined);
});

test("protocol without any base URL yields no synthesized capability", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    { name: "Codex API", protocol: "openai_responses", models: [] }
  ]);

  assert.equal(providers[0].capabilities, undefined);
});

test("per-model protocol restriction accepts the same aliases as other protocol config", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    {
      baseUrl: "https://api.example.test/v1",
      modelMetadata: {
        "alias-openai": { protocols: ["openai"] },
        "alias-anthropic": { protocols: ["anthropic"] },
        "alias-images": { protocols: ["openai_images"] },
        "canonical": { protocols: ["openai_chat_completions"] },
        "snake-case": { protocol: "gemini_generate_content" }
      },
      models: ["alias-openai", "alias-anthropic", "alias-images", "canonical", "snake-case"],
      name: "Aliases",
      type: "openai_chat_completions"
    }
  ]);

  // An alias must never collapse into the block-everything empty set.
  assert.deepEqual(providers?.[0].modelMetadata?.["alias-openai"].protocols, ["openai_responses"]);
  assert.deepEqual(providers?.[0].modelMetadata?.["alias-anthropic"].protocols, ["anthropic_messages"]);
  assert.deepEqual(providers?.[0].modelMetadata?.["alias-images"].protocols, ["openai_image_generations"]);
  assert.deepEqual(providers?.[0].modelMetadata?.["canonical"].protocols, ["openai_chat_completions"]);
  assert.deepEqual(providers?.[0].modelMetadata?.["snake-case"].protocols, ["gemini_generate_content"]);
});

test("per-model protocol restriction keeps an explicit empty list and ignores junk", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    {
      baseUrl: "https://api.example.test/v1",
      modelMetadata: {
        blocked: { protocols: [] },
        deduped: { protocols: ["openai", "openai_responses", "anthropic"] },
        "all-junk": { protocols: ["bogus", 42] },
        "junk-mixed": { protocols: ["bogus", "anthropic"] }
      },
      models: ["blocked", "deduped", "all-junk", "junk-mixed"],
      name: "Edge cases",
      type: "openai_chat_completions"
    }
  ]);

  // An explicit empty array is meaningful: it blocks every protocol.
  assert.deepEqual(providers?.[0].modelMetadata?.blocked.protocols, []);
  assert.deepEqual(providers?.[0].modelMetadata?.deduped.protocols, ["openai_responses", "anthropic_messages"]);
  // A typo must not disable a working model: an unparseable-only list yields no
  // restriction at all (the metadata entry itself becomes empty and is dropped).
  assert.equal(providers?.[0].modelMetadata?.["all-junk"], undefined);
  assert.deepEqual(providers?.[0].modelMetadata?.["junk-mixed"].protocols, ["anthropic_messages"]);
});

test("provider protocolsManuallyEdited flag is parsed from camel and snake case config", async () => {
  const { parseProvidersForTest } = await import("@ccr/core/config/config.ts");
  const providers = parseProvidersForTest([
    { baseUrl: "https://a.test/v1", models: ["m"], name: "Camel", protocolsManuallyEdited: true },
    { baseUrl: "https://b.test/v1", models: ["m"], name: "Snake", protocols_manually_edited: true },
    { baseUrl: "https://c.test/v1", models: ["m"], name: "Unset" }
  ]);

  assert.equal(providers?.[0].protocolsManuallyEdited, true);
  assert.equal(providers?.[1].protocolsManuallyEdited, true);
  assert.equal(providers?.[2].protocolsManuallyEdited, undefined);
});

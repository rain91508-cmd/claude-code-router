import assert from "node:assert/strict";
import test from "node:test";
import { toCoreGatewayProviders } from "@ccr/core/providers/runtime-topology.ts";

const capabilities = [
  { baseUrl: "https://provider.example.test/v1", type: "openai_chat_completions" },
  { baseUrl: "https://provider.example.test", type: "anthropic_messages" },
  { baseUrl: "https://provider.example.test/v1", type: "openai_image_generations" }
];

function provider(modelMetadata, overrides = {}) {
  return {
    api_key: "sk-test",
    api_base_url: "https://provider.example.test/v1",
    capabilities,
    credentials: [{ apiKey: "sk-test", id: "dual-main" }],
    id: "dual",
    modelMetadata,
    models: ["openai-only", "blocked", "both", "image-model"],
    name: "Dual",
    type: "openai_chat_completions",
    ...overrides
  };
}

function modelsByType(coreProviders) {
  return Object.fromEntries(coreProviders.map((item) => [item.type, item.models]));
}

test("compiled runtime providers drop models whose restriction excludes their protocol", () => {
  const compiled = toCoreGatewayProviders(provider({
    "openai-only": { protocols: ["openai_chat_completions"] },
    "blocked": { protocols: [] }
  }));
  const models = modelsByType(compiled);

  assert.deepEqual(models.openai_chat_completions, ["openai-only", "both", "image-model"]);
  // A model restricted to OpenAI, and one blocked outright, are not advertised on Anthropic.
  assert.deepEqual(models.anthropic_messages, ["both", "image-model"]);
});

test("compiled runtime providers are removed when no model may use them", () => {
  const compiled = toCoreGatewayProviders(provider({
    "openai-only": { protocols: ["openai_chat_completions"] },
    "blocked": { protocols: [] },
    "both": { protocols: ["openai_chat_completions"] },
    "image-model": { protocols: ["openai_chat_completions"] }
  }));

  assert.deepEqual(Object.keys(modelsByType(compiled)).filter((type) => type === "anthropic_messages"), []);
});

test("compiled media providers keep their models: chat checks never probe media protocols", () => {
  const compiled = toCoreGatewayProviders(provider({
    "image-model": { protocols: ["openai_chat_completions"] },
    "blocked": { protocols: [] }
  }));
  const models = modelsByType(compiled);

  // A per-model list comes from chat connectivity checks, so it must not remove
  // the model from the image-generation runtime provider — every model stays.
  assert.deepEqual(models.openai_image_generations, ["openai-only", "blocked", "both", "image-model"]);
});

test("compiled providers without explicit capabilities honor the restriction too", () => {
  const compiled = toCoreGatewayProviders(provider(
    { "openai-only": { protocols: ["anthropic_messages"] } },
    { capabilities: undefined }
  ));

  assert.equal(compiled.length, 1);
  assert.equal(compiled[0].type, "openai_chat_completions");
  // The only model allowed on the inferred protocol is excluded, leaving none.
  assert.deepEqual(compiled[0].models.filter((model) => model === "openai-only"), []);
});

test("compiled providers are unchanged when no model declares protocols", () => {
  const compiled = toCoreGatewayProviders(provider({
    "openai-only": { contextWindow: 128000 },
    both: undefined
  }));

  assert.deepEqual(modelsByType(compiled).openai_chat_completions, [
    "openai-only", "blocked", "both", "image-model"
  ]);
  assert.deepEqual(modelsByType(compiled).anthropic_messages, [
    "openai-only", "blocked", "both", "image-model"
  ]);
});

test("per-model restriction lookup is case-insensitive", () => {
  const compiled = toCoreGatewayProviders(provider({
    "OpenAI-Only": { protocols: ["openai_chat_completions"] }
  }));

  assert.deepEqual(modelsByType(compiled).anthropic_messages, ["blocked", "both", "image-model"]);
});

# opencode-provider-cliproxy

An [OpenCode](https://opencode.ai) plugin that uses a [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
instance as the source of truth for a provider's model list.

Instead of maintaining a `models` map by hand, the plugin reads `GET <baseURL>/models` and registers every model it
returns, refreshing in the background.

## Install

Add the plugin to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugins": ["github:auenkr/opencode-provider-cliproxy"]
}
```

OpenCode installs missing package plugins on startup, so no `npm install` step is required. You can also run:

```sh
opencode plugin add github:auenkr/opencode-provider-cliproxy
```

Pin a revision with a full commit hash: `github:auenkr/opencode-provider-cliproxy#<sha>`.

## Configure

The plugin expects a provider (default id `cliproxy`) that points at your CLIProxyAPI instance:

```jsonc
{
  "plugins": ["github:auenkr/opencode-provider-cliproxy"],
  "providers": {
    "cliproxy": {
      "name": "CLIProxyAPI",
      "env": ["CLIPROXY_API_KEY"],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "{env:CLIPROXY_BASE_URL}",
        "apiKey": "{env:CLIPROXY_API_KEY}"
      }
    }
  }
}
```

The provider no longer needs a `models` block. Export the variables used above before starting OpenCode:

```sh
export CLIPROXY_BASE_URL=http://127.0.0.1:8317/v1
export CLIPROXY_API_KEY=<your-key>
```

Everything can also be passed as plugin options, which take precedence over the environment:

```jsonc
{
  "plugins": [
    {
      "package": "github:auenkr/opencode-provider-cliproxy",
      "options": {
        "providerID": "cliproxy",
        "baseURL": "http://127.0.0.1:8317/v1",
        "apiKey": "…",
        "refreshMs": 300000,
        "exclude": ["gpt-image-*"]
      }
    }
  ]
}
```

| Option | Default | Purpose |
| --- | --- | --- |
| `providerID` | `cliproxy` | Provider to register the discovered models under. |
| `baseURL` | `CLIPROXY_BASE_URL` | Base URL of the OpenAI-compatible endpoint. `/models` is appended. |
| `apiKey` | `CLIPROXY_API_KEY` | Sent as `Authorization: Bearer …` when set. |
| `refreshMs` | `300000` | How often to re-read the endpoint. |
| `exclude` | `["gpt-image-*"]` | Glob patterns for model IDs to skip. |

## Behavior

- Models are added to the provider; existing entries are left alone, so per-model overrides such as `limit`,
  `capabilities`, or `body` are preserved.
- When the model list includes CLIProxyAPI `thinking` metadata, the plugin exposes each supported effort as an
  OpenCode model variant and routes the selected effort through `reasoningEffort`. The level names reported by the
  endpoint become the variant ids, and `zero_allowed` adds a `none` variant. A `variants` list you set yourself for a
  model in `providers.cliproxy.models` takes precedence over the generated one.
- The plugin only adds and updates models. A model that disappears from the endpoint stays registered until OpenCode
  restarts, so an entry you maintain by hand in `providers.cliproxy.models` is never removed by a refresh.
- `gpt-image-*` is excluded by default because image models do not fit the chat-completions route.
- The endpoint reports no context limits or capabilities, so OpenCode's fallback assumptions apply (tools enabled,
  text and image input, 200k context, 32k output). Set `limit` or `capabilities` per model in `providers.cliproxy.models`
  if a model differs.

## Requirements

- OpenCode v2.0.30 or newer.
- The `@opencode/plugin` module is provided by the OpenCode host; do not bundle your own copy.

## License

MIT

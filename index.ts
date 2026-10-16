import { Model, Plugin, Provider } from "@opencode/plugin"

type Options = {
  providerID?: string
  baseURL?: string
  apiKey?: string
  refreshMs?: number
  exclude?: string[]
}

type ProxyThinking = {
  levels?: unknown
  zero_allowed?: unknown
}

type ProxyModel = {
  id?: unknown
  thinking?: ProxyThinking
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const toMatchers = (patterns: readonly string[]) =>
  patterns.map((pattern) => new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`))

// The endpoint reports reasoning support as a CLIProxyAPI "thinking" object.
// OpenCode exposes reasoning controls through model variants, so every level
// becomes a variant that selects that effort for the request.
const reasoningEfforts = (entry: ProxyModel) => {
  const levels = Array.isArray(entry.thinking?.levels)
    ? entry.thinking.levels.filter((level): level is string => typeof level === "string" && level.length > 0)
    : []
  const efforts = [...new Set(levels)]
  if (entry.thinking?.zero_allowed === true && !efforts.includes("none")) efforts.unshift("none")
  return efforts
}

export default Plugin.define({
  id: "cliproxy.models",
  async setup(ctx) {
    const options = (ctx.options ?? {}) as Options
    const providerID = Provider.ID.make(options.providerID ?? "cliproxy")
    const baseURL = (options.baseURL ?? process.env.CLIPROXY_BASE_URL ?? "").replace(/\/+$/, "")
    const apiKey = options.apiKey ?? process.env.CLIPROXY_API_KEY ?? ""
    const refreshMs = options.refreshMs ?? 300_000
    const excludes = toMatchers(options.exclude ?? ["gpt-image-*"])

    if (!baseURL) {
      console.error("[cliproxy.models] no baseURL: set plugins[].options.baseURL or CLIPROXY_BASE_URL")
      return
    }

    const fetchModels = async () => {
      const response = await fetch(`${baseURL}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      })
      if (!response.ok) throw new Error(`GET ${baseURL}/models failed with ${response.status}`)
      const body = (await response.json()) as { data?: ProxyModel[] }
      return (body.data ?? [])
        .filter((entry) => typeof entry?.id === "string" && entry.id.length > 0)
        .filter((entry) => !excludes.some((matcher) => matcher.test(entry.id as string)))
        .sort((a, b) => (a.id as string).localeCompare(b.id as string))
    }

    const applyModels = async (entries: readonly ProxyModel[]) => {
      await ctx.provider.transform((editor) => {
        for (const entry of entries) {
          const id = entry.id as string
          const efforts = reasoningEfforts(entry)
          editor.models.update(providerID, Model.ID.make(id), (draft) => {
            if (!draft.name) draft.name = id
            if (efforts.length > 0) {
              draft.variants = efforts.map((effort) => ({
                id: Model.VariantID.make(effort),
                settings: { reasoningEffort: effort },
              }))
            }
          })
        }
      })
    }

    const signature = (entries: readonly ProxyModel[]) =>
      JSON.stringify(entries.map((entry) => [entry.id, reasoningEfforts(entry)]))

    let models = await fetchModels()
    let synced = signature(models)
    await applyModels(models)

    const sync = async () => {
      const next = await fetchModels()
      const nextSynced = signature(next)
      if (nextSynced === synced) return
      models = next
      synced = nextSynced
      await applyModels(models)
      await ctx.provider.reload()
    }

    const timer = setInterval(() => {
      void sync().catch((error) => console.error("[cliproxy.models] refresh failed:", error))
    }, refreshMs)
    return () => clearInterval(timer)
  },
})

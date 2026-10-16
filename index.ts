import { Plugin } from "@opencode/plugin"

type Options = {
  providerID?: string
  baseURL?: string
  apiKey?: string
  refreshMs?: number
  exclude?: string[]
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const toMatchers = (patterns: readonly string[]) =>
  patterns.map((pattern) => new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`))

export default Plugin.define({
  id: "cliproxy.models",
  async setup(ctx) {
    const options = (ctx.options ?? {}) as Options
    const providerID = options.providerID ?? "cliproxy"
    const baseURL = (options.baseURL ?? process.env.CLIPROXY_BASE_URL ?? "").replace(/\/+$/, "")
    const apiKey = options.apiKey ?? process.env.CLIPROXY_API_KEY ?? ""
    const refreshMs = options.refreshMs ?? 300_000
    const excludes = toMatchers(options.exclude ?? ["gpt-image-*"])

    if (!baseURL) {
      console.error("[cliproxy.models] no baseURL: set plugins[].options.baseURL or CLIPROXY_BASE_URL")
      return
    }

    const fetchModelIDs = async () => {
      const response = await fetch(`${baseURL}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      })
      if (!response.ok) throw new Error(`GET ${baseURL}/models failed with ${response.status}`)
      const body = (await response.json()) as { data?: { id?: unknown }[] }
      return (body.data ?? [])
        .map((entry) => entry?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .filter((id) => !excludes.some((matcher) => matcher.test(id)))
        .sort((a, b) => a.localeCompare(b))
    }

    let ids = await fetchModelIDs()

    await ctx.provider.transform((editor) => {
      for (const id of ids) {
        editor.models.update(providerID, id, (draft) => {
          if (!draft.name) draft.name = id
        })
      }
    })

    const sync = async () => {
      const next = await fetchModelIDs()
      if (next.join("\n") === ids.join("\n")) return
      ids = next
      await ctx.provider.reload()
    }

    const timer = setInterval(() => {
      void sync().catch((error) => console.error("[cliproxy.models] refresh failed:", error))
    }, refreshMs)
    return () => clearInterval(timer)
  },
})

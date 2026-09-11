/**
 * Renders the subset of Markdown Discord actually supports into HTML.
 *
 * This is deliberately *not* the shared `useMarkdown()` composable: that one is
 * configured with `html: true` because it renders trusted README files, while
 * Discord messages are arbitrary user input. Everything here escapes first and
 * only then applies a fixed set of replacements, so a message can never inject
 * a tag, an `on*` handler or a `javascript:` URL into the launcher.
 */

const ESCAPED: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#39;',
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ESCAPED[char] ?? char)
}

export interface DiscordMarkdownOptions {
  /** BCP-47 tag used for `<t:...>` timestamps, e.g. `es-ES`. */
  locale?: string
  /** Label rendered for `<@id>`, which cannot be resolved without the guild. */
  userMention?: string
  /** Label rendered for `<@&id>`. */
  roleMention?: string
  /** Label rendered for `<#id>`. */
  channelMention?: string
}

const HTTP_URL = /^https?:\/\/[^\s<>"']+$/i

/**
 * Delimiter for the stashed-HTML placeholders.
 *
 * A Private Use Area code point rather than `\u0000`: it cannot occur in
 * normal message text, it survives HTML escaping untouched, and unlike a
 * control character it does not trip the `no-control-regex` rule. It is also
 * stripped from the input below, so a message cannot forge a placeholder.
 */
const SENTINEL = '\uE000'

/** Only `http(s)` links become anchors; anything else stays inert text. */
function safeHref(url: string) {
  return HTTP_URL.test(url) ? url : ''
}

/**
 * Drops every control character except tab and newline, plus the sentinel.
 *
 * A plain loop instead of a range regex: control characters in a pattern are
 * exactly what `no-control-regex` warns about, and filtering by code point
 * states the intent ("keep whitespace that renders, drop the rest") more
 * directly than `[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]` does.
 */
function stripInvisible(source: string) {
  let out = ''
  for (const char of source) {
    const code = char.charCodeAt(0)
    if (code === 9 || code === 10) {
      out += char
    } else if (code < 32 || code === 127 || code === SENTINEL.charCodeAt(0)) {
      continue
    } else {
      out += char
    }
  }
  return out
}

function formatTimestamp(epochSeconds: number, style: string, locale: string) {
  const date = new Date(epochSeconds * 1000)
  if (Number.isNaN(date.getTime())) return ''
  try {
    if (style === 'R' || style === 'r') {
      const diff = (date.getTime() - Date.now()) / 1000
      const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
        ['year', 60 * 60 * 24 * 365],
        ['month', 60 * 60 * 24 * 30],
        ['day', 60 * 60 * 24],
        ['hour', 60 * 60],
        ['minute', 60],
      ]
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
      for (const [unit, seconds] of units) {
        if (Math.abs(diff) >= seconds || unit === 'minute') {
          return rtf.format(Math.round(diff / seconds), unit)
        }
      }
    }
    const options: Intl.DateTimeFormatOptions
      = style === 'T' || style === 't'
        ? { hour: '2-digit', minute: '2-digit' }
        : style === 'D' || style === 'd'
          ? { year: 'numeric', month: 'long', day: 'numeric' }
          : { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    return new Intl.DateTimeFormat(locale, options).format(date)
  } catch {
    // An unsupported locale tag throws in some runtimes; the ISO date still reads fine.
    return date.toISOString().slice(0, 10)
  }
}

/**
 * Converts a Discord message body to HTML.
 *
 * The pipeline stashes every construct that produces HTML into numbered
 * placeholders first, then escapes whatever is left, then applies the inline
 * and block formatting. Escaping last-but-before-restore is what makes the
 * whole thing injection-proof.
 */
export function renderDiscordMarkdown(source: string, options: DiscordMarkdownOptions = {}): string {
  const locale = options.locale || 'en'
  const slots: string[] = []
  const stash = (html: string) => {
    slots.push(html)
    return `${SENTINEL}${slots.length - 1}${SENTINEL}`
  }

  // Strip control characters that would otherwise survive into the DOM, keeping
  // tab and newline, and drop any sentinel the author typed so it cannot forge a
  // placeholder index and replay one of our stashed fragments.
  let text = stripInvisible(source)

  // Fenced code blocks are matched before anything else so their backticks,
  // emoji and angle brackets are never reinterpreted.
  text = text.replace(/```[^\S\n]*[a-zA-Z0-9+#-]*\n?([\s\S]*?)(?:```|$)/g, (_m, body: string) =>
    stash(`<pre class="ml-md-pre"><code>${escapeHtml(body.replace(/\n$/, ''))}</code></pre>`))

  text = text.replace(/`([^`\n]+)`/g, (_m, body: string) => stash(`<code class="ml-md-code">${escapeHtml(body)}</code>`))

  // Custom emoji, animated or not, are served from Discord's CDN.
  text = text.replace(/<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,24})>/g, (_m, animated: string, name: string, id: string) => {
    const ext = animated ? 'gif' : 'png'
    const alt = escapeHtml(`:${name}:`)
    return stash(`<img class="ml-md-emoji" draggable="false" loading="lazy" alt="${alt}" title="${alt}" src="https://cdn.discordapp.com/emojis/${id}.${ext}?size=32">`)
  })

  // Message timestamps: `<t:1712345678:R>`.
  text = text.replace(/<t:(-?\d{1,17})(?::([a-zA-Z]))?>/g, (_m, epoch: string, style: string) =>
    stash(`<span class="ml-md-timestamp">${escapeHtml(formatTimestamp(Number(epoch), style || 'g', locale))}</span>`))

  // Mentions cannot be resolved without querying the guild, so they degrade to a
  // labelled chip instead of dumping `<@123456789012345678>` on screen.
  const user = escapeHtml(options.userMention ?? 'user')
  const role = escapeHtml(options.roleMention ?? 'role')
  const channel = escapeHtml(options.channelMention ?? 'channel')
  text = text.replace(/<@!(\d{17,24})>/g, () => stash(`<span class="ml-md-mention">@${user}</span>`))
  text = text.replace(/<@(\d{17,24})>/g, () => stash(`<span class="ml-md-mention">@${user}</span>`))
  text = text.replace(/<@&(\d{17,24})>/g, () => stash(`<span class="ml-md-mention">@${role}</span>`))
  text = text.replace(/<#(\d{17,24})>/g, () => stash(`<span class="ml-md-mention">#${channel}</span>`))

  // `[label](url)` before bare-URL detection, or the linkifier would eat the URL
  // out of the Markdown form.
  text = text.replace(/\[([^\]\n]*)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const href = safeHref(url)
    if (!href) return stash(escapeHtml(label))
    return stash(`<a href="${escapeHtml(href)}" target="browser" rel="noopener noreferrer">${escapeHtml(label)}</a>`)
  })

  text = text.replace(/(^|[^\w"'>])(https?:\/\/[^\s<>"]+)/g, (_m, prefix: string, url: string) => {
    // Trim trailing punctuation that is almost never part of the URL.
    const trimmed = url.replace(/[),.;:!?]+$/, '')
    const rest = url.slice(trimmed.length)
    const href = safeHref(trimmed)
    if (!href) return prefix + url
    return prefix + stash(`<a href="${escapeHtml(href)}" target="browser" rel="noopener noreferrer">${escapeHtml(trimmed)}</a>`) + rest
  })

  // `@everyone` / `@here` ping every reader, so they get Discord's highlight.
  text = text.replace(/@(everyone|here)\b/g, (_m, word: string) => stash(`<span class="ml-md-mention">@${word}</span>`))

  /** Escapes one line of body text, then applies Discord's inline formatting. */
  function inline(raw: string) {
    let out = escapeHtml(raw)
    // Order matters: the doubled markers must be consumed before the single ones.
    out = out.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    out = out.replace(/__([^_\n]+?)__/g, '<span class="ml-md-underline">$1</span>')
    out = out.replace(/~~([^~\n]+?)~~/g, '<s>$1</s>')
    out = out.replace(/(?<![*\w])\*([^*\n]+?)\*(?![*\w])/g, '<em>$1</em>')
    // Word boundaries keep `snake_case_names` from being italicised.
    out = out.replace(/(?<![\w_])_([^_\n]+?)_(?![\w_])/g, '<em>$1</em>')
    out = out.replace(/\|\|([^|\n]+?)\|\|/g, '<span class="ml-md-spoiler">$1</span>')
    return out
  }

  const out: string[] = []
  const quotes: string[] = []
  let listOpen = false

  function flushQuote() {
    if (quotes.length === 0) return
    out.push(`<blockquote class="ml-md-quote">${quotes.join('<br>')}</blockquote>`)
    quotes.length = 0
  }
  function flushList() {
    if (!listOpen) return
    out.push('</ul>')
    listOpen = false
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+$/, '')

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      flushQuote()
      flushList()
      out.push(`<strong class="ml-md-heading">${inline(heading[2])}</strong>`)
      continue
    }

    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      flushList()
      quotes.push(inline(quote[1]))
      continue
    }
    flushQuote()

    const bullet = /^\s*[-*]\s+(.+)$/.exec(line)
    if (bullet) {
      if (!listOpen) {
        out.push('<ul class="ml-md-list">')
        listOpen = true
      }
      out.push(`<li>${inline(bullet[1])}</li>`)
      continue
    }
    flushList()

    const token = line.trim()
    // A stashed `<pre>` is block-level already and must not be wrapped or joined.
    if (/^\uE000\d+\uE000$/.test(token)) {
      out.push(token)
      continue
    }
    if (token === '') {
      out.push('<br>')
      continue
    }
    out.push(`${inline(line)}<br>`)
  }
  flushQuote()
  flushList()

  return out
    .join('')
    .replace(/(?:<br>)+$/, '')
    .replace(/\uE000(\d+)\uE000/g, (_m, index: string) => slots[Number(index)] ?? '')
}

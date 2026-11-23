/**
 * Host half of the stock ticker bundle.
 *
 * The browser never talks to the quote provider directly: it calls one
 * authenticated same-origin route, and this module reads `qt.gtimg.cn` on the
 * Host. That keeps the response out of CORS and lets the Host decode the
 * provider's GBK payload and pick the fields the ticker needs.
 *
 * One request carries every code in the ticker (the provider accepts a
 * comma-separated list), so a row of instruments costs one round trip.
 */

/** Exact Fetch route the Client half calls: `GET /api/dsh-stock-bbar/quote?code=a,b,c`. */
const ROUTE_PATH = '/api/dsh-stock-bbar/quote'
/** Quote provider; one GET parameter carries the comma-separated codes (`q=sh000001,sz399001`). */
const ENDPOINT = 'https://qt.gtimg.cn/q='
/** Shanghai Composite Index, the same default the Client half starts with. */
const DEFAULT_CODE = 'sh000001'
/** Upper bound for one request; beyond this the URL and the row both stop being useful. */
const MAX_CODES = 20
const REQUEST_TIMEOUT_MS = 8000
/** Upstream codes this ticker accepts: market prefix plus a short code body. */
const CODE_PATTERN = /^(sh|sz|bj|hk)[0-9a-z.]{1,12}$/

/**
 * Accepts what a user types and returns the provider's code form.
 * `600519` becomes `sh600519`, `sz399001` stays as typed, `00700` becomes `hk00700`.
 * @param {unknown} raw
 * @returns {string | null} the code, or null when it cannot be one
 */
function normalizeCode(raw) {
  const value = String(raw === undefined || raw === null ? '' : raw).trim().replace(/\s+/g, '')
  if (value === '') return null
  if (/^[0-9]{6}$/.test(value)) {
    const head = value.charAt(0)
    if (head === '5' || head === '6' || head === '9') return 'sh' + value
    if (head === '4' || head === '8') return 'bj' + value
    return 'sz' + value
  }
  if (/^[0-9]{5}$/.test(value)) return 'hk' + value
  const lowered = value.toLowerCase()
  return CODE_PATTERN.test(lowered) ? lowered : null
}

/**
 * Splits the client's list on a comma in either width and normalizes every part.
 * @param {unknown} raw
 * @returns {string[] | null} the codes without duplicates, or null when any part is invalid
 */
function normalizeCodes(raw) {
  const parts = String(raw === undefined || raw === null ? '' : raw)
    .split(/[,\uFF0C]/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  if (parts.length === 0) return null
  const codes = []
  for (const part of parts) {
    const code = normalizeCode(part)
    if (code === null) return null
    if (codes.includes(code) === false) codes.push(code)
  }
  return codes
}

/**
 * Reads every `v_<code>="market~name~code~price~prevClose~...~time~change~changePct"`
 * record in the payload; a code the provider does not know is simply absent.
 * @param {string} text decoded response body
 * @returns {Array<{ code: string, name: string, price: string, prevClose: string, change: string, changePct: string, time: string }>}
 */
function parseQuotes(text) {
  const quotes = []
  const pattern = /v_([a-z0-9]+)="([^"]*)"/gi
  let matched = pattern.exec(text)
  while (matched !== null) {
    const fields = matched[2].split('~')
    if (fields.length >= 5) {
      const name = fields[1] === undefined ? '' : fields[1]
      const price = fields[3] === undefined ? '' : fields[3]
      if (name !== '' && price !== '') {
        quotes.push({
          code: matched[1],
          name,
          price,
          prevClose: fields[4] === undefined ? '' : fields[4],
          change: fields[31] === undefined ? '' : fields[31],
          changePct: fields[32] === undefined ? '' : fields[32],
          time: formatTime(fields[30] === undefined ? '' : fields[30]),
        })
      }
    }
    matched = pattern.exec(text)
  }
  return quotes
}

/**
 * The provider's stamp differs by market: A-shares send `20261120104606`, while
 * Hong Kong sends `2026/11/20 11:00:56` and US `2026-11-19 16:00:01`. All three
 * are normalised to one readable stamp.
 * @param {string} raw
 * @returns {string} `2026-11-20 10:46:06`, or an empty string when absent
 */
function formatTime(raw) {
  if (/^[0-9]{14}$/.test(raw)) {
    return (
      raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8) + ' ' +
      raw.slice(8, 10) + ':' + raw.slice(10, 12) + ':' + raw.slice(12, 14)
    )
  }
  if (/^[0-9]{4}[/-][0-9]{2}[/-][0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(raw)) {
    return raw.replaceAll('/', '-')
  }
  return ''
}

/**
 * @param {string} code
 * @returns {{ code: string, message: string }}
 */
function failure(code, message) {
  return { code, message }
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describe(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * @param {unknown} body
 * @returns {Response}
 */
function json(body) {
  return Response.json(body, { headers: { 'cache-control': 'no-store' } })
}

/**
 * @param {string[]} codes normalized provider codes
 * @returns {Promise<{ ok: true, value: { quotes: object[], missing: string[] } } | { ok: false, error: { code: string, message: string } }>}
 */
async function readQuotes(codes) {
  let response
  try {
    response = await fetch(ENDPOINT + codes.map(encodeURIComponent).join(','), {
      headers: { accept: '*/*' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    const timedOut = error !== null && typeof error === 'object' && error.name === 'TimeoutError'
    return { ok: false, error: failure(timedOut ? 'timeout' : 'upstream', describe(error)) }
  }
  if (response.ok === false) {
    return { ok: false, error: failure('upstream', 'quote provider responded HTTP ' + response.status) }
  }
  let text
  try {
    text = new TextDecoder('gbk').decode(new Uint8Array(await response.arrayBuffer()))
  } catch (error) {
    return { ok: false, error: failure('upstream', describe(error)) }
  }
  const quotes = parseQuotes(text)
  const missing = codes.filter((code) => quotes.every((quote) => quote.code !== code))
  return { ok: true, value: { quotes, missing } }
}

/** @param {Request} request */
async function handleQuoteRequest(request) {
  let raw = DEFAULT_CODE
  try {
    raw = new URL(request.url).searchParams.get('code') || DEFAULT_CODE
  } catch (error) {
    raw = DEFAULT_CODE
  }
  const codes = normalizeCodes(raw)
  if (codes === null) {
    return json({ ok: false, error: failure('invalid-code', 'not a code list: ' + raw) })
  }
  if (codes.length > MAX_CODES) {
    return json({ ok: false, error: failure('too-many', 'at most ' + MAX_CODES + ' codes per request') })
  }
  try {
    return json(await readQuotes(codes))
  } catch (error) {
    return json({ ok: false, error: failure('upstream', describe(error)) })
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.inject(['connection'], (scope) => {
    const routes = scope.get('connection') === undefined ? undefined : scope.get('connection').fetch
    if (routes === undefined || typeof routes.register !== 'function') return
    ctx.effect(
      () => routes.register({
        path: ROUTE_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: handleQuoteRequest,
      }),
      'dsh-stock-bbar: quote route',
    )
  })
}

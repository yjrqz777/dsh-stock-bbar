window.__ModuleLoader__.load({
  id: 'dsh-stock-bbar',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-stock-bbar'
    /** Host route registered by this bundle's `index.js`. */
    const ROUTE = 'api/dsh-stock-bbar/quote'
    const CODE_KEY = 'dsh-stock-bbar.code'
    const COLOR_KEY = 'dsh-stock-bbar.color'
    /** Which instrument of the list is on screen. */
    const SELECT_KEY = 'dsh-stock-bbar.selected'
    /** Context-menu target kind; `contextMenu.content` dispatches this exact key. */
    const MENU_KIND = 'stock-bbar'
    const DEFAULT_CODES = ['sh000001']
    /** Must match the Host's bound; one request carries the whole row. */
    const MAX_CODES = 20
    /**
     * Fixed row width: cycling through a list of instruments must not resize the
     * dock row, so the name truncates instead of the row growing.
     */
    const ROW_WIDTH = '188px'
    const REFRESH_MS = 5000
    const MAX_BACKOFF_MS = 30000

    const DICTS = {
      zh: {
        'edit.label': '股票代码，多个用英文逗号分隔',
        'edit.placeholder': '如 600519,sz399001',
        'edit.hint': '可输入多个代码，用英文逗号分隔，例如 600519,sz399001,hk00700',
        'edit.invalid': '格式不对，例如 600519 或 sh000001,sz399001',
        'edit.tooMany': '最多一次看 20 个代码',
        'edit.switch': '设置股票',
        'menu.color': '显示涨跌颜色',
        'menu.refresh': '立即刷新',
        'quote.pending': '正在获取行情…',
        'quote.unknown': '没有这些代码的行情',
        'quote.invalid': '代码格式不对',
        'quote.unavailable': '暂时取不到行情',
        'direction.up': '涨',
        'direction.down': '跌',
      },
      en: {
        'edit.label': 'Stock codes, comma separated',
        'edit.placeholder': 'e.g. 600519,sz399001',
        'edit.hint': 'Several codes are allowed, separated by commas: 600519,sz399001,hk00700',
        'edit.invalid': 'Not a code list, try 600519 or sh000001,sz399001',
        'edit.tooMany': 'At most 20 codes at a time',
        'edit.switch': 'Set instruments',
        'menu.color': 'Show up/down colours',
        'menu.refresh': 'Refresh now',
        'quote.pending': 'Loading quote…',
        'quote.unknown': 'No quote for these codes',
        'quote.invalid': 'Code format is not valid',
        'quote.unavailable': 'Quote unavailable',
        'direction.up': 'up',
        'direction.down': 'down',
      },
    }

    /**
     * The same normalization the Host applies: bare A-share codes gain their
     * market prefix, five-digit codes are treated as Hong Kong instruments.
     * @param {unknown} raw
     * @returns {string | null}
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
      return /^(sh|sz|bj|hk)[0-9a-z.]{1,12}$/.test(lowered) ? lowered : null
    }

    /**
     * Splits on a comma in either width so a pasted Chinese comma still works.
     * @param {unknown} raw
     * @returns {string[] | null} codes without duplicates, or null when any part is invalid
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
     * @param {string} text the stored comma-separated list
     * @returns {string[]} at least one code
     */
    function codesOf(text) {
      const parts = String(text === undefined || text === null ? '' : text).split(',').filter((part) => part !== '')
      return parts.length === 0 ? DEFAULT_CODES.slice() : parts
    }

    /** @returns {string} the stored comma-separated code list */
    function readStoredCodes() {
      try {
        const stored = normalizeCodes(window.localStorage.getItem(CODE_KEY))
        if (stored !== null && stored.length > 0 && stored.length <= MAX_CODES) return stored.join(',')
      } catch (error) {
        /* Storage can be unavailable; the default below still works. */
      }
      return DEFAULT_CODES.join(',')
    }

    /** @returns {boolean} whether the quote is colour-coded; on unless turned off */
    function readStoredColor() {
      try {
        return window.localStorage.getItem(COLOR_KEY) !== 'off'
      } catch (error) {
        return true
      }
    }

    /**
     * One tiny observable for the preferences the chip and the menu share: the
     * menu renders in the host overlay, outside the chip's subtree, so both read
     * the same source instead of passing props across that boundary.
     * @template T
     * @param {T} initial
     * @param {(value: T) => void} persist
     */
    function createPreference(initial, persist) {
      return {
        value: initial,
        listeners: new Set(),
        subscribe(listener) {
          this.listeners.add(listener)
          return () => {
            this.listeners.delete(listener)
          }
        },
        set(next) {
          if (this.value === next) return
          this.value = next
          try {
            persist(next)
          } catch (error) {
            /* Keeping the choice is a bonus, not a requirement. */
          }
          for (const listener of Array.from(this.listeners)) listener()
        },
      }
    }

    const codeStore = createPreference(readStoredCodes(), (codes) => {
      window.localStorage.setItem(CODE_KEY, codes)
    })
    /** @returns {string} the instrument last put on screen, or an empty string */
    function readStoredSelection() {
      try {
        const stored = window.localStorage.getItem(SELECT_KEY)
        return typeof stored === 'string' ? stored : ''
      } catch (error) {
        return ''
      }
    }

    const colorStore = createPreference(readStoredColor(), (on) => {
      window.localStorage.setItem(COLOR_KEY, on ? 'on' : 'off')
    })
    /** The instrument on screen; empty means "the first code in the list". */
    const selectionStore = createPreference(readStoredSelection(), (code) => {
      window.localStorage.setItem(SELECT_KEY, code)
    })
    /** Bumped by the menu's refresh row; the chip's poll chain restarts on it. */
    const refreshStore = createPreference(0, () => {})

    /**
     * @template T
     * @param {{ value: T, subscribe: (listener: () => void) => () => void }} store
     * @returns {T} the current value, re-rendering on change
     */
    function usePreference(store) {
      const [value, setValue] = React.useState(store.value)
      React.useEffect(() => store.subscribe(() => setValue(store.value)), [])
      return value
    }

    /**
     * @param {unknown} error
     * @returns {string} a key suffix for `quote.*`
     */
    function classify(error) {
      const code = error !== null && typeof error === 'object' ? error.code : ''
      if (code === 'unknown-code') return 'unknown'
      if (code === 'invalid-code') return 'invalid'
      if (code === 'too-many') return 'tooMany'
      return 'unavailable'
    }

    /** @returns {Error} the failure a response that describes no instrument produces */
    function emptyResponseError() {
      const error = new Error('quote route returned no instrument data')
      error.code = 'unavailable'
      return error
    }

    /**
     * One HTTP round trip, in either Host dialect: the current one answers with a
     * list (`quotes` + `missing`), a Host from before the list support answers with
     * a single quote object. Both are accepted, because a page refresh reloads this
     * half while a Host module only changes on restart.
     * @param {string[]} codes
     * @param {AbortSignal | undefined} signal
     * @returns {Promise<{ quotes: Array<{ code: string, name: string, price: string, change: string, changePct: string, time: string }>, missing: string[] }>}
     */
    async function requestOnce(codes, signal) {
      const response = await fetch(ROUTE + '?code=' + encodeURIComponent(codes.join(',')), {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      })
      if (response.ok === false) {
        const error = new Error('quote route HTTP ' + response.status)
        error.code = 'unavailable'
        throw error
      }
      const body = await response.json()
      const value = body !== null && typeof body === 'object' && body.ok === true ? body.value : null
      if (value !== null && typeof value === 'object') {
        if (Array.isArray(value.quotes)) {
          const quotes = value.quotes
          const missing = Array.isArray(value.missing) ? value.missing : []
          // A response with neither quotes nor missing entries cannot describe any
          // instrument; treat it as a failure instead of rendering "loading" forever.
          if (quotes.length === 0 && missing.length === 0) throw emptyResponseError()
          return { quotes, missing }
        }
        if (typeof value.code === 'string' && typeof value.price === 'string') {
          return { quotes: [value], missing: [] }
        }
        throw emptyResponseError()
      }
      const failure = body !== null && typeof body === 'object' && body.error !== null && typeof body.error === 'object' ? body.error : {}
      const error = new Error(typeof failure.message === 'string' ? failure.message : 'quote request failed')
      error.code = typeof failure.code === 'string' ? failure.code : 'unavailable'
      throw error
    }

    /**
     * One batch request, falling back to one request per code when the Host rejects
     * a comma-separated parameter — the older Host dialect does exactly that.
     * @param {string[]} codes
     * @param {AbortSignal | undefined} signal
     * @returns {Promise<{ quotes: object[], missing: string[] }>}
     */
    async function requestQuotes(codes, signal) {
      try {
        return await requestOnce(codes, signal)
      } catch (error) {
        if (codes.length < 2 || error === null || typeof error !== 'object' || error.code !== 'invalid-code') throw error
        const quotes = []
        const missing = []
        for (const code of codes) {
          try {
            const single = await requestOnce([code], signal)
            quotes.push(...single.quotes)
          } catch (singleError) {
            if (singleError !== null && typeof singleError === 'object' && singleError.code === 'unknown-code') {
              missing.push(code)
              continue
            }
            throw singleError
          }
        }
        return { quotes, missing }
      }
    }

    /**
     * Parses, verifies against the provider, and only then stores the list.
     * @param {string} raw what the user typed
     * @returns {Promise<{ ok: true, key: string, quotes: object[] } | { ok: false, kind: string, missing?: string[] }>}
     */
    async function applyCodes(raw) {
      const codes = normalizeCodes(raw)
      if (codes === null) return { ok: false, kind: 'invalid' }
      if (codes.length > MAX_CODES) return { ok: false, kind: 'tooMany' }
      try {
        const result = await requestQuotes(codes, undefined)
        if (result.missing.length > 0) return { ok: false, kind: 'unknown', missing: result.missing }
        const key = codes.join(',')
        codeStore.set(key)
        return { ok: true, key, quotes: result.quotes }
      } catch (error) {
        return { ok: false, kind: classify(error) }
      }
    }

    /**
     * @param {(key: string) => string} t
     * @param {{ ok: boolean, kind?: string, missing?: string[] }} outcome
     * @returns {string}
     */
    function outcomeMessage(t, outcome) {
      if (outcome.ok) return ''
      if (outcome.kind === 'invalid') return t('edit.invalid')
      if (outcome.kind === 'tooMany') return t('edit.tooMany')
      if (outcome.kind === 'unknown') {
        const missing = Array.isArray(outcome.missing) ? outcome.missing : []
        return t('quote.unknown') + (missing.length === 0 ? '' : ' ' + missing.join(', '))
      }
      return t('quote.' + outcome.kind)
    }

    /**
     * Geometry copied from the host's own composer-dock pills
     * (`button.hNGZaa_pill` in dsh-client-ui-chat): no border, 1px 8px padding,
     * `--dsw-radius-sm`. The row is a centred flex container with a 12px gap, so
     * the ticker is a peer of the activity and token pills, not a wrapper.
     */
    const rowStyle = {
      boxSizing: 'border-box',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      width: ROW_WIDTH,
      padding: '1px 8px',
      border: 'none',
      borderRadius: 'var(--dsw-radius-sm, 6px)',
      backgroundColor: 'transparent',
      color: 'var(--dsw-alias-label-secondary)',
      font: 'inherit',
      fontSize: '12px',
      lineHeight: '18px',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      transition: 'background-color 120ms ease',
    }

    /**
     * Hover and keyboard focus use the host's own hover surface, the same
     * `--dsw-alias-interactive-bg-hover` that `button.hNGZaa_pill:hover` paints.
     */
    const rowEmphasisStyle = Object.assign({}, rowStyle, {
      backgroundColor: 'var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2))',
    })

    /** One instrument is two targets: the name switches codes, the price toggles colour. */
    const segmentButtonStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      margin: 0,
      padding: 0,
      border: 'none',
      borderRadius: '3px',
      backgroundColor: 'transparent',
      color: 'inherit',
      font: 'inherit',
      fontSize: '12px',
      lineHeight: '18px',
      fontVariantNumeric: 'tabular-nums',
      cursor: 'pointer',
    }

    /** The name is the code-list cycle trigger; the price toggles the colours. */
    const nameButtonStyle = Object.assign({}, segmentButtonStyle, {
      flex: '0 1 auto',
      minWidth: 0,
      maxWidth: '9em',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      color: 'var(--dsw-alias-label-secondary)',
    })

    const nameEmphasisStyle = Object.assign({}, nameButtonStyle, {
      color: 'var(--dsw-alias-label-primary)',
    })

    const priceStyle = {
      fontWeight: 600,
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: '0.2px',
    }

    /** The percentage rides beside the price at a lighter weight than it. */
    const percentStyle = {
      fontWeight: 500,
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: '0.2px',
    }

    const srOnlyStyle = {
      position: 'absolute',
      width: '1px',
      height: '1px',
      margin: '-1px',
      padding: 0,
      border: 0,
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
      whiteSpace: 'nowrap',
    }

    const inputStyle = {
      boxSizing: 'border-box',
      width: '196px',
      height: '26px',
      padding: '0 8px',
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: '6px',
      backgroundColor: 'var(--dsw-alias-bg-layer-1)',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: '13px',
      lineHeight: '22px',
      outline: 'none',
    }

    const menuStyle = {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      minWidth: '188px',
      padding: '4px',
    }

    /** One host-menu-sized row; the host renders this content inside its own popup. */
    const menuRowStyle = {
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      width: '100%',
      minHeight: '28px',
      padding: '0 8px',
      border: 'none',
      borderRadius: '6px',
      backgroundColor: 'transparent',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: '13px',
      lineHeight: '20px',
      textAlign: 'left',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      transition: 'background-color 100ms ease',
    }

    const menuRowEmphasisStyle = Object.assign({}, menuRowStyle, {
      backgroundColor: 'var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2))',
    })

    /**
     * The field shares the rows' 8px inset, so its frame lines up with their text
     * instead of sticking out to the menu's own 4px padding.
     */
    const menuFieldStyle = { padding: '0 8px' }

    const switchTrackStyle = {
      position: 'relative',
      flex: 'none',
      width: '26px',
      height: '15px',
      borderRadius: '999px',
      transition: 'background-color 120ms ease',
    }

    const switchKnobStyle = {
      position: 'absolute',
      top: '2px',
      width: '11px',
      height: '11px',
      borderRadius: '50%',
      backgroundColor: 'var(--dsw-alias-bg-layer-1)',
      transition: 'left 120ms ease',
    }

    const menuStatusStyle = {
      padding: '0 8px 2px',
      fontSize: '11px',
      lineHeight: '15px',
      color: 'var(--dsw-alias-label-secondary)',
    }

    const menuErrorStyle = Object.assign({}, menuStatusStyle, {
      color: 'var(--dsw-alias-state-error-primary)',
    })

    /** @param {{ on: boolean }} props */
    function SwitchTrail(props) {
      return h('span', {
        'aria-hidden': 'true',
        style: Object.assign({}, switchTrackStyle, {
          // Label colour, not brand: this theme's brand resolves to a near-black
          // static neutral, which would vanish on a dark menu surface.
          backgroundColor: props.on ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-border-l2)',
        }),
      }, h('span', { style: Object.assign({}, switchKnobStyle, { left: props.on ? '13px' : '2px' }) }))
    }

    /**
     * One row of this plugin's context menu. Written here rather than imported,
     * because a plugin must not load Harness Client packages as modules.
     * @param {{ label: string, role: string, checked?: boolean, trailing?: unknown, onClick: () => void }} props
     */
    function MenuRow(props) {
      const [hovered, setHovered] = React.useState(false)
      const [focused, setFocused] = React.useState(false)
      const emphasized = hovered || focused
      return h('button', {
        type: 'button',
        role: props.role,
        'aria-checked': typeof props.checked === 'boolean' ? (props.checked ? 'true' : 'false') : undefined,
        style: emphasized ? menuRowEmphasisStyle : menuRowStyle,
        onClick: props.onClick,
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
      },
        h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, props.label),
        props.trailing === undefined ? null : props.trailing,
      )
    }

    /**
     * Rows for the right-click menu the chip opens through `useContextMenu`: the
     * colour switch and a code list field that saves only after the provider
     * answers. Nothing is focused on open, so the menu stays a menu.
     * @param {(key: string) => string} translate
     */
    function createMenuContent(translate) {
      function StockMenu(props) {
        const t = translate
        const colorOn = usePreference(colorStore)
        const codeText = usePreference(codeStore)
        const [draft, setDraft] = React.useState(codeText)
        const [inputFocused, setInputFocused] = React.useState(false)
        const [pending, setPending] = React.useState(false)
        const [invalid, setInvalid] = React.useState(false)
        const [error, setError] = React.useState('')
        const aliveRef = React.useRef(true)
        const dismiss = typeof props?.dismiss === 'function' ? props.dismiss : () => {}

        React.useEffect(() => () => {
          aliveRef.current = false
        }, [])

        const submit = async (event) => {
          if (event !== undefined && typeof event.preventDefault === 'function') event.preventDefault()
          if (pending) return
          setPending(true)
          setInvalid(false)
          setError('')
          const outcome = await applyCodes(draft)
          if (aliveRef.current === false) return
          if (outcome.ok) {
            setPending(false)
            dismiss()
            return
          }
          setPending(false)
          if (outcome.kind === 'invalid' || outcome.kind === 'tooMany') setInvalid(true)
          setError(outcomeMessage(t, outcome))
        }

        const status = invalid
          ? t('edit.invalid')
          : error !== ''
            ? error
            : pending ? t('quote.pending') : ''
        const statusStyle = invalid || error !== '' ? menuErrorStyle : menuStatusStyle
        // `--dsw-alias-border-selected` is the theme's bluish selection grey; the
        // brand token resolves to a near-black static neutral here, which is why a
        // focus ring built from it read as a black frame.
        const focusTone = invalid ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-border-selected)'
        const inputBorder = invalid
          ? 'var(--dsw-alias-state-error-primary)'
          : inputFocused ? 'var(--dsw-alias-border-selected)' : 'var(--dsw-alias-border-l2)'

        return h('div', { style: menuStyle, role: 'menu' },
          h(MenuRow, {
            label: t('menu.color'),
            role: 'menuitemcheckbox',
            checked: colorOn,
            trailing: h(SwitchTrail, { on: colorOn }),
            onClick: () => colorStore.set(colorOn === false),
          }),
          h('div', { style: menuFieldStyle },
            h('input', {
              type: 'text',
              value: draft,
              spellCheck: false,
              autoComplete: 'off',
              readOnly: pending,
              placeholder: t('edit.placeholder'),
              title: t('edit.hint'),
              'aria-label': t('edit.label'),
              'aria-invalid': invalid ? 'true' : 'false',
              onFocus: () => setInputFocused(true),
              onBlur: () => setInputFocused(false),
              onChange: (event) => {
                setDraft(event.target.value)
                if (invalid) setInvalid(false)
                if (error !== '') setError('')
              },
              onKeyDown: (event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                event.stopPropagation()
                submit()
              },
              style: Object.assign({}, inputStyle, { width: '100%', borderColor: inputBorder },
                inputFocused ? { boxShadow: '0 0 0 1px ' + focusTone } : null),
            }),
          ),
          status === '' ? null : h('div', { style: statusStyle, role: 'status' }, status),
        )
      }
      return StockMenu
    }

    /**
     * @param {(key: string) => string} translate
     * @param {(listener: () => void) => () => void} subscribeLocale
     */
    function createComponent(translate, subscribeLocale) {
      function StockTicker(props) {
        const t = translate
        const colorOn = usePreference(colorStore)
        const codeText = usePreference(codeStore)
        const selected = usePreference(selectionStore)
        const refreshTick = usePreference(refreshStore)
        const [answer, setAnswer] = React.useState(null)
        const [problem, setProblem] = React.useState(null)
        const [hovered, setHovered] = React.useState(false)
        const [rowFocused, setRowFocused] = React.useState(false)

        const [, bumpLocale] = React.useState(0)
        React.useEffect(() => subscribeLocale(() => bumpLocale((tick) => tick + 1)), [])

        // One request per cycle carries the whole list; one in flight at a time,
        // with backoff, and no retry for a list the provider rejected outright.
        React.useEffect(() => {
          const list = codesOf(codeText)
          let mounted = true
          let inFlight = false
          let stopped = false
          let delay = REFRESH_MS
          let timer = 0
          const controller = new AbortController()

          const tick = async () => {
            if (document.visibilityState === 'hidden') {
              timer = window.setTimeout(tick, REFRESH_MS)
              return
            }
            inFlight = true
            try {
              const result = await requestQuotes(list, controller.signal)
              if (mounted === false) return
              setAnswer({ key: codeText, list: result.quotes })
              setProblem(null)
              delay = REFRESH_MS
              timer = window.setTimeout(tick, REFRESH_MS)
            } catch (error) {
              if (mounted === false || controller.signal.aborted) return
              const kind = classify(error)
              setProblem({ key: codeText, kind })
              if (kind === 'invalid' || kind === 'tooMany') {
                stopped = true
                return
              }
              delay = Math.min(delay * 2, MAX_BACKOFF_MS)
              timer = window.setTimeout(tick, delay)
            } finally {
              inFlight = false
            }
          }

          const onVisibility = () => {
            if (document.visibilityState !== 'visible' || inFlight || stopped || mounted === false) return
            window.clearTimeout(timer)
            tick()
          }

          tick()
          document.addEventListener('visibilitychange', onVisibility)
          return () => {
            mounted = false
            controller.abort()
            window.clearTimeout(timer)
            document.removeEventListener('visibilitychange', onVisibility)
          }
        }, [codeText, refreshTick])

        const codes = codesOf(codeText)
        const failure = problem !== null && problem.key === codeText ? problem.kind : ''
        const failureText = failure === '' ? '' : t('quote.' + failure)
        const listed = answer !== null && answer.key === codeText && answer.list.length > 0 ? answer.list : null
        const loading = listed === null && failure === ''
        // A kept quote whose latest refresh failed is dimmed, never silently stale.
        const stale = listed !== null && failure !== ''

        const emphasized = hovered || rowFocused
        const labelColor = emphasized ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)'

        // One instrument is on screen. Every code in the list is polled together, so
        // clicking the name lands on a quote that is already fresh.
        const activeIndex = Math.max(0, codes.indexOf(selected))
        const activeCode = codes[activeIndex]
        const quote = listed === null ? null : listed.find((entry) => entry.code === activeCode) || null
        const quoted = quote !== null && typeof quote.price === 'string' && quote.price !== ''
        const name = quoted && typeof quote.name === 'string' && quote.name !== '' ? quote.name : activeCode
        const price = quoted ? quote.price : loading ? '…' : failureText !== '' ? failureText : '--'
        const changePct = quoted && typeof quote.changePct === 'string' ? quote.changePct : ''
        const percent = Number(changePct)
        const rising = Number.isFinite(percent) && percent > 0
        const falling = Number.isFinite(percent) && percent < 0
        const priceColor = quoted === false
          ? labelColor
          : colorOn === false
            ? labelColor
            : rising
              ? 'var(--dsw-alias-state-error-primary)'
              : falling ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-primary)'
        const direction = rising ? t('direction.up') : falling ? t('direction.down') : ''
        // The provider sends the percentage as a bare string (`-2.07`, `0.25`, `0.00`);
        // it is shown at the precision it arrived with, with the sign made explicit.
        const rawPercent = changePct.trim()
        const signedPercent = rawPercent !== '' && !rawPercent.startsWith('+') && !rawPercent.startsWith('-') && Number(rawPercent) > 0
          ? '+' + rawPercent
          : rawPercent
        const percentText = signedPercent !== '' && Number.isFinite(Number(rawPercent)) ? signedPercent + '%' : ''
        const priceTitle = [name, direction + ' ' + price, percentText].filter((part) => part !== '').join(' · ')

        /** Clicking the name picks the next instrument in the list. */
        const cycle = () => {
          if (codes.length < 2) return
          selectionStore.set(codes[(activeIndex + 1) % codes.length])
        }

        const contextMenu = typeof props?.useContextMenu === 'function' ? props.useContextMenu() : null
        const triggerProps = contextMenu !== null && typeof contextMenu.getTriggerProps === 'function'
          ? contextMenu.getTriggerProps(() => ({ kind: MENU_KIND, value: { codes: codes.join(','), active: activeCode } }), {})
          : {}

        // No wrapper around the row: the dock is a centred flex container, so the
        // ticker joins the activity and token pills as a peer with its 12px gap.
        return h(React.Fragment, null,
          h('div', Object.assign({}, triggerProps, {
            style: emphasized ? rowEmphasisStyle : rowStyle,
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
            onFocus: () => setRowFocused(true),
            onBlur: () => setRowFocused(false),
          }),
            h('button', {
              type: 'button',
              style: Object.assign({}, emphasized ? nameEmphasisStyle : nameButtonStyle, codes.length > 1 ? null : { cursor: 'default' }),
              'aria-label': codes.length > 1 ? t('edit.switch') + ' ' + name : name,
              onClick: cycle,
            }, name),
            h('button', {
              type: 'button',
              style: Object.assign({}, segmentButtonStyle, { flex: 'none' }),
              title: priceTitle,
              'aria-pressed': colorOn ? 'true' : 'false',
              'aria-label': [name, price, direction, percentText, t('menu.color')].filter((part) => part !== '').join(' '),
              onClick: () => colorStore.set(colorOn === false),
            },
              h('span', { style: Object.assign({}, priceStyle, { color: priceColor }, stale && quoted ? { opacity: 0.55 } : null) }, price),
              percentText === ''
                ? null
                : h('span', {
                  style: Object.assign({}, percentStyle, { color: priceColor }, stale ? { opacity: 0.7 } : null),
                }, percentText),
            ),
          ),
          failureText === '' || listed !== null
            ? null
            : h('span', { style: srOnlyStyle, role: 'status' }, failureText),
        )
      }
      return StockTicker
    }

    return {
      inject: ['slots', 'locale', 'contextMenus'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', DICTS.zh), 'dsh-stock-bbar: zh locale')
        ctx.effect(() => ctx.locale.register(NS, 'en', DICTS.en), 'dsh-stock-bbar: en locale')
        const translate = ctx.locale.bind(NS)
        const subscribeLocale = (listener) => ctx.locale.subscribe(listener)
        // The host only shows its menu after a provider resolves items for the
        // target kind, so every kind needs one — this row is also the manual
        // refresh the ticker otherwise does on its own timer.
        ctx.effect(() => ctx.contextMenus.register({
          id: 'stock-bbar.menu',
          target: MENU_KIND,
          order: 100,
          resolve: () => [{
            id: 'refresh',
            label: translate('menu.refresh'),
            run: () => refreshStore.set(refreshStore.value + 1),
          }],
        }), 'dsh-stock-bbar: menu provider')
        const StockTicker = createComponent(translate, subscribeLocale)
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'stock-bbar',
          order: 10,
        }, StockTicker))
        const StockMenu = createMenuContent(translate)
        ctx.slots.inject('contextMenu.content', () => ctx.slots.register({
          name: 'contextMenu.content',
          key: MENU_KIND,
        }, StockMenu))
      },
    }
  },
})

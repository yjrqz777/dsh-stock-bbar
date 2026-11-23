# dsh-stock-bbar

Stock prices in the DSH bottom bar: the live quote of one instrument under the message
composer, with its session percentage. It starts on the Shanghai Composite Index, and a
comma-separated list of any A-share, Beijing, Hong Kong, or index codes you follow can
be cycled through one at a time.

`bbar` is short for **bottom bar** — the ambient row below the composer where the
ticker sits.

```
上证指数 3503.64 -2.07%
```

## Use

- The row shows one instrument: its name, its price, and the session percentage —
  nothing else. A rise is red and a fall is green, following Chinese trading screens.
- **The row has a fixed width** (`ROW_WIDTH`, 188px) and its content is centred in it:
  cycling instruments never resizes the dock row, so the pills beside it do not move. A
  name too long for the slot is truncated with an ellipsis; the price and percentage
  always stay visible.
- **One instrument is on screen at a time.** The list behind it can hold several codes
  (a comma-separated list, edited from the right-click menu), and the row shows only
  the selected one.
- **The name and the price are two different targets.**
  - Click a **name** to cycle to the next instrument in the list, wrapping at the end.
    With a single code the click does nothing.
  - Click a **price** to switch the red/green coding on and off, and `aria-pressed`
    exposes the state.
- Every code in the list is polled together, so a name click lands on a quote that is
  already fresh rather than starting a new request.
- Right-click the row (or press `Shift+F10` on it) for the menu. Nothing inside it is
  focused on open:
  - **显示涨跌颜色 / Show up/down colours** — the same switch, as a `menuitemcheckbox`
    row with a switch control.
  - a **code list field**: several codes separated by an English comma
    (`600519,sz399001,hk00700`). Its placeholder shows an example while empty and its
    hover tooltip (the floating hint) explains the list form. The list is saved only
    after the provider answers for **every** code, so a typo keeps the field open with
    the reason below it. `Esc` or a click outside closes the menu and discards the edit.
  - **立即刷新 / Refresh now** — a host-rendered row that restarts the poll at once. It
    is also the item the host menu needs: the overlay only opens after a provider
    resolves items for the target kind, and this bundle registers that provider with
    `ctx.contextMenus.register`.
- Turning the colours off leaves the price and percentage in the colour every other
  label in the row uses, so a price is distinguished by weight, not colour.
- Hovering — or focusing the row with the keyboard — highlights it exactly like the
  host's own composer-dock pills: the background switches to
  `--dsw-alias-interactive-bg-hover` and the names step up to primary text. The row
  copies that pill's geometry (`1px 8px` padding, `--dsw-radius-sm`, 4px gap) and sits
  in the dock's centred flex row, so it reads as a peer of the activity and token
  counters beside it.
- The code list and the colour switch are stored in the browser (`localStorage`, keys
  `dsh-stock-bbar.code` and `dsh-stock-bbar.color`).

## Accepted codes

| Input | Resolved code |
| :-- | :-- |
| `sh000001` (default) | Shanghai Composite Index |
| `sz399001` | Shenzhen Component Index |
| `600519` | `sh600519`, prefix added from the first digit |
| `000001` | `sz000001`, Ping An Bank — write `sh000001` for the index |
| `00700` | `hk00700`, five digits are treated as Hong Kong |
| `430047` | `bj430047`, Beijing Stock Exchange |
| `600519,sz399001,00700` | one row of three instruments, one request |

Prefixes `sh`, `sz`, `bj`, and `hk` are accepted. Anything else is rejected before a
request is made. A list holds at most 20 codes, in either comma width; duplicates are
collapsed. The provider decides which instruments exist and what each price means; a
Hong Kong code is quoted in HKD, an A-share in CNY.

## Data

- Quotes come from Tencent's quote endpoint, `https://qt.gtimg.cn/q=<codes>`, which is
  Tencent's own production backend for its finance pages: no API key, no account, no
  quota agreement. The provider takes a comma-separated list, so a whole row costs one
  request.
- The browser never contacts that endpoint. `index.js` (the Host half) registers one
  authenticated same-origin route, `GET /api/dsh-stock-bbar/quote?code=a,b,c`, reads the
  provider, decodes its GBK payload, and returns
  `{ ok: true, value: { quotes: [{ name, price, prevClose, change, changePct, time }], missing: [] } }`.
  Failures return `{ ok: false, error: { code, message } }` with a code of
  `invalid-code`, `too-many`, `timeout`, or `upstream`; an unknown instrument is listed
  in `missing` instead of failing the request, so one bad code cannot hide the rest.
- The row refreshes every 5 seconds while the page is visible, pauses while the tab is
  hidden, backs off 10 → 20 → 30 seconds after a failure, and stops for a rejected code
  list until you change it. One request is in flight at a time.
- A failed refresh keeps the last quotes on screen, dimmed — never silently stale. A
  failure with no quotes yet shows the reason in the row instead of a dash.

## Install

- From the plugin market once the bundle is listed.
- Locally: **Plugins → Add plugin**, then point it at this directory.
- Nothing is built at install time: the package ships plain ESM and has no
  dependencies.

## Requirements

- DSH `0.2.2-rc.5` or newer, declared as `engines.dsh`:
  `>=0.2.2-rc.5 || >=0.3.0-0`. The second branch is deliberate — a range without a
  prerelease comparator on the matching version tuple silently excludes every future
  prerelease of the harness, the trap described in the awesome-dsh-plugin
  contributing guide.
- The Web GUI (`dsh.client.platform: web`): the row lives in the conversation
  composer dock, so it appears while a session is open.
- `dsh.compatibility.dshReleases` records the release this version was tested on.

## Package layout

| File | Role |
| :-- | :-- |
| `package.json` | Bundle manifest: `dsh.bundle`, `dsh.client`, `engines`, exports |
| `cordis.patch.yml` | Inserts the `dsh-stock-bbar` row into the profile |
| `index.js` | Host half: the quote route and the provider parser |
| `client.js` | Client half: the row, and the context-menu content |
| `locale/en.json`, `locale/zh.json` | Display title and description for the Plugins page |
| `icon.svg` | Icon shown by Plugin Manager |
| `README.md`, `LICENSE` | Document and MIT licence |

## Limitations

- The row is a price ticker, not a watchlist or a chart: a name, a price, and a
  percentage only.
- The row width is fixed, so a long instrument name is truncated rather than widening
  the row.
- The provider decides the price, its delay, and which instruments it serves. Delisted
  or suspended instruments can still return a stale record; the quote time in the
  price tooltip is the signal that a price is old.
- Visible only while a session is open, because the slot belongs to the conversation.
  Disabling the bundle removes the row and its route.

## 中文说明

在输入框下方显示一只股票或指数的价格与涨跌幅。默认上证指数（`sh000001`），可以在右键
菜单里输入一份代码列表（英文逗号分隔，如 `600519,sz399001`，最多 20 个），点名称逐只轮换。

- 屏幕上一次只显示一只。列表里可以有多只（英文逗号分隔，在右键菜单里改），**点名称**按列表
  顺序轮换到下一只（到最后一只后回到第一只，只有一个代码时点击无动作）。
- **行的宽度是固定的**（`ROW_WIDTH`，188px），内容在这个宽度里居中：轮换标的不改变底部栏宽度，
  旁边的统计 pill 不会跟着抖；名称放不下时用省略号截断，价格和涨跌幅始终完整显示。
- **点价格**切换红涨绿跌；列表里所有代码一起轮询，所以轮换时用的是已经取到的最新价，不会重新等一次请求。
- 右键（或 `Shift+F10`）菜单：颜色开关 + 代码列表输入框 + 立即刷新；打开时不自动聚焦。
- 关掉颜色后价格、涨跌幅改用与行内其他文字相同的颜色，只靠字重区分价格。
- 列表里每个代码都要有行情才会保存；多个代码一次请求取回，5 秒刷新，页面隐藏时暂停，
  失败退避到 30 秒，代码列表被拒则停止轮询。
- 行情来自腾讯 `qt.gtimg.cn`，由插件 Host 侧转发并解码 GBK，浏览器不直接访问该接口。
- 需要 DSH `0.2.2-rc.5` 及以上，仅在 Web GUI 的会话里显示。

## License

MIT

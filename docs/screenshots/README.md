# Screenshots

1280×800 captures of the local server on 14 Nov 2026, after the dashboard was rebuilt to the dark layout. The numbers are from a real check and the live directory, not from the design mock.

| File | What it shows |
|---|---|
| `dashboard-check.png` | Free check of `near-examples/rust-status-message`. Content score 55. The line is **7 pass · 2 warnings · 1 failure**, from that run. Receipt written, and the hash matches the testnet view. |
| `estimate-and-quote.png` | Live estimate board with anonymised `team-` / `repo-` names, and a 1Click quote with `dry: true` (about 5.06 USDC on Base) recorded as a new receipt. Funds moved: 0. |
| `verify-page.png` | `/verify?id=1` read through `https://rpc.testnet.near.org`. No signer. |
| `field-page.png` | Directory tracks from the scan that was running in this process. |

The mock's "4 pass · 1 warning · 1 failure" and the rows `team-4be0c1` / `repo-91fa2e` are not in the app. An empty board says EXAMPLE and does not invent teams.

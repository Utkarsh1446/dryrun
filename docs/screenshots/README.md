# Screenshots

1280×800 captures on 14 Nov 2026. The numbers are from a real check and from testnet, not from a design mock.

| File | What it shows |
|---|---|
| `api-down-recorded.png` | Static build (`dist/`) whose API call to `https://dryrun-pfgy.onrender.com` is blocked (no CORS header). Banner says the API did not answer. **Wake / retry** is on the banner. The card is labelled **RECORDED**: `near-examples/rust-status-message`, score 55, 7 pass · 2 warnings · 1 failure. The on-chain link is receipt 1. |
| `api-wake-still-down.png` | Same page after Wake / retry. The banner ends with "Still no response." The score stays the recorded 55. |
| `verify-receipt-1.png` | `verify.html?id=1` read through `https://rpc.testnet.near.org`. No API and no signer. |
| `verify-receipt-2.png` | Receipt 2, kind `deep`, with the dry-quote hash. Read from the same RPC. |
| `local-api-up.png` | `npm start` with the scan off. The API answered, so there is no NO API banner and no recorded score. The verify card is receipt 1 from testnet. The board is empty because the scan is off, and it says so. |
| `live-verify.png` | https://dryrun-near.pages.dev/verify?id=1 as it answered on 14 Nov 2026, before this branch's static build was uploaded. Same receipt, read from testnet. |
| `dashboard-check.png` | Earlier free check of the same repo, from the local server, with a receipt written in that session. |
| `estimate-and-quote.png` | Earlier estimate board and a `dry: true` quote. Funds moved: 0. |
| `verify-page.png` | Earlier `/verify?id=1`. |
| `field-page.png` | Earlier directory tracks from a scan that was running in that process. |

The mock's "4 pass · 1 warning · 1 failure" and the rows `team-4be0c1` / `repo-91fa2e` are not in the app. An empty board says EXAMPLE and does not invent teams.

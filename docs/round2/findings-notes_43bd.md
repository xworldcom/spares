# Bea buyer video test — findings (items 1–27)

Source for Round 2 OEE360 Soft Launch fixes. Items **1–11** (HIGH) and **17**, **23** shipped in PRs #284–#286.

| # | Severity | Topic |
| --- | --- | --- |
| 1 | HIGH | Logout must revoke server session |
| 2 | HIGH | Lifecycle notices (6331K32, 5972K325) |
| 3 | HIGH | Part More → part sheet (#273) |
| 4 | HIGH | Quote tray persistence |
| 5 | HIGH | Part # field width / spellcheck |
| 6 | HIGH | BOM qty → tray qty |
| 7 | HIGH | 3D picking |
| 8 | HIGH | Explode floor / selection |
| 9 | HIGH | List → 3D toggle |
| 10 | HIGH | Phone Add lag / focus |
| 11 | HIGH | Landing scroll trap / touch orbit |
| 12 | MED | Care / quote **reply feedback** (visible send-in-progress) |
| 13 | MED | **Quote request confirmation** after submit |
| 14 | MED | Quote detail **part number + description** |
| 15 | MED | Tray **line vs unit** counts |
| 16 | MED | Tray **remove + undo**; line **truncation** |
| 17 | MED | Quotes list **filter / empty copy** (#286) |
| 18 | MED | **Skeletons** vs bare “Loading…” |
| 19 | MED | Phone quote **step labels** (progress strip) |
| 20 | MED | **Conversation sheet** polish (peek / titles) |
| 21 | MED | Customer ticket **“Notes” → Messages** |
| 22 | MED | **Machine page phone layout** (list + safe area) |
| 23 | LOW | Login **empty validation** (#286) |
| 24 | LOW | Demo **filler data** — do not delete; report only |
| 25 | LOW | Login **error layout shift** |
| 26 | LOW | Landing **section gaps** (post scroll-trap fix) |
| 27 | LOW | Quotes machine tab **empty / filter** clarity |

**Holds:** Care Notes bury composer; tenant isolation; no demo filler deletion (#24).

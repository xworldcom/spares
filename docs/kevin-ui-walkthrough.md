# Kevin UI walkthrough (local only)

Private local-dev screenshot walkthrough of the staff and customer flows on `main` (`ae215b2`).

**Not a deploy.** No Vercel, no production, no custom domain. Screenshots were captured from `next dev` in a Cloud Agent VM so Kevin can critique the UI without a preview URL.

Seeded logins (private preview only):

| Role | Email | Password |
| --- | --- | --- |
| staff | `staff@spares.local` | `SparesStaff1!` |
| customer | `customer@spares.local` | `SparesCustomer1!` |

## What was walked

1. **Staff** — login → empty machines → upload pack → hardware fixture pack (`mcmaster-hardware.glb` + parts JSON) → parts list with qty → unmatched washer `93475A240` → quotes inbox empty → quotes inbox with a customer request
2. **Customer** — login → machine list → 3D viewer → rotate/zoom → select `5972K325` bearing → quote form → confirmation
3. **Edge states** — bad password; upload rejected for missing GLB; upload rejected when a JSON file is used as the model

Customer view confirms: **no unmatched panel**, **no public signup link**.

Full screenshot gallery with captions is in the pull request description.

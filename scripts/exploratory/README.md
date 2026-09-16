# Production crawl levers

Scripts that drove the 16 Sep 2026 oee360.com crawl. They need env credentials. They do not print passwords.

```
export OEE360_BASE_URL=https://oee360.com
export OEE360_STAFF_EMAIL=...
export OEE360_STAFF_PASSWORD=...
export OEE360_CUST_A_EMAIL=...
export OEE360_CUST_A_PASSWORD=...
export OEE360_CUST_B_EMAIL=...
export OEE360_CUST_B_PASSWORD=...
```

- `crawl-oee360-isolation.mjs` authz and customer isolation
- `crawl-oee360-conversation.mjs` quote and Care message plus status walk
- `crawl-oee360-ui.cjs` Playwright customer and staff UI
- `crawl-oee360-staff-pages.cjs` staff Directory, Service, Platform screenshots
- `crawl-oee360-wide.mjs` remaining staff, customer, and platform APIs
- `crawl-oee360-ui-wide.cjs` numeric Care URLs, Directory drill-in, mobile, desktop collapse

Playwright comes from `.cursor/skills/verify-oee360/scripts` (`npm install` there). Set `NODE_PATH` to that `node_modules`.

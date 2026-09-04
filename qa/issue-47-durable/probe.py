#!/usr/bin/env python3
"""Issue #47 durable-quote probe. Bypass secret must come from env; never logged."""

from __future__ import annotations

import http.client
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from typing import Any

BASE = os.environ.get("SPARES_PREVIEW", "https://spares-f60bbh7hm-yonder3.vercel.app").rstrip(
    "/"
)
BYPASS = os.environ.get("SPARES_BYPASS", "")
MARKER = os.environ.get(
    "SPARES_MARKER",
    f"QA-47 hop marker {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}",
)
NOTE = os.environ.get(
    "SPARES_NOTE",
    f"QA-47 quote note {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}",
)
OUT = os.environ.get(
    "SPARES_OUT",
    os.path.join(os.path.dirname(__file__), "evidence/logs/probe.json"),
)

CUSTOMER = ("customer@spares.local", os.environ.get("SPARES_CUSTOMER_PW", "SparesCustomer1!"))
STAFF = ("staff@spares.local", os.environ.get("SPARES_STAFF_PW", "SparesStaff1!"))


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def redact_headers(headers: dict[str, str]) -> dict[str, str]:
    redacted: dict[str, str] = {}
    for key, value in headers.items():
        lower = key.lower()
        if lower in {
            "x-vercel-protection-bypass",
            "cookie",
            "set-cookie",
            "authorization",
        }:
            names = []
            for part in value.split(","):
                names.append(part.split("=", 1)[0].split(";", 1)[0].strip() or "<set>")
            redacted[key] = ",".join(names) + " [redacted]"
        else:
            redacted[key] = value
    return redacted


def parse_set_cookie_names(headers: list[tuple[str, str]]) -> list[str]:
    names: list[str] = []
    for key, value in headers:
        if key.lower() == "set-cookie":
            names.append(value.split("=", 1)[0].strip())
    return names


class Probe:
    def __init__(self, label: str, reuse: bool = False):
        self.label = label
        self.jar = CookieJar()
        ctx = ssl.create_default_context()
        if reuse:
            self.opener = urllib.request.build_opener(
                urllib.request.HTTPSHandler(context=ctx),
                urllib.request.HTTPCookieProcessor(self.jar),
            )
        else:
            # Force a fresh TCP/TLS connection per request to raise odds of another isolate.
            self.opener = urllib.request.build_opener(
                urllib.request.HTTPHandler(),
                urllib.request.HTTPSHandler(context=ctx),
                urllib.request.HTTPCookieProcessor(self.jar),
            )
        self.log: list[dict[str, Any]] = []

    def request(
        self,
        method: str,
        path: str,
        *,
        body: bytes | None = None,
        content_type: str | None = None,
        extra_headers: dict[str, str] | None = None,
        send_bypass: bool = True,
    ) -> dict[str, Any]:
        url = path if path.startswith("http") else f"{BASE}{path}"
        headers = {
            "Accept": "application/json, text/html;q=0.8",
            "User-Agent": f"spares-qa-47/{self.label}",
            "Connection": "close",
        }
        if send_bypass and BYPASS:
            headers["x-vercel-protection-bypass"] = BYPASS
            headers["x-vercel-set-bypass-cookie"] = "true"
        if content_type:
            headers["Content-Type"] = content_type
        if extra_headers:
            headers.update(extra_headers)
        req = urllib.request.Request(url, data=body, method=method, headers=headers)
        started = time.monotonic()
        entry: dict[str, Any] = {
            "at": now(),
            "label": self.label,
            "method": method,
            "path": path,
        }
        try:
            with self.opener.open(req, timeout=60) as resp:
                raw = resp.read()
                elapsed_ms = int((time.monotonic() - started) * 1000)
                ctype = resp.headers.get("Content-Type", "")
                parsed: Any
                if "application/json" in ctype:
                    try:
                        parsed = json.loads(raw.decode("utf-8"))
                    except json.JSONDecodeError:
                        parsed = raw.decode("utf-8", errors="replace")[:2000]
                else:
                    text = raw.decode("utf-8", errors="replace")
                    parsed = text[:4000]
                entry.update(
                    {
                        "status": resp.status,
                        "elapsed_ms": elapsed_ms,
                        "ctype": ctype,
                        "vercel_id": resp.headers.get("x-vercel-id"),
                        "vercel_cache": resp.headers.get("x-vercel-cache"),
                        "set_cookie_names": parse_set_cookie_names(list(resp.headers.items())),
                        "body": parsed,
                    }
                )
        except urllib.error.HTTPError as err:
            raw = err.read()
            elapsed_ms = int((time.monotonic() - started) * 1000)
            ctype = err.headers.get("Content-Type", "") if err.headers else ""
            text = raw.decode("utf-8", errors="replace")
            try:
                parsed = json.loads(text) if "application/json" in ctype else text[:4000]
            except json.JSONDecodeError:
                parsed = text[:4000]
            entry.update(
                {
                    "status": err.code,
                    "elapsed_ms": elapsed_ms,
                    "ctype": ctype,
                    "vercel_id": err.headers.get("x-vercel-id") if err.headers else None,
                    "body": parsed,
                    "error": "http",
                }
            )
        except Exception as err:  # noqa: BLE001 — probe must record transport failures
            entry.update(
                {
                    "status": 0,
                    "elapsed_ms": int((time.monotonic() - started) * 1000),
                    "error": f"{type(err).__name__}: {err}",
                }
            )
        self.log.append(entry)
        return entry

    def login(self, email: str, password: str) -> dict[str, Any]:
        payload = json.dumps({"email": email, "password": password}).encode()
        return self.request(
            "POST",
            "/api/auth/login",
            body=payload,
            content_type="application/json",
        )


def protection_is_on() -> dict[str, Any]:
    """Unauthenticated GET should hit Vercel protection, not the app login."""
    parsed = urllib.parse.urlparse(BASE)
    conn = http.client.HTTPSConnection(parsed.netloc, timeout=30)
    started = time.monotonic()
    conn.request(
        "GET",
        parsed.path or "/",
        headers={"User-Agent": "spares-qa-47/protection-check", "Accept": "text/html"},
    )
    resp = conn.getresponse()
    body = resp.read().decode("utf-8", errors="replace")
    conn.close()
    lower = body.lower()
    return {
        "at": now(),
        "label": "protection-check",
        "method": "GET",
        "path": "/",
        "status": resp.status,
        "elapsed_ms": int((time.monotonic() - started) * 1000),
        "vercel_id": resp.getheader("x-vercel-id"),
        "looks_like_vercel_sso": (
            "vercel" in lower
            and (
                "authentication" in lower
                or "sso" in lower
                or "login to continue" in lower
                or "deployment protection" in lower
            )
        ),
        "looks_like_spares_login": "staff and customers use the same screen" in lower
        or 'id="email"' in lower,
        "title_snip": body[body.find("<title>") : body.find("</title>") + 8][:200]
        if "<title>" in lower
        else body[:180],
    }


def summarize_quote(body: Any) -> dict[str, Any] | None:
    quote = body.get("quote") if isinstance(body, dict) else None
    if not isinstance(quote, dict):
        return None
    activities = quote.get("activities") or []
    messages = [
        a.get("text")
        for a in activities
        if isinstance(a, dict) and a.get("kind") == "message"
    ]
    return {
        "id": quote.get("id"),
        "number": quote.get("number"),
        "status": quote.get("status"),
        "note": quote.get("note"),
        "machineId": quote.get("machineId"),
        "machineName": quote.get("machineName"),
        "customerEmail": quote.get("customerEmail"),
        "activity_count": len(activities),
        "messages": messages,
        "marker_present": MARKER in messages,
        "note_present": NOTE in (quote.get("note") or ""),
    }


def main() -> int:
    if not BYPASS:
        print("SPARES_BYPASS is required", file=sys.stderr)
        return 2

    report: dict[str, Any] = {
        "preview": BASE,
        "marker": MARKER,
        "note": NOTE,
        "started": now(),
        "protection": None,
        "log": [],
        "verdict": {},
    }

    protection = protection_is_on()
    report["protection"] = protection
    report["log"].append(protection)

    customer = Probe("customer-a")
    login = customer.login(*CUSTOMER)
    me = customer.request("GET", "/api/auth/me")
    machines = customer.request("GET", "/api/machines")
    created = customer.request(
        "POST",
        "/api/quotes",
        body=json.dumps(
            {
                "machineId": "hardware-fixture",
                "items": [{"id": "5972K325", "qty": 2}],
                "note": NOTE,
            }
        ).encode(),
        content_type="application/json",
    )
    quote = created.get("body", {}).get("quote") if isinstance(created.get("body"), dict) else None
    quote_id = quote.get("id") if isinstance(quote, dict) else None
    quote_number = quote.get("number") if isinstance(quote, dict) else None
    ident = str(quote_number or quote_id or "1")

    commented = customer.request(
        "POST",
        f"/api/quotes/{ident}/activity",
        body=json.dumps({"text": MARKER}).encode(),
        content_type="application/json",
    )
    after_create = customer.request("GET", f"/api/quotes/{ident}")

    # Same cookie, new connection (possible other isolate).
    after_hop_same_cookie = customer.request("GET", f"/api/quotes/{ident}")
    machines_after = customer.request("GET", "/api/machines")

    staff = Probe("staff-b")
    staff.login(*STAFF)
    staff_list = staff.request("GET", "/api/quotes")
    staff_get = staff.request("GET", f"/api/quotes/{ident}")
    staff_machines = staff.request("GET", "/api/machines")

    wait_s = int(os.environ.get("SPARES_WAIT_S", "25"))
    time.sleep(wait_s)

    after_wait_customer = customer.request("GET", f"/api/quotes/{ident}")
    after_wait_staff = staff.request("GET", f"/api/quotes/{ident}")
    after_wait_machines = customer.request("GET", "/api/machines")

    # Brand-new staff session after the wait (new isolate + new cookie).
    staff2 = Probe("staff-c-after-wait")
    staff2.login(*STAFF)
    staff2_get = staff2.request("GET", f"/api/quotes/{ident}")
    staff2_machines = staff2.request("GET", "/api/machines")

    for probe in (customer, staff, staff2):
        report["log"].extend(probe.log)

    def machine_names(entry: dict[str, Any]) -> list[str]:
        body = entry.get("body")
        machines_list = body.get("machines") if isinstance(body, dict) else None
        if not isinstance(machines_list, list):
            return []
        names: list[str] = []
        for item in machines_list:
            if isinstance(item, dict) and item.get("name"):
                names.append(str(item["name"]))
        return names

    customer_quote = summarize_quote(after_create.get("body"))
    hop_quote = summarize_quote(after_hop_same_cookie.get("body"))
    wait_customer = summarize_quote(after_wait_customer.get("body"))
    staff_quote = summarize_quote(staff_get.get("body"))
    wait_staff = summarize_quote(after_wait_staff.get("body"))
    staff2_quote = summarize_quote(staff2_get.get("body"))

    login_html = customer.request("GET", "/login")
    report["log"].append(login_html)
    login_body = login_html.get("body") if isinstance(login_html.get("body"), str) else ""
    spares_login = "staff and customers use the same screen" in login_body.lower() or (
        'id="email"' in login_body.lower() and "password" in login_body.lower()
    )

    instances = sorted(
        {
            (entry.get("vercel_id") or "").split("::")[-1]
            for entry in report["log"]
            if entry.get("vercel_id")
        }
        - {""}
    )

    quote_ok = all(
        q and q.get("marker_present") and q.get("note_present")
        for q in (customer_quote, hop_quote, wait_customer, staff_quote, wait_staff, staff2_quote)
        if q is not None
    ) and all(
        q is not None
        for q in (customer_quote, hop_quote, wait_customer, staff_quote, wait_staff, staff2_quote)
    )
    machines_ok = all(
        "Hardware fixture" in machine_names(entry) and "Palletizer" in machine_names(entry)
        for entry in (machines, machines_after, staff_machines, after_wait_machines, staff2_machines)
    )

    report["finished"] = now()
    report["quote_id"] = quote_id
    report["quote_number"] = quote_number
    report["vercel_instance_suffixes"] = instances
    report["summaries"] = {
        "after_create": customer_quote,
        "after_hop_same_cookie": hop_quote,
        "staff_other_context": staff_quote,
        "after_wait_customer": wait_customer,
        "after_wait_staff": wait_staff,
        "new_staff_session_after_wait": staff2_quote,
        "machines_first": machine_names(machines),
        "machines_after_wait": machine_names(after_wait_machines),
        "machines_new_staff": machine_names(staff2_machines),
    }
    report["verdict"] = {
        "protection_on": bool(protection.get("looks_like_vercel_sso"))
        or (protection.get("status") in {401, 403} and not protection.get("looks_like_spares_login")),
        "bypass_reaches_spares_login": spares_login,
        "customer_login": login.get("status") == 200,
        "me": me.get("status") == 200,
        "quote_created": created.get("status") == 201,
        "comment_created": commented.get("status") == 201,
        "quote_and_comment_durable": quote_ok,
        "machines_list_loads": machines_ok,
        "second_context_staff_sees_quote": bool(staff_quote and staff_quote.get("marker_present")),
        "after_wait_new_session_sees_quote": bool(
            staff2_quote and staff2_quote.get("marker_present")
        ),
    }

    durable = (
        report["verdict"]["quote_and_comment_durable"]
        and report["verdict"]["machines_list_loads"]
        and report["verdict"]["protection_on"]
    )
    report["verdict"]["issue_47"] = "FIXED" if durable else "STILL BROKEN"

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
        fh.write("\n")

    print(json.dumps({"verdict": report["verdict"], "quote_number": quote_number, "out": OUT}))
    return 0 if durable else 1


if __name__ == "__main__":
    raise SystemExit(main())

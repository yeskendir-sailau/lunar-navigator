"""Checks whether the source pages behind Lunar Navigator have changed.

What it does
  1. Collects every source URL from data/sites.json, plus the extra pages listed in EXTRA_SOURCES below.
  2. Downloads each page, removes scripts / styles / tags / dates-and-counters noise, and hashes the remaining text
     (for PDFs it hashes the file itself).
  3. Compares the hash with the one saved in data/source_hashes.json.
  4. If something changed, it writes a short report (source_report.md) and, with --create-issue, opens a GitHub issue
     "Check what's new in the sources". A human then decides what to do.

It NEVER edits data/sites.json or anything on the map. The only file it writes is data/source_hashes.json
(the memory of "what the pages looked like last time") and the report.

Run (from the project folder):
    python3 tools/check_sources.py                  # check and print
    python3 tools/check_sources.py --create-issue   # also open a GitHub issue if something changed (needs the gh tool)
    python3 tools/check_sources.py --dry-run        # do not write the hashes file

The first run only records the baseline: nothing is reported as "changed".
Known limitation: a page that shows a changing text (news box, visit counter) can look "changed" every day.
If one page keeps creating issues, remove it from the list or look at what changes.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITES = ROOT / "data" / "sites.json"
HASHES = ROOT / "data" / "source_hashes.json"
REPORT = ROOT / "source_report.md"

# Pages that are not tied to one site but that the project depends on. Edit freely.
EXTRA_SOURCES = [
    {"name": "JPL Horizons (Sun and Earth positions)", "url": "https://ssd.jpl.nasa.gov/horizons/"},
    {"name": "NASA Scientific Visualization Studio: Moon Kit (texture)", "url": "https://svs.gsfc.nasa.gov/4720"},
]

TIMEOUT_S = 40
USER_AGENT = "lunar-navigator-source-check/1.0 (hackathon project; daily check)"


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
        return response.read(), response.headers.get("Content-Type", "")


def fingerprint(body, content_type, url):
    """Hash of the meaningful content, ignoring markup and obviously changing noise."""
    is_pdf = "pdf" in content_type.lower() or url.lower().endswith(".pdf") or body[:5] == b"%PDF-"
    if is_pdf:
        return hashlib.sha256(body).hexdigest()
    text = body.decode("utf-8", errors="replace")
    text = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", " ", text)
    text = re.sub(r"(?s)<!--.*?-->", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = re.sub(r"&[#\w]+;", " ", text)
    text = re.sub(r"(?i)(last updated|page last updated|last modified)[^.\n]{0,60}", " ", text)
    text = re.sub(r"\s+", " ", text).strip().lower()
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def collect_sources():
    sources = {}
    try:
        sites = json.loads(SITES.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        sys.exit(f"Cannot read {SITES}: {error}")
    for site in sites:
        url = site.get("source")
        if url:
            sources.setdefault(url, {"name": url, "sites": []})["sites"].append(site.get("name", site.get("id", "?")))
    for extra in EXTRA_SOURCES:
        sources.setdefault(extra["url"], {"name": extra["name"], "sites": []})
    return sources


def run_gh_issue(title, body):
    try:
        subprocess.run(["gh", "issue", "create", "--title", title, "--body", body], check=True)
        return True
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"Could not create the issue: {error}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--create-issue", action="store_true", help="open a GitHub issue when a source changed")
    parser.add_argument("--dry-run", action="store_true", help="do not write the hashes file")
    args = parser.parse_args()

    old = {}
    first_run = not HASHES.exists()
    if not first_run:
        try:
            old = json.loads(HASHES.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            sys.exit(f"{HASHES} is not valid JSON. Delete it to start a new baseline.")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    sources = collect_sources()
    new, changed, failed = dict(old), [], []

    for url, info in sources.items():
        try:
            body, content_type = fetch(url)
        except (urllib.error.URLError, OSError, ValueError) as error:
            failed.append((url, info, str(error)))
            print(f"UNREACHABLE  {url}  ({error})")
            continue
        digest = fingerprint(body, content_type, url)
        previous = old.get(url, {}).get("hash")
        if previous is None:
            print(f"NEW          {url}")
        elif previous != digest:
            changed.append((url, info))
            print(f"CHANGED      {url}")
        else:
            print(f"same         {url}")
        new[url] = {"hash": digest, "checked": now,
                    "changed": now if previous not in (None, digest) else old.get(url, {}).get("changed")}

    if not args.dry_run:
        HASHES.write_text(json.dumps(new, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if first_run:
        print("\nFirst run: baseline saved, nothing to report.")
        REPORT.unlink(missing_ok=True)
        return 0
    if not changed:
        print("\nNo source changed." + (f" {len(failed)} page(s) could not be reached." if failed else ""))
        REPORT.unlink(missing_ok=True)
        return 0

    lines = [f"Some source pages changed since the last check ({now}).", "",
             "Please look at what is new. This check does **not** change the map: a person decides.", ""]
    for url, info in changed:
        used_by = f" (used for: {', '.join(info['sites'][:6])}{'…' if len(info['sites']) > 6 else ''})" if info["sites"] else ""
        lines.append(f"- {info['name']}{used_by}: {url}")
    if failed:
        lines += ["", "Could not be reached this time (not necessarily a problem):"]
        lines += [f"- {url}: {err}" for url, _info, err in failed]
    lines += ["", "What to do: open the pages, compare with `data/sites.json`, update the site list by hand if needed, "
              "run `python3 tools/check_sites.py`, then close this issue."]
    body_text = "\n".join(lines)
    REPORT.write_text(body_text + "\n", encoding="utf-8")
    print("\n" + body_text)
    if args.create_issue:
        run_gh_issue("Check what's new in the sources", body_text)
    return 0


if __name__ == "__main__":
    sys.exit(main())

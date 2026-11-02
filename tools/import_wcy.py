#!/usr/bin/env python3
"""Read an official WCY group timetable and emit a compact JSON calendar.

No third-party timetable API, credentials, or Python dependencies are used.
The source is https://planzajec.wcy.wat.edu.pl/.
"""
import argparse
import hashlib
import html
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://planzajec.wcy.wat.edu.pl/pl/rozklad?grupa_id={}"
GROUP = re.compile(r"^WCY[0-9A-Za-z_*]+$")


def plain(markup):
    return html.unescape(re.sub(r"<[^>]+>", "", markup)).strip()


def span(markup, cls):
    match = re.search(r'<span\s+class="' + re.escape(cls) + r'"[^>]*>(.*?)</span>', markup, re.S)
    return plain(match.group(1)) if match else ""


def block_times(page):
    """Keep each day's clock: WCY uses different weekday and weekend slots."""
    times = {}
    days = {"pon": 0, "wt": 1, "sr": 2, "czw": 3, "pt": 4, "sob": 5, "nd": 6}
    sections = list(re.finditer(r'<div\s+class="day_v1\s+(pon|wt|sr|czw|pt|sob|nd)"[^>]*>', page))
    fragments = [(days[section.group(1)], page[section.end():sections[i+1].start() if i+1<len(sections) else len(page)]) for i, section in enumerate(sections)] if sections else [(None, page)]
    for weekday, fragment in fragments:
        for match in re.finditer(r'<div\s+class="block_nr (block\d+)"[^>]*>(.*?)</div>', fragment, re.S):
            a, b = span(match.group(2), "hr1"), span(match.group(2), "hr2")
            if re.fullmatch(r"\d{2}:\d{2}", a) and re.fullmatch(r"\d{2}:\d{2}", b):
                start, end = datetime.strptime(a, "%H:%M"), datetime.strptime(b, "%H:%M")
                if end <= start:
                    raise ValueError("Invalid lesson block time range")
                key = (weekday, match.group(1))
                if key in times and times[key] != (a, b):
                    raise ValueError("Ambiguous block times; weekday context required")
                times[key] = (a, b)
    return times


def parse(page, group):
    if not GROUP.fullmatch(group):
        raise ValueError("Invalid WCY group code")
    heading = re.search(r"Rozkład\s+zajęć\s+grupy:\s*([A-Za-z0-9_*]+)", page, re.I)
    if heading and heading.group(1).upper() != group.upper():
        raise ValueError("Saved timetable belongs to a different WCY group")
    island = re.search(r'<div\s+class="lessons hidden"[^>]*>(.*?)</div>\s*<div\s+class="rozklad_container"', page, re.S)
    if not island:
        raise ValueError("Official schedule structure not found; refusing to publish an empty or incorrect plan")
    times = block_times(page)
    if not times:
        raise ValueError("Lesson block times missing")
    events = []
    for match in re.finditer(r'<div\s+class="lesson"[^>]*>(.*?)</div>', island.group(1), re.S):
        raw = match.group(1)
        date = span(raw, "date").replace("_", "-")
        block = span(raw, "block_id")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            continue
        weekday = datetime.strptime(date, "%Y-%m-%d").weekday()
        hours = times.get((weekday, block)) or times.get((None, block))
        if not hours:
            raise ValueError("Lesson block times missing for its weekday; previous plan preserved")
        name_match = re.search(r'<span\s+class="name"[^>]*>(.*?)</span>', raw, re.S)
        parts = [plain(piece) for piece in re.split(r"<br\s*/?>", name_match.group(1))] if name_match else []
        details = span(raw, "info")
        subject, sep, suffix = details.rpartition(" - (")
        if sep:
            lesson_type, end_marker, tail = suffix.partition(")")
            if not end_marker:
                lesson_type, tail = "", ""
            instructor = tail.strip().removeprefix("-").strip(" -")
        else:
            subject, lesson_type, instructor = details, "", ""
        subject = subject.strip(" -") or (parts[0] if parts else "Zajęcia")
        start, end = hours
        identity = "|".join((group, date, block, subject, lesson_type, parts[2] if len(parts) > 2 else "", instructor))
        event_id = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:20]
        events.append({"id": f"wcy:{event_id}", "title": subject,
                       "subject": subject, "type": lesson_type, "instructor": instructor,
                       "date": date, "start_time": start, "end_time": end,
                       "location": parts[2] if len(parts) > 2 else "", "kind": "university",
                       "recurrence": "none", "source": "wcy"})
    if not events:
        raise ValueError("No valid lessons found; keeping the previous published timetable")
    events.sort(key=lambda e: (e["date"], e["start_time"], e["title"], e["id"]))
    return {"group": group, "source": BASE.format(group), "fetched_at": datetime.now(timezone.utc).isoformat(),
            "events": events}


def prepare_update(result, previous_path, term_start):
    """Reject suspicious snapshots; avoid commits when only fetch time changes."""
    current = [event for event in result["events"] if event["date"] >= term_start]
    if not current:
        raise ValueError("No lessons from the requested semester; previous plan preserved")
    result["events"] = current
    if not previous_path.exists():
        return True
    previous = json.loads(previous_path.read_text(encoding="utf-8"))
    if previous.get("group") != result["group"]:
        raise ValueError("Previous file belongs to another group")
    old_events = previous.get("events", [])
    if not isinstance(old_events, list):
        raise ValueError("Previous calendar contains invalid data")
    if old_events == current:
        return False
    if old_events and len(current) < len(old_events) * 0.6:
        raise ValueError("New plan is more than 40% smaller; review required before replacing it")
    return True


def decode_saved_html(path):
    """Accept browser-saved UTF-8 and older Windows-1250 HTML exports."""
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "windows-1250"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            pass
    raise ValueError("Cannot decode HTML file as UTF-8 or Windows-1250")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--group", default="WCY25KY2S1")
    parser.add_argument("--html", type=Path, help="Optional officially saved HTML file for offline verification")
    parser.add_argument("--output", type=Path, help="JSON destination (defaults to data/GROUP.json)")
    parser.add_argument("--term-start", default="2026-09-01", help="Ignore lessons before this YYYY-MM-DD date")
    args = parser.parse_args()
    if not GROUP.fullmatch(args.group):
        parser.error("Invalid WCY group code")
    if args.output is None:
        args.output = Path("data") / (args.group.upper() + ".json")
    datetime.strptime(args.term_start, "%Y-%m-%d")
    if args.html:
        page = decode_saved_html(args.html)
    else:
        req = urllib.request.Request(BASE.format(args.group), headers={"User-Agent": "MojPlan/1.0 (+personal calendar; contact via repository)"})
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                page = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            raise SystemExit(f"Official WCY server returned HTTP {exc.code}; no bypass attempted") from exc
    result = parse(page, args.group)
    if not prepare_update(result, args.output, args.term_start):
        print(f"No changes to {args.group}; previous calendar preserved")
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(result['events'])} lessons for {args.group} to {args.output}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

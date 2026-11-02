"""Official WCY first, public PlanWAT iCalendar as an explicitly allowed fallback."""
import argparse
import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from import_wcy import BASE, GROUP, parse, prepare_update

PLANWAT = 'https://kilerdevs.github.io/PlanWAT/{}/plan.ics'


def unescape(value):
    return re.sub(r'\\([nN,;\\])', lambda m: '\n' if m[1].lower() == 'n' else m[1], value)


def parse_ics(text, group):
    lines = re.sub(r'\r?\n[ \t]', '', text).splitlines()
    if 'BEGIN:VCALENDAR' not in lines or 'END:VCALENDAR' not in lines:
        raise ValueError('Incomplete iCalendar response')
    fields, events, item = {}, [], None
    for line in lines:
        if line == 'BEGIN:VEVENT':
            item = {}
        elif line == 'END:VEVENT':
            if item is None:
                raise ValueError('Invalid VEVENT')
            events.append(item)
            item = None
        elif ':' in line:
            key, value = line.split(':', 1)
            name = key.split(';', 1)[0]
            (fields if item is None else item)[name] = (key, value)
    if fields.get('X-PLAN-GROUP', ('', ''))[1] != group:
        raise ValueError('PlanWAT calendar belongs to another group')
    result = []
    for item in events:
        if 'RRULE' in item or 'RECURRENCE-ID' in item:
            raise ValueError('Recurring ICS entries require review')
        def timestamp(name):
            key, value = item[name]
            if ';TZID=Europe/Warsaw' not in key:
                raise ValueError('Expected Europe/Warsaw local timestamps')
            return datetime.strptime(value, '%Y%m%dT%H%M%S')
        start, end = timestamp('DTSTART'), timestamp('DTEND')
        if end <= start or start.date() != end.date():
            raise ValueError('Invalid lesson time range')
        title = unescape(item['SUMMARY'][1])
        kind = unescape(item.get('CATEGORIES', ('', ''))[1])
        subject = title.removesuffix(f' ({kind})') if kind else title
        identity = '|'.join((group, start.isoformat(), subject, kind))
        result.append(dict(id='planwat:' + hashlib.sha256(identity.encode()).hexdigest()[:20],
                           title=subject, subject=subject, type=kind, instructor='',
                           date=start.strftime('%Y-%m-%d'), start_time=start.strftime('%H:%M'),
                           end_time=end.strftime('%H:%M'), location=unescape(item.get('LOCATION', ('', ''))[1]),
                           kind='university', recurrence='none', source='planwat'))
    if not result:
        raise ValueError('No lessons in PlanWAT calendar')
    generated = fields.get('X-PLAN-GENERATED', ('', ''))[1]
    generated_date = datetime.strptime(generated, '%Y%m%d').date().isoformat()
    result.sort(key=lambda e: (e['date'], e['start_time'], e['title'], e['id']))
    return dict(group=group, source=PLANWAT.format(group), provider='PlanWAT (nieoficjalne źródło)',
                source_generated_at=generated_date, fetched_at=datetime.now(timezone.utc).isoformat(), events=result)


def download(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'MojPlan/1.0 (public timetable sync)'})
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read().decode('utf-8-sig')


def older_fallback(result, previous):
    previous_date = previous.get('source_generated_at') or previous.get('fetched_at', '')[:10]
    return bool(previous_date and result['source_generated_at'] < previous_date)


def sync(group, path, term_start):
    try:
        result = parse(download(BASE.format(group)), group)
        changed = prepare_update(result, path, term_start)
    except (OSError, ValueError, KeyError) as error:
        print(f'Official WCY unavailable: {error}. Trying public PlanWAT feed.')
        result = parse_ics(download(PLANWAT.format(group)), group)
        previous = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
        if older_fallback(result, previous):
            print('::warning::PlanWAT feed predates the published snapshot; preserving the newer timetable.')
            return False
        changed = prepare_update(result, path, term_start)
    if changed:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'Saved {len(result["events"])} lessons from {result["source"]}')
    else:
        print('No timetable changes.')
    return changed


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--group', default='WCY25KY2S1')
    parser.add_argument('--term-start', default='2026-09-01')
    args = parser.parse_args()
    group = args.group.upper()
    if not re.fullmatch(r'WCY[0-9A-Z_]+', group):
        parser.error('Invalid group')
    sync(group, Path('data') / f'{group}.json', args.term_start)

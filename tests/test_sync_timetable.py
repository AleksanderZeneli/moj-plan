import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / 'tools'))
import sync_timetable as module

ICS = '''BEGIN:VCALENDAR
VERSION:2.0
X-PLAN-GROUP:WCY25KY2S1
X-PLAN-GENERATED:20261102
BEGIN:VEVENT
UID:test@planwat
DTSTART;TZID=Europe/Warsaw:20261103T080000
DTEND;TZID=Europe/Warsaw:20261103T093500
SUMMARY:Bazy danych (Laboratorium)
CATEGORIES:Laboratorium
LOCATION:Sala 213
END:VEVENT
END:VCALENDAR
'''


class SyncTests(unittest.TestCase):
    def test_parses_type_and_local_time(self):
        event = module.parse_ics(ICS, 'WCY25KY2S1')['events'][0]
        self.assertEqual((event['title'], event['type'], event['start_time'], event['source']),
                         ('Bazy danych', 'Laboratorium', '08:00', 'planwat'))

    def test_wrong_group_and_incomplete_files_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'another group'):
            module.parse_ics(ICS, 'WCY26KY3S1')
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            module.parse_ics(ICS.replace('END:VCALENDAR', ''), 'WCY25KY2S1')

    def test_folded_lines_and_escaped_characters(self):
        text = ICS.replace('SUMMARY:Bazy danych (Laboratorium)', 'SUMMARY:Bazy da\n nych\\, SQL (Laboratorium)')
        self.assertEqual(module.parse_ics(text, 'WCY25KY2S1')['events'][0]['title'], 'Bazy danych, SQL')

    def test_unsupported_recurrence_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Recurring'):
            module.parse_ics(ICS.replace('UID:test@planwat', 'UID:test@planwat\nRRULE:FREQ=WEEKLY'), 'WCY25KY2S1')

    def test_stale_fallback_preserves_previous_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'plan.json'
            before = json.dumps({'group': 'WCY25KY2S1', 'fetched_at': '2026-11-03T12:00:00Z', 'events': []})
            path.write_text(before, encoding='utf-8')
            with patch.object(module, 'download', side_effect=[OSError('403'), ICS]):
                self.assertFalse(module.sync('WCY25KY2S1', path, '2026-09-01'))
            self.assertEqual(path.read_text(encoding='utf-8'), before)

    def test_fallback_is_used_after_official_block(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'plan.json'
            with patch.object(module, 'download', side_effect=[OSError('403'), ICS]):
                self.assertTrue(module.sync('WCY25KY2S1', path, '2026-09-01'))
            self.assertEqual(json.loads(path.read_text(encoding='utf-8'))['events'][0]['source'], 'planwat')

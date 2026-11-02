import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("import_wcy", Path(__file__).parents[1] / "tools" / "import_wcy.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TimetableTests(unittest.TestCase):
    page = '''
    <div class="day_blocks"><div class="block_nr block1"><span class="hr1">08:00</span><span class="hr2">09:35</span></div></div>
    <div class="lessons hidden"><div class="lesson">
      <span class="date">2026_11_03</span><span class="block_id">block1</span>
      <span class="name">BD<br>(L)<br>213</span>
      <span class="info">Bazy danych - (Laboratorium) - Jan Kowalski</span>
    </div></div><div class="rozklad_container">
    '''

    def test_parses_official_fields(self):
        data = module.parse(self.page, "WCY25KY2S1")
        item = data["events"][0]
        self.assertEqual((item["date"], item["start_time"], item["end_time"]), ("2026-11-03", "08:00", "09:35"))
        self.assertEqual((item["title"], item["location"], item["type"]), ("Bazy danych", "213", "Laboratorium"))

    def test_subject_parentheses_are_not_classified_as_type(self):
        html_page = self.page.replace("Bazy danych - (Laboratorium) - Jan Kowalski", "Język obcy (II) międzywydziałowy - (Ćwiczenia) - -")
        item = module.parse(html_page, "WCY25KY2S1")["events"][0]
        self.assertEqual((item["title"], item["type"], item["instructor"]), ("Język obcy (II) międzywydziałowy", "Ćwiczenia", ""))

    def test_group_mismatch_is_rejected(self):
        html_page = self.page + "<h1>Rozkład zajęć grupy: WCY26KY3S1</h1>"
        with self.assertRaisesRegex(ValueError, "different WCY group"):
            module.parse(html_page, "WCY25KY2S1")

    def test_fails_closed_on_missing_schedule(self):
        with self.assertRaisesRegex(ValueError, "structure"):
            module.parse("Forbidden", "WCY25KY2S1")

    def test_preserves_file_when_data_unchanged(self):
        data = module.parse(self.page, "WCY25KY2S1")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "calendar.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            self.assertFalse(module.prepare_update(data, path, "2026-09-01"))

    def test_rejects_suspicious_shrink(self):
        data = module.parse(self.page, "WCY25KY2S1")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "calendar.json"
            path.write_text(json.dumps({**data, "events": data["events"] * 4}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "40%"):
                module.prepare_update(data, path, "2026-09-01")

    def test_rejects_old_semester(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, "requested semester"):
                module.prepare_update(module.parse(self.page, "WCY25KY2S1"), Path(tmp) / "none", "2027-03-01")

    def test_decode_windows_saved_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "plan.html"
            path.write_bytes("Zażółć gęślą".encode("windows-1250"))
            self.assertEqual(module.decode_saved_html(path), "Zażółć gęślą")

    def test_weekday_and_weekend_clocks_are_not_overwritten(self):
        lessons = self.page.replace('<div class="day_blocks"><div class="block_nr block1"><span class="hr1">08:00</span><span class="hr2">09:35</span></div></div>', '')
        lessons = lessons.replace('block1', 'block6')
        table = '<div class="day_v1 wt"><div class="block_nr block6"><span class="hr1">17:50</span><span class="hr2">19:25</span></div></div><div class="day_v1 sob"><div class="block_nr block6"><span class="hr1">17:10</span><span class="hr2">18:45</span></div></div>'
        tuesday = module.parse(lessons + table, 'WCY25KY2S1')['events'][0]
        self.assertEqual((tuesday['start_time'], tuesday['end_time']), ('17:50', '19:25'))
        saturday = module.parse(lessons.replace('2026_11_03', '2026_11_07') + table, 'WCY25KY2S1')['events'][0]
        self.assertEqual((saturday['start_time'], saturday['end_time']), ('17:10', '18:45'))
        self.assertEqual(tuesday['id'], module.parse(lessons + table.replace('17:50', '17:55'), 'WCY25KY2S1')['events'][0]['id'])

    def test_ambiguous_clock_without_weekdays_is_rejected(self):
        conflicting = self.page + '<div class="block_nr block1"><span class="hr1">09:00</span><span class="hr2">10:35</span></div>'
        with self.assertRaisesRegex(ValueError, 'Ambiguous'):
            module.parse(conflicting, 'WCY25KY2S1')

    def test_missing_weekday_clock_does_not_drop_lessons_silently(self):
        page = self.page.replace('<div class="day_blocks">', '<div class="day_v1 sob"><div class="day_blocks">', 1)
        with self.assertRaisesRegex(ValueError, 'weekday'):
            module.parse(page, 'WCY25KY2S1')


if __name__ == "__main__":
    unittest.main()

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


if __name__ == "__main__":
    unittest.main()

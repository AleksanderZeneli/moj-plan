import importlib.util
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


if __name__ == "__main__":
    unittest.main()

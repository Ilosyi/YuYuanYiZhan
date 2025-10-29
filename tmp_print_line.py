from pathlib import Path

path = Path(r'e:\CodeHub\YuYuanYiZhan\frontend\src\pages\HomePage.jsx')
lines = path.read_text(encoding='utf-8').splitlines()
for offset in range(1180, 1200):
    print(offset + 1, repr(lines[offset]))

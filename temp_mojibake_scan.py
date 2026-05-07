from pathlib import Path
import re
root = Path('fronted')
pattern = re.compile(r'(?:[\u0420\u0421][^\x00-\x7f]){4,}')
for p in sorted(root.rglob('*')):
    if p.suffix.lower() not in {'.js', '.jsx', '.ts', '.tsx', '.css', '.md', '.json', '.html'}:
        continue
    text = p.read_text('utf-8', errors='replace')
    matches = pattern.findall(text)
    if matches:
        print(p)
        for t in sorted(set(matches))[:20]:
            try:
                print('  ', t, '=>', t.encode('cp1251').decode('utf-8'))
            except Exception as e:
                print('  ', t, 'ERR', e)
        print('---', len(matches), 'matches')

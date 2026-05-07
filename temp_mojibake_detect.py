from pathlib import Path
import re
p = Path('fronted/src/components/ViewControls.jsx')
b = p.read_bytes()
s = b.decode('utf-8')
pattern = re.compile(r'(?:[\u0420\u0421][^\x00-\x7f]){4,}')
seen = []
for m in pattern.finditer(s):
    t = m.group(0)
    if t in seen:
        continue
    seen.append(t)
    try:
        recovered = t.encode('cp1251').decode('utf-8')
    except Exception as e:
        recovered = 'ERROR:' + str(e)
    print('---')
    print(repr(t))
    print('=>', recovered)
print('count', len(seen))

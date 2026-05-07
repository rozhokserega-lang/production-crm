from pathlib import Path
import re
p = Path('fronted/src/components/ViewControls.jsx')
text = p.read_text('utf-8', errors='replace')
pattern = re.compile(r'(?:[\u0420\u0421][^\u0400-\u04FF]){3,}')
for m in pattern.finditer(text):
    t = m.group(0)
    print(repr(t), [hex(ord(c)) for c in t])
print('count', len(pattern.findall(text)))

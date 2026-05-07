from pathlib import Path
import re
p = Path('fronted/src/components/ViewControls.jsx')
text = p.read_text('utf-8', errors='replace')
# find sequences that include U+0098 or similar after R
pattern = re.compile(r'Р[\x80-\x9f][^\s"\'>]{2,20}')
for m in pattern.finditer(text):
    t = m.group(0)
    print(repr(t), [hex(ord(c)) for c in t])

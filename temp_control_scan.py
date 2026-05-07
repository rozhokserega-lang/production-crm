from pathlib import Path
import re
text = Path('fronted/src/components/ViewControls.jsx').read_text('utf-8', errors='replace')
for m in re.finditer(r'Р[\x80-\x9f][^\s"\'>]{1,20}', text):
    t = m.group(0)
    print(repr(t), [hex(ord(c)) for c in t])

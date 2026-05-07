from pathlib import Path
import re
p = Path('fronted/src/components/ViewControls.jsx')
s = p.read_text('utf-8', errors='replace')
candidates = ['Р\x98С\u0459Р\u043eС\u0440Р\u0438Р\u044f', 'Р\xadС\u0442Р\u0430Р\u043fС\u044b', 'Р\x98Р\u043cР\u043fР\u043eС\u0440С\u0442']
for c in candidates:
    idx = s.find(c)
    print('candidate', repr(c), 'index', idx)
    if idx != -1:
        print(repr(s[idx:idx+40]))
    else:
        print('not found')

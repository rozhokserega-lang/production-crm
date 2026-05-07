from pathlib import Path
import re
p = Path('fronted/src/components/ViewControls.jsx')
text = p.read_text('utf-8', errors='replace')
pattern = re.compile(r'(?:[\u0420\u0421][^\x00-\x7f]){4,}')
for m in pattern.finditer(text):
    t = m.group(0)
    try:
        recovered = t.encode('cp1251').decode('utf-8')
    except Exception as e:
        print('BAD', repr(t), 'len', len(t))
        print('ords', [hex(ord(c)) for c in t])
        print('snippet', repr(text[m.start()-5:m.end()+5]))
        print('---')

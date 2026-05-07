from pathlib import Path
import sys
p = Path('fronted/src/components/ViewControls.jsx')
b = p.read_bytes()
s = b.decode('utf-8')
idx = s.find('Р')
print('first R index', idx)
print('snippet', repr(s[idx:idx+40]))
print('codepoints', [hex(ord(c)) for c in s[idx:idx+40]])
print('contains R? ', 'Р' in s)
print('len', len(s))

from pathlib import Path
p = Path('fronted/src/components/ViewControls.jsx')
text = p.read_text('utf-8', errors='replace')
needle = 'Р\x98С'
idx = text.find(needle)
print('idx', idx)
print('slice repr', repr(text[idx:idx+30]))

b = p.read_bytes()
# find the raw bytes of the utf-8 replacement sequence by comparing char positions
byte_idx = len(text[:idx].encode('utf-8'))
print('byte idx', byte_idx)
print('bytes', b[byte_idx:byte_idx+20])
print('bytes hex', ' '.join(f'{x:02x}' for x in b[byte_idx:byte_idx+20]))

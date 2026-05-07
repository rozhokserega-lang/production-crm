s = 'РљР°РЅР±Р°РЅ'
print(repr(s))
print(s.encode('cp1251').decode('utf-8'))
print(s.encode('latin-1').decode('utf-8'))
print(s.encode('utf-8').decode('utf-8'))

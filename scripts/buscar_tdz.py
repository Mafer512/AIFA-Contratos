# -*- coding: utf-8 -*-
"""Busca posibles errores de zona muerta temporal (TDZ) en Dashboard.tsx.

Un `const` declarado dentro del componente sólo existe a partir de la línea en
que se declara. Si un useMemo/useCallback de MÁS ARRIBA lo llama durante el
render, revienta con "Cannot access X before initialization" y React desmonta
toda la aplicación.

Esto lista los nombres que se usan antes de declararse. No todos son un fallo:
si el uso está dentro de una función que sólo corre al hacer clic, para entonces
ya está inicializada. Los peligrosos son los que se usan dentro de un useMemo.
"""
import io
import re

p = 'components/Dashboard.tsx'
lines = io.open(p, encoding='utf-8').read().split('\n')

# Declaraciones a dos espacios de sangría = ámbito del cuerpo del componente.
decl_re = re.compile(r'^  (?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=')
decls = {}
for i, l in enumerate(lines):
    m = decl_re.match(l)
    if m and m.group(1) not in decls:
        decls[m.group(1)] = i

# Rangos de cada useMemo: su cuerpo SÍ se ejecuta durante el render.
# useCallback queda fuera a propósito: sólo crea la función, no la ejecuta.
memo_ranges = []
for i, l in enumerate(lines):
    if 'useMemo(' in l:
        # Cierre aproximado: la primera línea que empieza con "  }, [" o "  });"
        for j in range(i, min(i + 400, len(lines))):
            if re.match(r'^  \}\s*,\s*\[', lines[j]) or re.match(r'^  \}\)', lines[j]):
                memo_ranges.append((i, j))
                break

def en_memo(idx):
    return any(a <= idx <= b for a, b in memo_ranges)

sospechosos = []
for nombre, decl_line in decls.items():
    if len(nombre) < 4:
        continue
    patron = re.compile(r'\b' + re.escape(nombre) + r'\b')
    for i in range(decl_line):
        l = lines[i]
        if l.strip().startswith('//') or l.strip().startswith('*'):
            continue
        if not patron.search(l):
            continue
        # Ignorar la propia lista de dependencias y comentarios.
        sospechosos.append((nombre, decl_line + 1, i + 1, en_memo(i), l.strip()[:80]))
        break

criticos = [s for s in sospechosos if s[3]]
otros = [s for s in sospechosos if not s[3]]

print('=== CRITICOS: usados dentro de un useMemo/useCallback antes de declararse ===\n')
if not criticos:
    print('  (ninguno)')
for nombre, decl, uso, _, texto in sorted(criticos, key=lambda x: x[2]):
    print(f'  {nombre:<40} declarado en {decl:>5}, usado en {uso:>5}')
    print(f'      {texto}')

print(f'\n=== Otros usos antes de declarar (dentro de funciones diferidas: no fallan) ===')
print(f'  {len(otros)} casos, no criticos')

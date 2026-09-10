PROVSOFT - KÁRDEX SKU MULTIDIRECCIONAL

1. Configure assets/js/config.js con sus credenciales Firebase.
2. Ejecute: py server.py
3. Abra http://localhost:8000

Funcionamiento:
- Busca artículos en /productos por codigoBarra o concepto.
- Acepta palabras en cualquier orden.
- Muestra 20 movimientos por página, del más reciente al más antiguo.
- Siguiente calcula el bloque posterior usando cursores por ruta.
- Anterior reutiliza páginas en memoria sin nuevas lecturas.
- No guarda resultados ni usa listeners en tiempo real.

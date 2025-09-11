@"
# App Conciliación Transitorias

Herramienta para pareo automático de débitos y créditos en cuentas transitorias.

## Requisitos
- Python 3.10+
- \`pip install -r requirements.txt\`

## Ejecutar
Opción A (Streamlit):
\`streamlit run app.py\`  
o \`streamlit run app_conciliacion_transitorias.py\`

Opción B (CLI):
\`python app.py\`

## Notas
- Los archivos \`.xlsx\` están ignorados para no subir datos sensibles.
- Usa ramas para nuevas funciones: \`git checkout -b feature/nombre\`.
"@ | Set-Content -Encoding utf8 README.md
git add README.md
git commit -m "Agregar README inicial"
git push

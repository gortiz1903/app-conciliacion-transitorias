# App Conciliación Transitorias

Herramienta para pareo automático de débitos y créditos en cuentas transitorias.

## Requisitos

- Python 3.10+
- Instalar dependencias:

```bash
pip install -r requirements.txt
```

## Ejecutar

La app es de Streamlit; la forma correcta de arrancarla es:

```bash
streamlit run app.py
```

o

```bash
streamlit run app_conciliacion_transitorias.py
```

Si el comando `streamlit` no se reconoce, usa:

```bash
python -m streamlit run app.py
```

Ambos scripts también se relanzan solos si se ejecutan con `python app.py`
(o con doble clic), así que cualquiera de las formas abre la interfaz.

## Si la pantalla queda en blanco

1. Verifica en la terminal que aparezca `Local URL: http://localhost:8501` — si no aparece, el servidor no arrancó; revisa el error mostrado.
2. Abre manualmente `http://localhost:8501` en el navegador (Chrome o Edge) y refresca con `Ctrl+F5` para limpiar caché.
3. Asegúrate de haber instalado las dependencias con `pip install -r requirements.txt` en el mismo Python con el que ejecutas la app.
4. Si el puerto 8501 está ocupado por una sesión anterior, ciérrala o usa `streamlit run app.py --server.port 8502`.

## Notas

- Los archivos `.xlsx` están ignorados para no subir datos sensibles.
- Usa ramas para nuevas funciones: `git checkout -b feature/nombre`.

# app_conciliacion_transitorias.py
# -------------------------------------------------------------
# App Streamlit para conciliar movimientos de cuentas transitorias
# Autor: ChatGPT (@costos)
# Descripción:
#  - Carga CSV/Excel con movimientos contables.
#  - Permite mapear columnas a un esquema estándar.
#  - Aplica reglas de pareo (débitos vs créditos) con puntaje configurable.
#  - Marca PAREADO / NO_PAREADO / NO_PAREADO - OVERDUE.
#  - Agrupa pares (débito primero, crédito después) y exporta resultados.
# -------------------------------------------------------------

import io
import math
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

try:
    import streamlit as st
    from streamlit import runtime
except Exception:
    raise SystemExit("Esta app requiere Streamlit. Instala con: pip install streamlit pandas numpy")

# --------------------- Utilidades ---------------------
STD_FIELDS = [
    "FECHA", "PERIODO", "ASIENTO", "TIPO", "CUENTA_CO", "NOMBRE_CU",
    "DEBE", "HABER", "Referencia registro", "Numero_Doc", "Descripcion_",
    "Nota Asiento", "CHEQUE"
]

CANDIDATES = {
    "FECHA": ["fecha", "date", "fecha_asiento", "f_contable"],
    "PERIODO": ["periodo", "mes", "period", "periodo_contable"],
    "ASIENTO": ["asiento", "journal_entry", "je", "num_asiento"],
    "TIPO": ["tipo", "tipo_asiento", "origen"],
    "CUENTA_CO": ["cuenta_co", "cuenta", "cta", "cuenta_contable", "codigo_cuenta"],
    "NOMBRE_CU": ["nombre_cu", "nombre_cuenta", "desc_cuenta"],
    "DEBE": ["debe", "debit", "cargo"],
    "HABER": ["haber", "credit", "abono"],
    "Referencia registro": ["referencia", "ref", "ref_registro"],
    "Numero_Doc": ["numero_doc", "num_doc", "documento", "factura", "n_doc", "doc"],
    "Descripcion_": ["descripcion_", "descripcion", "detalle", "glosa"],
    "Nota Asiento": ["nota_asiento", "nota", "observacion", "comentario"],
    "CHEQUE": ["cheque", "num_cheque", "n_cheque", "cheq"]
}


def normalize_colnames(cols: List[str]) -> Dict[str, str]:
    mapping = {}
    lower = {c.lower().strip(): c for c in cols}
    for std, cands in CANDIDATES.items():
        # prefer exact std name if present
        if std in cols:
            mapping[std] = std
            continue
        # else find by candidates
        found = None
        for cand in [std] + cands:
            if cand.lower() in lower:
                found = lower[cand.lower()]
                break
        mapping[std] = found
    return mapping


def to_date(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce").dt.normalize()


def jaccard_sim(a: str, b: str) -> float:
    def tokens(s: str) -> set:
        return {t for t in ''.join(ch if ch.isalnum() else ' ' for ch in (s or '').lower()).split() if t}
    A, B = tokens(a), tokens(b)
    if not A and not B:
        return 1.0
    if not A or not B:
        return 0.0
    return len(A & B) / len(A | B)


def amount_close(a: float, b: float, abs_tol: float, rel_tol: float) -> bool:
    if pd.isna(a) or pd.isna(b):
        return False
    diff = abs(a - b)
    allowed = abs_tol + rel_tol * max(abs(a), abs(b))
    return diff <= allowed


def score_pair(row_d: pd.Series, row_c: pd.Series, cfg: Dict) -> Tuple[int, Dict[str, float]]:
    score = 0
    details = {}

    # Monto exacto / cercano
    diff = abs((row_d.get('DEBE') or 0) - (row_c.get('HABER') or 0))
    if diff <= 0.01:
        score += 4; details['monto_exact'] = 4
    elif amount_close(row_d.get('DEBE') or 0, row_c.get('HABER') or 0, cfg['abs_tol'], cfg['rel_tol']):
        score += 2; details['monto_cercano'] = 2

    # Fechas
    dias = abs((row_d.get('FECHA') - row_c.get('FECHA')).days)
    if dias == 0:
        score += 2; details['fecha_mismo_dia'] = 2
    elif dias <= min(cfg['date_window'], 7):
        score += 1; details['fecha_proxima'] = 1
    details['dias_diff'] = dias

    # Campos exactos
    for field, pts in [("Numero_Doc", 5), ("CHEQUE", 4), ("Referencia registro", 3)]:
        v1 = str(row_d.get(field) or '').strip()
        v2 = str(row_c.get(field) or '').strip()
        if v1 and v2 and v1 == v2:
            score += pts; details[f'{field}_match'] = pts

    # Cuenta igual
    if str(row_d.get('CUENTA_CO')) == str(row_c.get('CUENTA_CO')):
        score += 1; details['cuenta_igual'] = 1

    # Similitud de descripción
    sim = jaccard_sim(str(row_d.get('Descripcion_') or ''), str(row_c.get('Descripcion_') or ''))
    if sim >= 0.75:
        score += 2; details['desc_sim_alta'] = 2
    elif sim >= 0.5:
        score += 1; details['desc_sim_media'] = 1
    details['desc_sim'] = sim

    return score, details


# --------------------- Lógica de pareo ---------------------

def build_pairs(df: pd.DataFrame, cfg: Dict) -> pd.DataFrame:
    df = df.copy()

    # Asegurar columnas estándar (faltantes -> NaN)
    for col in STD_FIELDS:
        if col not in df.columns:
            df[col] = np.nan

    # Tipos correctos
    df['DEBE'] = pd.to_numeric(df['DEBE'], errors='coerce').fillna(0.0)
    df['HABER'] = pd.to_numeric(df['HABER'], errors='coerce').fillna(0.0)
    df['FECHA'] = to_date(df['FECHA'])

    # Filtro por cuenta (opcional)
    if cfg.get('cuenta_filtro'):
        mask = df['CUENTA_CO'].astype(str).str.contains(cfg['cuenta_filtro'], case=False, na=False)
        df = df[mask].copy()

    deb = df[df['DEBE'] > 0].reset_index(drop=True)
    cre = df[df['HABER'] > 0].reset_index(drop=True)

    # Índices para seguimiento
    deb['__idx_d'] = deb.index
    cre['__idx_c'] = cre.index

    # Candidatos por ventana de fechas y tolerancia de monto
    candidates: List[Tuple[int, int, int, Dict]] = []  # (score, idx_d, idx_c, details)

    # Pre-index por fecha para velocidad
    if not deb.empty and not cre.empty:
        min_date = deb['FECHA'].min() - timedelta(days=cfg['date_window'])
        max_date = deb['FECHA'].max() + timedelta(days=cfg['date_window'])
        cre_win = cre[(cre['FECHA'] >= min_date) & (cre['FECHA'] <= max_date)]
        for i, rd in deb.iterrows():
            dmin = rd['FECHA'] - timedelta(days=cfg['date_window'])
            dmax = rd['FECHA'] + timedelta(days=cfg['date_window'])
            slice_cre = cre_win[(cre_win['FECHA'] >= dmin) & (cre_win['FECHA'] <= dmax)]

            # Filtrar por monto cercano para reducir candidatos
            slice_cre = slice_cre[ slice_cre['HABER'].apply(lambda h: amount_close(rd['DEBE'], h, cfg['abs_tol'], cfg['rel_tol'])) ]

            for j, rc in slice_cre.iterrows():
                s, det = score_pair(rd, rc, cfg)
                if s >= cfg['min_score']:
                    candidates.append((int(s), int(rd['__idx_d']), int(rc['__idx_c']), det))

    # Resolver asignación 1 a 1 por greedy descendente (score alto, menor diff, menor dias)
    candidates.sort(key=lambda x: (-x[0], x[3].get('dias_diff', 9999), abs(deb.loc[x[1], 'DEBE'] - cre.loc[x[2], 'HABER'])))

    used_d, used_c = set(), set()
    matches: List[Tuple[int, int, int, Dict]] = []
    for s, idd, icc, det in candidates:
        if idd in used_d or icc in used_c:
            continue
        used_d.add(idd); used_c.add(icc)
        matches.append((s, idd, icc, det))

    # Construir resultado
    result_rows = []
    pair_counter = 1
    idx_to_pair = {}

    for s, idd, icc, det in matches:
        rd = deb.loc[idd].to_dict(); rc = cre.loc[icc].to_dict()
        pair_key = f"PAIR-{pair_counter:06d}"
        idx_to_pair[("D", idd)] = (pair_key, s, det)
        idx_to_pair[("C", icc)] = (pair_key, s, det)
        pair_counter += 1

    # Marcar cada fila
    for i, row in deb.iterrows():
        tag = "PAREADO" if ("D", i) in idx_to_pair else None
        pair_info = idx_to_pair.get(("D", i))
        result_rows.append({
            **{k: row.get(k) for k in STD_FIELDS},
            "PAREO": tag or ("NO_PAREADO - OVERDUE" if (pd.Timestamp.today().normalize() - row['FECHA']).days > cfg['overdue_days'] else "NO_PAREADO"),
            "pair_key": pair_info[0] if pair_info else None,
            "pair_score": pair_info[1] if pair_info else None,
            "_tipo_mvto": "D",  # para ordenar
        })

    for i, row in cre.iterrows():
        tag = "PAREADO" if ("C", i) in idx_to_pair else None
        pair_info = idx_to_pair.get(("C", i))
        result_rows.append({
            **{k: row.get(k) for k in STD_FIELDS},
            "PAREO": tag or ("NO_PAREADO - OVERDUE" if (pd.Timestamp.today().normalize() - row['FECHA']).days > cfg['overdue_days'] else "NO_PAREADO"),
            "pair_key": pair_info[0] if pair_info else None,
            "pair_score": pair_info[1] if pair_info else None,
            "_tipo_mvto": "C",
        })

    out = pd.DataFrame(result_rows)

    # Orden: pares juntos (por pair_key), débito primero, luego no pareados por fecha
    out['__order_pair'] = out['pair_key'].notna().astype(int) * 1
    out['__order_tipo'] = out['_tipo_mvto'].map({'D': 0, 'C': 1}).fillna(2)

    # Para no pareados: ordenar por FECHA asc
    out['__fecha_ord'] = out['FECHA'].fillna(pd.Timestamp('1970-01-01'))

    out = out.sort_values(by=['__order_pair', 'pair_key', '__order_tipo', '__fecha_ord'], ascending=[False, True, True, True]).reset_index(drop=True)

    # Totales
    out['DEBE'] = pd.to_numeric(out['DEBE'], errors='coerce').fillna(0.0)
    out['HABER'] = pd.to_numeric(out['HABER'], errors='coerce').fillna(0.0)

    return out


# --------------------- Interfaz Streamlit ---------------------

def main():
    st.set_page_config(page_title="Conciliación Transitorias", layout="wide")
    st.title("Conciliación de Cuentas Transitorias")
    st.caption("Sube un CSV/Excel con movimientos y genera un pareo automático de débitos vs créditos.")

    with st.sidebar:
        st.header("Parámetros")
        abs_tol = st.number_input("Tolerancia absoluta de monto", min_value=0.0, value=0.0, step=0.01, help="Ej.: 0 si requiere exacto; 500 para permitir diferencias menores.")
        rel_tol_pct = st.number_input("Tolerancia relativa (%)", min_value=0.0, value=0.0, step=0.1, help="Ej.: 0.5 permite diferencia de 0.5%.")
        date_window = st.number_input("Ventana de fechas (días)", min_value=0, value=30, step=1)
        overdue_days = st.number_input("Días para marcar OVERDUE", min_value=1, value=60, step=1)
        min_score = st.number_input("Puntaje mínimo para pareo", min_value=0, value=3, step=1, help="Ajusta la exigencia del algoritmo (0-15 aprox.)")
        cuenta_filtro = st.text_input("Filtrar por CUENTA_CO (opcional)")

    file = st.file_uploader("Archivo de movimientos (CSV o Excel)", type=["csv", "xlsx", "xls"]) 

    if file is None:
        st.info("Carga un archivo para continuar.")
        st.stop()

    # Leer archivo
    if file.name.lower().endswith('.csv'):
        df_raw = pd.read_csv(file)
    else:
        # Intenta la primera hoja por defecto
        try:
            df_raw = pd.read_excel(file)
        except Exception:
            xls = pd.ExcelFile(file)
            hoja = st.selectbox("Hoja a usar", xls.sheet_names)
            df_raw = pd.read_excel(xls, sheet_name=hoja)

    st.subheader("1) Mapeo de columnas")
    st.write("Selecciona en qué columna de tu archivo está cada campo estándar. Si falta alguno, déjalo en blanco.")

    # Propuesta automática
    auto_map = normalize_colnames(list(df_raw.columns))

    col_map = {}
    cols1, cols2, cols3 = st.columns(3)
    for i, field in enumerate(STD_FIELDS):
        with [cols1, cols2, cols3][i % 3]:
            options = [None] + list(df_raw.columns)
            default = auto_map.get(field)
            idx_default = options.index(default) if default in options else 0
            sel = st.selectbox(field, options=options, index=idx_default)
            col_map[field] = sel

    # Construir DF normalizado
    df = pd.DataFrame()
    for field, src in col_map.items():
        if src is not None:
            df[field] = df_raw[src]
        else:
            df[field] = np.nan

    # Ejecutar pareo
    cfg = {
        'abs_tol': float(abs_tol),
        'rel_tol': float(rel_tol_pct) / 100.0,
        'date_window': int(date_window),
        'overdue_days': int(overdue_days),
        'min_score': int(min_score),
        'cuenta_filtro': cuenta_filtro.strip() or None,
    }

    with st.spinner("Calculando pareos..."):
        out = build_pairs(df, cfg)

    st.subheader("2) Resumen")
    total_d = out[out['_tipo_mvto'] == 'D']['DEBE'].sum()
    total_c = out[out['_tipo_mvto'] == 'C']['HABER'].sum()
    matched = out[out['PAREO'] == 'PAREADO']
    no_match = out[out['PAREO'] != 'PAREADO']

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Débitos", f"{total_d:,.2f}")
    m2.metric("Créditos", f"{total_c:,.2f}")
    m3.metric("Pares formados", f"{matched['pair_key'].nunique():,}")
    saldo = total_d - total_c
    m4.metric("Saldo neto", f"{saldo:,.2f}", delta=None)

    st.subheader("3) Detalle")
    # Orden de salida y columnas
    show_cols = ["PAREO", "pair_key", "pair_score", "FECHA", "PERIODO", "ASIENTO", "TIPO", "CUENTA_CO", "NOMBRE_CU", "DEBE", "HABER", "Referencia registro", "Numero_Doc", "Descripcion_", "Nota Asiento", "CHEQUE"]
    st.dataframe(out[show_cols], use_container_width=True)

    # Descarga
    buff = io.StringIO()
    out_to_export = out[show_cols].copy()
    out_to_export.sort_values(by=['pair_key', 'FECHA', 'PAREO'], inplace=True, na_position='last')
    out_to_export.to_csv(buff, index=False)
    st.download_button("Descargar CSV conciliado", data=buff.getvalue(), file_name="conciliacion_transitorias.csv", mime="text/csv")

    st.caption("Tip: Ajusta el puntaje mínimo, la tolerancia y la ventana de fechas si observas falsos positivos o faltantes.")


if __name__ == "__main__":
    if runtime.exists():
        main()
    else:
        # Ejecutado con "python app_conciliacion_transitorias.py": sin el
        # servidor de Streamlit la pantalla queda en blanco. Relanzamos.
        from streamlit.web import cli as stcli

        sys.argv = ["streamlit", "run", sys.argv[0]]
        sys.exit(stcli.main())

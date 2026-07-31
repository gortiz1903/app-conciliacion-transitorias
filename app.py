# -*- coding: utf-8 -*-
# Streamlit app: Conciliación Transitorias
# Ejecutar:
#   streamlit run app.py

import re
import sys
from io import BytesIO
from typing import List, Dict, Any

import numpy as np
import pandas as pd
import streamlit as st
from streamlit import runtime

# Si se ejecuta con "python app.py" (o doble clic), Streamlit no levanta su
# servidor y el navegador queda en blanco. Relanzamos con "streamlit run".
if not runtime.exists():
    from streamlit.web import cli as stcli

    sys.argv = ["streamlit", "run", sys.argv[0]]
    sys.exit(stcli.main())

st.set_page_config(page_title="Conciliación Transitorias", layout="wide")

# --------- Normalización columnas ----------
ALIASES = {
    "DEBE": ["DEBE", "CARGOS", "DEBITO", "DÉBITO", "DEBITOS", "DÉBITOS"],
    "HABER": ["HABER", "ABONOS", "CREDITO", "CRÉDITO", "CREDITOS", "CRÉDITOS"],
    "ASIENTO": ["ASIENTO", "AD", "JENUM"],
    "Numero_Doc": ["Numero_Doc", "Numero_Documento", "NUMERO_DOC", "NUMDOC", "Numero", "Documento"],
    "Referencia registro": ["Referencia registro", "REFERENCIA", "Referencia", "Referencia_registro"],
}
REQUIRED = ["DEBE", "HABER", "ASIENTO", "Referencia registro", "Numero_Doc"]

def _num(x):
    if pd.isna(x):
        return 0.0
    if isinstance(x, (int, float, np.number)):
        return float(x)
    s = str(x).replace("\xa0", "").replace(" ", "").replace(",", "").strip()
    try:
        return float(s) if s else 0.0
    except Exception:
        return 0.0

def _norm_doc(s):
    if pd.isna(s):
        return ""
    return re.sub(r"[^A-Za-z0-9]", "", str(s).upper())

def apply_aliases(df: pd.DataFrame) -> pd.DataFrame:
    mapping = {}
    cols = set(df.columns)
    for target, cands in ALIASES.items():
        if target in cols:
            continue
        for c in cands:
            if c in cols:
                mapping[c] = target
                break
    if mapping:
        df = df.rename(columns=mapping)
    return df

def load_file(file) -> pd.DataFrame:
    try:
        if file.name.lower().endswith(".csv"):
            df = pd.read_csv(file, dtype=str)
        else:
            df = pd.read_excel(file, dtype=str)
    except Exception as e:
        st.error(f"No se pudo leer el archivo: {e}")
        return pd.DataFrame()

    df = apply_aliases(df)
    faltan = [c for c in REQUIRED if c not in df.columns]
    if faltan:
        st.error(f"Faltan columnas requeridas: {faltan}. Presentes: {list(df.columns)}")
        return pd.DataFrame()

    df["DEBE"] = df["DEBE"].apply(_num)
    df["HABER"] = df["HABER"].apply(_num)
    df["_DOC_NORM"] = df["Numero_Doc"].apply(_norm_doc)

    df = df.reset_index(drop=True)
    df["RID"] = df.index
    return df

# --------- Modelo de pareos ----------
class Pair:
    def __init__(self, rid_deb: List[int], rid_hab: List[int], fuente: str):
        self.rid_deb = rid_deb
        self.rid_hab = rid_hab
        self.fuente = fuente  # AUTO_1a1 / AUTO_1a2 / AUTO_2a1 / MANUAL

    def resumen(self, df: pd.DataFrame) -> Dict[str, Any]:
        s_deb = float(df.loc[df.RID.isin(self.rid_deb), "DEBE"].sum())
        s_hab = float(df.loc[df.RID.isin(self.rid_hab), "HABER"].sum())
        return {
            "sum_debe": round(s_deb, 2),
            "sum_haber": round(s_hab, 2),
            "diferencia": round(s_deb - s_hab, 2),
            "n_deb": len(self.rid_deb),
            "n_hab": len(self.rid_hab),
            "fuente": self.fuente,
        }

def auto_match_1a1(df: pd.DataFrame, tol: float) -> List[Pair]:
    usados_hab = set()
    pairs: List[Pair] = []

    deb = df[df["DEBE"] > 0].copy()
    hab = df[df["HABER"] > 0].copy()
    deb = deb.assign(_has_doc=(deb["_DOC_NORM"] != "")).sort_values(["_has_doc", "DEBE"], ascending=[False, False])

    for _, d in deb.iterrows():
        cand = hab[~hab["RID"].isin(usados_hab)].copy()
        cand["_doc_hit"] = (cand["_DOC_NORM"] == d["_DOC_NORM"]).astype(int)
        cand["_diff"] = (cand["HABER"] - d["DEBE"]).abs()
        cand = cand.sort_values(["_doc_hit", "_diff"], ascending=[False, True]).head(50)
        for _, c in cand.iterrows():
            if abs(d["DEBE"] - c["HABER"]) <= tol:
                pairs.append(Pair([int(d["RID"])], [int(c["RID"])], "AUTO_1a1"))
                usados_hab.add(int(c["RID"]))
                break
    return pairs

# --------- Estado de sesión ----------
if "pairs" not in st.session_state:
    st.session_state.pairs: List[Pair] = []
if "manual_pairs" not in st.session_state:
    st.session_state.manual_pairs: List[Pair] = []
if "df_base" not in st.session_state:
    st.session_state.df_base = pd.DataFrame()

# --------- UI ---------
st.sidebar.header("Parámetros")
with st.sidebar:
    tol = st.number_input("Tolerancia de monto (±)", min_value=0.0, value=1.0, step=0.5, format="%.2f")
    run_1a1 = st.checkbox("Auto 1↔1", value=True)
    st.caption("Puede empezar con 1↔1 y luego conciliar manual.")

st.title("Conciliación Transitorias")
file = st.file_uploader("Sube tu archivo (Excel o CSV)", type=["xlsx", "xls", "csv"])

if file is None:
    st.info("Sube un archivo para comenzar. Columnas requeridas: DEBE, HABER, ASIENTO, Referencia registro, Numero_Doc.")
    st.stop()

df = load_file(file)
st.session_state.df_base = df.copy()
if df.empty:
    st.stop()

st.success(f"Archivo: {file.name} | Filas: {len(df)}")
with st.expander("Vista previa (50 filas)"):
    st.dataframe(df.head(50), use_container_width=True)

if st.button("Ejecutar conciliación automática", type="primary"):
    pairs_all: List[Pair] = []
    if run_1a1:
        pairs_all.extend(auto_match_1a1(df, tol))
    st.session_state.pairs = pairs_all
    st.success(f"Auto-pareos: {len(pairs_all)}")

def used_ids(pairs: List[Pair]):
    u_d = set()
    u_h = set()
    for p in pairs:
        u_d.update(p.rid_deb)
        u_h.update(p.rid_hab)
    return u_d, u_h

auto_pairs = st.session_state.pairs
all_pairs: List[Pair] = auto_pairs + st.session_state.manual_pairs
used_d_all, used_h_all = used_ids(all_pairs)

pend_deb_all = df[(df["DEBE"] > 0) & (~df.RID.isin(used_d_all))].copy()
pend_hab_all = df[(df["HABER"] > 0) & (~df.RID.isin(used_h_all))].copy()

st.markdown("---")
st.subheader("Conciliación manual: selecciona y pulsa **Conciliar**")

tab_pend, tab_conc, tab_exp = st.tabs(["Pendientes", "Conciliados", "Exportar"])

# ---- Tab Pendientes (selección con checkbox) ----
with tab_pend:
    deb_view = pend_deb_all[["RID", "ASIENTO", "Numero_Doc", "DEBE", "Referencia registro"]].copy()
    hab_view = pend_hab_all[["RID", "ASIENTO", "Numero_Doc", "HABER", "Referencia registro"]].copy()
    deb_view["SEL"] = False
    hab_view["SEL"] = False

    csel1, csel2 = st.columns(2)
    with csel1:
        st.caption("Débitos pendientes")
        deb_edit = st.data_editor(
            deb_view,
            key="debs_editor",
            use_container_width=True,
            hide_index=True,
            column_config={
                "SEL": st.column_config.CheckboxColumn("✔", help="Seleccionar"),
                "DEBE": st.column_config.NumberColumn(format="%,.2f"),
            },
            height=320,
        )
    with csel2:
        st.caption("Créditos pendientes")
        hab_edit = st.data_editor(
            hab_view,
            key="habs_editor",
            use_container_width=True,
            hide_index=True,
            column_config={
                "SEL": st.column_config.CheckboxColumn("✔", help="Seleccionar"),
                "HABER": st.column_config.NumberColumn(format="%,.2f"),
            },
            height=320,
        )

    if st.button("Conciliar", type="primary"):
        sel_rid_deb = deb_edit.loc[deb_edit["SEL"] == True, "RID"].astype(int).tolist()
        sel_rid_hab = hab_edit.loc[hab_edit["SEL"] == True, "RID"].astype(int).tolist()
        if not sel_rid_deb or not sel_rid_hab:
            st.warning("Selecciona al menos un débito y un crédito.")
        else:
            sum_deb = float(df.loc[df.RID.isin(sel_rid_deb), "DEBE"].sum())
            sum_hab = float(df.loc[df.RID.isin(sel_rid_hab), "HABER"].sum())
            dif = round(sum_deb - sum_hab, 2)
            if abs(dif) > tol:
                st.error(f"La diferencia ({dif:,.2f}) excede la tolerancia (±{tol}).")
            else:
                st.session_state.manual_pairs.append(Pair(sel_rid_deb, sel_rid_hab, "MANUAL"))
                st.success("Pareados y movidos a 'Conciliados'.")
                st.rerun()

    colA, colB = st.columns(2)
    with colA:
        if st.button("Deshacer último pareo manual"):
            if st.session_state.manual_pairs:
                st.session_state.manual_pairs.pop()
                st.info("Se deshizo el último pareo manual.")
                st.rerun()
    with colB:
        if st.button("Reiniciar pareos manuales"):
            st.session_state.manual_pairs = []
            st.info("Pareos manuales reiniciados.")
            st.rerun()

# ---- Tab Conciliados ----
with tab_conc:
    rows_pairs = []
    for idx, p in enumerate(all_pairs, start=1):
        for rid in p.rid_deb:
            base = df.loc[df.RID == rid].iloc[0].to_dict()
            base.update({"PAIR_ID": idx, "LADO": "DEBE", "FUENTE": p.fuente})
            rows_pairs.append(base)
        for rid in p.rid_hab:
            base = df.loc[df.RID == rid].iloc[0].to_dict()
            base.update({"PAIR_ID": idx, "LADO": "HABER", "FUENTE": p.fuente})
            rows_pairs.append(base)
    df_pairs = pd.DataFrame(rows_pairs)
    if df_pairs.empty:
        st.info("Aún no hay movimientos conciliados.")
    else:
        show_cols = [c for c in ["PAIR_ID", "FUENTE", "LADO", "ASIENTO", "Numero_Doc", "DEBE", "HABER", "Referencia registro"] if c in df_pairs.columns]
        st.dataframe(df_pairs[show_cols].sort_values(["PAIR_ID", "LADO"]).reset_index(drop=True), use_container_width=True, height=360)

# ---- Tab Exportar ----
with tab_exp:
    st.subheader("Pendientes finales")
    c3, c4 = st.columns(2)
    with c3:
        st.dataframe(pend_deb_all[["RID", "ASIENTO", "Numero_Doc", "DEBE", "Referencia registro"]],
                     use_container_width=True, height=260)
    with c4:
        st.dataframe(pend_hab_all[["RID", "ASIENTO", "Numero_Doc", "HABER", "Referencia registro"]],
                     use_container_width=True, height=260)

    total_deb_pend = float(pend_deb_all["DEBE"].sum())
    total_hab_pend = float(pend_hab_all["HABER"].sum())
    dif_pend = round(total_deb_pend - total_hab_pend, 2)
    st.info(f"Totales pendientes → DEBE: {total_deb_pend:,.2f} | HABER: {total_hab_pend:,.2f} | DIF: {dif_pend:,.2f}")

    def build_excel() -> bytes:
        out = BytesIO()
        with pd.ExcelWriter(out, engine="openpyxl") as wb:
            # Hoja CONCILIADOS
            if not df_pairs.empty:
                df_pairs.to_excel(wb, index=False, sheet_name="CONCILIADOS")
            # Pendientes
            (pend_deb_all if not pend_deb_all.empty else pd.DataFrame()).to_excel(wb, index=False, sheet_name="PEND_DEBE")
            (pend_hab_all if not pend_hab_all.empty else pd.DataFrame()).to_excel(wb, index=False, sheet_name="PEND_HABER")
            # Resumen
            resumen = pd.DataFrame([
                {"Metrica": "Pareos automáticos", "Valor": len(auto_pairs)},
                {"Metrica": "Pareos manuales", "Valor": len(st.session_state.manual_pairs)},
                {"Metrica": "Pendiente DEBE", "Valor": total_deb_pend},
                {"Metrica": "Pendiente HABER", "Valor": total_hab_pend},
                {"Metrica": "Diferencia", "Valor": dif_pend},
            ])
            resumen.to_excel(wb, index=False, sheet_name="RESUMEN")
        return out.getvalue()

    def build_asiento_txt() -> bytes:
        lineas = []
        lineas.append("ASIENTO PROPUESTO POR CONCILIACION")
        lineas.append(f"TOTAL PENDIENTE DEBE: {total_deb_pend:,.2f}")
        lineas.append(f"TOTAL PENDIENTE HABER: {total_hab_pend:,.2f}")
        lineas.append(f"DIFERENCIA: {dif_pend:,.2f}")
        lineas.append("")
        if abs(dif_pend) <= tol:
            lineas.append("No se requiere ajuste: diferencia dentro de tolerancia.")
        else:
            lineas.append("Propuesta de ajuste (revisar cuentas antes de contabilizar):")
            if dif_pend > 0:
                lineas.append("  DEBE  AJUSTE_CONCILIACION  " + f"{dif_pend:,.2f}")
                lineas.append("  HABER  1200103.9           " + f"{dif_pend:,.2f}")
            else:
                amt = abs(dif_pend)
                lineas.append("  DEBE  1200103.9            " + f"{amt:,.2f}")
                lineas.append("  HABER  AJUSTE_CONCILIACION " + f"{amt:,.2f}")
            lineas.append("(Reemplace AJUSTE_CONCILIACION por la cuenta correcta)")
        return ("\n".join(lineas)).encode("utf-8")

    colx, coly = st.columns(2)
    with colx:
        st.download_button(
            "Descargar conciliacion.xlsx",
            data=build_excel(),
            file_name="conciliacion.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True,
        )
    with coly:
        st.download_button(
            "Descargar asiento.txt",
            data=build_asiento_txt(),
            file_name="asiento.txt",
            mime="text/plain",
            use_container_width=True,
        )

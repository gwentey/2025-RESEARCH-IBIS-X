#!/usr/bin/env python3
"""
Test du lazy loading pour vérifier la consommation mémoire.
"""
import psutil
import os
import time

def get_memory_usage():
    """Obtenir l'utilisation mémoire du processus en MB."""
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024

print("Test du lazy loading XAI Engine")
print("="*50)

# Mémoire avant import
mem_start = get_memory_usage()
print(f"Mémoire au démarrage: {mem_start:.1f} MB")

# Import du module avec lazy loading
print("\nImport du module explainers_lazy...")
from app.xai.explainers_lazy import choose_best_explainer, load_model_and_data
mem_after_import = get_memory_usage()
print(f"Mémoire après import: {mem_after_import:.1f} MB")
print(f"Différence: +{mem_after_import - mem_start:.1f} MB")

# Simuler l'import des librairies lourdes
print("\n" + "="*50)
print("Simulation d'une utilisation réelle...")

# Import numpy (devrait déclencher le lazy loading)
from app.xai.explainers_lazy import _lazy_import_numpy
numpy = _lazy_import_numpy()
mem_after_numpy = get_memory_usage()
print(f"Mémoire après chargement NumPy: {mem_after_numpy:.1f} MB")
print(f"Différence: +{mem_after_numpy - mem_after_import:.1f} MB")

# Import pandas
from app.xai.explainers_lazy import _lazy_import_pandas
pandas = _lazy_import_pandas()
mem_after_pandas = get_memory_usage()
print(f"Mémoire après chargement Pandas: {mem_after_pandas:.1f} MB")
print(f"Différence: +{mem_after_pandas - mem_after_numpy:.1f} MB")

# Import matplotlib
from app.xai.explainers_lazy import _lazy_import_matplotlib
plt = _lazy_import_matplotlib()
mem_after_plt = get_memory_usage()
print(f"Mémoire après chargement Matplotlib: {mem_after_plt:.1f} MB")
print(f"Différence: +{mem_after_plt - mem_after_pandas:.1f} MB")

# Import SHAP
from app.xai.explainers_lazy import _lazy_import_shap
shap = _lazy_import_shap()
mem_after_shap = get_memory_usage()
print(f"Mémoire après chargement SHAP: {mem_after_shap:.1f} MB")
print(f"Différence: +{mem_after_shap - mem_after_plt:.1f} MB")

print("\n" + "="*50)
print("RÉSUMÉ:")
print(f"Mémoire initiale: {mem_start:.1f} MB")
print(f"Mémoire après import module (sans librairies): {mem_after_import:.1f} MB")
print(f"Mémoire après chargement complet: {mem_after_shap:.1f} MB")
print(f"Économie grâce au lazy loading: {mem_after_shap - mem_after_import:.1f} MB")
print("="*50)

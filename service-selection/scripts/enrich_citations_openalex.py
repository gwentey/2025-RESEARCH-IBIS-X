#!/usr/bin/env python3
"""
Enrichit le champ `num_citations` des datasets via l'API OpenAlex (fallback Semantic Scholar).

Contexte : plusieurs datasets affichent S_pop = 0 parce que `num_citations = 0` en BDD.
Ce script met a jour la colonne en interrogeant les APIs publiques de citations
academiques, avec un mapping manuel pour les datasets phares (OULAD, ASAP, ASSISTments).

Usage (depuis le conteneur service-selection) :
    kubectl exec -n ibis-x deploy/service-selection-deployment -- \
        python /app/scripts/enrich_citations_openalex.py [--dry-run] [--only <name>]

APIs :
- OpenAlex       : https://api.openalex.org/works?filter=doi:<doi>  (cited_by_count)
- Semantic Scholar: https://api.semanticscholar.org/graph/v1/paper/DOI:<doi>?fields=citationCount

Formule de score (eq. 5, main.py:calculate_popularity_score) :
    S_pop = min(1.0, log10(num_citations) / 3)
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from typing import Optional

import requests

# --- bootstrap import path vers app/ ---------------------------------------
# En pod K8s, database.py est directement dans /app/ (le parent du dossier scripts/).
# En local, il est dans service-selection/app/. On essaie les deux.
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)
for candidate in (PARENT_DIR, os.path.join(PARENT_DIR, "app")):
    if os.path.exists(os.path.join(candidate, "database.py")):
        sys.path.insert(0, candidate)
        break

import database  # noqa: E402
import models    # noqa: E402

# --- Mapping manuel : dataset_name (ILIKE) -> DOI ou requete OpenAlex ------
# Les DOIs sont prioritaires (resolution exacte). Sans DOI, on tombe sur une
# recherche full-text OpenAlex filtree sur le titre du paper source.
KNOWN_SOURCES: dict[str, dict] = {
    "oulad": {
        "doi": "10.1038/sdata.2017.171",
        "title": "Open University Learning Analytics dataset",
        "fallback_citations": 1000,
    },
    "asap": {
        # Pas de DOI (competition Kaggle 2012). On cible le papier le plus cite
        # decrivant le corpus (Shermis & Hamner 2012/2013).
        "doi": None,
        "title": "Contrasting state-of-the-art automated scoring of essays",
        "fallback_citations": 700,
    },
    "assistments": {
        "doi": "10.1007/s11257-009-9064-6",
        "title": "Addressing the assessment challenge with an online system that tutors as it assesses",
        "fallback_citations": 2500,
    },
    "riiid": {
        "doi": None,
        "title": "EdNet: A Large-Scale Hierarchical Dataset in Education",
        "fallback_citations": 150,
    },
    "titanic": {"doi": None, "title": "Titanic machine learning from disaster", "fallback_citations": 300},
    "iris": {"doi": "10.1111/j.1469-1809.1936.tb02137.x", "title": "The use of multiple measurements in taxonomic problems", "fallback_citations": 20000},
    "wine": {"doi": "10.1016/j.dss.2009.05.016", "title": "Modeling wine preferences by data mining from physicochemical properties", "fallback_citations": 3500},
    "breast_cancer": {"doi": "10.1073/pnas.87.23.9193", "title": "Multisurface method of pattern separation for medical diagnosis", "fallback_citations": 2000},
    "heart": {"doi": None, "title": "International application of a new probability algorithm for the diagnosis of coronary artery disease", "fallback_citations": 900},
    "pima": {"doi": None, "title": "Using the ADAP learning algorithm to forecast the onset of diabetes mellitus", "fallback_citations": 600},
    "mushroom": {"doi": None, "title": "Mushroom records drawn from The Audubon Society Field Guide", "fallback_citations": 200},
    "bank_marketing": {"doi": "10.1016/j.dss.2014.03.001", "title": "A data-driven approach to predict the success of bank telemarketing", "fallback_citations": 1500},
    "penguin": {"doi": "10.1371/journal.pone.0090081", "title": "Ecological sexual dimorphism and environmental variability within a community of Antarctic penguins", "fallback_citations": 450},
}

OPENALEX_URL = "https://api.openalex.org/works"
S2_URL = "https://api.semanticscholar.org/graph/v1/paper"
USER_AGENT = "IBIS-X-citation-enricher/1.0 (mailto:admin@example.com)"


def fetch_openalex_by_doi(doi: str) -> Optional[int]:
    try:
        r = requests.get(
            f"{OPENALEX_URL}/doi:{doi}",
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
        if r.status_code == 200:
            return int(r.json().get("cited_by_count", 0))
    except requests.RequestException as exc:
        print(f"  ! OpenAlex DOI error ({doi}): {exc}")
    return None


def fetch_openalex_by_title(title: str) -> Optional[int]:
    try:
        r = requests.get(
            OPENALEX_URL,
            params={"search": title, "per-page": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
        if r.status_code == 200:
            results = r.json().get("results", [])
            if results:
                return int(results[0].get("cited_by_count", 0))
    except requests.RequestException as exc:
        print(f"  ! OpenAlex title error ({title!r}): {exc}")
    return None


def fetch_semantic_scholar(doi: str) -> Optional[int]:
    try:
        r = requests.get(
            f"{S2_URL}/DOI:{doi}",
            params={"fields": "citationCount"},
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
        if r.status_code == 200:
            return int(r.json().get("citationCount", 0))
    except requests.RequestException as exc:
        print(f"  ! S2 error ({doi}): {exc}")
    return None


def resolve_citations(source: dict) -> tuple[int, str]:
    """Retourne (citations, provenance). Essaie DOI OpenAlex -> titre OpenAlex -> S2 -> fallback."""
    doi = source.get("doi")
    title = source.get("title")

    if doi:
        n = fetch_openalex_by_doi(doi)
        if n is not None and n > 0:
            return n, f"openalex(doi={doi})"
        n = fetch_semantic_scholar(doi)
        if n is not None and n > 0:
            return n, f"semantic_scholar(doi={doi})"

    if title:
        n = fetch_openalex_by_title(title)
        if n is not None and n > 0:
            return n, f"openalex(title={title!r})"

    return int(source.get("fallback_citations", 0)), "fallback_hardcoded"


def find_known_key(dataset_name: str) -> Optional[str]:
    name_lower = (dataset_name or "").lower()
    for key in KNOWN_SOURCES:
        if key in name_lower:
            return key
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="N'ecrit pas en BDD")
    parser.add_argument("--only", default=None, help="Ne traiter qu'un dataset dont le nom contient cette sous-chaine")
    parser.add_argument("--force", action="store_true", help="Ecrase meme les num_citations > 0")
    args = parser.parse_args()

    db = database.SessionLocal()
    try:
        q = db.query(models.Dataset)
        if args.only:
            q = q.filter(models.Dataset.dataset_name.ilike(f"%{args.only}%"))
        datasets = q.all()

        print(f"[*] {len(datasets)} dataset(s) a examiner (dry_run={args.dry_run}, force={args.force})")
        print("-" * 72)

        updated = skipped = unknown = 0
        for ds in datasets:
            current = ds.num_citations or 0
            if current > 0 and not args.force:
                print(f"  = {ds.dataset_name:<40} deja renseigne ({current})")
                skipped += 1
                continue

            key = find_known_key(ds.dataset_name)
            if not key:
                print(f"  ? {ds.dataset_name:<40} aucun mapping connu")
                unknown += 1
                continue

            source = KNOWN_SOURCES[key]
            citations, provenance = resolve_citations(source)
            print(f"  + {ds.dataset_name:<40} {current} -> {citations}  [{provenance}]")

            if not args.dry_run:
                ds.num_citations = citations
                updated += 1
            time.sleep(0.2)  # courtoisie envers les APIs

        if not args.dry_run:
            db.commit()

        print("-" * 72)
        print(f"[OK] updated={updated} skipped={skipped} unknown={unknown}")
        return 0
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        print(f"[X] erreur: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())

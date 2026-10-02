#!/usr/bin/env python3
"""Bake-off for the Chinese NER model that ships in Lethe's suggestion lane.

Measures **recall** — the metric that matters for a reviewer-facing suggestion
lane: a miss is a silent leak, a false positive is one click — on two sets:

  1. `samples/nlp-sample-zh.txt`, a Chinese due-diligence memo, scored per
     business entity kind (people / organisations / school names). This is the
     only place school names are covered; it is small and synthetic.
  2. The public CLUENER2020 dev split (1343 human-annotated news sentences,
     via `xusenlin/clue-ner`, Apache-2.0), scored on people and organisations.
     Large n, real text, but news domain rather than contracts, and it is the
     dev split of the corpus `uer/...-cluener2020` was fine-tuned on.

Two kinds of row in both tables:
  * the spaCy models in Lethe's catalogue, run through the app's real code path
    (`nlp_suggester._analyze`, i.e. Presidio + the Chinese-name rules);
  * external candidates (HuggingFace token-classification models and the
    ModelScope RaNER checkpoint), run through the runners below.

Run:  pixi run python tools/zh_ner_eval.py
`tools/compare_nlp_models.py` imports this and appends the section to
`docs/nlp-model-comparison.md`, so there is only one doc generator.
Needs the [nlp] extras; a catalogue model that isn't installed is fetched the
same way Settings would, and a candidate that can't be fetched is reported as
"not installed" rather than skipped.
"""
from __future__ import annotations

import argparse
import ast
import os
import sys
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

SAMPLE = os.path.join(ROOT, "samples", "nlp-sample-zh.txt")

# Gold entities, typed the way the business talks about them. SCHOOL is a
# subset of ORGANIZATION — school names are ORG entities the reviewer needs
# surfaced, so they get their own recall column. Only full, unambiguous names
# are listed: defined short forms ("华信资本") are deliberately left out so a
# model isn't punished for a judgement call an annotator would also make.
GOLD = {
    "PERSON": [
        "张宏伟", "李明远", "赵敏", "王建军", "周文杰",
        "陈晓丽", "徐立群", "林静怡", "吴嘉禾", "高远航",
    ],
    "ORG": [
        "上海华信资本管理有限公司", "深圳市卓越科技有限公司",
        "华信国际控股集团有限公司", "苏州卓越智能装备有限公司",
        "北京中鼎创业投资中心", "金杜律师事务所", "中天会计师事务所",
        "中国证券监督管理委员会", "上海证券交易所",
        "深圳市市场监督管理局", "上海仲裁委员会",
    ],
    "SCHOOL": [
        "清华大学", "北京大学", "复旦大学", "上海交通大学",
        "华中科技大学", "中欧国际工商学院",
    ],
}

# Internal span types: "PERSON" and "COUNTERPARTY" (the suggestion lane's name
# for anything organisation-shaped, place names included).
_FAMILY = {"PERSON": "PERSON", "COUNTERPARTY": "ORG", "ORGANIZATION": "ORG"}

# ---- external candidates ---------------------------------------------------
# kind "raner": ModelScope AdaSeq transformer-CRF checkpoint, re-exported to
# safetensors; needs the explicit linear+CRF decode below (Presidio/spaCy
# cannot host it). The one Lethe ships is in the catalogue, so it is scored
# through the app path like every other catalogue model — these are the
# candidates that were *not* picked, kept for the record.
# kind "tc": a plain HuggingFace token-classification model.
CANDIDATES = [
    {
        "label": "`shibing624/bert4ner-base-chinese`",
        "kind": "tc",
        "hf_id": "shibing624/bert4ner-base-chinese",
        "licence": "Apache-2.0",
        "size": "~389 MB",
        "labels": {"PER": "PERSON", "ORG": "ORG", "LOC": "ORG"},
    },
    {
        "label": "`uer/roberta-base-finetuned-cluener2020-chinese`",
        "kind": "tc",
        "hf_id": "uer/roberta-base-finetuned-cluener2020-chinese",
        "licence": "not declared — cannot ship",
        "size": "~391 MB",
        "labels": {"name": "PERSON", "company": "ORG", "organization": "ORG",
                   "government": "ORG", "address": "ORG", "scene": "ORG"},
    },
]


def _catalogue() -> list[str]:
    """Every Chinese model the app offers, in catalogue order — so the report
    always covers exactly what a user can switch to."""
    from lethe import nlp_suggester
    return [m["name"] for L in nlp_suggester.LANGUAGES if L["code"] == "zh"
            for m in L["models"]]

# ---- runners ---------------------------------------------------------------
# Each factory returns fn(text) -> [(start, end, "PERSON"|"ORG")], loading the
# model once so a 400-sentence corpus isn't 400 model loads.


def _app_fn(model: str):
    """The app's real path: Presidio + Chinese-name rules for spaCy models, the
    RaNER CRF decode for the HuggingFace one."""
    from lethe import nlp_suggester

    def fn(text: str):
        return [(s, e, _FAMILY[t])
                for s, e, t in nlp_suggester._analyze("zh", model, text, 0.40)
                if t in _FAMILY]

    return fn


@lru_cache(maxsize=8)
def _hf_dir(hf_id: str) -> "str | None":
    from huggingface_hub import snapshot_download
    try:
        return snapshot_download(hf_id,
                                 allow_patterns=["*.json", "*.txt", "*.safetensors"])
    except Exception as exc:  # noqa: BLE001 — reported as "not installed"
        print(f"[zh_ner_eval] {hf_id} unavailable: {exc}", file=sys.stderr)
        return None


def _tc_fn(cand: dict):
    from transformers import AutoModelForTokenClassification, AutoTokenizer, pipeline
    d = _hf_dir(cand["hf_id"])
    if not d:
        return None
    nlp = pipeline("token-classification",
                   model=AutoModelForTokenClassification.from_pretrained(d).eval(),
                   tokenizer=AutoTokenizer.from_pretrained(d),
                   aggregation_strategy="simple")
    labels = cand["labels"]

    def fn(text: str):
        out = []
        for off, chunk in _chunks(text):
            for ent in nlp(chunk):
                fam = labels.get(ent["entity_group"].split("-")[-1])
                if fam:
                    out.append((off + ent["start"], off + ent["end"], fam))
        return out

    return fn


def _raner_fn(cand: dict):
    """AdaSeq transformer-CRF: BertModel -> linear emission -> Viterbi.
    Reimplemented in ~40 lines rather than pulling AdaSeq (which drags in
    pytorch-lightning) for one forward pass."""
    import torch
    from safetensors.torch import load_file
    from transformers import AutoConfig, AutoTokenizer, BertModel

    d = _hf_dir(cand["hf_id"])
    if not d:
        return None
    cfg = AutoConfig.from_pretrained(d)
    bert = BertModel(cfg)
    state = load_file(os.path.join(d, "model.safetensors"))
    bert.load_state_dict({k[len("encoder."):]: v for k, v in state.items()
                          if k.startswith("encoder.")}, strict=False)
    bert.eval()
    tok = AutoTokenizer.from_pretrained(d)
    linear_w, linear_b = state["linear.weight"], state["linear.bias"]
    trans = state["crf.transitions"]
    start_t, end_t = state["crf.start_transitions"], state["crf.end_transitions"]
    labels = [cfg.id2label[i] for i in range(cfg.num_labels)]
    fam = {"PER": "PERSON", "ORG": "ORG", "LOC": "ORG", "GPE": "ORG"}
    torch.set_num_threads(min(8, os.cpu_count() or 1))

    def viterbi(em):
        score = start_t + em[0]
        back = []
        for t in range(1, len(em)):
            score, arg = (score.unsqueeze(1) + trans).max(dim=0)
            back.append(arg)
            score = score + em[t]
        best = int((score + end_t).argmax())
        path = [best]
        for arg in reversed(back):
            best = int(arg[best])
            path.append(best)
        return path[::-1]

    def fn(text: str):
        out = []
        for off, chunk in _chunks(text, size=480, overlap=30):
            enc = tok(chunk, return_offsets_mapping=True, return_tensors="pt")
            offsets = enc["offset_mapping"][0].tolist()
            with torch.no_grad():
                hidden = bert(input_ids=enc["input_ids"],
                              attention_mask=enc["attention_mask"]).last_hidden_state[0]
            # Drop [CLS]/[SEP] — AdaSeq decodes the content tokens only.
            path = viterbi(hidden @ linear_w.T + linear_b)[1:-1]
            cur = None
            for tag_id, (s, e) in zip(path, offsets[1:-1]):
                tag = labels[tag_id]
                if tag == "O":
                    if cur:
                        out.append(cur)
                        cur = None
                    continue
                prefix, _, kind = tag.partition("-")
                fam_name = fam.get(kind)
                if not fam_name:
                    cur = None
                    continue
                if prefix in ("B", "S"):
                    if cur:
                        out.append(cur)
                    cur = (off + s, off + e, fam_name)
                    if prefix == "S":
                        out.append(cur)
                        cur = None
                elif prefix in ("I", "E") and cur:
                    cur = (cur[0], off + e, cur[2])
                    if prefix == "E":
                        out.append(cur)
                        cur = None
        return out

    return fn


_FACTORIES = {"app": _app_fn, "raner": _raner_fn, "tc": _tc_fn}


def _chunks(text: str, size: int = 380, overlap: int = 40):
    """Split on line boundaries into <=size windows so a 512-token BERT sees
    the whole document; yields (start_offset, chunk_text)."""
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            cut = text.rfind("\n", start, end)
            end = cut + 1 if cut > start else end
        yield start, text[start:end]
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)


def _rows():
    """(label, factory, argument, note) for every model under test."""
    rows = [(f"`{m}`", "app", m, "") for m in _catalogue()]
    for cand in CANDIDATES:
        rows.append((cand["label"], cand["kind"], cand, ""))
    return rows


def _make_row_fn(kind: str, arg):
    try:
        if kind == "app":
            from lethe import nlp_suggester
            if not nlp_suggester.is_installed(arg):
                # Install it the way the Settings page would, so the report
                # covers the whole catalogue rather than whatever happens to be
                # lying around in this environment.
                nlp_suggester.download_model(arg)
            if not nlp_suggester.is_installed(arg):
                return None
        return _FACTORIES[kind](arg)
    except Exception as exc:  # noqa: BLE001
        print(f"[zh_ner_eval] {arg} unavailable: {exc}", file=sys.stderr)
        return None


# ---- set 1: the due-diligence sample ---------------------------------------
def _hit(gold: str, spans, text: str, family: str) -> bool:
    for s, e, fam in spans:
        if fam == family:
            surface = text[s:e]
            if surface and (gold in surface or surface in gold):
                return True
    return False


def _sample_section(lines: list[str]) -> None:
    with open(SAMPLE, encoding="utf-8") as fh:
        text = fh.read()
    lines += [
        "## ZH models — recall on `samples/nlp-sample-zh.txt` (people / orgs / schools)",
        "",
        "Generated by `tools/zh_ner_eval.py`. The sample is a synthetic but",
        "representative Chinese due-diligence memo: deal parties, directors and",
        "contacts, law/audit firms, regulators, and the schools on the management",
        "team's CVs. A gold entity counts as hit when a span of the same family",
        "contains it or is contained in it. `ORG` includes the schools (they are",
        "organisation-shaped entities); the last column isolates them. Catalogue",
        "rows run the app's real path (`nlp_suggester._analyze`): Presidio + the",
        "Chinese-name rules for spaCy models, the CRF decode for RaNER.",
        "",
        f"Gold: {len(GOLD['PERSON'])} people, {len(GOLD['ORG'])} organisations "
        f"(of which {len(GOLD['SCHOOL'])} are schools).",
        "",
        "| Model | Matched | Recall | Spans | Distinct | False positives | Schools |",
        "|---|---:|---:|---:|---:|---:|---|",
    ]
    for label, kind, arg, _note in _rows():
        fn = _make_row_fn(kind, arg)
        if fn is None:
            lines.append(f"| {label} | n/a — not installed in this environment |")
            continue
        spans = fn(text)
        matched = sum(_hit(g, spans, text, "PERSON") for g in GOLD["PERSON"])
        matched += sum(_hit(g, spans, text, "ORG") for g in GOLD["ORG"] + GOLD["SCHOOL"])
        total = len(GOLD["PERSON"]) + len(GOLD["ORG"]) + len(GOLD["SCHOOL"])
        surfaces = [text[s:e] for s, e, _f in spans]
        known = GOLD["PERSON"] + GOLD["ORG"] + GOLD["SCHOOL"]
        fp = sum(1 for sp in surfaces if not any(sp in g or g in sp for g in known))
        missed_schools = [g for g in GOLD["SCHOOL"] if not _hit(g, spans, text, "ORG")]
        schools = ("all 6" if not missed_schools
                   else "missed " + ", ".join(f"`{g}`" for g in missed_schools))
        lines.append(f"| {label} | {matched}/{total} | {matched / total:.0%} | "
                     f"{len(spans)} | {len(set(surfaces))} | {fp} | {schools} |")
    lines.append("")


# ---- set 2: the public CLUENER2020 dev split -------------------------------
CLUENER = {
    "repo": "xusenlin/clue-ner",
    "file": "data/validation-00000-of-00001-bc5663be3b7ff2cd.parquet",
    "limit": 1343,  # the whole dev split
}
# CLUENER's fine-grained labels -> the suggestion lane's families. The rest
# (address, scene, position, book, game, movie) is neither scored nor counted
# against a model: a hit there is a legitimate entity, just not our two.
_CLUENER_FAMILY = {"name": "PERSON", "company": "ORG",
                   "government": "ORG", "organization": "ORG"}


@lru_cache(maxsize=1)
def _cluener_rows():
    import pyarrow.parquet as pq
    from huggingface_hub import hf_hub_download
    path = hf_hub_download(CLUENER["repo"], CLUENER["file"], repo_type="dataset")
    table = pq.read_table(path)
    rows = []
    for text, raw in zip(table.column("text").to_pylist(),
                         table.column("entities").to_pylist()):
        entities = ast.literal_eval(raw) if isinstance(raw, str) else raw
        gold, ignored = [], []
        for ent in entities:
            item = (ent["start_offset"], ent["end_offset"],
                    _CLUENER_FAMILY.get(ent["label"]))
            (gold if item[2] else ignored).append(item)
        rows.append((text, gold, ignored))
    return rows[:CLUENER["limit"]]


def _corpus_section(lines: list[str]) -> None:
    rows = _cluener_rows()
    n_gold = sum(len(g) for _t, g, _i in rows)
    lines += [
        "## ZH models — recall on CLUENER2020 dev (public, human-annotated)",
        "",
        f"Generated by `tools/zh_ner_eval.py` from the {len(rows)} sentences of the",
        "CLUENER2020 dev split (source `xusenlin/clue-ner`, Apache-2.0; original corpus",
        "from the CLUE benchmark). News domain, not contracts — it answers \"does the",
        "model find people and organisations in real Chinese text?\", not \"does it find",
        "them in a contract?\". Caveat to read alongside the numbers: this is the dev",
        "split of the corpus `uer/...-cluener2020-chinese` was fine-tuned on, so that",
        "row is optimistic by construction. Each entity is matched by span overlap",
        "within the same family; other CLUENER categories (address, position, …) are",
        "ignored, not counted as errors.",
        "",
        f"Gold: {n_gold} entities across {len(rows)} sentences "
        f"({sum(1 for _t, g, _i in rows for x in g if x[2] == 'PERSON')} people, "
        f"{sum(1 for _t, g, _i in rows for x in g if x[2] == 'ORG')} organisations).",
        "",
        "| Model | PERSON recall | ORG recall | Overall | False positives |",
        "|---|---:|---:|---:|---:|",
    ]
    for label, kind, arg, _note in _rows():
        fn = _make_row_fn(kind, arg)
        if fn is None:
            lines.append(f"| {label} | n/a — not installed in this environment |")
            continue
        hits = {"PERSON": 0, "ORG": 0}
        totals = {"PERSON": 0, "ORG": 0}
        fp = 0
        for text, gold, ignored in rows:
            spans = fn(text)
            for start, end, family in gold:
                totals[family] += 1
                if any(f == family and s < end and start < e
                       for s, e, f in spans):
                    hits[family] += 1
            for s, e, _f in spans:
                if not any(s < ge and gs < e for gs, ge, _f in gold + ignored):
                    fp += 1
        matched = hits["PERSON"] + hits["ORG"]
        total = totals["PERSON"] + totals["ORG"]
        lines.append(
            f"| {label} | {hits['PERSON']}/{totals['PERSON']} "
            f"({hits['PERSON'] / max(totals['PERSON'], 1):.0%}) "
            f"| {hits['ORG']}/{totals['ORG']} ({hits['ORG'] / max(totals['ORG'], 1):.0%}) "
            f"| {matched / total:.0%} | {fp} |")
    lines.append("")


def report() -> list[str]:
    lines: list[str] = []
    _sample_section(lines)
    _corpus_section(lines)
    lines += ["### Candidates that were not picked — licences and sizes", "",
              "| Candidate | Licence | Model size |", "|---|---|---|"]
    for cand in CANDIDATES:
        lines.append(f"| {cand['label']} | {cand['licence']} | {cand['size']} |")
    lines.append("")
    return lines


def main() -> int:
    argparse.ArgumentParser(description=__doc__).parse_args()
    lines = report()
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())

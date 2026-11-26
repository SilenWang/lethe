"""
Detection + redaction core.

Strategy (in order of reliability for a compliance gate):
  1. Known-entity dictionary  -- your real people / counterparties + aliases.
     Deterministic, ~100% recall on the names that actually matter.
  2. Pattern detectors        -- emails, phone numbers, account/IBAN-like IDs.
  3. Preset context rules     -- two deterministic rules that need no model:
     Chinese names anchored on a surname + title/contact label, and Japanese
     company names anchored on their legal-form suffix/prefix.

Everything funnels into a list of "items" that the UI presents for human
confirmation before anything is written out.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# ---- token formatting --------------------------------------------------------
# Descriptive placeholders survive a round-trip through an LLM well: the model
# treats "[PERSON_001]" as an opaque placeholder and preserves it verbatim.
TYPE_PREFIX = {
    "PERSON": "PERSON",
    "COUNTERPARTY": "COUNTERPARTY",
    "ORG": "COUNTERPARTY",
    "EMAIL": "EMAIL",
    "PHONE": "PHONE",
    "ACCOUNT": "ACCOUNT",
}


def make_token(entity_type: str, index: int) -> str:
    prefix = TYPE_PREFIX.get(entity_type.upper(), entity_type.upper())
    return f"[{prefix}_{index:03d}]"


# ---- pattern detectors -------------------------------------------------------
PATTERNS = {
    "EMAIL": re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),
    # Loose international phone matcher: +65 6789 1234, (02) 1234-5678, etc.
    # Word-boundary lookarounds only (a trailing "." ends a sentence, not the number).
    "PHONE": re.compile(r"(?<!\w)\+?\d[\d\s().\-]{6,}\d(?!\w)"),
    # IBAN-ish / long account numbers (>=8 digits, optional grouping)
    "ACCOUNT": re.compile(r"\b(?:[A-Z]{2}\d{2}[A-Z0-9]{10,30}|\d[\d\- ]{6,}\d)\b"),
}

@dataclass
class Entity:
    """A known person or counterparty from the user's dictionary."""
    canonical: str
    type: str  # PERSON | COUNTERPARTY
    aliases: list[str] = field(default_factory=list)

    def surfaces(self) -> list[str]:
        seen, out = set(), []
        for s in [self.canonical, *self.aliases]:
            s = s.strip()
            if s and s.lower() not in seen:
                seen.add(s.lower())
                out.append(s)
        return out


@dataclass
class Item:
    """A confirmed-or-candidate redaction target shown in the review UI."""
    type: str
    canonical: str          # value the token maps back to (the "real" value)
    surfaces: list[str]     # every string form that should be replaced
    source: str             # "dictionary" | "pattern" | "preset_rule" | "manual"
    count: int = 0
    include: bool = True
    token: str = ""


# Hiragana/Katakana, CJK ideographs (+ext A), Hangul, compatibility & half-width.
_CJK_RE = re.compile(r"[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿ｦ-ﾟ]")


def _whole_word_regex(surface: str) -> re.Pattern:
    # Names can contain regex metachars (e.g. ".", "&"); escape them.
    body = re.escape(surface)
    if _CJK_RE.search(surface):
        # CJK/Japanese/Korean text has no word delimiters, so word-boundary
        # lookarounds would miss names embedded in running text -> substring match.
        return re.compile(body)
    # \b doesn't work well around &/. so guard with lookarounds on word chars.
    return re.compile(rf"(?<![\w]){body}(?![\w])", re.IGNORECASE)


# Overlap resolution: longest span wins, so a whole-email pattern beats a
# dictionary name that happens to sit inside it. Ties break by source tier:
# dictionary > preset_rule > pattern. "manual" items are added by the reviewer
# in the UI and are not produced by detect().
_TIER = {"dictionary": 3, "preset_rule": 2, "pattern": 1, "manual": 0}
_TYPE_RANK = {"EMAIL": 4, "ACCOUNT": 3, "PHONE": 2}  # account/email beat phone on a tie


@dataclass
class _Span:
    start: int
    end: int
    type: str
    canonical: str
    surface: str
    source: str

    @property
    def length(self) -> int:
        return self.end - self.start


# Japanese company-name rule. A data-driven model often mislabels companies
# (e.g. tags 株式会社 as EVENT), so we anchor on the legal-form suffix/prefix.
# \uXXXX escapes work inside re patterns even in raw strings.
# Name body = Katakana, Kanji, half-width kana, Latin, full-width Latin/digits,
# digits, middle-dot, long-vowel mark -- but NOT Hiragana, so grammatical
# particles (は/が/の…) cleanly bound the company name.
_JP_BODY = r"[゠-ヿ㐀-鿿ｦ-ﾟA-Za-zＡ-Ｚａ-ｚ0-9０-９・ー]"
_JP_SUFFIX = (r"株式会社|合同会社|有限会社|"
              r"合資会社|合名会社|（株）|\(株\)|㈱")
_JP_PREFIX = (r"株式会社|合同会社|有限会社|"
              r"合資会社|合名会社")
_JP_COMPANY = re.compile(
    rf"(?:{_JP_BODY}{{1,24}}(?:{_JP_SUFFIX}))|(?:(?:{_JP_PREFIX}){_JP_BODY}{{1,24}})")


def _jp_company_spans(text: str) -> list[tuple[int, int]]:
    return [(m.start(), m.end()) for m in _JP_COMPANY.finditer(text)]


# Chinese name rule: anchored on a common surname AND on either a title /
# honorific ("张三先生") or a form/contact label ("联系人：张三"). Anchoring on
# both keeps arbitrary 2-4 character CJK runs (brands, places, job titles) out.
_ZH_SURNAMES = ("赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜"
                "戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐"
                "费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和"
                "穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮"
                "蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田胡凌霍虞万支柯"
                "昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴")
_ZH_TITLE = ("先生|女士|小姐|老师|经理|总监|董事长|总裁|总经理|副经理|主任|教授|博士|"
             "律师|医师|会计|工程师|代表|同志|局长|部长|院长|校长")
_ZH_PREFIX = ("姓名|名字|联系人|联络人|负责人|签署人|签字人|授权代表|法定代表人|委托代表|"
              "甲方|乙方|丙方|由|致|尊敬的|给")
_ZH_NAME = rf"[{_ZH_SURNAMES}][\u4e00-\u9fff]{{1,2}}"
_ZH_NAME_RE = re.compile(
    rf"({_ZH_NAME})(?=(?:{_ZH_TITLE}))"
    rf"|(?:(?:{_ZH_PREFIX})[：: \u3000]{{0,2}})({_ZH_NAME})(?![\u4e00-\u9fff])")


def _preset_rule_spans(text: str) -> list[_Span]:
    """The two deterministic context rules; both are default-checked."""
    # Both rules require CJK script; an ASCII spreadsheet should not pay for a
    # full Japanese/Chinese regex scan of a 30MB corpus.
    if not _CJK_RE.search(text):
        return []
    out: list[_Span] = []
    for match in _ZH_NAME_RE.finditer(text):
        group = 1 if match.group(1) else 2
        surface = match.group(group)
        out.append(_Span(match.start(group), match.end(group), "PERSON", surface, surface,
                         "preset_rule"))
    for start, end in _jp_company_spans(text):
        surface = text[start:end]
        out.append(_Span(start, end, "COUNTERPARTY", surface, surface, "preset_rule"))
    return out


def detect(text: str, entities: list[Entity], enable_patterns: bool = True,
           enable_preset_rules: bool = True, *,
           enable_suggestions: bool | None = None) -> list[Item]:
    """Span-based detection with overlap resolution, grouped into review items."""
    if enable_suggestions is not None:  # v1 compatibility: no NLP lane any more
        enable_preset_rules = enable_suggestions
    spans: list[_Span] = []

    # 1. Dictionary entities --------------------------------------------------
    for ent in entities:
        for s in ent.surfaces():
            for m in _whole_word_regex(s).finditer(text):
                spans.append(_Span(m.start(), m.end(), ent.type, ent.canonical, s, "dictionary"))

    # 2. Pattern detectors ----------------------------------------------------
    if enable_patterns:
        for ptype, pat in PATTERNS.items():
            for m in pat.finditer(text):
                v = m.group(0).strip()
                if not v:
                    continue
                if ptype == "PHONE" and sum(c.isdigit() for c in v) < 7:
                    continue
                # account: require enough digits to avoid catching years etc.
                if ptype == "ACCOUNT" and sum(c.isdigit() for c in v) < 8:
                    continue
                start = m.start() + m.group(0).find(v)
                spans.append(_Span(start, start + len(v), ptype, v, v, "pattern"))

    # 3. Deterministic context rules -----------------------------------------
    if enable_preset_rules:
        spans.extend(_preset_rule_spans(text))

    # ---- resolve overlaps by longest-wins, then source tier -----------------
    primary = list(spans)
    primary.sort(key=lambda s: (s.length, _TIER[s.source], _TYPE_RANK.get(s.type, 0)), reverse=True)
    accepted: list[_Span] = []
    # Character occupancy is the same rule as "any accepted span overlaps",
    # but O(text) instead of O(spans^2): a 50MB sheet can yield tens of
    # thousands of account matches, and the quadratic scan was the bottleneck.
    occupied = bytearray(len(text))
    for sp in primary:
        if sp.start < 0 or sp.end > len(text) or sp.end <= sp.start:
            continue
        if any(occupied[sp.start : sp.end]):
            continue
        accepted.append(sp)
        occupied[sp.start : sp.end] = b"\x01" * (sp.end - sp.start)

    # ---- group accepted spans into items by canonical value ----------------
    groups: dict[str, Item] = {}
    order: list[str] = []
    for sp in accepted:
        key = sp.canonical
        if key not in groups:
            groups[key] = Item(type=sp.type, canonical=sp.canonical, surfaces=[],
                               source=sp.source, count=0,
                               include=True)
            order.append(key)
        it = groups[key]
        it.count += 1
        if sp.surface not in it.surfaces:
            it.surfaces.append(sp.surface)

    items = [groups[k] for k in order]
    # stable, readable ordering: dictionary, preset rules, then patterns
    rank = {"dictionary": 0, "preset_rule": 1, "pattern": 2, "manual": 3}
    items.sort(key=lambda it: (rank[it.source], -it.count, it.canonical.lower()))
    return items


def assign_tokens(items: list[Item]) -> list[Item]:
    """Allocate stable, per-type, sequential tokens to the included items."""
    counters: dict[str, int] = {}
    for it in items:
        if not it.include:
            it.token = ""
            continue
        key = TYPE_PREFIX.get(it.type.upper(), it.type.upper())
        counters[key] = counters.get(key, 0) + 1
        it.token = make_token(it.type, counters[key])
    return items


def apply_token_overrides(
    items: list[Item], overrides: dict[str, str] | None = None
) -> list[Item]:
    """Apply task-wide tokens after per-file detection.

    A multi-file task detects each file separately but needs one mapping for
    the whole task. The caller assigns tokens across the union of files, then
    gives every worker run the same type+canonical lookup.

    The key is "TYPE|canonical". An exact hit wins, then a case-folded one, so
    a caller that folded the value with JavaScript's ``toLowerCase`` (which is
    not Unicode case folding: "Straße" stays "straße" instead of "strasse")
    still lands on the token its interface showed the user.
    """
    if not overrides:
        return items
    exact = {str(key): str(token) for key, token in overrides.items() if token}
    folded: dict[str, str] = {}
    for key, token in exact.items():
        raw_type, _, raw_canonical = key.partition("|")
        folded.setdefault(f"{raw_type.upper()}|{raw_canonical.casefold()}", token)
    for item in items:
        if not item.include:
            continue
        token = (
            exact.get(f"{item.type.upper()}|{item.canonical}")
            or folded.get(f"{item.type.upper()}|{item.canonical.casefold()}")
            or ""
        )
        if token:
            item.token = token
    return items


def build_replacer(items: list[Item]):
    """
    Build a single function that redacts text using all included items.
    Longest surfaces first so "John Smith" wins over "Smith".
    Returns (replace_fn, token_to_canonical).
    """
    pairs: list[tuple[re.Pattern, str]] = []
    token_to_real: dict[str, str] = {}
    surface_token: list[tuple[str, str]] = []
    for it in items:
        if not it.include or not it.token:
            continue
        token_to_real[it.token] = it.canonical
        for s in it.surfaces:
            surface_token.append((s, it.token))
    # longest first
    surface_token.sort(key=lambda st: len(st[0]), reverse=True)
    for s, tok in surface_token:
        pairs.append((_whole_word_regex(s), tok))

    def replace(text: str) -> tuple[str, int]:
        hits = 0
        for pat, tok in pairs:
            text, n = pat.subn(tok, text)
            hits += n
        return text, hits

    return replace, token_to_real


def build_fast_replacer(items: list[Item]):
    """Same semantics as :func:`build_replacer`, one combined regex.

    The per-surface loop is O(surfaces) Python calls per text node, which is
    fine for a docx paragraph but not for an xlsx with 200k cells and tens of
    thousands of pattern hits.  Alternation keeps the same longest-first order.
    """
    token_to_real: dict[str, str] = {}
    entries: list[tuple[str, str]] = []
    pattern_tokens: dict[str, str] = {}
    for it in items:
        if not it.include or not it.token:
            continue
        token_to_real[it.token] = it.canonical
        for surface in it.surfaces:
            if it.source == "pattern":
                pattern_tokens[surface.casefold()] = it.token
            else:
                entries.append((surface, it.token))
    if not entries and not pattern_tokens:
        return (lambda text: (text, 0)), token_to_real
    entries.sort(key=lambda entry: len(entry[0]), reverse=True)
    pattern = (
        re.compile(
            "|".join(f"(?:{_whole_word_regex(surface).pattern})" for surface, _ in entries),
            re.IGNORECASE,
        )
        if entries
        else None
    )
    token_by_surface = {surface.casefold(): token for surface, token in entries}

    def replace(text: str) -> tuple[str, int]:
        hits = 0

        if pattern is not None:
            def sub_dictionary(match: re.Match[str]) -> str:
                nonlocal hits
                token = token_by_surface.get(match.group(0).casefold())
                if token is None:
                    return match.group(0)
                hits += 1
                return token

            text = pattern.sub(sub_dictionary, text)

        # Pattern detectors (email/phone/account) already know the exact
        # values; run their three cheap regexes instead of thousands of
        # one-value alternatives.
        for pattern_re in PATTERNS.values():
            def sub_pattern(match: re.Match[str]) -> str:
                nonlocal hits
                raw = match.group(0)
                value = raw.strip()
                token = pattern_tokens.get(value.casefold())
                if token is None:
                    return raw
                hits += 1
                return raw.replace(value, token, 1)

            text = pattern_re.sub(sub_pattern, text)
        return text, hits

    return replace, token_to_real


def build_fast_restorer(token_to_real: dict[str, str]):
    tokens = sorted(token_to_real, key=len, reverse=True)
    if not tokens:
        return lambda text: (text, 0)
    pattern = re.compile("|".join(re.escape(token) for token in tokens))

    def restore(text: str) -> tuple[str, int]:
        hits = 0

        def sub(match: re.Match[str]) -> str:
            nonlocal hits
            hits += 1
            return token_to_real[match.group(0)]

        return pattern.sub(sub, text), hits

    return restore


def build_restorer(token_to_real: dict[str, str]):
    """Inverse: swap tokens in AI output back to real values."""
    # Longest tokens first (defensive; tokens are uniform but be safe).
    toks = sorted(token_to_real, key=len, reverse=True)
    pats = [(re.compile(re.escape(t)), token_to_real[t]) for t in toks]

    def restore(text: str) -> tuple[str, int]:
        hits = 0
        for pat, real in pats:
            text, n = pat.subn(real, text)
            hits += n
        return text, hits

    return restore

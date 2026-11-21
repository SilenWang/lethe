"""v2 core: dictionary + regex + two deterministic context rules, no NLP."""

from __future__ import annotations

from lethe import Entity, assign_tokens, detect


def test_chinese_name_anchored_on_title() -> None:
    items = detect("请转告张三先生，合同已发出。", [])
    assert [item.source for item in items] == ["preset_rule"]
    assert items[0].canonical == "张三"
    assert items[0].type == "PERSON"
    assert items[0].include is True


def test_chinese_name_anchored_on_contact_label() -> None:
    items = detect("联系人：李四", [])
    assert any(item.canonical == "李四" and item.source == "preset_rule" for item in items)


def test_japanese_company_rule() -> None:
    items = detect("株式会社テストと契約します。", [])
    assert any(item.source == "preset_rule" and item.type == "COUNTERPARTY" for item in items)


def test_no_suggestion_lane_remains() -> None:
    items = detect("Acme Capital Partners met Project Atlas.", [])
    assert all(item.source in {"dictionary", "pattern", "preset_rule"} for item in items)


def test_dictionary_wins_over_preset_rule_for_same_value() -> None:
    entities = [Entity("张三", "PERSON")]
    items = detect("联系人：张三", entities)
    assert len(items) == 1
    assert items[0].source == "dictionary"


def test_v1_suggestion_flag_aliases_preset_rules() -> None:
    assert detect("联系人：张三", [], enable_suggestions=False) == []
    assert detect("联系人：张三", [], enable_preset_rules=False) == []


def test_manual_source_survives_token_assignment() -> None:
    items = assign_tokens(detect("联系人：张三", []))
    items[0].source = "manual"
    assert items[0].token == "[PERSON_001]"

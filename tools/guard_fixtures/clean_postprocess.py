"""Deliberately good fixture: the only sanctioned exit."""


def postprocess(document):
    raise NotImplementedError


def export(document) -> bytes:
    return postprocess(document)

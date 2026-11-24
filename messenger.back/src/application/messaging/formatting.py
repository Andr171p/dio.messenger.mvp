"""Visible text projection for validating quotes selected in the web client."""

import re

_DELIMITERS = ("**", "__", "~~", "||", "*", "_", chr(96))
_SPECIAL = re.compile(r"\\[\\#*_~|()[\]\x60]|[\[*_~|\x60]")
_LINK = re.compile(r"""\[([^\]\n]+)\]\((https?://[^\s()<>"']+)\)""", re.IGNORECASE)
_FENCE = re.compile(r"(?:^|\n)\x60{3}[\w+-]*[ \t]*\r?\n([\s\S]*?)\r?\n\x60{3}(?=\r?\n|$)")


def _inline_text(text: str, depth: int = 0, *, links: bool = True, hide_spoilers: bool = False) -> str:
    if depth >= 6:
        return text
    parts: list[str] = []
    cursor = position = 0
    while match := _SPECIAL.search(text, position):
        start = match.start()
        marker = match[0]
        end = start
        position = match.end()
        output = ""
        if marker.startswith("\\"):
            output, end = marker[1:], position
        elif marker == "[" and links:
            link = _LINK.match(text, start)
            if link:
                output, end = _inline_text(link[1], depth + 1, links=False, hide_spoilers=hide_spoilers), link.end()
        else:
            delimiter = next((mark for mark in _DELIMITERS if text.startswith(mark, start)), None)
            if delimiter:
                position = start + len(delimiter)
                close = text.find(delimiter, position)
                while close > position and text[close - 1] == "\\":
                    close = text.find(delimiter, close + len(delimiter))
                body = text[position:close]
                if (
                    close > position and body.strip() and "\n" not in body
                    and (delimiter != "_" or not start or not text[start - 1].isalnum())
                ):
                    if delimiter == "||" and (hide_spoilers or not links):
                        output = "▰▰▰"
                    elif delimiter in ("||", chr(96)):
                        output = body
                    else:
                        output = _inline_text(body, depth + 1, links=links, hide_spoilers=hide_spoilers)
                    end = close + len(delimiter)
        if end > start:
            parts.extend((text[cursor:start], output))
            cursor = position = end
    parts.append(text[cursor:])
    return "".join(parts)


def visible_formatted_text(text: str, *, hide_spoilers: bool = False) -> str:
    parts: list[str] = []
    cursor = 0
    for fence in _FENCE.finditer(text):
        parts.append(_inline_text(
            re.sub(r"^> ", "", text[cursor:fence.start()], flags=re.M), hide_spoilers=hide_spoilers,
        ))
        parts.append("\n" + fence[1])
        cursor = fence.end()
    parts.append(_inline_text(re.sub(r"^> ", "", text[cursor:], flags=re.M), hide_spoilers=hide_spoilers))
    return "".join(parts).strip()

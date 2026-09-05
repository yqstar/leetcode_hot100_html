const pythonFormatter = String.raw`
import base64
import io
import json
import os
import re
import sys
import zipfile


def _lc_prepare_black():
    if globals().get("_LC_BLACK"):
        return
    bundle = json.loads(formatter_bundle_json)
    site_packages = "/tmp/lc-black/site-packages"
    os.makedirs(site_packages, exist_ok=True)
    for encoded in bundle["wheels"].values():
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(encoded))) as archive:
            archive.extractall(site_packages)
    if site_packages not in sys.path:
        sys.path.insert(0, site_packages)
    import black

    globals()["_LC_BLACK"] = black
    globals().pop("formatter_bundle_json", None)


def _lc_format_python(source):
    try:
        _lc_prepare_black()
        black = globals()["_LC_BLACK"]
        try:
            formatted = black.format_file_contents(
                source,
                fast=False,
                mode=black.Mode(line_length=int(formatter_line_length)),
            )
        except black.NothingChanged:
            formatted = source
        return {
            "ok": True,
            "changed": formatted != source,
            "code": formatted,
            "version": black.__version__,
        }
    except Exception as error:
        text = str(error)
        position = re.search(r"Cannot parse(?: for target version [^:]+)?:\s*(\d+):(\d+)", text)
        return {
            "ok": False,
            "kind": "syntax" if position else "formatter",
            "error": text,
            "line": int(position.group(1)) if position else None,
            "column": int(position.group(2)) if position else None,
        }


FORMAT_RESULT_JSON = json.dumps(_lc_format_python(formatter_source), ensure_ascii=False)
`;

export default pythonFormatter;

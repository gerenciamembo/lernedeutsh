import json
import os
import re
import sys
import uuid
import zipfile
from dataclasses import dataclass
from email.message import EmailMessage
from email.parser import BytesParser
from email.policy import default
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

BASE_DIR = Path(__file__).resolve().parent.parent
CLIENT_DIR = BASE_DIR.parent / "client"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "db.json"


def ensure_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DB_PATH.exists():
        DB_PATH.write_text(json.dumps({"decks": []}, ensure_ascii=False, indent=2), encoding="utf-8")


def read_database() -> Dict[str, Any]:
    ensure_database()
    with DB_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_database(data: Dict[str, Any]) -> None:
    ensure_database()
    tmp_path = DB_PATH.with_suffix(".tmp")
    with tmp_path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    tmp_path.replace(DB_PATH)


def list_decks() -> List[Dict[str, Any]]:
    db = read_database()
    return db.get("decks", [])


def save_decks(decks: List[Dict[str, Any]]) -> None:
    write_database({"decks": decks})


def find_deck(deck_id: str) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    decks = list_decks()
    for deck in decks:
        if deck["id"] == deck_id:
            return deck, decks
    return None, decks


SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def parse_json_cards(raw: bytes) -> List[Dict[str, Any]]:
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise ValueError("El archivo JSON debe contener un arreglo de objetos") from exc

    if not isinstance(payload, list):
        raise ValueError("El JSON debe ser un arreglo de objetos")

    cards = []
    for entry in payload:
        if not isinstance(entry, dict):
            raise ValueError("Cada tarjeta en el JSON debe ser un objeto con pares clave/valor")
        cards.append(
            {
                "id": str(uuid.uuid4()),
                "aciertos": 0,
                "contenido": entry,
            }
        )
    if not cards:
        raise ValueError("El archivo no contiene tarjetas")
    return cards


def _load_shared_strings(zf: zipfile.ZipFile) -> List[str]:
    try:
        data = zf.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    tree = ET.fromstring(data)
    ns = {"main": SPREADSHEET_NS}
    strings: List[str] = []
    for entry in tree.findall("main:si", ns):
        parts = [node.text or "" for node in entry.findall(".//main:t", ns)]
        strings.append("".join(parts))
    return strings


def _column_index(cell_ref: str) -> int:
    letters = [ch for ch in cell_ref if ch.isalpha()]
    if not letters:
        return 0
    index = 0
    for ch in letters:
        index = index * 26 + (ord(ch.upper()) - ord("A") + 1)
    return index - 1


def _parse_cell_value(cell: ET.Element, shared_strings: List[str]) -> Any:
    ns = {"main": SPREADSHEET_NS}
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        parts = [node.text or "" for node in cell.findall("main:is//main:t", ns)]
        return "".join(parts)
    value_node = cell.find("main:v", ns)
    if cell_type == "s":
        if value_node is None:
            return ""
        try:
            idx = int(value_node.text or "0")
        except ValueError:
            return ""
        if 0 <= idx < len(shared_strings):
            return shared_strings[idx]
        return ""
    if cell_type == "b":
        return "TRUE" if value_node is not None and value_node.text == "1" else "FALSE"
    if value_node is None:
        return ""
    text = value_node.text or ""
    stripped = text.strip()
    if stripped == "":
        return ""
    if re.fullmatch(r"-?\d+", stripped):
        if stripped.startswith("0") and len(stripped) > 1:
            return stripped
        try:
            return int(stripped)
        except ValueError:
            return stripped
    if re.fullmatch(r"-?\d+\.\d+", stripped):
        try:
            return float(stripped)
        except ValueError:
            return stripped
    return stripped


def _normalise_sheet_target(target: str) -> str:
    cleaned = target.lstrip("/")
    while cleaned.startswith("../"):
        cleaned = cleaned[3:]
    if not cleaned.startswith("xl/"):
        cleaned = f"xl/{cleaned}"
    return cleaned


def parse_xlsx_cards(raw: bytes) -> List[Dict[str, Any]]:
    try:
        zf = zipfile.ZipFile(BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise ValueError("El archivo Excel (.xlsx) es inválido o está dañado") from exc

    with zf:
        try:
            workbook_data = zf.read("xl/workbook.xml")
        except KeyError as exc:
            raise ValueError("El archivo Excel no contiene un libro de trabajo válido") from exc

        workbook = ET.fromstring(workbook_data)
        ns = {"main": SPREADSHEET_NS, "r": DOC_REL_NS}
        sheet = workbook.find("main:sheets/main:sheet", ns)
        if sheet is None:
            raise ValueError("El archivo Excel no contiene hojas de cálculo")
        rel_id = sheet.attrib.get(f"{{{DOC_REL_NS}}}id")
        if not rel_id:
            raise ValueError("No se pudo determinar la hoja principal del Excel")

        try:
            rels_data = zf.read("xl/_rels/workbook.xml.rels")
        except KeyError as exc:
            raise ValueError("El archivo Excel no contiene relaciones de libro válidas") from exc

        rels = ET.fromstring(rels_data)
        rels_ns = {"rel": REL_NS}
        sheet_target: Optional[str] = None
        for rel in rels.findall("rel:Relationship", rels_ns):
            if rel.attrib.get("Id") == rel_id:
                sheet_target = rel.attrib.get("Target")
                break
        if not sheet_target:
            raise ValueError("No se pudo encontrar la hoja de cálculo referenciada en el Excel")

        sheet_path = _normalise_sheet_target(sheet_target)
        try:
            sheet_data = zf.read(sheet_path)
        except KeyError as exc:
            raise ValueError("No se pudo leer la hoja de cálculo principal del Excel") from exc

        sheet_tree = ET.fromstring(sheet_data)
        sheet_ns = {"main": SPREADSHEET_NS}
        rows = sheet_tree.findall("main:sheetData/main:row", sheet_ns)
        if not rows:
            raise ValueError("El archivo Excel no contiene filas de datos")

        shared_strings = _load_shared_strings(zf)
        header_map: Dict[int, str] = {}
        header_counts: Dict[str, int] = {}

        def allocate_header_name(base: str, col_index: int) -> str:
            name_base = base.strip() if isinstance(base, str) else ""
            if not name_base:
                name_base = f"Columna {col_index + 1}"
            count = header_counts.get(name_base, 0)
            header_counts[name_base] = count + 1
            if count == 0:
                return name_base
            return f"{name_base} ({count + 1})"

        def register_header(col_index: int, base_name: Any) -> None:
            header_map[col_index] = allocate_header_name(str(base_name) if base_name is not None else "", col_index)

        def ensure_header(col_index: int) -> str:
            if col_index not in header_map:
                header_map[col_index] = allocate_header_name("", col_index)
            return header_map[col_index]

        cards: List[Dict[str, Any]] = []

        for idx, row in enumerate(rows):
            cells: Dict[int, Any] = {}
            for cell in row.findall("main:c", sheet_ns):
                ref = cell.attrib.get("r", "")
                column = _column_index(ref)
                cells[column] = _parse_cell_value(cell, shared_strings)

            if idx == 0:
                if not cells:
                    raise ValueError("La primera fila del Excel debe contener encabezados")
                for col in sorted(cells):
                    register_header(col, cells[col])
                continue

            if not cells:
                continue

            card_content: Dict[str, Any] = {}
            for col_index in sorted(cells):
                header = ensure_header(col_index)
                value = cells[col_index]
                if value in ("", None):
                    continue
                card_content[header] = value

            if not card_content:
                continue

            cards.append(
                {
                    "id": str(uuid.uuid4()),
                    "aciertos": 0,
                    "contenido": card_content,
                }
            )

        if not cards:
            raise ValueError("El archivo Excel no contiene tarjetas después de la fila de encabezados")
        return cards


@dataclass
class TextField:
    name: str
    value: str


class FileField:
    def __init__(
        self,
        name: str,
        filename: str,
        data: bytes,
        content_type: str,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        self.name = name
        self.filename = filename
        self.type = content_type
        self.headers = headers or {}
        self.value = data
        self.file = BytesIO(data)


MultipartField = Union[TextField, FileField]


class MultipartForm:
    def __init__(self) -> None:
        self._fields: Dict[str, List[MultipartField]] = {}

    def add_field(self, name: str, field: MultipartField) -> None:
        self._fields.setdefault(name, []).append(field)

    def getfirst(self, name: str, default: Optional[str] = None) -> Optional[str]:
        fields = self._fields.get(name)
        if not fields:
            return default
        field = fields[0]
        if isinstance(field, TextField):
            return field.value
        return default

    def __contains__(self, name: object) -> bool:
        return isinstance(name, str) and name in self._fields and bool(self._fields[name])

    def __getitem__(self, name: str) -> MultipartField:
        fields = self._fields.get(name)
        if not fields:
            raise KeyError(name)
        return fields[0]


def _parse_multipart_form_data(body: bytes, content_type: str) -> MultipartForm:
    header_bytes = f"Content-Type: {content_type}\r\n\r\n".encode("utf-8")
    try:
        message: EmailMessage = BytesParser(policy=default).parsebytes(header_bytes + body)
    except Exception as exc:  # pragma: no cover - defensive
        raise ValueError("No se pudo interpretar el formulario enviado") from exc

    if not message.is_multipart():
        raise ValueError("El cuerpo debe ser multipart/form-data válido")

    form = MultipartForm()
    for part in message.iter_parts():
        if part.get_content_disposition() != "form-data":
            continue
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        filename = part.get_filename()
        payload = part.get_payload(decode=True) or b""
        headers = {key: value for key, value in part.items()}
        if filename:
            form.add_field(
                name,
                FileField(
                    name=name,
                    filename=filename,
                    data=payload,
                    content_type=part.get_content_type(),
                    headers=headers,
                ),
            )
            continue

        charset = part.get_content_charset() or "utf-8"
        try:
            text = payload.decode(charset, errors="replace")
        except LookupError:
            text = payload.decode("utf-8", errors="replace")
        form.add_field(name, TextField(name=name, value=text))

    return form


def parse_cards_from_file(file_item: FileField) -> List[Dict[str, Any]]:
    try:
        raw = file_item.file.read()
    except Exception as exc:  # pragma: no cover - defensive
        raise ValueError(f"No se pudo leer el archivo: {exc}")

    filename = getattr(file_item, "filename", "") or ""
    extension = Path(filename).suffix.lower()

    if extension == ".json":
        return parse_json_cards(raw)
    if extension == ".xlsx":
        return parse_xlsx_cards(raw)

    json_error: Optional[Exception] = None
    try:
        return parse_json_cards(raw)
    except ValueError as exc:
        json_error = exc

    try:
        return parse_xlsx_cards(raw)
    except ValueError as exc:
        if json_error:
            raise ValueError(
                "No se pudo procesar el archivo. Sube un JSON con un arreglo de objetos o un Excel (.xlsx) con encabezados en la primera fila."
            ) from exc
        raise


class DeckHandler(SimpleHTTPRequestHandler):
    server_version = "DeckStudy/1.0"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(CLIENT_DIR), **kwargs)

    # --- Helpers ---------------------------------------------------------
    def send_json(self, payload: Any, status: int = 200) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def send_error_json(self, status: int, message: str) -> None:
        self.send_json({"error": message}, status=status)

    def read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return b""
        return self.rfile.read(length)

    def log_message(self, format: str, *args: Any) -> None:  # pragma: no cover - reduce noise
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), format % args))

    # --- Routing ---------------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802 - required by base class
        if self.path.startswith("/api/"):
            self.handle_api_get()
        else:
            if self.path == "/":
                # ensure index exists
                index_path = CLIENT_DIR / "index.html"
                if not index_path.exists():
                    self.send_error(404, "Archivo index.html no encontrado")
                    return
            super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        if self.path.startswith("/api/"):
            self.handle_api_post()
        else:
            self.send_error(404, "Ruta no encontrada")

    def do_DELETE(self) -> None:  # noqa: N802
        if self.path.startswith("/api/"):
            self.handle_api_delete()
        else:
            self.send_error(404, "Ruta no encontrada")

    def do_PATCH(self) -> None:  # noqa: N802
        if self.path.startswith("/api/"):
            self.handle_api_patch()
        else:
            self.send_error(404, "Ruta no encontrada")

    # --- API Handlers ----------------------------------------------------
    def handle_api_get(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/decks":
            decks = list_decks()
            summary = [
                {
                    "id": deck["id"],
                    "name": deck["name"],
                    "cardCount": len(deck.get("cards", [])),
                }
                for deck in decks
            ]
            self.send_json({"decks": summary})
            return

        deck_match = re.fullmatch(r"/api/decks/([\w-]+)", path)
        if deck_match:
            deck_id = deck_match.group(1)
            deck, _ = find_deck(deck_id)
            if deck is None:
                self.send_error_json(404, "Mazo no encontrado")
                return
            self.send_json(deck)
            return

        self.send_error_json(404, "Ruta no encontrada")

    def handle_api_post(self) -> None:
        if self.path != "/api/decks":
            self.send_error_json(404, "Ruta no encontrada")
            return

        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            self.send_error_json(400, "Se requiere multipart/form-data para subir un mazo")
            return

        body = self.read_body()
        try:
            form = _parse_multipart_form_data(body, content_type)
        except ValueError as exc:
            self.send_error_json(400, str(exc))
            return

        name_field = form.getfirst("name")
        file_field = form["file"] if "file" in form else None

        if not name_field or file_field is None or getattr(file_field, "filename", "") == "":
            self.send_error_json(400, "Debe proporcionar un nombre y un archivo JSON o Excel (.xlsx) con las tarjetas")
            return

        try:
            cards = parse_cards_from_file(file_field)
        except ValueError as exc:
            self.send_error_json(400, str(exc))
            return

        decks = list_decks()
        deck = {
            "id": str(uuid.uuid4()),
            "name": name_field.strip(),
            "cards": cards,
        }
        decks.append(deck)
        save_decks(decks)
        self.send_json({
            "message": "Mazo creado",
            "deck": {
                "id": deck["id"],
                "name": deck["name"],
                "cardCount": len(cards),
            },
        }, status=201)

    def handle_api_delete(self) -> None:
        match = re.fullmatch(r"/api/decks/([\w-]+)", self.path)
        if not match:
            self.send_error_json(404, "Ruta no encontrada")
            return
        deck_id = match.group(1)
        deck, decks = find_deck(deck_id)
        if deck is None:
            self.send_error_json(404, "Mazo no encontrado")
            return
        decks = [d for d in decks if d["id"] != deck_id]
        save_decks(decks)
        self.send_json({"message": "Mazo eliminado"})

    def handle_api_patch(self) -> None:
        match = re.fullmatch(r"/api/decks/([\w-]+)/cards/([\w-]+)", self.path)
        if not match:
            self.send_error_json(404, "Ruta no encontrada")
            return
        deck_id, card_id = match.groups()
        try:
            body = json.loads(self.read_body().decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error_json(400, "El cuerpo debe ser JSON válido")
            return
        delta = body.get("delta")
        if delta not in (-1, 1):
            self.send_error_json(400, "El campo delta debe ser -1 o 1")
            return

        deck, decks = find_deck(deck_id)
        if deck is None:
            self.send_error_json(404, "Mazo no encontrado")
            return

        card = next((c for c in deck["cards"] if c["id"] == card_id), None)
        if card is None:
            self.send_error_json(404, "Tarjeta no encontrada")
            return

        card["aciertos"] += int(delta)
        save_decks(decks)
        self.send_json({"card": card})


def run_server(host: str = "0.0.0.0", port: int = 8000) -> None:
    ensure_database()
    CLIENT_DIR.mkdir(parents=True, exist_ok=True)
    handler = DeckHandler
    with ThreadingHTTPServer((host, port), handler) as httpd:
        print(f"Servidor iniciado en http://{host}:{port}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    run_server(port=port)

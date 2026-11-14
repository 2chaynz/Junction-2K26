"""English for everything the UI shows: IFC storeys, properties, room and type names, takeoff rows, labels.

Display only: runs after the Stoa check, never on what the scorer sees.
Order: cache → whole phrases → floor patterns → word / compound dictionary (€0, offline) →
Gemini batch for what is left (GEMINI_API_KEY set; SITELENS_TRANSLATE=dict turns it off). Cached on disk.
"""
from __future__ import annotations

import json
import os
import re
import threading
from pathlib import Path

# Whole strings (lowercase key). Storeys, rooms and codes that a word-by-word pass would get wrong.
PHRASES = {
    # German
    "kellergeschoss": "Basement", "keller": "Basement", "untergeschoss": "Basement", "klder": "Basement",
    "erdgeschoss": "Ground floor", "obergeschoss": "Upper floor",
    "dachgeschoss": "Attic floor", "dachboden": "Attic", "gok": "Ground level",
    "wohnküche": "Kitchen-living room", "hw": "Utility room", "vorr.": "Storage", "bad": "Bathroom",
    "gang": "Corridor", "flur": "Hallway", "diele": "Hallway", "zimmer": "Room", "abstellraum": "Storage room",
    "treppenlauf": "Stair flight", "treppenhaus": "Stairwell", "aufzug": "Elevator",
    # Dutch
    "begane grond": "Ground floor", "eerste verdieping": "First floor", "tweede verdieping": "Second floor",
    "derde verdieping": "Third floor", "kelder": "Basement", "zolder": "Attic", "n.v.t.": "N/A", "geen": "None",
    "uit": "Off", "aan": "On",
    # Danish / Swedish / Norwegian
    "kælder": "Basement", "grundplan": "Ground floor", "stueetage": "Ground floor", "tag": "Roof",
    "källare": "Basement", "bottenvåning": "Ground floor", "vind": "Attic",
    # Estonian / Finnish
    "vundament": "Foundation", "katus": "Roof", "kellari": "Basement", "katto": "Roof",
    "perustus": "Foundation", "ullakko": "Attic", "pohjakerros": "Ground floor",
    "mh": "Bedroom", "kh": "Bathroom", "kph": "Bathroom", "kk": "Kitchenette", "vh": "Closet",
    "muro básico": "Basic wall", "tipos de tubería": "Pipe types", "tubo con uniones": "Pipe with joints",
    "codo de tubo": "Pipe elbow", "montante rectangular": "Rectangular mullion",
    # Italian / Spanish / French / Polish / Romanian
    "solaio interrato": "Basement slab", "piano terra": "Ground floor", "sottotetto": "Attic", "seminterrato": "Basement",
    "planta baja": "Ground floor", "sótano": "Basement", "cubierta": "Roof", "rez-de-chaussée": "Ground floor",
    "sous-sol": "Basement", "toit": "Roof", "parter": "Ground floor", "piwnica": "Basement", "dach": "Roof", "subsol": "Basement", "acoperiș": "Roof", "mansardă": "Attic",
    "estándar": "Standard", "standaard": "Standard", "generisch": "Generic", "genérico": "Generic",
    "ja": "Yes", "nein": "No", "nee": "No", "nej": "No", "kyllä": "Yes", "jah": "Yes", "sí": "Yes",
}

# "1.korrus", "2. OG", "1. Sal", "Piano 1", "Etage 3" → "Floor N". (prefix words, suffix words)
_FLOOR_WORDS = r"korrus|kerros|sal|etage|etasje|våning|verdieping|og|obergeschoss|geschoss|piano|planta|étage|piętro|etaj|kat|level"
_FLOOR_SUFFIX = re.compile(rf"^(\d+)\s*\.?\s*({_FLOOR_WORDS})$", re.I)
_FLOOR_PREFIX = re.compile(rf"^({_FLOOR_WORDS})\s*\.?\s*(\d+)$", re.I)
_LEADING_CODE = re.compile(r"^(\d+[_ ]+)(.+)$")   # "0_Piano terra", "00 Begane grond"
# German storey codes, uppercase only (lowercase kg is kilograms): "KG", "EG", "OG1", "DG 2"
_DE_CODE = re.compile(r"^(KG|UG|EG|OG|DG)\s*(\d*)$")
_DE_CODES = {"KG": "Basement", "UG": "Basement", "EG": "Ground floor", "OG": "Upper floor", "DG": "Attic floor"}

# Words, lowercase. Also used as compound parts ("Geschossdecke" → "floor slab").
WORDS = {
    # German
    "wand": "wall", "wände": "walls", "basiswand": "basic wall", "innenwand": "interior wall", "außenwand": "exterior wall",
    "decke": "ceiling", "geschossdecke": "floor slab", "deckensystem": "ceiling system", "boden": "floor",
    "fußboden": "floor", "dach": "roof", "tür": "door", "türen": "doors", "fenster": "window", "treppe": "stair",
    "geländer": "railing", "gelaender": "railing", "stütze": "column", "pfosten": "mullion", "träger": "beam",
    "balken": "beam", "fundament": "foundation", "platte": "slab", "bodenplatte": "floor slab", "rohr": "pipe",
    "rohrtypen": "pipe types", "bogen": "elbow", "kupfer": "copper", "edelstahl": "stainless steel", "stück": "piece",
    "übergang": "transition", "rechteck": "rectangle", "rechteckig": "rectangular", "rechteckiger": "rectangular",
    "rund": "round", "flansch": "flange", "kanal": "duct", "kanalteilstutzen": "duct takeoff", "blech": "sheet metal",
    "gipskarton": "plasterboard", "heizkörper": "radiator", "ventil": "valve", "unten": "bottom", "oben": "top",
    "schlitzdurchlass": "slot diffuser", "abluft": "exhaust air", "zuluft": "supply air", "drehflügel": "casement",
    "systemelement": "system panel", "verglasung": "glazing", "markierung": "marking", "bekleidung": "cladding",
    "objekt": "object", "dämmung": "insulation", "außen": "exterior", "innen": "interior", "abmessungen": "dimensions",
    "abhängigkeiten": "constraints", "phasen": "phases", "sonstige": "other", "grafiken": "graphics", "daten": "data",
    "länge": "length", "fläche": "area", "breite": "width", "höhe": "height", "dicke": "thickness", "größe": "size",
    "gesamtmaß": "overall size", "versatz": "offset", "endversatz": "end offset", "startversatz": "start offset",
    "druckverlust": "pressure loss", "volumenstrom": "flow rate", "geschwindigkeit": "velocity", "zusätzlicher": "additional",
    "systemname": "system name", "systemklassifizierung": "system classification", "systemabkürzung": "system abbreviation",
    "abgehängte": "suspended", "die": "the", "material": "material", "beton": "concrete", "holz": "wood", "stahl": "steel",
    "ziegel": "brick", "glas": "glass", "raum": "room", "räume": "rooms", "küche": "kitchen", "wohnen": "living",
    "schlafen": "bedroom", "kind": "child", "kinderzimmer": "child's room", "schlafzimmer": "bedroom",
    "wohnzimmer": "living room", "badezimmer": "bathroom", "terrasse": "terrace", "balkon": "balcony",
    "garage": "garage", "geschoss": "floor", "zimmer": "room", "bad": "bathroom", "gang": "corridor", "flur": "hallway", "stb": "RC", "mit": "with", "ohne": "without", "und": "and", "neu": "new",
    "bestand": "existing", "abbruch": "demolition", "tragend": "load-bearing", "nichttragend": "non-load-bearing",
    "lüftung": "ventilation", "heizung": "heating", "sanitär": "plumbing", "elektro": "electrical",
    # German ArchiCAD / Revit property vocabulary
    "oberfläche": "surface", "oberflächenmaterial": "surface material", "schriftgröße": "font size", "schraffur": "hatch",
    "stift": "pen", "flügel": "sash", "türblatt": "door leaf", "setzstufe": "riser", "stufe": "step", "auftritt": "tread",
    "lauflinie": "walking line", "lauflinietyp": "walking line type", "bruchlinie": "break line", "bruch": "break",
    "bruchsymbol": "break symbol", "änderung": "change", "änderungen": "changes", "datum": "date", "winkel": "angle",
    "öffnungswinkel": "opening angle", "abzugsfläche": "deduction area", "gemessene": "measured", "nettofläche": "net area",
    "bruttofläche": "gross area", "dächer": "roofs", "geschützt": "protected", "nicht": "not", "verknüpft": "linked",
    "verknüpfte": "linked", "innenseite": "inside face", "außenseite": "outside face", "kante": "edge", "seite": "side",
    "einheitliche": "uniform", "gleiche": "same", "niveauhöhe": "level height", "steigungsverhältnis": "rise-run ratio",
    "einflügeltür": "single-leaf door", "doppeltür": "double door", "öffnungsrichtung": "opening direction", "eine": "one",
    "rückseite": "back", "waagrecht": "horizontal", "senkrecht": "vertical", "geteilt": "divided", "tlg": "part",
    "maßstabunabhängig": "scale-independent", "maßstababhängig": "scale-dependent", "geschoßabhängig": "storey-dependent",
    "geschossabhängig": "storey-dependent", "hintergrund": "background", "typ": "type", "linientyp": "line type",
    "ausfüllmuster": "fill pattern", "einzelfläche": "single area", "wandnischen": "wall niches", "hinten": "back",
    "umfassungswände": "enclosing walls", "zeigen": "show", "über": "above", "unter": "below", "bei": "at",
    "modifizierung": "modification", "einfache": "simple", "mittelmässige": "medium", "detaillierte": "detailed",
    "übernimmt": "takes", "loch": "hole", "der": "the", "wandseite": "wall side", "übernehme": "use",
    "projektpräferenzen": "project preferences", "äußerer": "outer", "innerer": "inner", "neigungswinkel": "slope angle",
    "neigung": "slope", "raumflächen": "room area", "für": "for", "oberkantenverknüpfung": "top link",
    "stufenlänge": "step length", "gesamt": "total", "trimm": "trim", "körper": "body", "punkt": "point",
    "einsetzgeschoß": "insertion storey", "linie": "line", "name": "name", "nummer": "number", "bezeichnung": "name",
    "beschreibung": "description", "hersteller": "manufacturer", "status": "status", "renovierung": "renovation",
    "brandschutz": "fire protection", "schallschutz": "sound insulation", "wärmedurchgangskoeffizient": "U-value",
    "tragendes": "load-bearing", "bauteil": "element", "außenbauteil": "exterior element", "volumen": "volume",
    "umfang": "perimeter", "gewicht": "weight", "anzahl": "count", "position": "position", "ebene": "layer",
    "vorlage": "template", "profil": "profile", "kern": "core", "schicht": "layer", "schichten": "layers",
    "waagrecht.": "horizontal", "rahmen": "frame", "sturz": "lintel", "brüstung": "sill", "laibung": "reveal",
    "zarge": "door frame", "griff": "handle", "beschlag": "hardware", "schwelle": "threshold", "glasfläche": "glass area",
    "oberkante": "top edge", "unterkante": "bottom edge", "rohbau": "structural", "fertig": "finished",
    "eingang": "entrance", "schiebe": "sliding", "teilig": "part", "zwei": "two", "drei": "three", "panele": "panels",
    "vertikal": "vertical", "leicht": "lightweight", "leichtbeton": "lightweight concrete", "pfette": "purlin",
    "sparren": "rafter", "dachfenster": "skylight", "kamin": "chimney", "estrich": "screed", "putz": "plaster",
    "mauerwerk": "masonry", "kalksandstein": "sand-lime brick", "stahlbeton": "reinforced concrete",
    # Spanish / Polish extras
    "información": "information", "proyecto": "project", "propuesta": "proposal", "solución": "solution",
    "básica": "basic", "cubierta": "roof", "de": "of", "del": "of the", "treppenhaus": "stairwell", "aufzug": "elevator", "płyta": "slab", "ściany": "walls",
    # Dutch
    "leidingen": "pipes", "leiding": "pipe", "zaaglijst": "cut list", "materiaallijst": "material list",
    "hulpstukken": "fittings", "sanitair": "sanitary", "riolering": "drainage", "binnenriolering": "indoor drainage",
    "drinkwater": "drinking water", "verwarmd": "heated", "tapwater": "tap water", "aanvoer": "supply", "retour": "return",
    "lengte": "length", "breedte": "width", "hoogte": "height", "afmeting": "size", "omschrijving": "description",
    "artikelnummer": "article number", "leveringsprogramma": "product range", "fabrikant": "manufacturer",
    "groothandel": "wholesaler", "systeemtype": "system type", "systeemnaam": "system name", "binnendiameter": "inner diameter",
    "productcodelijst": "product code list", "vermogenscodelijst": "power code list", "fase": "phase", "nivo": "level",
    "verf": "paint", "wit": "white", "achtergrond": "background", "arcering": "hatch", "lege": "empty",
    "arceringspen": "hatch pen", "algemeen": "general", "standaardpen": "default pen", "hout": "wood", "vuren": "spruce",
    "hor": "horiz", "nerf": "grain", "metaal": "metal", "roestvrijstaal": "stainless steel", "ijzer": "iron",
    "isolatie": "insulation", "geel": "yellow", "niet": "not", "wijzigen": "change", "toepassing": "applicable",
    "van": "of", "binnenwanden": "interior walls", "inbouw": "recessed", "met": "with", "meetnippels": "test points",
    "mantelbuis": "conduit sleeve", "bocht": "bend", "buis": "pipe", "wand": "wall",
    "verdieping": "floor", "trap": "stair", "deur": "door", "raam": "window", "kozijn": "frame", "vloer": "floor",
    "dak": "roof", "kolom": "column", "balk": "beam", "ruimte": "space", "keuken": "kitchen", "badkamer": "bathroom",
    "slaapkamer": "bedroom", "woonkamer": "living room", "berging": "storage", "hal": "hall",
    # Danish / Swedish / Norwegian
    "maling": "paint", "hvid": "white", "baggrund": "background", "træ": "wood", "fyr": "pine", "vandret": "horizontal",
    "rustfri": "stainless", "stål": "steel", "gipsplade": "plasterboard", "isolering": "insulation",
    "mineraluld": "mineral wool", "blød": "soft", "væg": "wall", "dør": "door", "vindue": "window", "trappe": "stair",
    "gulv": "floor", "loft": "ceiling", "søjle": "column", "bjælke": "beam", "rum": "room", "køkken": "kitchen",
    "badeværelse": "bathroom", "soveværelse": "bedroom", "stue": "living room", "vägg": "wall",
    "dörr": "door", "fönster": "window", "trapp": "stair", "golv": "floor", "tak": "roof", "rör": "pipe",
    # Estonian / Finnish
    "korrus": "floor", "sein": "wall", "uks": "door", "aken": "window", "trepp": "stair", "põrand": "floor",
    "lagi": "ceiling", "katus": "roof", "post": "column", "tala": "beam", "plaat": "slab", "päikesepaneel": "solar panel",
    "ruum": "room", "koridor": "corridor", "köök": "kitchen", "vannituba": "bathroom", "magamistuba": "bedroom",
    "elutuba": "living room", "esik": "hall", "panipaik": "storage", "tehnoruum": "technical room", "trepikoda": "stairwell",
    "kontor": "office", "saal": "hall", "fuajee": "foyer", "riietusruum": "changing room", "dušš": "shower",
    "kandev": "load-bearing", "mittekandev": "non-load-bearing", "sisesein": "interior wall", "välissein": "exterior wall",
    "vahesein": "partition wall", "geneeriline": "generic", "konstruktsioon": "structure", "konstruktrioon": "structure",
    "kostruktsioon": "structure", "kipsplaat": "plasterboard", "veekindel": "waterproof", "parapetiplekk": "parapet flashing",
    "plekk": "flashing", "raudbetoon": "reinforced concrete", "betoon": "concrete", "tulepüsiv": "fire-resistant",
    "pinnasel": "on ground", "vahelagi": "floor slab", "sisetrepp": "interior stair", "välistrepp": "exterior stair",
    "katusel": "on roof", "sise": "interior", "välis": "exterior", "puit": "timber", "teras": "steel", "klaas": "glass",
    "seinä": "wall", "ovi": "door", "ikkuna": "window", "porras": "stair", "portaat": "stairs", "lattia": "floor",
    "pilari": "column", "palkki": "beam", "laatta": "slab", "huone": "room", "keittiö": "kitchen",
    "kylpyhuone": "bathroom", "makuuhuone": "bedroom", "olohuone": "living room", "eteinen": "hall", "sauna": "sauna",
    "parveke": "balcony", "varasto": "storage", "kerros": "floor",
    # Italian / Spanish / French / Polish / Romanian
    "muro": "wall", "básico": "basic", "parete": "wall", "porta": "door", "finestra": "window", "scala": "stair",
    "solaio": "slab", "pilastro": "column", "trave": "beam", "tetto": "roof", "piano": "floor", "puerta": "door",
    "ventana": "window", "escalera": "stair", "losa": "slab", "pilar": "column", "viga": "beam", "techo": "ceiling",
    "suelo": "floor", "hormigón": "concrete", "tubería": "pipe", "tuberías": "pipes", "tubo": "pipe", "tipos": "types",
    "uniones": "joints", "con": "with", "codo": "elbow", "montante": "mullion", "rectangular": "rectangular",
    "mur": "wall", "porte": "door", "fenêtre": "window", "escalier": "stair", "dalle": "slab", "poteau": "column",
    "poutre": "beam", "plancher": "floor", "ściana": "wall", "drzwi": "door", "okno": "window", "schody": "stairs",
    "strop": "slab", "słup": "column", "belka": "beam", "perete": "wall", "ușă": "door", "fereastră": "window",
    "scară": "stair", "planșeu": "slab", "stâlp": "column", "grindă": "beam", "nivel": "level", "etaj": "floor",
}
# Real English words too: only translated when the whole string is that word or another foreign word is next to it.
_AMBIGUOUS = {"die", "kind", "post", "hal", "van", "met", "mit", "con", "hor", "plan", "rum", "stue", "fase", "tak",
              "trap", "rund", "material", "garage", "sauna", "rectangular", "loft", "mur", "bad", "gang", "de", "del", "porta", "piano", "scala",
              "tala", "kontor", "saal", "nivel", "trave", "uit", "aan"}

_TOKEN = re.compile(r"[^\W\d_²³¹]+", re.U)   # \w counts superscript digits (m²) as letters
_CACHE_FILE = Path(os.environ.get("SITELENS_STORE") or Path(__file__).resolve().parent.parent / ".sitelens" / "measure").parent / "translate.json"
_lock = threading.Lock()
_cache: dict[str, str] | None = None
_failed: set[str] = set()   # Gemini misses this process: don't retry on every request


def _load() -> dict[str, str]:
    global _cache
    if _cache is None:
        try:
            _cache = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _cache = {}
    return _cache


def _save() -> None:
    try:
        _CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        gi = _CACHE_FILE.parent / ".gitignore"
        if _CACHE_FILE.parent.name == ".sitelens" and not gi.exists():
            gi.write_text("*\n")
        _CACHE_FILE.write_text(json.dumps(_cache, ensure_ascii=False, indent=0), encoding="utf-8")
    except OSError:
        pass


def _case(src: str, dst: str) -> str:
    if src.isupper() and len(src) > 1:
        return dst.upper()
    if src[:1].isupper():
        return dst[:1].upper() + dst[1:]
    return dst


def _compound(w: str) -> str | None:
    """German / Dutch / Danish compounds: two known parts ("Geschoss"+"decke")."""
    for i in range(len(w) - 3, 2, -1):
        a, b = w[:i], w[i:]
        for head in (a, a[:-1] if a.endswith(("s", "e", "n")) else None):
            if head and len(head) >= 3 and head in WORDS and b in WORDS and b not in _AMBIGUOUS:
                return f"{WORDS[head]} {WORDS[b]}"
    return None


def _word(w: str) -> str | None:
    lw = w.lower()
    return WORDS.get(lw) or (_compound(lw) if len(lw) >= 7 else None)


def _floor(s: str) -> str | None:
    t = s.strip()
    m = _FLOOR_SUFFIX.match(t) or _FLOOR_PREFIX.match(t)
    if not m:
        return None
    n = m.group(1) if m.group(1).isdigit() else m.group(2)
    word = (m.group(2) if m.group(1).isdigit() else m.group(1)).lower()
    if word == "level" and not t[0].isdigit():
        return None   # "Level 1" is English already
    if word in ("og", "obergeschoss"):
        return f"Upper floor {n}"
    return f"Floor {n}"


def dictionary(s: str) -> str:
    """Offline pass. Unknown words stay as they are."""
    t = s.strip()
    if not t:
        return s
    if m := _DE_CODE.match(t):
        return f"{_DE_CODES[m.group(1)]} {m.group(2)}".strip()
    if (p := PHRASES.get(t.lower())) is not None:
        return p
    if (f := _floor(t)) is not None:
        return f
    if (m := _LEADING_CODE.match(t)) and ((p := PHRASES.get(m.group(2).lower())) or (p := _floor(m.group(2)))):
        return m.group(1) + p
    hits = [(m, _word(m.group())) for m in _TOKEN.finditer(s)]
    sure = any(tr and m.group().lower() not in _AMBIGUOUS for m, tr in hits)
    out, last = [], 0
    for m, tr in hits:
        if tr and (sure or m.group().lower() not in _AMBIGUOUS):
            out += [s[last:m.start()], _case(m.group(), tr)]
            last = m.end()
    return "".join(out) + s[last:] if out else s


def _needs_model(s: str) -> bool:
    """Worth a Gemini call: has real words. Codes, numbers and plain ASCII English-looking ids are skipped."""
    words = _TOKEN.findall(s)
    if not words:
        return False
    if any(ord(c) > 127 for w in words for c in w):   # letters only: our own ·, ², × don't count
        return True
    return any(len(w) >= 4 and w.lower() not in _ENGLISH_HINT for w in words)


# Common English words in IFC/Revit/ArchiCAD data: a string made only of these needs no model call.
_ENGLISH_HINT = set("""
wall walls door doors window windows floor floors roof stair stairs column columns beam beams slab slabs level levels
basic generic standard default type types family category system name number area length width height volume depth
thickness size material materials concrete steel wood glass brick insulation interior exterior internal external
room rooms space spaces kitchen bathroom bedroom living hall hallway corridor foyer utility storage office toilet
pipe pipes duct ducts elbow fitting fittings round rectangular transition flex single double sliding fixed mullion
panel panels curtain railing handrail baluster post footing foundation ceiling ceilings opening openings plumbing
electrical mechanical lighting light fixture fixtures receptacle switch outlet socket valve meter tank sink basin
shower bathtub counter cabinet furniture parking ground first second third fourth upper lower basement attic top
bottom main north south east west left right inside outside face surface load bearing structural non element
elements object proxy assembly code description mark comments phase created demolished existing new renovation
status identity data dimensions constraints graphics other text unique external reference classification layer
position function home story building project site zone related linked locked show filter master parent hotlink
property properties manufacturer model article product range circular square flange takeoff diffuser supply return
exhaust air water drinking heated cold hot drainage sanitary waste vent heating cooling ventilation ventilated
radiator boiler pump fan grille register terminal frame glazed glazing sill lintel jamb leaf swing awning casement
""".split())


def _gemini(batch: list[str]) -> dict[str, str]:
    from .pipeline import _gemini as call
    prompt = ("Translate each string to English. These are names from building drawings and BIM models (rooms, "
              "storeys, element types, materials, property names). Keep codes, numbers, units and brand names. "
              "If a string is already English, return it unchanged. Answer JSON: {\"t\": [one string per input, same order]}.\n"
              + json.dumps(batch, ensure_ascii=False))
    out, _, _ = call(prompt, json_mode=True, timeout=25)
    got = out.get("t") if isinstance(out, dict) else None
    if not isinstance(got, list) or len(got) != len(batch):
        return {}
    return {s: str(g) for s, g in zip(batch, got) if isinstance(g, (str, int, float)) and str(g).strip()}


def _model_on() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY")) and os.environ.get("SITELENS_TRANSLATE", "auto") != "dict"


def sheet_title(slug: str) -> str:
    """Sheet file name part: '4-korrus' / 'og1' / 'piano-terra' → 'Floor 4' / 'Upper floor 1' / 'Ground floor'."""
    t = slug.replace("-", " ").strip()
    if re.fullmatch(r"(?:[a-z]{1,2}\d+|[a-z]{2,3})(?: [a-z]{1,4})?", t):
        t = t.upper()   # codes: "og1", "p0", "b01 okrd"
    out = dictionary(t)
    return out[:1].upper() + out[1:]


def english_many(texts: list[str], model: bool = True) -> list[str]:
    """Same order, same length. Strings already English come back unchanged. model=False: dictionary only."""
    cache = _load()
    with _lock:
        out = {s: cache[s] if s in cache else dictionary(s) for s in set(texts)}
    if model and _model_on():
        # The model gets the original string: the dictionary pass may have left a half-translated mix.
        todo = [s for s in out if s not in cache and s not in _failed and _needs_model(dictionary(s))][:400]
        for i in range(0, len(todo), 100):
            batch = todo[i:i + 100]
            try:
                got = _gemini(batch)
            except Exception:
                got = {}
            with _lock:
                for s in batch:
                    if s in got:
                        cache[s] = out[s] = got[s]
                    else:
                        _failed.add(s)
        if todo:
            with _lock:
                _save()
    return [out[s] for s in texts]


def english(text: str, model: bool = True) -> str:
    return english_many([text], model)[0]


# Keys whose string values are ids, paths or codes the UI matches on: never translated.
_KEEP = {"file", "path", "view", "ifc_guid", "guid", "url", "kind", "method", "unit", "tier", "source", "source_path",
         "id", "question", "standalone", "project", "model", "change", "backend", "current", "latest", "expected",
         "check", "followup", "clarify", "t", "n"}
# Short names that repeat across a model (types, storeys): the only strings worth a model call, once each, cached.
# Everything else (labels, traces, table cells) is per element or our own sentence: dictionary only, never a call.
_NAMES = {"type", "category", "size", "levels", "by_level", "name", "level", "title", "columns"}


_QUOTED = re.compile(r"'([^']+)'")


def sentence(text: str) -> str:
    """Quoted names keep the original next to the English, so it still matches the drawing: 'Zimmer' (room)."""
    def gloss(m: re.Match) -> str:
        en = _load().get(m.group(1)) or dictionary(m.group(1))   # a name the model translated before
        if en == m.group(1):
            return m.group(0)
        return f"{m.group(0)} ({en[:1].lower() + en[1:] if en[1:2].islower() else en})"
    parts = _QUOTED.split(text)   # odd items are the quoted names
    return "".join(gloss(_QUOTED.match(f"'{p}'")) if i % 2 else dictionary(p) for i, p in enumerate(parts))


def _value(s: str) -> str:
    """A text answer keeps the original next to the English, so it still reads against Stoa's key."""
    en = dictionary(s)
    return s if en == s else f"{s} · {en}"


def _walk(obj, key: str | None, found: list[str], put):
    if isinstance(obj, str):
        if key in _KEEP:
            return obj
        if key in _NAMES:
            found.append(obj)
            return put[obj] if put is not None else obj
        if put is None:
            return obj
        return _value(obj) if key == "value" else sentence(obj)
    if isinstance(obj, list):
        return [_walk(v, key, found, put) for v in obj]
    if isinstance(obj, dict):
        res = {}
        for k, v in obj.items():
            if k in _KEEP:
                res[k] = v
                continue
            # by_level is {storey name: count}: its keys are display text that matches `levels`
            nk = (put[k] if put is not None else (found.append(k) or k)) if key == "by_level" else k
            v = _walk(v, k, found, put)
            # two storeys can share an English name (Keller, Kellergeschoss → Basement): add their counts
            res[nk] = res[nk] + v if nk in res and isinstance(v, (int, float)) else v
        return res
    return obj


def english_obj(obj, model: bool = True):
    """Translate every display string in a JSON-like object (answer, takeoff, step). Ids, paths, codes kept."""
    found: list[str] = []
    _walk(obj, None, found, None)
    uniq = list(dict.fromkeys(found))
    return _walk(obj, None, [], dict(zip(uniq, english_many(uniq, model))))

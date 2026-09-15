"""Fraud lexicon, amount extraction, and disfluency markers.

See docs/ENGINE.md Sections 4.3, 4.4, 3.3. Everything here is deliberately
deterministic and inspectable: when the product tells a victim "this is a scam", we
must be able to point at the exact words that triggered it.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# Category weights. Higher means more diagnostic of fraud on its own.
CATEGORY_WEIGHTS: dict[str, float] = {
    "credentials": 1.00,
    "coercion": 0.95,
    "secrecy": 0.80,
    "urgency": 0.70,
    "money": 0.65,
    "authority": 0.60,
}

# Diagnostic phrases only. Isolated words like otp / kyc / transfer / send / money
# are ordinary in genuine speech, so they never fire a category on their own — see
# detect_intents() and AMBIGUOUS_UNIGRAMS.
CATEGORY_TERMS: dict[str, list[str]] = {
    "credentials": [
        "cvv", "upi pin", "mpin", "net banking", "netbanking", "cvv number",
        "card number", "expiry date", "otp batao", "otp bhejo", "password batao",
    ],
    "coercion": [
        "kill", "killed", "kidnap", "kidnapped", "kidnapping", "kid napped", "hostage",
        "police", "ransom", "harm her", "harm him", "harm your",
        "arrest", "arrested", "warrant", "court case", "fir", "jail", "custody",
        "digital arrest", "cyber crime case", "non bailable", "raid",
        "giraftar", "girftar", "police case", "jaan se", "maar dunga", "jaan ka khatra",
        "पुलिस", "गिरफ्तार", "अपहरण",
        # Multi-word ransom / extortion — weak single words like "daughter" alone are
        # not listed; SilverGuard still needs this layer to unlock the voice-call header.
        "has been kidnapped", "been kidnapped", "we have her", "we have him",
        "we have your", "her safety depends", "his safety depends",
        "do exactly what i tell", "do exactly what i say",
        "we know where you live", "we know where your",
        "don't try to be clever", "dont try to be clever", "do not try to be clever",
        "don't try to trace", "dont try to trace", "do not try to trace",
        "trace this call",
        # Courier / customs hold is a top Indian SMS scam archetype.
        "customs", "parcel atka", "parcel hold", "contraband", "customs duty",
    ],
    "secrecy": [
        "don't tell", "dont tell", "do not tell", "tell no one", "keep this between us",
        "keep it secret", "don't tell anyone", "dont tell anyone", "don't disconnect",
        "dont disconnect", "do not disconnect", "stay on the line", "don't hang up",
        "dont hang up", "do not tell the police", "don't tell the police",
        "dont tell the police", "don't call the police", "dont call the police",
        "do not call the police",
        "kisi ko mat batana", "kisi ko na batao", "phone mat rakho",
        "mat batana", "किसी को मत बताना",
    ],
    "urgency": [
        # Everyday English ("quickly", "hurry") is too common in normal stories.
        # Prefer scam-shaped urgency: deadlines, warnings, act-now CTAs, Hinglish jaldi.
        "right now", "immediately", "urgent", "urgently", "emergency", "last warning",
        "final warning", "within 10 minutes", "within 5 minutes", "before it's too late",
        "please act now", "act now", "click to proceed", "click here",
        "abhi", "abhi bhejo", "jaldi", "jaldi kare", "jaldi karo", "turant", "foran",
        "अभी", "जल्दी", "तुरंत",
    ],
    "money": [
        "transfer money", "send money", "pay now", "account number", "ifsc",
        "gpay", "google pay", "phonepe", "phone pe", "paytm", "upi", "bank transfer",
        "neft", "imps", "rtgs", "processing fee", "paise bhejo", "paise chahiye",
        "instant loan", "loan approval", "pre-approved", "customs duty",
        "release fee", "pay karke", "get the money", "money together",
        "how to transfer",
    ],
    "authority": [
        "cbi", "income tax", "customs", "rbi", "reserve bank", "trai", "epfo",
        "bank manager", "cyber cell", "cyber crime branch", "enforcement directorate",
        "narcotics", "courier company", "fedex", "police station", "government officer",
        "account freeze", "account blocked", "atm card block", "card block",
        "सीबीआई", "आरबीआई", "आयकर",
    ],
}

DISFLUENCY_MARKERS: list[str] = [
    # English
    "um", "umm", "ummm", "uh", "uhh", "uhhh", "er", "err", "erm",
    "ah", "ahh", "hmm", "hm", "hmmm", "mmm", "mhm",
    "you know", "i mean", "sort of", "kind of",
    # Hindi / Hinglish
    "matlab", "haan", "haa", "achha", "acha", "arre", "arey", "woh", "wo",
    "yaani", "kya bolun", "toh", "bas",
]

SCALE_MULTIPLIERS: dict[str, float] = {
    "thousand": 1e3,
    "k": 1e3,
    "hazaar": 1e3,
    "hazar": 1e3,
    "hajar": 1e3,
    "lakh": 1e5,
    "lac": 1e5,
    "lakhs": 1e5,
    "crore": 1e7,
    "crores": 1e7,
    "million": 1e6,
}

_SCALE_ALTERNATION = "|".join(sorted(SCALE_MULTIPLIERS, key=len, reverse=True))

# "50 hazaar", "2.5 lakh", "1 crore"
_SCALED_AMOUNT = re.compile(
    rf"(\d+(?:[.,]\d+)?)\s*(?:rupees?|rs\.?|inr)?\s*({_SCALE_ALTERNATION})\b",
    re.IGNORECASE,
)
# "₹10,000", "rs 10000", "10000 rupees"
_PLAIN_AMOUNT = re.compile(
    r"(?:₹|rs\.?|inr)\s*(\d[\d,]{2,})|(\d[\d,]{3,})\s*(?:rupees?|rs\b|inr)",
    re.IGNORECASE,
)
# Bare large numbers, e.g. "send 50000"
_BARE_AMOUNT = re.compile(r"\b(\d{4,9})\b")

AMOUNT_BANDS: list[tuple[float, float]] = [
    (5_000.0, 0.20),
    (50_000.0, 0.50),
    (500_000.0, 0.80),
    (float("inf"), 1.00),
]


@dataclass
class MatchedTerm:
    category: str
    term: str


@dataclass(frozen=True)
class IntentHit:
    """A scam-shaped ask, not a lone keyword."""

    id: str
    category: str
    label: str


@dataclass
class LexiconHit:
    score: float
    categories: list[str]
    terms: list[MatchedTerm]
    intents: list[IntentHit] = field(default_factory=list)


@dataclass
class AmountHit:
    score: float | None
    amount_inr: float | None
    raw: str | None


def normalize(text: str) -> str:
    """Lowercase, strip accents from Latin text, and collapse punctuation.

    Devanagari is left intact; NFKC keeps it usable while normalising Latin forms.
    """
    if not text:
        return ""
    folded = unicodedata.normalize("NFKC", text).lower()
    folded = re.sub(r"[^\w\s\u0900-\u097F₹.,]", " ", folded)
    return re.sub(r"\s+", " ", folded).strip()


def _contains_term(haystack: str, term: str) -> bool:
    pattern = r"(?<!\w)" + re.escape(term) + r"(?!\w)"
    return re.search(pattern, haystack) is not None


# Window in characters (~8–12 words). Intent is a nearby ask, not the whole transcript.
_INTENT_SPAN = 56

# These words appear in genuine speech. They must never raise a category unless an
# intent frame (solicit a secret, coerce a payment, KYC-as-freeze) also matches.
AMBIGUOUS_UNIGRAMS = frozenset(
    {
        "otp",
        "o t p",
        "kyc",
        "pin",
        "password",
        "passcode",
        "aadhaar",
        "aadhar",
        "pan card",
        "verification code",
        "one time password",
        "pin number",
        "credit card",
        "debit card",
        "money",
        "transfer",
        "send",
        "send me",
        "payment",
        "deposit",
        "refund",
        "loan",
        "fees",
        "fine",
        "penalty",
        "wire",
        "bhej",
        "bhejo",
        "bhej do",
        "bhej dena",
        "transfer karo",
        "paisa",
        "paise",
        "rupaye",
        "rupees",
        "ओटीपी",
        "पासवर्ड",
        "आधार",
        "पैसा",
        "पैसे",
        "रुपये",
    }
)

_SECRET_NOUNS = [
    "otp",
    "o t p",
    "one time password",
    "verification code",
    "pin",
    "cvv",
    "password",
    "passcode",
    "aadhaar",
    "aadhar",
    "card number",
    "credit card",
    "ओटीपी",
    "पासवर्ड",
    "आधार",
]
_SOLICIT_VERBS = [
    "share",
    "give me",
    "give us",
    "tell me",
    "tell us",
    "read out",
    "confirm your",
    "confirm the",
    "batao",
    "bataiye",
    "bol do",
    "send me",
    "mujhe",
    "bhejo",
]
_HARVEST_RE = re.compile(
    r"\b(?:send|share|give|forward|bhej(?:o| do)?)\s+"
    r"(?:me |us |your |the )?"
    r"(?:otp|pin|cvv|password|passcode|aadhaar|aadhar|card number|"
    r"verification code|one time password|credit card)\b"
)
_PROTECT_SECRET_RE = re.compile(
    r"\b(?:do not|don't|dont|never)\s+(?:share|give|tell)\b|"
    r"\bkisi ko mat (?:dena|batana)\b"
)
_FIRST_PERSON_RE = re.compile(r"\b(?:with me|to me|to us|mujhe|mujhko|hamen|hamein|mere ko)\b")

_TRANSFER_VERBS = [
    "transfer",
    "transfer karo",
    "send",
    "send me",
    "bhej",
    "bhejo",
    "bhej do",
    "bhej dena",
]
_MONEY_CUES = [
    "money",
    "paisa",
    "paise",
    "rupees",
    "rupaye",
    "upi",
    "gpay",
    "google pay",
    "phonepe",
    "paytm",
    "account number",
    "bank account",
    "my account",
    "this account",
    "ifsc",
    "lakh",
    "lac",
    "hazaar",
    "hazar",
    "hajar",
    "crore",
    "payment",
    "refund",
    "fees",
    "fine",
    "bank",
    "पैसा",
    "पैसे",
    "रुपये",
]
_BENIGN_TRANSFER_OBJECTS = [
    "order",
    "orders",
    "notes",
    "note",
    "file",
    "files",
    "document",
    "documents",
    "meeting",
    "call",
    "shift",
    "ticket",
    "data",
    "chat",
    "message",
    "ownership",
    "report",
    "ppt",
    "deck",
    "email",
    "invite",
    "invitation",
    "photo",
    "photos",
]
_KYC_THREAT_CUES = [
    "pending",
    "freeze",
    "frozen",
    "block",
    "blocked",
    "expire",
    "expired",
    "update",
    "immediately",
    "fail",
    "failed",
]
_KYC_DONE_CUES = ["done", "completed", "verified", "already"]
_CARD_HARVEST_CUES = ["cvv", "expiry", "otp", "pin", "share", "batao", "number"]
_CARD_BENIGN_CUES = ["statement", "bill", "offer", "reward", "points", "due"]
_ENTERTAINMENT_SERVICES = [
    "hotstar",
    "jiohotstar",
    "jio cinema",
    "jiocinema",
    "netflix",
    "prime video",
    "amazon prime",
    "disney",
    "disney plus",
    "zee5",
    "sonyliv",
    "sony liv",
    "spotify",
    "youtube premium",
    "apple tv",
    "aha",
    "voot",
    "mx player",
]
_FINANCIAL_OTP_CUES = [
    "bank",
    "upi",
    "kyc",
    "credit card",
    "debit card",
    "cvv",
    "net banking",
    "netbanking",
    "ifsc",
    "aadhaar",
    "aadhar",
    "wallet",
    "paytm",
    "gpay",
    "phonepe",
    "warrant",
    "cbi",
    "freeze",
    "income tax",
    "cyber cell",
    "account number",
]


def _term_spans(normalized: str, term: str) -> list[tuple[int, int]]:
    folded = normalize(term)
    if not folded:
        return []
    pattern = r"(?<!\w)" + re.escape(folded) + r"(?!\w)"
    return [(m.start(), m.end()) for m in re.finditer(pattern, normalized)]


def _near(normalized: str, anchors: list[str], cues: list[str], span: int = _INTENT_SPAN) -> bool:
    for anchor in anchors:
        for start, end in _term_spans(normalized, anchor):
            window = normalized[max(0, start - span) : end + span]
            for cue in cues:
                if _contains_term(window, normalize(cue)):
                    return True
    return False


def _amount_in_window(window: str) -> bool:
    return _SCALED_AMOUNT.search(window) is not None or _PLAIN_AMOUNT.search(window) is not None


def _solicit_secret(normalized: str) -> bool:
    asked = _HARVEST_RE.search(normalized) is not None or _near(
        normalized, _SOLICIT_VERBS, _SECRET_NOUNS
    )
    if not asked:
        return False
    # Bank/OTP SMS: "Your OTP is 123456. Do not share it with anyone."
    if _PROTECT_SECRET_RE.search(normalized) and not _FIRST_PERSON_RE.search(normalized):
        return False
    return True


def _coerce_payment(normalized: str) -> bool:
    if _near(normalized, _TRANSFER_VERBS, _MONEY_CUES):
        return True
    for verb in _TRANSFER_VERBS:
        for start, end in _term_spans(normalized, verb):
            window = normalized[max(0, start - _INTENT_SPAN) : end + _INTENT_SPAN]
            if _amount_in_window(window):
                return True
    return False


def _benign_transfer(normalized: str) -> bool:
    """'Transfer the notes/order' is not a funds request unless money is also nearby."""
    if not _near(normalized, _TRANSFER_VERBS, _BENIGN_TRANSFER_OBJECTS):
        return False
    if _near(normalized, _TRANSFER_VERBS, _MONEY_CUES):
        return False
    for verb in _TRANSFER_VERBS:
        for start, end in _term_spans(normalized, verb):
            window = normalized[max(0, start - _INTENT_SPAN) : end + _INTENT_SPAN]
            if _amount_in_window(window):
                return False
    return True


def _kyc_threat(normalized: str) -> bool:
    if not _contains_term(normalized, "kyc"):
        return False
    if _near(normalized, ["kyc"], _KYC_DONE_CUES) and not _near(
        normalized, ["kyc"], _KYC_THREAT_CUES
    ):
        return False
    return _near(normalized, ["kyc"], _KYC_THREAT_CUES)


def _card_harvest(normalized: str) -> bool:
    cards = ["credit card", "debit card"]
    if not any(_contains_term(normalized, name) for name in cards):
        return False
    if _near(normalized, cards, _CARD_BENIGN_CUES) and not _near(
        normalized, cards, _CARD_HARVEST_CUES
    ):
        return False
    return _near(normalized, cards, _CARD_HARVEST_CUES)


def _entertainment_service(normalized: str) -> bool:
    return any(_contains_term(normalized, name) for name in _ENTERTAINMENT_SERVICES) or (
        _contains_term(normalized, "prime")
        and (_contains_term(normalized, "otp") or _contains_term(normalized, "login"))
    )


def _financial_secret_frame(normalized: str) -> bool:
    return any(_contains_term(normalized, cue) for cue in _FINANCIAL_OTP_CUES)


def detect_intents(text: str) -> list[IntentHit]:
    """Map a transcript to scam-shaped asks rather than keyword presence."""
    normalized = normalize(text)
    if not normalized:
        return []

    hits: list[IntentHit] = []
    if _solicit_secret(normalized):
        # Family: "send me the Hotstar OTP" is the same ask as a bank harvest.
        # Words cannot prove where the OTP will be used — only the service named
        # in this turn, plus Stage 1 (clone / voiceprint) on the live path.
        if (
            _entertainment_service(normalized)
            and not _financial_secret_frame(normalized)
            and not _kyc_threat(normalized)
        ):
            hits.append(
                IntentHit(
                    "entertainment_otp",
                    "context",
                    "asked for an entertainment login OTP (Hotstar/Prime/Netflix)",
                )
            )
        else:
            hits.append(
                IntentHit(
                    "solicit_secret",
                    "credentials",
                    "asked them to disclose a secret (OTP, PIN, password, or KYC)",
                )
            )
    if _kyc_threat(normalized):
        hits.append(
            IntentHit(
                "kyc_freeze_threat",
                "credentials",
                "used KYC as an account-freeze threat",
            )
        )
    if _card_harvest(normalized):
        hits.append(
            IntentHit(
                "card_harvest",
                "credentials",
                "asked for card number or CVV",
            )
        )
    if _coerce_payment(normalized) and not _benign_transfer(normalized):
        hits.append(
            IntentHit(
                "coerce_payment",
                "money",
                "asked them to move money, not notes or an order",
            )
        )
    return hits


def score_lexicon(text: str, single_category_multiplier: float = 0.55) -> LexiconHit:
    """Weighted category scoring driven by diagnostic phrases and intent frames.

    A category counts once no matter how many of its terms appear, so repetition
    cannot inflate the score. Ambiguous unigrams (otp, kyc, transfer, send, money)
    never count unless detect_intents() finds a matching ask. A single category is
    still discounted because one real ask can be ordinary; it takes a combination to
    make a scam.
    """
    normalized = normalize(text)
    if not normalized:
        return LexiconHit(0.0, [], [])

    intents = detect_intents(text)
    hit_categories: list[str] = []
    matched: list[MatchedTerm] = []

    for category, terms in CATEGORY_TERMS.items():
        found: list[str] = []
        for term in terms:
            folded = normalize(term)
            if folded in AMBIGUOUS_UNIGRAMS:
                continue
            if _contains_term(normalized, folded):
                found.append(term)
        if found:
            hit_categories.append(category)
            # Keep the longest matches; they are the most specific and read best in the UI.
            for term in sorted(found, key=len, reverse=True)[:3]:
                matched.append(MatchedTerm(category, term))

    for intent in intents:
        if intent.category in CATEGORY_WEIGHTS and intent.category not in hit_categories:
            hit_categories.append(intent.category)
        # Intent labels are what a host should read aloud — not the bare keyword.
        if not any(term.term == intent.label for term in matched):
            matched.append(MatchedTerm(intent.category, intent.label))

    if not hit_categories:
        return LexiconHit(0.0, [], [], intents)

    # Saturate around two heavy categories (credentials + coercion ≈ 1.95) or three
    # mid-weight ones (secrecy + urgency + money = 2.15). Dividing by the sum of every
    # category weight instead made even a four-category hit top out around 0.73, so the
    # lexicon could never clear the high fraud band without the SMS classifier — and
    # that classifier goes quiet on Hinglish speech transcripts with no DLT header.
    saturation = 2.15
    raw = sum(CATEGORY_WEIGHTS.get(c, 0.0) for c in hit_categories) / saturation
    if len(hit_categories) == 1:
        raw *= single_category_multiplier
    return LexiconHit(min(1.0, raw), hit_categories, matched, intents)


def _to_number(raw: str) -> float | None:
    cleaned = raw.replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_amount(text: str) -> AmountHit:
    """Find the largest monetary amount mentioned, in rupees."""
    normalized = normalize(text)
    if not normalized:
        return AmountHit(None, None, None)

    best_amount: float | None = None
    best_raw: str | None = None

    def consider(amount: float | None, raw: str) -> None:
        nonlocal best_amount, best_raw
        if amount is None or amount <= 0:
            return
        if best_amount is None or amount > best_amount:
            best_amount = amount
            best_raw = raw.strip()

    for match in _SCALED_AMOUNT.finditer(normalized):
        base = _to_number(match.group(1))
        multiplier = SCALE_MULTIPLIERS.get(match.group(2).lower())
        if base is not None and multiplier:
            consider(base * multiplier, match.group(0))

    for match in _PLAIN_AMOUNT.finditer(normalized):
        raw_value = match.group(1) or match.group(2)
        consider(_to_number(raw_value or ""), match.group(0))

    if best_amount is None:
        credential_context = bool(
            re.search(r"\b(otp|o t p|password|passcode|pin|verification code)\b", normalized)
        )
        for match in _BARE_AMOUNT.finditer(normalized):
            raw_digits = match.group(1)
            value = _to_number(raw_digits)
            # Bare 4–6 digit runs next to OTP/PIN language are codes, not rupees.
            # "Your OTP is 456789" must not become a ₹4.5 lakh request.
            if (
                value is not None
                and value >= 10_000
                and not (credential_context and len(raw_digits) <= 6)
            ):
                consider(value, match.group(0))

    if best_amount is None:
        return AmountHit(None, None, None)

    score = AMOUNT_BANDS[-1][1]
    for ceiling, band_score in AMOUNT_BANDS:
        if best_amount < ceiling:
            score = band_score
            break
    return AmountHit(score, best_amount, best_raw)


def count_disfluencies(text: str) -> tuple[int, int]:
    """Return (marker_count, word_count) over the normalized transcript."""
    normalized = normalize(text)
    if not normalized:
        return 0, 0
    words = [w for w in re.split(r"\s+", normalized) if w]
    count = 0
    for marker in DISFLUENCY_MARKERS:
        normalized_marker = normalize(marker)
        if not normalized_marker:
            continue
        pattern = r"(?<!\w)" + re.escape(normalized_marker) + r"(?!\w)"
        count += len(re.findall(pattern, normalized))
    return count, len(words)


def format_inr(amount: float) -> str:
    """Format rupees the way an Indian reader expects."""
    if amount >= 1e7:
        return f"₹{amount / 1e7:.2f} crore".replace(".00", "")
    if amount >= 1e5:
        return f"₹{amount / 1e5:.2f} lakh".replace(".00", "")
    return f"₹{int(round(amount)):,}"

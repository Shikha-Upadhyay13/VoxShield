"""Fraud lexicon, amount extraction, and disfluency markers.

See docs/ENGINE.md Sections 4.3, 4.4, 3.3. Everything here is deliberately
deterministic and inspectable: when the product tells a victim "this is a scam", we
must be able to point at the exact words that triggered it.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# Category weights. Higher means more diagnostic of fraud on its own.
CATEGORY_WEIGHTS: dict[str, float] = {
    "credentials": 1.00,
    "coercion": 0.95,
    "secrecy": 0.80,
    "urgency": 0.70,
    "money": 0.65,
    "authority": 0.60,
}

# Terms are matched on word boundaries over normalized text. Hindi is included both
# in Devanagari and in the Roman transliteration people actually speak and type.
CATEGORY_TERMS: dict[str, list[str]] = {
    "credentials": [
        "otp", "o t p", "one time password", "password", "passcode", "pin", "pin number",
        "cvv", "upi pin", "mpin", "aadhaar", "aadhar", "pan card", "kyc", "verification code",
        "net banking", "netbanking", "cvv number", "card number", "expiry date",
        "otp batao", "otp bhejo", "password batao", "पासवर्ड", "ओटीपी", "आधार",
    ],
    "coercion": [
        "kill", "killed", "kidnap", "kidnapped", "kidnapping", "hostage", "police",
        "arrest", "arrested", "warrant", "court case", "fir", "jail", "custody",
        "digital arrest", "cyber crime case", "non bailable", "raid",
        "giraftar", "girftar", "police case", "jaan se", "maar dunga", "jaan ka khatra",
        "पुलिस", "गिरफ्तार", "अपहरण",
    ],
    "secrecy": [
        "don't tell", "dont tell", "do not tell", "tell no one", "keep this between us",
        "keep it secret", "don't tell anyone", "dont tell anyone", "don't disconnect",
        "dont disconnect", "do not disconnect", "stay on the line", "don't hang up",
        "dont hang up", "kisi ko mat batana", "kisi ko na batao", "phone mat rakho",
        "mat batana", "किसी को मत बताना",
    ],
    "urgency": [
        "right now", "immediately", "urgent", "urgently", "emergency", "last warning",
        "final warning", "within 10 minutes", "within 5 minutes", "before it's too late",
        "no time", "hurry", "quickly", "at once",
        "abhi", "abhi bhejo", "jaldi", "jaldi karo", "turant", "foran",
        "अभी", "जल्दी", "तुरंत",
    ],
    "money": [
        "money", "transfer", "transfer money", "send money", "payment", "pay now",
        "fees", "fine", "penalty", "deposit", "wire", "account number", "ifsc",
        "gpay", "google pay", "phonepe", "phone pe", "paytm", "upi", "bank transfer",
        "neft", "imps", "rtgs", "refund", "processing fee",
        "paisa", "paise", "paise bhejo", "rupaye", "rupees", "paise chahiye",
        "पैसा", "पैसे", "रुपये",
    ],
    "authority": [
        "cbi", "income tax", "customs", "rbi", "reserve bank", "trai", "epfo",
        "bank manager", "cyber cell", "cyber crime branch", "enforcement directorate",
        "narcotics", "courier company", "fedex", "police station", "government officer",
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


@dataclass
class LexiconHit:
    score: float
    categories: list[str]
    terms: list[MatchedTerm]


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


def score_lexicon(text: str, single_category_multiplier: float = 0.55) -> LexiconHit:
    """Weighted category scoring.

    A category counts once no matter how many of its terms appear, so repetition
    cannot inflate the score. A single category is discounted because one "money"
    mention is ordinary conversation; it takes a combination to make a scam.
    """
    normalized = normalize(text)
    if not normalized:
        return LexiconHit(0.0, [], [])

    hit_categories: list[str] = []
    matched: list[MatchedTerm] = []
    for category, terms in CATEGORY_TERMS.items():
        found: list[str] = []
        for term in terms:
            if _contains_term(normalized, normalize(term)):
                found.append(term)
        if found:
            hit_categories.append(category)
            # Keep the longest matches; they are the most specific and read best in the UI.
            for term in sorted(found, key=len, reverse=True)[:3]:
                matched.append(MatchedTerm(category, term))

    if not hit_categories:
        return LexiconHit(0.0, [], [])

    total = sum(CATEGORY_WEIGHTS.values())
    raw = sum(CATEGORY_WEIGHTS.get(c, 0.0) for c in hit_categories) / total
    if len(hit_categories) == 1:
        raw *= single_category_multiplier
    return LexiconHit(min(1.0, raw), hit_categories, matched)


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
        for match in _BARE_AMOUNT.finditer(normalized):
            value = _to_number(match.group(1))
            # Four digits could be a year or an OTP; only treat big numbers as money.
            if value is not None and value >= 1000:
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

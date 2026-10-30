"""Defence against common dialect leakage; the full linguistic rule lives in the prompt.

Never transliterate or rewrite a learner's evidence here. This is a rejection
guard for generated Serbian fields, not an ije/je substitution algorithm.
"""
from pydantic import BaseModel

from app.services.serbian_text import normalized_serbian_words


_IJEKAVIAN_WORDS = frozenset("""
dvije dijete djeca djece djeci djecom dječji dječja dječje
mlijeko mlijeka mlijeku mlijekom mliječni mliječna mliječno mliječne
vrijeme lijep lijepa lijepo lijepe lijepi lijepih lijepom
mjesto mjesta mjestu mjestom mjestima
sljedeći sljedeća sljedeće sljedećeg sljedeću sljedećoj
prije poslije uvijek ovdje gdje
riječ riječi riječima rječnik rječnika
lijek lijeka lijeku lijekom lijekovi lijekove
mjesec mjeseca mjesecu mjeseci mjesečno mjesečna mjesečne
snijeg snijega snijegu bijel bijela bijelo bijele bijeli
razumjeti razumijem razumiješ razumije razumijemo razumijete razumiju razumio razumjela
htjeti htio htjela vidjeti vidio vidjela željeti želio željela
volio voljela voljeli voljele
osjećam osjeća osjećaj sjećam sjeća sjećanje
uspjeh uspjeha uspješan uspješna uspješno
svijet svijeta svijetu svijetom cvijeće cvijeća
""".split())


def is_ekavian_candidate(text: str) -> bool:
    """False for a known Ijekavian token, including Serbian Cyrillic spellings."""
    return _IJEKAVIAN_WORDS.isdisjoint(normalized_serbian_words(text).split())


def validate_generated_serbian(result: BaseModel) -> None:
    """Check Serbian output fields only, after Pydantic validation."""
    texts = list(getattr(result, "intended_sr_variants", []))
    texts.extend(hint.translation_sr for hint in getattr(result, "word_hints", []))
    versions = getattr(result, "source_versions", None)
    if versions is not None:
        texts.extend(hint.translation_sr for hint in [*versions.hints_ru, *versions.hints_en])
    texts.extend(getattr(result, "suggested_vocabulary", []))
    if hasattr(result, "corrected_sr"):
        texts.append(result.corrected_sr)
        texts.extend(result.accepted_alternatives)
        texts.extend(issue.correction for issue in result.issues if issue.correction)
    # STT candidates are hypotheses about what was said, not generated answers.
    if any(not is_ekavian_candidate(text) for text in texts):
        raise ValueError("Generated Serbian violates the Ekavica standard")

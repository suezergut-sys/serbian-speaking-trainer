from __future__ import annotations

import random
import re
from datetime import datetime, timezone
from difflib import SequenceMatcher

from sqlalchemy.orm import Session

from app.models import Exercise
from app.repositories import (
    ExerciseRepository,
    ReviewPhraseRepository,
    SkillRepository,
    TopicPhraseRepository,
    TrainingSessionRepository,
)
from app.schemas import ExerciseGenerationResult, ExerciseResponse
from app.services.ai_adapter import AIServiceError, StructuredAIProvider
from app.services.review_service import ReviewQueueEmptyError
from app.services.scheduler import Scheduler
from app.services.session_service import SessionNotFoundError, SessionService

LOCAL_EXERCISES: dict[str, tuple[tuple[str, tuple[str, ...]], ...]] = {
    "bank": (
        ("Не могли бы вы объяснить размер комиссии?", ("Da li biste mogli da objasnite visinu naknade?",)),
        ("Я хотел бы открыть счёт сегодня.", ("Voleo bih da otvorim račun danas.",)),
        ("Какие документы мне нужно принести?", ("Koje dokumente treba da donesem?",)),
    ),
    "cafe": (
        ("Можно мне, пожалуйста, меню?", ("Mogu li da dobijem jelovnik, molim vas?",)),
        ("Я хотел бы заказать кофе без сахара.", ("Voleo bih da naručim kafu bez šećera.",)),
        ("Не могли бы вы принести счёт?", ("Da li biste mogli da donesete račun?",)),
    ),
    "doctor": (
        ("У меня болит горло уже два дня.", ("Boli me grlo već dva dana.",)),
        ("Я хотел бы записаться на осмотр.", ("Voleo bih da zakažem pregled.",)),
        ("Нужно ли мне принимать это лекарство?", ("Da li treba da uzimam ovaj lek?",)),
    ),
    "rent": (
        ("В квартире не работает стиральная машина.", ("Mašina za veš ne radi u stanu.",)),
        ("Когда мастер сможет прийти на ремонт?", ("Kada majstor može da dođe na popravku?",)),
        ("Не могли бы вы проверить отопление?", ("Da li biste mogli da proverite grejanje?",)),
    ),
    "transport": (
        ("Где мне нужно сделать пересадку?", ("Gde treba da presednem?",)),
        ("Я хотел бы купить билет до центра.", ("Voleo bih da kupim kartu do centra.",)),
        ("Когда отправляется следующий автобус?", ("Kada polazi sledeći autobus?",)),
    ),
    "job-interview": (
        ("Я работал в этой области два года.", ("Radio sam u ovoj oblasti dve godine.",)),
        ("Я хотел бы узнать больше об этой работе.", ("Voleo bih da saznam više o ovom poslu.",)),
        ("Когда я могу начать работать?", ("Kada mogu da počnem da radim?",)),
    ),
    "work": (
        ("Не могли бы мы перенести встречу на завтра?", ("Da li bismo mogli da pomerimo sastanak za sutra?",)),
        ("Мне нужно закончить эту задачу сегодня.", ("Moram da završim ovaj zadatak danas.",)),
        ("Я немного опоздаю из-за транспорта.", ("Malo ću kasniti zbog prevoza.",)),
    ),
    "vacation": (
        ("В прошлом году мы отдыхали у моря.", ("Prošle godine smo se odmarali na moru.",)),
        ("Я хотел бы посетить этот город снова.", ("Voleo bih da ponovo posetim ovaj grad.",)),
        ("Где вы остановились во время отпуска?", ("Gde ste odseli tokom odmora?",)),
    ),
    "general": (
        ("Не могли бы вы повторить немного медленнее?", ("Da li biste mogli da ponovite malo sporije?",)),
        ("Я хотел бы узнать, когда вы открываетесь.", ("Voleo bih da znam kada otvarate.",)),
        ("Мне нужно купить продукты после работы.", ("Moram da kupim namirnice posle posla.",)),
    ),
}

LOCAL_WORD_TRANSLATIONS = {
    "я": "ja", "мы": "mi", "вы": "vi", "мне": "meni", "меня": "mene", "у": "kod",
    "не": "ne", "ли": "da li", "бы": "bih", "могли": "mogli", "можно": "može",
    "хотел": "želeo", "хотела": "želela", "хотелось": "želeo bih", "нужно": "treba",
    "могу": "mogu", "где": "gde", "когда": "kada", "какие": "koji", "этой": "ovoj",
    "эту": "ovu", "это": "ovo", "самому": "sam", "за": "za", "до": "do", "на": "na",
    "в": "u", "из": "iz", "после": "posle", "сегодня": "danas", "завтра": "sutra",
    "два": "dva", "дня": "dana", "года": "godine", "город": "grad", "снова": "ponovo",
    "открыть": "otvoriti", "счёт": "račun", "комиссии": "naknade", "размер": "visina",
    "объяснить": "objasniti", "документы": "dokumenti", "принести": "doneti", "меню": "jelovnik",
    "пожалуйста": "molim vas", "заказать": "naručiti", "кофе": "kafa", "без": "bez", "сахара": "šećera",
    "болит": "boli", "горло": "grlo", "записаться": "zakazati", "осмотр": "pregled",
    "принимать": "uzimati", "лекарство": "lek", "квартире": "stanu", "работает": "radi",
    "стиральная": "veš", "машина": "mašina", "мастер": "majstor", "прийти": "doći",
    "ремонт": "popravka", "проверить": "proveriti", "отопление": "grejanje", "сделать": "uraditi",
    "пересадку": "presedanje", "купить": "kupiti", "билет": "karta", "центра": "centra",
    "отправляется": "polazi", "следующий": "sledeći", "автобус": "autobus", "работал": "radio",
    "области": "oblasti", "узнать": "saznati", "больше": "više", "работе": "poslu",
    "начать": "početi", "работать": "raditi", "перенести": "pomeriti", "встречу": "sastanak",
    "закончить": "završiti", "задачу": "zadatak", "немного": "malo", "опоздаю": "kasniću",
    "транспорта": "prevoza", "прошлом": "prošloj", "году": "godini", "отдыхали": "odmarali",
    "моря": "mora", "посетить": "posetiti", "остановились": "odseli", "время": "vreme",
    "отпуска": "odmora", "повторить": "ponoviti", "медленнее": "sporije", "открываетесь": "otvarate",
    "продукты": "namirnice", "работы": "posla", "платить": "platiti",
}


class ExerciseGenerator:
    def __init__(self, db: Session, ai: StructuredAIProvider, scheduler: Scheduler | None = None) -> None:
        self.sessions = TrainingSessionRepository(db)
        self.exercises = ExerciseRepository(db)
        self.review_phrases = ReviewPhraseRepository(db)
        self.topic_phrases = TopicPhraseRepository(db)
        self.skills = SkillRepository(db)
        self.ai = ai
        self.scheduler = scheduler or Scheduler()

    def generate_next(self, session_id: str) -> ExerciseResponse:
        training_session = self.sessions.get(session_id)
        if training_session is None:
            raise SessionNotFoundError(session_id)
        topic = SessionService.topic_snapshot(training_session)
        review_payload = training_session.normalized_topic_json.get("review_phrase")
        if review_payload:
            return self._review_exercise(training_session.id, review_payload)
        if training_session.normalized_topic_json.get("review_carousel"):
            return self._next_review_exercise(training_session.id)
        recent = self.exercises.list_recent(session_id, limit=20)
        targets = self.scheduler.select_target_skills(self.skills.list(limit=200), topic, recent)
        target_keys = [skill.key for skill in targets]
        target_payload = [
            {"key": skill.key, "category": skill.category, "title_ru": skill.title_ru}
            for skill in targets
        ]
        recent_sources = [exercise.source_ru for exercise in recent]
        catalog_phrase = self._select_catalog_phrase(topic.id, target_keys, recent_sources)
        if catalog_phrase is not None:
            target_keys = [key for key in catalog_phrase.targeted_skill_keys_json if self.skills.get_by_key(key)]
            result = ExerciseGenerationResult(
                source_ru=catalog_phrase.source_ru,
                topic_fit=f"Постоянный каталог A2 для темы «{topic.title_ru}».",
                intended_sr_variants=[catalog_phrase.canonical_sr],
                targeted_skills=target_keys,
                difficulty=0.5,
                novelty_signature=f"catalog:{catalog_phrase.id}",
                word_hints=catalog_phrase.word_hints_json,
            )
        else:
            if topic.source == "general":
                result = self._generate(topic, target_payload, target_keys, recent_sources)
                catalog_phrase = None
            else:
                self.review_phrases.activate_due(datetime.now(timezone.utc))
                topic_phrases = self.review_phrases.list_active_for_topic(topic.id)
                if not topic_phrases:
                    raise ReviewQueueEmptyError
                recent_ids = {
                    str(item.generation_meta_json.get("review_phrase_id"))
                    for item in recent
                    if item.generation_meta_json.get("review_phrase_id")
                }
                candidates = [phrase for phrase in topic_phrases if phrase.id not in recent_ids] or topic_phrases
                return self._review_exercise(training_session.id, self._review_payload(random.choice(candidates)))
        skill_catalog = {skill.key: skill for skill in self.skills.list(limit=500)}
        entity = self.exercises.add(
            Exercise(
                session_id=session_id,
                source_ru=result.source_ru,
                targeted_skill_ids=[skill_catalog[key].id for key in target_keys if key in skill_catalog],
                target_hints_json={
                    "intended_sr_variants": result.intended_sr_variants,
                    "canonical_sr": result.intended_sr_variants[0],
                    "word_hints": [hint.model_dump() for hint in result.word_hints],
                },
                generation_meta_json={
                    "topic_fit": result.topic_fit,
                    "difficulty": result.difficulty,
                    "novelty_signature": result.novelty_signature,
                    "expected_level": result.expected_level,
                    "targeted_skill_keys": target_keys,
                    "topic_phrase_id": catalog_phrase.id if catalog_phrase else None,
                    "topic_id": topic.id if catalog_phrase else None,
                },
            )
        )
        return ExerciseResponse(
            id=entity.id,
            session_id=entity.session_id,
            source_ru=entity.source_ru,
            targeted_skills=target_keys,
            difficulty=result.difficulty,
        )

    def _select_catalog_phrase(self, topic_id: str, target_keys: list[str], recent_sources: list[str]):
        phrases = self.topic_phrases.list_for_topic(topic_id)
        if not phrases:
            return None
        recent_normalized = {self._normalize(source) for source in recent_sources}
        fresh = [phrase for phrase in phrases if self._normalize(phrase.source_ru) not in recent_normalized]
        candidates = fresh or phrases
        target_set = set(target_keys)
        candidates.sort(
            key=lambda phrase: (
                -len(target_set.intersection(phrase.targeted_skill_keys_json)),
                phrase.position,
            )
        )
        return candidates[0]

    def _next_review_exercise(self, session_id: str) -> ExerciseResponse:
        self.review_phrases.activate_due(datetime.now(timezone.utc))
        phrases = self.review_phrases.list_active()
        if not phrases:
            raise ReviewQueueEmptyError
        recent_ids = {
            str(item.generation_meta_json.get("review_phrase_id"))
            for item in self.exercises.list_recent(session_id, limit=8)
            if item.generation_meta_json.get("review_phrase_id")
        }
        candidates = [phrase for phrase in phrases if phrase.id not in recent_ids] or phrases
        phrase = random.choice(candidates)
        return self._review_exercise(session_id, self._review_payload(phrase))

    @staticmethod
    def _review_payload(phrase) -> dict:
        return {
            "id": phrase.id,
            "source_ru": phrase.source_ru,
            "intended_sr_variants": phrase.intended_sr_variants_json,
            "word_hints": phrase.word_hints_json,
            "targeted_skill_keys": phrase.targeted_skill_keys_json,
            "topic_id": phrase.topic_id,
            "topic_phrase_id": phrase.topic_phrase_id,
        }

    def _review_exercise(self, session_id: str, payload: dict) -> ExerciseResponse:
        target_keys = list(payload.get("targeted_skill_keys", []))
        catalog = {skill.key: skill for skill in self.skills.list(limit=500)}
        entity = self.exercises.add(
            Exercise(
                session_id=session_id,
                source_ru=str(payload["source_ru"]),
                targeted_skill_ids=[catalog[key].id for key in target_keys if key in catalog],
                target_hints_json={
                    "intended_sr_variants": list(payload.get("intended_sr_variants", [])),
                    "canonical_sr": next(iter(payload.get("intended_sr_variants", [])), None),
                    "word_hints": list(payload.get("word_hints", [])),
                },
                generation_meta_json={
                    "topic_fit": "Фраза из персонального списка повторения.",
                    "difficulty": 0.5,
                    "novelty_signature": f"review:{payload['id']}",
                    "expected_level": "A2",
                    "targeted_skill_keys": target_keys,
                    "review_phrase_id": str(payload["id"]),
                    "topic_id": payload.get("topic_id"),
                    "topic_phrase_id": payload.get("topic_phrase_id"),
                },
            )
        )
        return ExerciseResponse(
            id=entity.id,
            session_id=entity.session_id,
            source_ru=entity.source_ru,
            targeted_skills=target_keys,
            difficulty=0.5,
        )

    def _generate(
        self,
        topic,
        target_payload: list[dict[str, str]],
        target_keys: list[str],
        recent_sources: list[str],
    ) -> ExerciseGenerationResult:
        if self.ai.is_available:
            try:
                result = ExerciseGenerationResult.model_validate(
                    self.ai.generate_exercise(
                        topic=topic,
                        target_skills=target_payload,
                        recent_sources=recent_sources,
                    )
                )
                retry_reason = None
                if not self._is_russian_source(result.source_ru):
                    retry_reason = "source_ru должен быть полностью на русском языке кириллицей, без сербских слов или латиницы."
                elif self._too_similar(result.source_ru, recent_sources):
                    retry_reason = "Фраза слишком похожа на недавнюю; выбери другую ситуацию и формулировку."
                if retry_reason:
                    result = ExerciseGenerationResult.model_validate(
                        self.ai.generate_exercise(
                            topic=topic,
                            target_skills=target_payload,
                            recent_sources=recent_sources,
                            retry_reason=retry_reason,
                        )
                    )
                if self._is_russian_source(result.source_ru) and not self._too_similar(result.source_ru, recent_sources):
                    return result.model_copy(update={"targeted_skills": target_keys})
            except AIServiceError:
                pass
        return self._local_fallback(topic.id, topic.title_ru, target_keys, recent_sources)

    @staticmethod
    def _local_fallback(
        topic_id: str,
        topic_title: str,
        target_keys: list[str],
        recent_sources: list[str],
    ) -> ExerciseGenerationResult:
        templates = LOCAL_EXERCISES.get(topic_id, LOCAL_EXERCISES["general"])
        recent_normalized = {ExerciseGenerator._normalize(source) for source in recent_sources}
        index = next(
            (i for i, (source, _) in enumerate(templates) if ExerciseGenerator._normalize(source) not in recent_normalized),
            len(recent_sources) % len(templates),
        )
        source, variants = templates[index]
        return ExerciseGenerationResult(
            source_ru=source,
            topic_fit=f"Локальный A2 fallback для темы «{topic_title}».",
            intended_sr_variants=list(variants),
            targeted_skills=target_keys,
            difficulty=0.5,
            novelty_signature=f"local:{topic_id}:{index}",
            word_hints=ExerciseGenerator._local_word_hints(source),
        )

    @staticmethod
    def _local_word_hints(source: str) -> list[dict[str, str]]:
        words = re.findall(r"[А-Яа-яЁё]+", source)
        return [
            {"word_ru": word, "translation_sr": LOCAL_WORD_TRANSLATIONS[word.casefold()]}
            for word in words
            if word.casefold() in LOCAL_WORD_TRANSLATIONS
        ]

    @classmethod
    def _too_similar(cls, source: str, recent_sources: list[str]) -> bool:
        normalized = cls._normalize(source)
        return any(SequenceMatcher(None, normalized, cls._normalize(recent)).ratio() >= 0.82 for recent in recent_sources)

    @staticmethod
    def _normalize(value: str) -> str:
        return re.sub(r"[^а-яёa-z0-9]+", " ", value.casefold()).strip()

    @staticmethod
    def _is_russian_source(value: str) -> bool:
        return re.search(r"[А-Яа-яЁё]", value) is not None and re.search(r"[A-Za-z]", value) is None

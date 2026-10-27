from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.db.topic_phrases import TOPIC_PHRASES
from app.db.topic_phrase_hints import TOPIC_PHRASE_HINTS
from app.models import Exercise, ReviewPhrase, Skill, TopicPhrase, TopicPreset
from app.repositories import SkillRepository, TopicPhraseRepository, TopicPresetRepository


@dataclass(frozen=True)
class SkillSeed:
    key: str
    category: str
    title_ru: str
    explanation_ru: str
    difficulty: float


SKILLS: tuple[SkillSeed, ...] = (
    SkillSeed("vocab.racun", "vocabulary", "račun", "Счёт: в кафе, банке или квитанции.", 0.35),
    SkillSeed("vocab.odmah", "vocabulary", "odmah", "Наречие «сразу, немедленно».", 0.25),
    SkillSeed("vocab.ipak", "vocabulary", "ipak", "Связка «всё-таки, однако».", 0.45),
    SkillSeed("vocab.namirnice", "vocabulary", "namirnice", "Продукты питания и покупки.", 0.4),
    SkillSeed("vocab.kartica", "vocabulary", "kartica", "Карта или карточка по контексту.", 0.3),
    SkillSeed("vocab.naknada", "vocabulary", "naknada", "Плата, комиссия или возмещение.", 0.55),
    SkillSeed("vocab.prevoz", "vocabulary", "prevoz", "Транспорт и поездки.", 0.3),
    SkillSeed("vocab.stan", "vocabulary", "stan", "Квартира и жильё.", 0.25),
    SkillSeed("vocab.popravka", "vocabulary", "popravka", "Ремонт и исправление поломки.", 0.4),
    SkillSeed("vocab.pregled", "vocabulary", "pregled", "Осмотр или приём у врача.", 0.45),
    SkillSeed("vocab.sastanak", "vocabulary", "sastanak", "Встреча или совещание.", 0.35),
    SkillSeed("vocab.odmor", "vocabulary", "odmor", "Отдых, отпуск или перерыв.", 0.25),
    SkillSeed("grammar.present", "grammar", "Настоящее время", "Спряжение частотных глаголов в настоящем времени.", 0.3),
    SkillSeed("grammar.perfect", "grammar", "Прошедшее время", "Перфект с формами pomoćnog glagola biti.", 0.55),
    SkillSeed("grammar.future", "grammar", "Будущее время", "Формы ću/ćeš/će + инфинитив.", 0.55),
    SkillSeed("grammar.accusative", "grammar", "Винительный падеж", "Прямой объект и движение к месту.", 0.45),
    SkillSeed("grammar.genitive", "grammar", "Родительный падеж", "Количество, отсутствие и предлоги.", 0.55),
    SkillSeed("grammar.dative", "grammar", "Дательный падеж", "Адресат действия и частотные конструкции.", 0.6),
    SkillSeed("grammar.locative", "grammar", "Местный падеж", "Разговор о месте с u/na/o.", 0.55),
    SkillSeed("grammar.instrumental", "grammar", "Творительный падеж", "Совместность и средство действия.", 0.6),
    SkillSeed("grammar.adjective_agreement", "grammar", "Согласование прилагательных", "Род, число и падеж прилагательного.", 0.5),
    SkillSeed("grammar.negation", "grammar", "Отрицание", "Формы ne, nije/nema и порядок слов.", 0.3),
    SkillSeed("grammar.questions", "grammar", "Вопросительные формы", "Da li и вопросительные слова.", 0.35),
    SkillSeed("grammar.clitics", "grammar", "Клитики", "Базовый порядок кратких местоимений и вспомогательных форм.", 0.7),
    SkillSeed("grammar.modal_da_present", "grammar", "Модальный глагол + da", "mogu/moram/želim + da + настоящее время.", 0.55),
    SkillSeed("construction.voleo_bih", "construction", "Voleo bih da", "Вежливое выражение желания.", 0.5),
    SkillSeed("construction.mogao_bih", "construction", "Mogao bih da", "Возможность или осторожное предложение.", 0.55),
    SkillSeed("construction.da_li_biste_mogli", "construction", "Da li biste mogli da", "Вежливая просьба к собеседнику.", 0.65),
    SkillSeed("construction.nije_mi_problem", "construction", "Nije mi problem da", "Готовность выполнить действие.", 0.5),
    SkillSeed("construction.treba_da", "construction", "Treba da", "Необходимость или рекомендация.", 0.4),
    SkillSeed("construction.moram_da", "construction", "Moram da", "Личная необходимость.", 0.35),
    SkillSeed("construction.ako_mozete", "construction", "Ako možete", "Смягчённая вежливая просьба.", 0.45),
    SkillSeed("construction.zato_sto", "construction", "Zato što", "Объяснение причины.", 0.4),
    SkillSeed("construction.kad_budem", "construction", "Kad budem", "Будущее условие/время без русского калькирования.", 0.7),
    SkillSeed("intent.greeting", "communicative_intent", "Поздороваться", "Выбрать уместное приветствие.", 0.15),
    SkillSeed("intent.polite_request", "communicative_intent", "Вежливо попросить", "Сформулировать просьбу без приказного тона.", 0.4),
    SkillSeed("intent.clarify", "communicative_intent", "Уточнить", "Переспросить или запросить детали.", 0.4),
    SkillSeed("intent.explain_reason", "communicative_intent", "Объяснить причину", "Кратко связать действие с причиной.", 0.45),
    SkillSeed("intent.disagree", "communicative_intent", "Тактично возразить", "Не согласиться естественно и вежливо.", 0.55),
    SkillSeed("intent.apologize", "communicative_intent", "Извиниться", "Извинение и короткое объяснение.", 0.3),
    SkillSeed("intent.arrange_time", "communicative_intent", "Договориться о времени", "Предложить и подтвердить время встречи.", 0.45),
    SkillSeed("intent.ask_price", "communicative_intent", "Спросить цену", "Уточнить стоимость или комиссию.", 0.3),
    SkillSeed("intent.report_problem", "communicative_intent", "Сообщить о проблеме", "Описать поломку, симптом или затруднение.", 0.45),
    SkillSeed("intent.give_opinion", "communicative_intent", "Высказать мнение", "Краткая личная оценка и аргумент.", 0.5),
    SkillSeed("pronunciation.c_c", "pronunciation", "Различение č и ć", "Coarse-сигнал различения č/ć без фонемного диагноза.", 0.65),
    SkillSeed("pronunciation.dj", "pronunciation", "Звук đ", "Coarse-сигнал произношения đ.", 0.6),
    SkillSeed("fluency.reaction", "fluency", "Быстрый старт ответа", "Начать говорить без долгого извлечения конструкции.", 0.4),
    SkillSeed("fluency.long_pause", "fluency", "Длинная внутренняя пауза", "Сохранять плавность внутри короткой фразы.", 0.5),
    SkillSeed("fluency.self_correction", "fluency", "Самоисправление", "Снизить число повторных перезапусков фразы.", 0.5),
    SkillSeed("fluency.steady_rate", "fluency", "Ровный темп", "Произносить короткую фразу без резких провалов темпа.", 0.45),
)


TOPICS: tuple[dict[str, object], ...] = (
    {"id": "misc", "title_ru": "Разное", "description_ru": "Повседневные разговоры, короткие диалоги и разговорные выражения.", "intents_json": [], "vocabulary_json": []},
    {"id": "job-interview", "title_ru": "Собеседование", "description_ru": "Опыт, навыки и условия работы.", "intents_json": ["представиться", "рассказать об опыте", "уточнить условия"], "vocabulary_json": ["posao", "iskustvo", "veštine", "plata"]},
    {"id": "bank", "title_ru": "Банк", "description_ru": "Счёт, карта, документы и комиссии.", "intents_json": ["объяснить цель", "спросить о документах", "уточнить комиссию"], "vocabulary_json": ["račun", "kartica", "naknada", "lična karta"]},
    {"id": "vacation", "title_ru": "Отпуск", "description_ru": "Поездка, впечатления и планы.", "intents_json": ["рассказать о прошлом", "описать место", "обсудить планы"], "vocabulary_json": ["odmor", "putovanje", "more", "hotel"]},
    {"id": "cafe", "title_ru": "Кафе", "description_ru": "Заказ, пожелания и оплата.", "intents_json": ["сделать заказ", "уточнить состав", "попросить счёт"], "vocabulary_json": ["jelovnik", "poručiti", "račun", "bez"]},
    {"id": "work", "title_ru": "Работа", "description_ru": "Задачи, встречи и рабочий день.", "intents_json": ["обсудить задачу", "договориться о времени", "сообщить о задержке"], "vocabulary_json": ["sastanak", "zadatak", "rok", "kolega"]},
    {"id": "doctor", "title_ru": "Врач", "description_ru": "Симптомы, запись и рекомендации.", "intents_json": ["описать симптом", "записаться на приём", "уточнить лечение"], "vocabulary_json": ["pregled", "bol", "lek", "termin"]},
    {"id": "rent", "title_ru": "Аренда", "description_ru": "Квартира, условия и бытовые проблемы.", "intents_json": ["уточнить условия", "сообщить о поломке", "договориться о ремонте"], "vocabulary_json": ["stan", "kirija", "popravka", "stanodavac"]},
    {"id": "transport", "title_ru": "Транспорт", "description_ru": "Маршрут, билет и пересадка.", "intents_json": ["спросить дорогу", "купить билет", "уточнить расписание"], "vocabulary_json": ["prevoz", "karta", "stanica", "presedanje"]},
)


def seed_catalog(session: Session) -> tuple[int, int, int]:
    skill_repo = SkillRepository(session)
    topic_repo = TopicPresetRepository(session)
    phrase_repo = TopicPhraseRepository(session)
    skills_added = 0
    topics_added = 0
    phrases_added = 0

    for item in SKILLS:
        if skill_repo.get_by_key(item.key) is None:
            skill_repo.add(Skill(**item.__dict__))
            skills_added += 1

    for item in TOPICS:
        if topic_repo.get(item["id"]) is None:
            topic_repo.add(TopicPreset(**item))
            topics_added += 1
        elif item["id"] == "misc":
            topic_repo.get("misc").description_ru = item["description_ru"]

    for item in TOPIC_PHRASES:
        phrase = phrase_repo.get(item.id)
        values = {
            "topic_id": item.topic_id,
            "position": item.position,
            "source_ru": item.source_ru,
            "canonical_sr": item.canonical_sr,
            "word_hints_json": TOPIC_PHRASE_HINTS[item.id],
            "targeted_skill_keys_json": list(item.targeted_skill_keys_json),
            "enabled": True,
        }
        if phrase is None:
            phrase_repo.add(TopicPhrase(id=item.id, **values))
            phrases_added += 1
        else:
            for key, value in values.items():
                setattr(phrase, key, value)

    phrase_hints = {item.id: TOPIC_PHRASE_HINTS[item.id] for item in TOPIC_PHRASES}
    catalog = {item.id: item for item in TOPIC_PHRASES}
    for phrase in session.scalars(select(ReviewPhrase)):
        item = catalog.get(phrase.topic_phrase_id)
        if (item and phrase.source_ru == item.source_ru
                and next(iter(phrase.intended_sr_variants_json), "") == item.canonical_sr
                and phrase.word_hints_json != phrase_hints[item.id]):
            phrase.word_hints_json = phrase_hints[item.id]
            flag_modified(phrase, "updated_at")
    for exercise in session.scalars(select(Exercise)):
        topic_phrase_id = exercise.generation_meta_json.get("topic_phrase_id")
        item = catalog.get(topic_phrase_id)
        canonical = exercise.target_hints_json.get("canonical_sr") or next(iter(exercise.target_hints_json.get("intended_sr_variants", [])), "")
        if item and exercise.source_ru == item.source_ru and canonical in ("", item.canonical_sr):
            exercise.target_hints_json = {
                **exercise.target_hints_json,
                "word_hints": phrase_hints[topic_phrase_id],
            }

    return skills_added, topics_added, phrases_added

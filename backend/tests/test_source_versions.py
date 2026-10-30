from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.models import Exercise, ReviewPhrase, TopicPreset, User
from app.schemas.exercises import PhrasePreparation, SourceVersions
from app.services.source_versions import SourceLanguageService, SourceLanguageUnavailableError, exercise_source, preparation_versions, version_payload
from app.repositories.source_versions import SourceVersionRepository
from app.services.auth_service import LEGACY_USER_ID
from app.services.ai_adapter import get_ai_provider
from app.main import app
from tests.fakes import FakeAIProvider

RU = 'Я живу рядом с парком.'
EN = 'I live near the park.'
SR = 'Živim blizu parka.'


def versions():
    return SourceVersions(ru=RU, en=EN,
        hints_ru=[{'word_ru': 'парком', 'translation_sr': 'parka'}],
        hints_en=[{'word_ru': 'park', 'translation_sr': 'parka'}])


def personal(db, *, cache=True):
    user = db.get(User, LEGACY_USER_ID)
    user.access_tier = 'premium'
    db.add(TopicPreset(id='bilingual-personal', owner_user_id=user.id, is_custom=True, title_ru='Мои фразы', description_ru='Личные фразы'))
    db.flush()
    phrase = ReviewPhrase(user_id=user.id, source_ru=RU, source_normalized='synthetic personal', topic_id='bilingual-personal',
        intended_sr_variants_json=[SR], status='active', attempts=7, best_score=.9,
        source_versions_json=version_payload(RU, SR, versions()) if cache else {})
    db.add(phrase)
    db.commit()
    return phrase


@pytest.mark.parametrize('language,expected', [('ru', RU), ('en', EN)])
def test_personal_start_review_and_idempotent_next_use_selected_language(api_client, db_session, language, expected):
    phrase = personal(db_session)
    headers = {'X-Interface-Language': language}
    before = (phrase.attempts, phrase.best_score, deepcopy(phrase.intended_sr_variants_json), phrase.source_ru)
    for input in ({'topic_id': phrase.topic_id}, {'review_mode': True}, {'review_phrase_id': phrase.id}):
        response = api_client.post('/api/sessions/start', json=input, headers=headers)
        assert response.status_code == 201, response.text
        exercise = response.json()['exercise']
        assert exercise['source_text'] == expected
        assert exercise['source_language'] == language
        assert exercise['source_versions']['ru'] == RU and exercise['source_versions']['en'] == EN
        assert exercise['word_hints'][0]['word_ru'] == ('park' if language == 'en' else 'парком')
        assert exercise['source_ru'] == RU  # Immutable original, retained for old clients/history.
    db_session.refresh(phrase)
    assert (phrase.attempts, phrase.best_score, phrase.intended_sr_variants_json, phrase.source_ru) == before


def test_missing_foreign_source_is_not_returned_as_russian_fallback(api_client, db_session):
    phrase = personal(db_session, cache=False)
    response = api_client.post('/api/sessions/start', json={'topic_id': phrase.topic_id}, headers={'X-Interface-Language': 'en'})
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'source_language_unavailable'


def test_lazy_translation_is_cached_and_does_not_change_progress(api_client, db_session):
    phrase = personal(db_session, cache=False)
    provider = FakeAIProvider(available=True, phrase_result=PhrasePreparation(intended_sr_variants=[SR], source_versions=versions()))
    app.dependency_overrides[get_ai_provider] = lambda: provider
    response = api_client.post('/api/sessions/start', json={'topic_id': phrase.topic_id}, headers={'X-Interface-Language': 'en'})
    assert response.status_code == 201, response.text
    assert response.json()['exercise']['source_text'] == EN
    db_session.refresh(phrase)
    assert phrase.source_versions_json['versions']['en'] == EN
    assert phrase.source_ru == RU and phrase.intended_sr_variants_json == [SR] and phrase.attempts == 7


def test_new_preparation_and_saved_receipt_keep_both_sources(api_client, db_session):
    phrase = personal(db_session)
    provider = FakeAIProvider(available=True, phrase_result=PhrasePreparation(intended_sr_variants=[SR], source_versions=versions()))
    app.dependency_overrides[get_ai_provider] = lambda: provider
    prepared = api_client.post('/api/review-phrases/prepare', json={'source_ru': RU}).json()
    assert prepared['source_versions']['en'] == EN
    # Use a different normalized key to exercise insertion, not duplicate detection.
    phrase.source_normalized = 'old unrelated key'
    db_session.commit()
    saved = api_client.post('/api/review-phrases', json={'preparation_id': prepared['preparation_id'], 'topic_id': phrase.topic_id})
    assert saved.status_code == 201, saved.text
    assert saved.json()['source_versions']['en'] == EN


@pytest.mark.parametrize('bad', [dict(ru=EN, en=EN), dict(ru=RU, en=RU), dict(ru=RU, en='123')])
def test_invalid_script_is_rejected(bad):
    with pytest.raises(ValidationError):
        SourceVersions.model_validate(bad)


def test_translation_must_preserve_original_and_canonical():
    provider = FakeAIProvider(available=True, phrase_result=PhrasePreparation(intended_sr_variants=['Druga fraza.'], source_versions=versions()))
    with pytest.raises(SourceLanguageUnavailableError):
        preparation_versions(provider, RU, SR)
    provider.phrase_result = PhrasePreparation(intended_sr_variants=[SR], source_versions=versions())
    with pytest.raises(SourceLanguageUnavailableError):
        preparation_versions(provider, 'Другое значение.', SR)


def test_stale_cached_translation_is_not_reused_after_canonical_change():
    exercise = Exercise(source_ru=RU, target_hints_json={'canonical_sr': 'Drugo značenje.', 'source_versions': version_payload(RU, SR, versions())})
    with pytest.raises(SourceLanguageUnavailableError):
        exercise_source(exercise, 'en')


def test_owner_scoped_cache_does_not_borrow_another_accounts_phrase(db_session):
    phrase = personal(db_session)
    exercise = Exercise(source_ru=RU, generation_meta_json={'review_phrase_id': phrase.id}, target_hints_json={'canonical_sr': SR})
    assert SourceVersionRepository(db_session, 'other-owner').exercise_phrase(exercise) is None

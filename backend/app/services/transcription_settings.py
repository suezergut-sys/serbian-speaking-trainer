from sqlalchemy.orm import Session

from app.config import Settings
from app.repositories.model_debug import ModelDebugRepository
from app.repositories.users import UserRepository
from app.schemas.transcription_settings import TranscriptionModelOption, TranscriptionModelSettings
from app.services.model_debug import can_debug


class TranscriptionSettingsService:
    def __init__(self, db: Session, settings: Settings, user_id: str):
        self.db, self.settings, self.user_id = db, settings, user_id
        self.repository = ModelDebugRepository(db, user_id)
        self.users = UserRepository(db)

    def options(self) -> dict[str, TranscriptionModelOption]:
        options = {option.model: option for option in self.settings.openai_transcribe_models}
        if self.settings.openai_transcribe_model:
            options.setdefault(self.settings.openai_transcribe_model, TranscriptionModelOption(
                model=self.settings.openai_transcribe_model,
                language_parameter=self.settings.openai_transcribe_language_parameter))
        return options

    def selected(self) -> str | None:
        user = self.users.get(self.user_id)
        if user is None or not can_debug(user, self.settings):
            return None
        setting = self.repository.setting()
        selected = setting.transcription_model if setting else None
        return selected if selected in self.options() else None

    def read(self) -> TranscriptionModelSettings:
        selected = self.selected()
        return TranscriptionModelSettings(selected_model=selected,
            effective_model=selected or self.settings.openai_transcribe_model,
            default_model=self.settings.openai_transcribe_model, options=list(self.options()))

    def change(self, model: str | None) -> TranscriptionModelSettings:
        if model is not None and model not in self.options():
            raise ValueError("Unknown transcription model")
        self.repository.select_transcription_model(model)
        self.db.commit()
        return self.read()

    def provider_settings(self) -> Settings:
        selected = self.selected()
        if selected is None:
            return self.settings
        option = self.options()[selected]
        return self.settings.model_copy(update={"openai_transcribe_model": option.model,
            "openai_transcribe_language_parameter": option.language_parameter})

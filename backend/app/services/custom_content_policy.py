MAX_CUSTOM_TOPICS = 5
MAX_TOPIC_PHRASES = 30
MAX_CUSTOM_PHRASES = MAX_CUSTOM_TOPICS * MAX_TOPIC_PHRASES


class CustomContentError(RuntimeError):
    def __init__(self, code: str, status: int = 409) -> None:
        self.code = code
        self.status = status
        super().__init__(code)

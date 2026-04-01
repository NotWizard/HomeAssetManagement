NOT_FOUND_ERROR = 4040
SCOPED_NOT_FOUND_ERROR = 4041


class AppError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

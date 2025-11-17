import os

class Settings:
    ENV: str = os.getenv("TM_ENV", "local")

    # OpenAI
    OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
    OPENAI_BASE_URL: str | None = os.getenv("OPENAI_BASE_URL")  # usually None

    O4_MODEL_NAME: str = os.getenv("O4_MODEL_NAME", "o4-mini")
    ADJ_MODEL_NAME: str = os.getenv("ADJ_MODEL_NAME", "gpt-4.1-mini")

    # AWS / Textract
    AWS_REGION: str = os.getenv("AWS_REGION", "us-west-2")
    TEXTRACT_REGION: str = os.getenv("TEXTRACT_REGION", AWS_REGION)

    # Reducto
    REDUCTO_ENDPOINT: str | None = os.getenv("REDUCTO_ENDPOINT")

    # S3 / storage (if you’re using it for images)
    AWS_S3_BUCKET_NAME: str | None = os.getenv("pdf-viewer-replit")

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")


settings = Settings()

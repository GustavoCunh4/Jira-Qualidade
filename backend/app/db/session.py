from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings

settings = get_settings()
database_url = settings.sqlalchemy_database_url

connect_args = {}
engine_kwargs = {"pool_pre_ping": True, "pool_recycle": 300}
if database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    engine_kwargs.update({"pool_size": 5, "max_overflow": 10, "pool_timeout": 30})

engine = create_engine(database_url, connect_args=connect_args, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

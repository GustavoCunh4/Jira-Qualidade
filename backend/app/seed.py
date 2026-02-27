from app.db.models import TeamMember
from app.db.session import SessionLocal


def seed_team() -> None:
    db = SessionLocal()
    try:
        if db.query(TeamMember).count() > 0:
            return
        members = [
            TeamMember(name="Ana Silva", email="ana@example.com", area="QA", active=True),
            TeamMember(
                name="Bruno Costa", email="bruno@example.com", area="Automacao", active=True
            ),
            TeamMember(name="Carla Lima", email="carla@example.com", area="Qualidade", active=True),
        ]
        db.add_all(members)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed_team()

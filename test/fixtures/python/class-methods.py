class UserService:
    def __init__(self, db):
        self.db = db

    def fetch_user(self, user_id: str):
        user = self.db.find_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        return user

    def update_user(self, user_id: str, data: dict):
        user = self.fetch_user(user_id)
        for key, value in data.items():
            setattr(user, key, value)
        self.db.save(user)
        return user

    def delete_user(self, user_id: str):
        user = self.fetch_user(user_id)
        self.db.remove(user)
        return {"deleted": True}

    def validate_email(self, email: str) -> bool:
        import re
        pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
        return bool(re.match(pattern, email))


def top_level_function():
    return "I am at the top level"


def another_top_level():
    return "Another top level function"

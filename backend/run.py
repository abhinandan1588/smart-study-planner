"""Entry point for the Smart Study Planner Flask API."""

import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(
        host=os.environ.get("FLASK_RUN_HOST", "127.0.0.1"),
        port=int(os.environ.get("FLASK_RUN_PORT", 5000)),
        debug=app.config.get("DEBUG", False),
        use_reloader=False,
    )

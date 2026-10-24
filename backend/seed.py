"""Runnable wrapper around the seeding logic.

Usage::

    .venv/bin/python seed.py            # seed (safe to re-run)
    .venv/bin/python seed.py --reset    # clear demo rows first, then seed

Equivalent to ``flask --app run.py seed``.
"""

import sys

from app import create_app
from app.seed import seed_demo_data


def main():
    reset = "--reset" in sys.argv
    app = create_app()
    with app.app_context():
        seed_demo_data(reset=reset)


if __name__ == "__main__":
    main()

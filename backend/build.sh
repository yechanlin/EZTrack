#!/usr/bin/env bash
# Render runs this on every deploy.
set -o errexit  # abort the deploy if any step fails, rather than shipping a broken build

pip install -r requirements.txt

# Collect admin CSS/JS for WhiteNoise to serve.
python manage.py collectstatic --no-input

# Migrations include the data migration that seeds the default categories, so a
# fresh database comes up ready to use.
python manage.py migrate

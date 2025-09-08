#!/bin/sh

# https://github.com/ad-freiburg/qlever-ui/blob/master/docs/install_qleverui.md
python manage.py migrate
python manage.py createsuperuser --noinput || true

# https://github.com/ad-freiburg/qlever-control/blob/bd07360654a432216e46770650bf5fb3f978f3c8/src/qlever/commands/ui.py#L143-L147
python manage.py config default Qleverfile-ui.yml --hide-all-other-backends

# https://github.com/ad-freiburg/qlever-ui/blob/master/Dockerfile#L33C1-L34C1
gunicorn --bind :7000 --workers 3 --limit-request-line 10000 qlever.wsgi:application

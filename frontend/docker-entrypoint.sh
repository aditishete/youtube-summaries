#!/bin/sh
# Substitute only $BACKEND_HOST, leaving nginx variables ($host, $remote_addr, etc.) untouched
envsubst '$BACKEND_HOST' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'

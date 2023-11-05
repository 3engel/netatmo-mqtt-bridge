# Netatmo Bridge to MQTT

This node.js app consumes the [Netatmo API](https://dev.netatmo.com/apidocumentation/weather) and gathers data for weather devices and publishes them to a MQTT broker.

# OAuth 2.0
I'm consuming the netatmo API using the new OAuth 2.0 flow. Therfore you need to [create an app](https://dev.netatmo.com/apps/) with client_id and client_secret. Once this is setup you need to create an **access_token** with **refresh_token** with **"read_station"** scope. When the app is running the refresh_token will be refreshed automatically in order to be able to gather the api data as log as the app runs.

# Docker
You can run the bridge using docker. See docker-compose.yml


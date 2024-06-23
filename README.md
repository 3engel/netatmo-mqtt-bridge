# Netatmo Bridge to MQTT

This node.js app consumes the [Netatmo API](https://dev.netatmo.com/apidocumentation/weather) and gathers data for weather devices and publishes them to a MQTT broker.

# OAuth 2.0
I'm consuming the netatmo API using the new OAuth 2.0 flow. Therfore you need to [create an app](https://dev.netatmo.com/apps/) with client_id and client_secret. Once this is setup you need to create an **access_token** with **refresh_token** with **"read_station"** scope. When the app is running the refresh_token will be refreshed automatically in order to be able to gather the api data as log as the app runs.

# Preparation token.json
Create a **token.json** file an make sure to pass it correctly as volume of your choice e.g.:

```yml
volumes:
      - ./token.json:/usr/src/app/token.json
```

The file should have this content:
```json
{
  "access_token": "<ACCESS TOKEN FROM NETATMO>",
  "refresh_token": "<REFRESH TOKEN FROM NETATMO>"
}
```

Make the file writable for the container:

```bash
chmod 666 token.json
```

# Docker
You can run the bridge using docker. See docker-compose.yml


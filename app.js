require('dotenv').config()
const mqtt = require('mqtt');
const request = require('request');
const date = require('date-and-time');
const Promise = require("bluebird");
const fs = require('fs');

const log = (message, level) => {

  const currentDateTime = date.format(new Date(), 'YYYY-MM-DD HH:mm:ss [GMT]Z');

  switch (level) {
    case 'warn':
      console.warn(`${currentDateTime} [WARN] ${message}`)
      break;

    case 'error':
      console.error(`${currentDateTime} [ERROR] ${message}`)
      break;

    default:
      console.log(`${currentDateTime} [INFO] ${message}`)
      break;
  }
}

const expiresInSec = 10000
const refreshTokenFile = "last_refreshtoken.txt";

let mqttTopicPrefix = "netatmo";
let baseUrl = "https://api.netatmo.com"
let publishIntervalSeconds = 300;

const requiredEnvs = ["CLIENT_ID", "CLIENT_SECRET", "REFRESH_TOKEN", "MQTT_HOST"]

requiredEnvs.forEach(env => {
  if (process.env[env] === undefined) {
    log(`Missing ${env} variable is missing. Exiting...`, 'warn');
    process.exit(1);
  }
});

if (process.env.BASEURL !== undefined) {
  baseUrl = process.env.BASEURL
}
if (process.env.INTERVAL !== undefined) {
  publishIntervalSeconds = process.env.INTERVAL
}

if (process.env.MQTT_TOPIC_PREFIX !== undefined) {
  mqttTopicPrefix = process.env.MQTT_TOPIC_PREFIX
}

let clientId = process.env.CLIENT_ID;
let clientSecret = process.env.CLIENT_SECRET;
let accessToken = process.env.ACCESS_TOKEN;
let refreshToken = process.env.REFRESH_TOKEN;

if (fs.existsSync(refreshTokenFile)) {
  fs.stat(refreshTokenFile, (error, stats) => {

    if (error) {
      log(`Error while accessing ${refreshTokenFile}: ${error}`, 'error');
    }
    if (date.addSeconds(stats.mtime, expiresInSec) < new Date()) {
      const fileContent = fs.readFileSync(refreshTokenFile);
      if (fileContent !== null && fileContent !== undefined && stats.size > 0) {
        log("Using local stored refreshToken", 'info');
        refreshToken = fileContent;
      }
    }
  });
}

let expireDate = new Date();
let hasError = false;

let mqttOptions = {
  clientId: "netatmobridge",
  protocol: "mqtt",
  host: process.env.MQTT_HOST,
  port: 1883
}

if (process.env.MQTT_USER && process.env.MQTT_PASSWORD) {
  mqttOptions["username"] = process.env.MQTT_USER;
  mqttOptions["password"] = process.env.MQTT_PASSWORD;
}

const mqttClient = mqtt.connect(mqttOptions);

let firstConnected = false;

mqttClient.on("connect", () => {
  if (firstConnected) {
    log(`Connected to mqtt host ${process.env.MQTT_HOST}.`, 'info');
    firstConnected = true;
  }
});

mqttClient.on("error", (error) => {
  log(`Could not connect to mqtt host ${process.env.MQTT_HOST}\n${error}`, 'error');
  process.exit(1);
});

mqttClient.on("end", () => {
  log(`Connection to MQTT broker ${process.env.MQTT_HOST} ended`, 'warn');
  process.exit(1);
});

mqttClient.on("reconnectnd", () => {
  log(`Reconnecting  to MQTT broker ${process.env.MQTT_HOST}`, 'info');
});

const convertToMQTT = (data) => {

  if (data.status === "ok") {

    data.body.devices.forEach((device, index) => {

      let deviceTopic = `${mqttTopicPrefix}/${device._id.replaceAll(":", "")}/`

      if (mqttClient.connected) {

        log("Publishing device data via mqtt", 'info')

        mqttClient.publish(`${deviceTopic}type`, device.type.toString());
        mqttClient.publish(`${deviceTopic}Temperature`, device.dashboard_data.Temperature.toString());
        mqttClient.publish(`${deviceTopic}CO2`, device.dashboard_data.CO2.toString());
        mqttClient.publish(`${deviceTopic}Humidity`, device.dashboard_data.Humidity.toString());
        mqttClient.publish(`${deviceTopic}Noise`, device.dashboard_data.Noise.toString());
        mqttClient.publish(`${deviceTopic}Pressure`, device.dashboard_data.Pressure.toString());

        device.modules.forEach(module => {

          let moduleTopic = `${deviceTopic}modules/${module._id.replaceAll(":", "")}/`

          mqttClient.publish(`${moduleTopic}type`, module.type);
          mqttClient.publish(`${moduleTopic}battery_percent`, module.battery_percent.toString());

          if (module.dashboard_data !== undefined) {
            mqttClient.publish(`${moduleTopic}Temperature`, module.dashboard_data.Temperature.toString());
            mqttClient.publish(`${moduleTopic}Humidity`, module.dashboard_data.Humidity.toString());
          }
        });
      }
    });
  }
}

const doTokenRefresh = () => {

  if (expireDate < new Date()) {
    request.post(
      {
        url: `${baseUrl}/oauth2/token`,
        form: {
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret
        }
      },
      (error, response, body) => {
        if (!error && response.statusCode == 200) {
          const jsonResult = JSON.parse(body);
          refreshToken = jsonResult.refresh_token;
          expireDate = date.addSeconds(new Date(), jsonResult.expires_in - 800);
          fs.writeFileSync(refreshTokenFile, jsonResult.refresh_token);
          log(`Updated netatmo api refresh token and saved it under ${refreshTokenFile}`, 'info')
        }
        else {
          hasError = true;
          log(JSON.stringify(response, null, 3), "warn");
          log(error, "error");
        }
      }
    )
  }
}


const getStationData = () => {

  doTokenRefresh();

  request.get(`${baseUrl}/api/getstationsdata?get_favorites=false`,
    {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    }, (error, response, body) => {
      if (!error && response.statusCode == 200) {
        const jsonResult = JSON.parse(body);
        convertToMQTT(jsonResult);
      } else {
        hasError = true;
        log(JSON.stringify(response, null, 3), "warn");
        log(error, "error");
        mqttClient.end(true);
        process.exit(1);
      }
    });
}

const publishNetatmo = () => {
  if (hasError) {
    log("Stopping proccess.", "error");
    mqttClient.end(true);
    process.exit(1);
  }
  else {
    log("Getting station data", 'info')
    getStationData();
    return Promise.delay(publishIntervalSeconds * 1000).then(() => publishNetatmo());
  }
}

publishNetatmo();
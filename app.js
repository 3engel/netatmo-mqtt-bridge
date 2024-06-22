require('dotenv').config()
const mqtt = require('mqtt');
const axios = require('axios');
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
const refreshTokenFile = "token.json";

let mqttTopicPrefix = "netatmo";
let baseUrl = "https://api.netatmo.com"
let publishIntervalSeconds = 300;

const requiredEnvs = ["CLIENT_ID", "CLIENT_SECRET", "MQTT_HOST"]

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
let accessToken = ''
let refreshToken = ''

if (fs.existsSync(refreshTokenFile)) {

  const fileContent = fs.readFileSync(refreshTokenFile);
  if (fileContent !== null && fileContent !== undefined) {
    log(`Using stored ${refreshTokenFile}`, 'info');

    const fileJson = JSON.parse(fileContent);
    refreshToken = fileJson.refresh_token;
    accessToken = fileJson.access_token;
    log(`Access Token: ${accessToken}`)
    log(`Refresh Token: ${refreshToken}`)

  }
}
else {
  log(`No ${refreshTokenFile} not found. Please create one.`);
  process.exit(1);
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

const doTokenRefresh = async () => {

  if (expireDate < new Date()) {

    try {

      var bodyFormData = new FormData();

      const response = await axios.post(
        `${baseUrl}/oauth2/token`,
        {
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret
        },
        {
          headers: { 'content-type': 'application/x-www-form-urlencoded' }
        }
      );

      if (response.status === 200) {
        refreshToken = response.data.refresh_token;
        accessToken = response.data.access_token;
        expireDate = date.addSeconds(new Date(), response.data.expires_in - 800);
        fs.writeFileSync(refreshTokenFile, JSON.stringify(response.data, null, 2));
        log(`Updated netatmo api token and saved it under ${refreshTokenFile}`, 'info')
      }
    } catch (error) {
      hasError = true;
      log(JSON.stringify(error, null, 2), "error");
      if (error.response.data.error) {
        log(`Response error: ${error.response.data.error}`, "error");
      }
    }
  }
}


const getStationData = async () => {

  await doTokenRefresh();

  try {

    const response = await axios.get(
      `${baseUrl}/api/getstationsdata?get_favorites=false`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });

    if (response.status === 200) {
      convertToMQTT(response.data);
    }
  } catch (error) {
    hasError = true;
    log(JSON.stringify(error, null, 2), "error");
    if (error.response.data.error) {
      log(`Response error: ${error.response.data.error}`, "error");
    }
    mqttClient.end(true);
    process.exit(1);
  }
}

const publishNetatmo = async () => {
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
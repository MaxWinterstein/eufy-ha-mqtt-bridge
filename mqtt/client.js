const MQTT = require('async-mqtt')
const get = require('get-value')
const winston = require('winston')
const DB = require('../db')
const Settings = require('../enums/settings')
const NotificationType = require('../enums/notification_type')
const HaDiscovery = require('./ha-discovery')

class MqttClient {

  async connect() {
    const url = await DB.getSetting(Settings.MQTT_URL)
    const username = await DB.getSetting(Settings.MQTT_USERNAME)
    const password = await DB.getSetting(Settings.MQTT_PASSWORD)

    this.client = await MQTT.connectAsync(url, {
      username: username,
      password: password,
      keepalive: 60,
      reconnectPeriod: 1000
    })

    this.client.on('error', error => {
      winston.error(`MQTT error`, { error })
    })

    this.client.on('reconnect', () => {
      winston.info(`MQTT reconnect`)
    })

    this.client.on('close', () => {
      winston.info('MQTT connection closed')
    })

    this.client.on('message', async (topic, message) => {
      winston.debug(`MQTT message: [${topic}]: ${message.toString()}`)
      if (topic === 'homeassistant/status') {
        if (message.toString() === 'online') {
          await this.setupAutoDiscovery()
        }
      }
    })

    try {
      await this.client.subscribe('homeassistant/status')
      winston.debug(`Subscribed to homeassistant/status`)
    } catch (e) {
      winston.error(`Error subscribing to homeassistant/status`, { exception: e })
    }
  }

  async setupAutoDiscovery () {
    const devices = await DB.getDevices()
    for (let device of devices) {
      const configs = HaDiscovery.discoveryConfigs(device)
      for (let config of configs) {
        await this.client.publish(config.topic, config.message)
      }
    }
  }

  async sendMotionDetectedEvent (device_sn, attributes) {
    await this.client.publish(`${HaDiscovery.motionDetectedBaseTopic(device_sn)}/state`, 'motion')
    await this.client.publish(`${HaDiscovery.motionDetectedBaseTopic(device_sn)}/attributes`, JSON.stringify(attributes))
  }

  async sendDoorbellPressedEvent (device_sn, attributes) {
    await this.client.publish(`${HaDiscovery.doorbellPressedBaseTopic(device_sn)}/state`, 'motion')
    await this.client.publish(`${HaDiscovery.doorbellPressedBaseTopic(device_sn)}/attributes`, JSON.stringify(attributes))
  }

  async processPushNotification (notification) {
    let type = parseInt(get(notification, 'payload.payload.event_type', { default: 0 }))
    if (type === 0) {
      type = parseInt(get(notification, 'payload.type', { default: 0 }))
    }

    winston.debug(`Got Push Notification of type ${type}`)

    switch (type) {
      case NotificationType.DOORBELL_PRESSED:
        await this.doorbellEvent(notification)
        break
      case NotificationType.DOORBELL_SOMEONE_SPOTTED:
      case NotificationType.CAM_SOMEONE_SPOTTED:
        await this.motionDetectedEvent(notification)
        break
    }
  }

  async doorbellEvent (event) {
    let device_sn = get(event, 'payload.device_sn')
    if (!device_sn) {
      device_sn = get(event, 'payload.payload.device_sn')
      if (!device_sn) {
        winston.warn(`Got doorbellEvent with unknown device_sn`, { event })
        return
      }
    }

    const attributes = {
      event_time: get(event, 'payload.event_time'),
      thumbnail: get(event, 'payload.payload.pic_url')
    }

    try {
      await this.sendDoorbellPressedEvent(device_sn, attributes)
    } catch (e) {
      winston.error(`Failure in doorbellEvent`, { exception: e })
    }
  }

  async motionDetectedEvent (event) {
    let device_sn = get(event, 'payload.device_sn')
    if (!device_sn) {
      device_sn = get(event, 'payload.payload.device_sn')
      if (!device_sn) {
        winston.warn(`Got motionDetectedEvent with unknown device_sn`, { event })
        return
      }
    }

    const attributes = {
      event_time: get(event, 'payload.event_time'),
      thumbnail: get(event, 'payload.payload.pic_url')
    }

    try {
      await this.sendMotionDetectedEvent(device_sn, attributes)
    } catch (e) {
      winston.error(`Failure in doorbellEvent`, { exception: e })
    }
  }

}

module.exports = MqttClient

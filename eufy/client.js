const config = require('../config')
const { MqttClient } = require('../mqtt')
const { EufyHttp, EufyPush } = require('../eufy')

class EufyClient {

  async init() {
    this.mqttClient = new MqttClient()
    this.eufyHttpClient = new EufyHttp(config.eufyUsername, config.eufyPassword)
    this.eufyPush = new EufyPush(this.mqttClient)

    await this.mqttClient.connect()
    await this.eufyHttpClient.refreshDevices()
    await this.mqttClient.setupAutoDiscovery()
    await this.eufyPush.retrievePushCredentials()
    await this.eufyPush.startPushClient()
    const fcmToken = this.eufyPush.getFcmToken()
    await this.eufyHttpClient.registerPushToken(fcmToken)
    //
    // setInterval(async () => {
    //   console.log('checking push token')
    //   await this.eufyHttpClient.checkPushToken()
    // }, 30 * 1000)
  }
}

module.exports = EufyClient

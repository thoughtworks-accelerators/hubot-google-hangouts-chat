/**
 * Copyright 2018 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict'

const {Adapter, User, TextMessage} = require.main.require('hubot/es2015')
const PubSub = require(`@google-cloud/pubsub`)
const {google} = require('googleapis')
const {auth} = require('google-auth-library')
const {HangoutsChatTextMessage, AddedToSpaceTextMessage, AddedToSpaceMessage, RemovedFromSpaceMessage, CardClickedMessage} = require('./message')

class HangoutsChatBot extends Adapter {

  constructor(robot, options) {
    super(robot)
    this.subscriptionName =`projects/${options.projectId}/subscriptions/${options.subscriptionId}`
    this.isPubSub = options.isPubSub

    // Establish OAuth with Hangouts Chat. This is required for PubSub bots and
    // HTTP bots which want to create async messages.
    const authClientPromise = auth.getClient({
      scopes: ['https://www.googleapis.com/auth/chat.bot']
    })
    this.chatPromise = authClientPromise.then((credentials) =>
      google.chat({
        version: 'v1',
        auth: credentials,
      })).catch((err) =>
        robot.logger.error(`Hangouts Chat Authentication Failed! Please provide the credentials for your service account.\n${err}`))
  }

  postMessage_(space, thread = undefined, text = "", cardString = "[]") {
    if (text == "" && cardString == "[]") {
      throw new Error("You cannot send an empty message.")
    }

    let data = {
      space: {
        name: space,
      },
      text,
      cards: JSON.parse(cardString),
    }

    if (thread) {
      data.thread = thread
    }

    this.robot.logger.info(`Sending a message to space: ${space}`)
    this.createMessageUsingRestApi_(space, data)
  }

  send(envelope, ...strings) {
    this.postMessage_(this.getSpaceFromEnvelope_(envelope), this.getThreadFromEnvelope_(envelope),
      strings[0], strings[1])
    if (envelope.message) {
      envelope.message.setHandled()
    }
  }

  reply(envelope, ...strings) {
    if (!envelope.message) {
      throw new Error("When sending a reply, the envelope must contain a message");
    }
    this.postMessage_(this.getSpaceFromEnvelope_(envelope), envelope.message.thread, strings[0], strings[1])
  }

  getThreadFromEnvelope_(envelope){
    if (envelope.message) {
      return envelope.message.thread
    }

    if (envelope.room) {
      return envelope.room
    }
    return null
  }

  getSpaceFromEnvelope_(envelope) {
    if (envelope.message) {
      return envelope.message.space.name
    }

    if (envelope.room) {
      return envelope.room
    }

    throw new Error("When sending a message, the envelope must have either a message or a room.")
  }

  createMessageUsingRestApi_(space, message) {
    this.chatPromise.then((chat) => chat.spaces.messages.create({
            parent: space,
            requestBody: message
        }))
        .catch((err) =>
            this.robot.logger.error("Message creation failed.", err))
  }

  startPubSubClient() {
    const pubsub = PubSub()
    this.robot.logger.info(`Connecting to Pub/Sub subscription - ${this.subscriptionName}`)
    const subscription = pubsub.subscription(this.subscriptionName)
    const messageHandler = (pubsubMessage) => {
      this.robot.logger.debug(`Received message ${pubsubMessage.id}:`)
      this.robot.logger.debug(`\tData: ${pubsubMessage.data}`)
      const dataUtf8encoded = Buffer.from(pubsubMessage.data, 'base64').toString('utf8')
      let event
      try {
        event = JSON.parse(dataUtf8encoded)
      } catch (ex) {
        logging.warn('Bad request')
        pubsubMessage.ack()
        return
      }
      this.onEventReceived(event, null)
      pubsubMessage.ack()
    }
    // Listen for new messages until timeout is hit.
    subscription.on("message", messageHandler)
  }

  onEventReceived(event, res) {
    const message = event.message
    const space = event.space
    event.user.id = event.user.name
    event.user.name = event.user.displayName
    let user = new User(event.user.name, event.user)

    // This is the room value used in the Message constructor. Added for
    // compatibility with Hubot's API.
    user.room = space.name
    const eventTime = event.eventTime

    let hangoutsChatMessage
    switch(event.type) {
      case "ADDED_TO_SPACE":
        hangoutsChatMessage = message ? new AddedToSpaceTextMessage(user, message.text || "", message.name, space,
              message.thread, eventTime, res) :  new AddedToSpaceMessage(user, space, eventTime, res)
        break
      case "REMOVED_FROM_SPACE":
        hangoutsChatMessage = new RemovedFromSpaceMessage(user, space, eventTime, res)
        break
      case "MESSAGE":
        let text = message.text || ""
        if(space.type === "DM") text = `@${this.robot.name} ${text}`
        hangoutsChatMessage = new HangoutsChatTextMessage(user, text, message.name, space, message.thread,
          eventTime, res)
        break
      case "CARD_CLICKED":
        hangoutsChatMessage = new CardClickedMessage(user, space, eventTime, res, message.thread,
          event.action.actionMethodName, event.action.parameters)
        break
      default:
        this.robot.logger.error(`Unrecognized event type: ${event.type}`)
        return
    }
    this.receive(hangoutsChatMessage)
    this.emit("received", hangoutsChatMessage)
  }

  run() {
    if (this.isPubSub) {
      this.startPubSubClient()
    } else {
      this.robot.router.post("/", (req, res) => {
        this.onEventReceived(req.body, res)
        res.status(200).end()
      })
    }

    this.robot.logger.info("Hangouts Chat adapter initialized successfully")
    // To make Hubot load scripts
    this.emit("connected")
  }
}

module.exports = HangoutsChatBot

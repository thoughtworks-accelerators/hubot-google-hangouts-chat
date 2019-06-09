const dm = require("./messages-from-chat/dm.json")
const addToRoom = require("./messages-from-chat/add-to-room.json")
const {google} = require('googleapis')
const {auth} = require('google-auth-library');
const Path = require("path")
const ROOT = Path.resolve(__dirname, "../.")
const Robot = require('../node_modules/hubot/src/robot.js')
const Assert = require("assert")
google.chat = options => {
    return {
        spaces: {
            messages: {
                create(message){
                    process.emit("message created", message)
                }
            }
        }
    }
}
auth.getClient = options => {
    return Promise.resolve()
}

Robot.prototype.loadAdapter = function(adapter) {
    try {
        this.adapter = require(adapter).use(this)
    } catch (err) {
        console.error(`Cannot load adapter ${adapter} - ${err}`)
        process.exit(1)
    }
}
const port = process.env.PORT || 8080
const botOptions = {
    adapterPath: ROOT,
    adapterName: "../main.js",
    enableHttpd: true,
    botName: "hubot",
    botAlias: null
}

const robot = new Robot(botOptions.adapterPath, botOptions.adapterName,
    botOptions.enableHttpd, botOptions.botName, botOptions.botAlias)
robot.load(Path.resolve(ROOT, "./scripts"))
robot.run()

describe("Integration test", () => {
    it("Should adapt to Hubot's transport schema. ", done => {
        const botName = "hubot"
        const expected = `@${botName} ${dm.message.text}`
        const expectedName = dm.message.sender.displayName
        robot.adapter.once("received", message => {
            Assert.strictEqual(message.text, expected, "Text should include bot name, Google Chat doesn't include the bot name with Direct Messages.")
            Assert.strictEqual(message.user.id, dm.user.name, "There should be a new ID property that equals the Google Chat name of the user.")
            Assert.strictEqual(message.user.name, expectedName, "Google's name field is really an ID. Map it to the Display Name.")
            done()
        })

        robot.http(`http://localhost:${port}/`)
            .header("Content-Type", "application/json")
            .post(JSON.stringify(dm))
    })

    it("Should not bomb on an add to room message", done => {
        robot.adapter.once("received", message => {
            Assert.strictEqual(message.user.room, addToRoom.space.name, `Should have the room name. ${message.user.room}`)
            done()
        })
        robot.http(`http://localhost:${port}/`)
            .header("Content-Type", "application/json")
            .post(JSON.stringify(addToRoom))
    })

    it("A script should reply to the room that the message was sent from", done => {
        let directMessage = Object.assign({}, dm)
        directMessage.message.text = "testing say something"
        process.once("message created", message => {
            Assert.strictEqual(message.requestBody.text, "Hi. Thanks for testing me", "Script should responde.")
        }) 
        robot.adapter.once("received", message => {
            Assert.strictEqual(message.user.room, directMessage.space.name, `Should reply to the same room. ${message.user.room}`)
            done()
        })
        robot.http(`http://localhost:${port}/`)
            .header("Content-Type", "application/json")
            .post(JSON.stringify(directMessage))
    })
})

after(done => {
    robot.shutdown()
    done()
})

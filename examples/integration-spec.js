const dm = require("./messages-from-chat/dm.json")
const dmInRoom = require("./messages-from-chat/dm-in-room.json")
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

describe("Hubot Google Chat Adapter Integration Test", () => {
    it("Google Chat's message schema is different that Hubot's. The Adapter should map to Hubot's schema.", done => {
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

    it("Space name should map to Hubot's user room for an Add To Room message.", done => {
        robot.adapter.once("received", message => {
            Assert.strictEqual(message.user.room, addToRoom.space.displayName, `Should have the room name. ${message.user.room}`)
            done()
        })
        robot.http(`http://localhost:${port}/`)
            .header("Content-Type", "application/json")
            .post(JSON.stringify(addToRoom))
    })

    it("A script should reply with null room when the message is a direct message", done => {
        let directMessage = Object.assign({}, dm)
        directMessage.message.text = "testing say something"
        process.once("message created", message => {
            Assert.strictEqual(message.requestBody.text, "Hi. Thanks for testing me", "Script should responde.")
        }) 
        
        robot.adapter.once("received", message => {
            Assert.strictEqual(message.user.room, null, `Should reply to the same room. ${message.user.room}`)
            done()
        })

        robot.http(`http://localhost:${port}/`)
            .header("Content-Type", "application/json")
            .post(JSON.stringify(directMessage))
    })

    it("Message sent with bot name in it should respond with help commands within expected room.", done => {
        let directMessage = Object.assign({}, dmInRoom)
        directMessage.message.text = "@hubot help"
        process.once("message created", message => {
            Assert.strictEqual(message.requestBody.text, robot.helpCommands().join("\n"), "Script should responde.")
        })
        robot.adapter.once("received", message => {
          Assert.strictEqual(message.user.room, dmInRoom.space.displayName, `Should reply to the same room. ${message.user.room}`)
          done()
        })
        robot.http(`http://localhost:${port}/`)
            .header("Content-Type", "application/json")
            .post(JSON.stringify(directMessage))((err, resp, body)=>{
                Assert.equal(body, "", "Should respond with an empty string")
            })
    })

})

after(done => {
    robot.shutdown()
    done()
})

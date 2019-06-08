const dm = require("./messages-from-chat/dm.json")
const {google} = require('googleapis')
const {auth} = require('google-auth-library');
const Hubot = require("hubot")
const Path = require("path")
const ROOT = Path.resolve(__dirname, "../.")
const Robot = require('../node_modules/hubot/src/robot.js')
const Assert = require("assert")
google.chat = options => {}
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

describe("Integration test", () => {

    let robot = new Robot(botOptions.adapterPath, botOptions.adapterName,
        botOptions.enableHttpd, botOptions.botName, botOptions.botAlias)
    robot.run()

    it("Should adapt to Hubot's transport schema. ", done => {
        const botName = "hubot"
        const expected = `@${botName} ${dm.message.text}`
        const expectedName = dm.message.sender.displayName
        robot.receive = (message) => {
            robot.shutdown()
            Assert.strictEqual(message.text, expected, "Text should include bot name, Google Chat doesn't include the bot name with Direct Messages.")
            Assert.strictEqual(message.user.id, dm.user.name, "There should be a new ID property that equals the Google Chat name of the user.")
            Assert.strictEqual(message.user.name, expectedName, "Google's name field is really an ID. Map it to the Display Name.")
            done()
        }
        robot.http(`http://localhost:${port}/`)
            .header("Content-Type", "application/json")
            .post(JSON.stringify(dm))((err, message, body)=>{console.log(err, body)})
    })
})

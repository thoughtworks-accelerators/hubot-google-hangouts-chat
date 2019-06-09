// Description:
//   a bot to test adapters
//
// Dependencies:
//
// Configuration:
//
// Commands:
//   hubot - will validate reply with something
//
// Notes:
//
// Author:
//   joeyguerra

module.exports = robot => {
    robot.respond(/testing (.*)/, resp => {
        resp.reply("Hi. Thanks for testing me")
    })  
}
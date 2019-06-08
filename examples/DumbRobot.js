class DumbRobot {
    constructor(delegate, name){
        this.delegate = delegate
        this.name = name
        this.handlers = []
    }
    receive(chatMessage){
        this.delegate(chatMessage)
    }
    get logger(){
        return console
    }
    get router(){
        return {
            post: (regex, handler) => {
                this.handlers.push({regex, handler})
            }
        }
    }
    runHandlers(message){
        this.handlers.forEach( h => {
            let req = {body: message}
            let res = null
            h.handler(req, res)
        })    
    }
}

module.exports = DumbRobot
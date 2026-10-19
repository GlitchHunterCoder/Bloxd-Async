globalThis.GeneratorFunction = function*(){}.constructor
globalThis.Generator = function*(){}().constructor

TS = new class {
    constructor() {
        this.tasks = {
            0: {
                data: null,
                next: 0, 
                prev: 0 
            }
        }
        this.cursor = 0
        this.nextId = 1
    }

    add(gen, ...params) {
        gen = TS.run(gen, ...params)
        let id = this.nextId++
        let next = this.tasks[this.cursor].next
        this.tasks[id] = {
            data: gen,
            next: next,
            prev: this.cursor
        }
        this.tasks[this.cursor].next = id
        this.tasks[next].prev = id
        return id
    }

    run(gen, ...params){
        if(typeof gen === "function"){gen = gen(...params)}
        if(gen.constructor !== Generator){gen = function*(A){return A}(gen)}
        return gen
    }

    del(id) {
        if (id === 0) return false
        let task = this.tasks[id]
        if (!task) return false
        this.tasks[task.prev].next = task.next
        this.tasks[task.next].prev = task.prev
        if (this.cursor === id) this.cursor = task.prev
        delete this.tasks[id]
        return true
    }

    tick() {
        while(1){
            let id = this.tasks[this.cursor].next
            this.cursor = id
            if (id === 0) return
            let task = this.tasks[id]
            let result = task.data.next()
            if (result.done) this.del(id)
        }
    }
}

function tick() { TS.tick() }

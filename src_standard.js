globalThis.GeneratorFunction = function*(){}.constructor
globalThis.Generator = function*(){}().constructor

let TaskScheduler = class {
  constructor() {
    this.tasks       = []
    this.tasksById   = {}
    this.currentTask = null 
    this.nextId      = 1
    this.cursor      = 0
    this.tickCount   = 0
  }
  init(task, ...params) {
    if (task instanceof Generator) return task
    if (task instanceof GeneratorFunction) return task(...params)
    if (task instanceof Function) return (function* () { return task(...params) })()
    return (function* () { return task })()
  }
  *run(fn, ...params) {
    let gen = this.init(fn, ...params)
    let result = {done:false}
    while (!result.done) { yield (result = gen.next()); }
    return result.value
  }
  add(gen) {
    let task = { id: this.nextId++, gen, index: this.tasks.length }
    this.tasks.push(task)
    this.tasksById[task.id] = task
    return task.id
  }
  delById(id) {
    let task = this.tasksById[id]
    if (task) this._removeTask(task)
  }
  _removeTask(task) {
    let last = this.tasks.pop()
    if (last !== task) { this.tasks[task.index] = last; last.index = task.index }
    delete this.tasksById[task.id]
    if (this.currentTask === task) this.currentTask = null
  }
  iters() { return this.tickCount }
  tick() {
    if (!this.tasks.length) return
    if (this.cursor >= this.tasks.length) this.cursor = 0
    let task = this.tasks[this.cursor]
    this.currentTask = task
    let res;
    try { res = task.gen.next() }
    catch (e) { this._removeTask(task); throw e}
    if (res.done) this._removeTask(task)
    else this.cursor = (task.index + 1) % this.tasks.length
    this.currentTask = null
    this.tickCount++
  }
}

globalThis.TS = (()=>{
  let gen = new TaskScheduler()
  return {
    gen,
    init(task, ...params) { return gen.init(task, ...params) },
    add(task, ...params) { return gen.add(this.init(task, ...params)) },
    del(id) { gen.delById(id) },
    *run(fn, ...params) { return yield* gen.run(fn, ...params) },
    iters() { return gen.iters() },
    id() { return gen.currentTask?.id ?? null },
    stats() {return { count: gen.tasks.length, current: this.id(), nextId: gen.nextId }},
    tick() { gen.tick() }
  }
})()

function tick() { TS.tick() }

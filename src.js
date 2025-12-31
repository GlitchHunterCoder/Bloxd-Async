globalThis.GeneratorFunction = function*(){}.constructor;
globalThis.Generator = function*(){}().constructor;

class TaskScheduler {
  constructor() {
    this.tasks = []
    this.inx = 0
    this.current = 0
    this.nextId = 1
    this.debug = false
    this.run={keep:false,cont:false}
  }
  add(gen, priority = 0) {
    const task = { id: this.nextId++, gen, priority }
    this.tasks.push(task)
    return task.id
  }
  getHighestPriority() {
    if (this.tasks.length === 0) return null
    return Math.max(...this.tasks.map(t => t.priority))
  }
  next(highest) {
    if (this.tasks.length === 0) return null
    const same = this.tasks.filter(t => t.priority === highest)
    if (same.length === 0) return null
    const task = same[this.inx % same.length]
    this.current = this.tasks.indexOf(task)
    this.inx = (this.inx + 1) % same.length
    return task
  }
  del(index = this.current) {
    if (this.tasks.length === 0) return
    const task = this.tasks[index]
    Channel.close(task.id)
    this.tasks.splice(index, 1)
    this.inx = 0
  }
  delById(id) {
    const index = this.tasks.findIndex(t => t.id === id)
    if (index !== -1) this.del(index)
  }
  keep(){
    this.run.keep=true
  }
  cont(){
    this.run.cont=true
  }
  tick() {
    if (this.tasks.length === 0) return
    const highest = this.getHighestPriority()
    if (highest === null) return
    let task
    if (this.run.keep) {
      task = this.tasks[this.current]
      this.run.keep = false
    } else {
      task = this.next(highest)
    }
    if (!task) return
    if (this.debug) {
      console.log(`[TASK ${task.id}] resume`)
    }
    const result = task.gen.next()
    if (result.done) {
      if (this.debug) console.log(`[TASK ${task.id}] completed`)
      this.del()
    } else if (this.debug) {
      console.log(`[TASK ${task.id}] yield`)
    }
    if (this.run.cont) {
      this.run.cont = false
      this.tick()
    }
  }
}
globalThis.TS = new class {
  constructor() {
    this.gen = new TaskScheduler()
  }
  add(task, priority = 0, ...params) {
    return this.gen.add(this.init(task, ...params), priority)
  }
  debug(e) {
    this.gen.debug = e
    return e
  }
  run = function* (fn, ...params) {
    const gen = this.init(fn, ...params)
    let result = gen.next()
    while (!result.done) {
      yield
      result = gen.next()
    }
    return result.value
  }
  init(task, ...params) {
    if (task && typeof task.next === 'function' && typeof task.throw === 'function') {
      return task
    }
    if (typeof task === "function") {
      const result = task(...params)
      if (result && typeof result.next === 'function' && typeof result.throw === 'function') {
        return result
      }
      return (function* () { return result })()
    }
    return (function* () { return task })()
  }
  id() {
    return this.current().id
  }
  del(id) {
    this.gen.delById(id)
  }
  current() {
    const task = this.gen.tasks[this.gen.current]
    if (!task) throw new Error("TS.current() called outside of a running task")
    return task
  }
  stats() {
    return {
      tasks: this.gen.tasks,
      nextId: this.gen.nextId,
      current: this.gen.current,
      inx: this.gen.inx
    }
  }
  keep(){
    this.gen.keep()
  }
  cont(){
    this.gen.cont()
  }
  tick() { this.gen.tick() }
}
class PackageManager {
  constructor() {
    this.packs = {}
    this.init()
  }

  getOverride(name) {
    for (const packName in this.packs) {
      const pack = this.packs[packName]
      if (!pack.override) continue
      const fn = pack.override[name]
      if (typeof fn === "function") return fn
    }
    return undefined
  }

  wrap(target, prefix) {
    for (const key of Object.getOwnPropertyNames(target)) {
      const original = target[key]
      if (typeof original !== "function") continue

      const overrideName = `${prefix}.${key}`

      target[key] = (...args) => {
        const fn = this.getOverride(overrideName)
        if (fn) {
          return fn(original.bind(target), ...args)
        }
        return original.apply(target, args)
      }
    }
  }

  init() {
    this.wrap(TS, "TS")
    this.wrap(TaskScheduler.prototype, "TaskScheduler")
  }
}
globalThis.PM = new class {
  constructor() {
    this.mod = new PackageManager()
  }
  add(name, data) {
    this.mod.packs[name] = data
  }
  run(name) {
    return this.mod.packs[name]
  }
  del(name) {
    delete this.mod.packs[name]
  }
  override(name) {
    return this.mod.getOverride(name)
  }
}

function exportToPM(name, value) {
  PM.add(name, value)
  return value
}
function exportToGlobal(name, alias) {
  const pkg = PM.run(name)
  if (!pkg) throw new Error(`Package "${name}" not found`)
  globalThis[alias ?? name] = pkg
  return pkg
}
function deleteFromPM(name) {
  PM.del(name)
}
function deleteFromGlobal(name) {
  if (globalThis[name] !== undefined) delete globalThis[name]
}

function tick() {
  TS.tick()
}

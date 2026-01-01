globalThis.GeneratorFunction = function*(){}.constructor;
globalThis.Generator = function*(){}().constructor;

class TaskScheduler {
  constructor() {
    this.tasksByPriority = new Map()
    this.priorities = []
    this.currentTask = null
    this.nextId = 1
    this.debug = false
    this.run = {keep:false,cont:false,iters:0}
  }
  add(gen, priority = 0) {
    let bucket = this.tasksByPriority.get(priority)
    if (!bucket) {
      bucket = { list: [], inx: 0 }
      this.tasksByPriority.set(priority, bucket)
  
      // insert priority sorted (desc)
      let i = 0
      while (i < this.priorities.length && this.priorities[i] > priority) i++
      this.priorities.splice(i, 0, priority)
    }
  
    const task = {
      id: this.nextId++,
      gen,
      priority,
      index: bucket.list.length
    }
  
    bucket.list.push(task)
    return task.id
  }
  delById(id) {
    for (const bucket of this.tasksByPriority.values()) {
      const task = bucket.list.find(t => t.id === id)
      if (task) {
        this._removeTask(task)
        return
      }
    }
  }
  _removeTask(task) {
    const bucket = this.tasksByPriority.get(task.priority)
    if (!bucket) return
  
    const last = bucket.list.pop()
    if (last !== task) {
      bucket.list[task.index] = last
      last.index = task.index
    }
  
    if (!bucket.list.length) {
      this.tasksByPriority.delete(task.priority)
      this.priorities.splice(this.priorities.indexOf(task.priority), 1)
    }
  
    if (this.currentTask === task) {
      this.currentTask = null
    }
  }
  keep() {
    this.run.keep = true
  }
  cont() {
    this.run.cont = true
  }
  iters(){
    return this.run.iters
  }
  tick() {
    this.run.iters = 0
    if (!this.priorities.length) return
    do {
      this.run.cont = false
      let task
      if (this.run.keep && this.currentTask) {
        task = this.currentTask
        this.run.keep = false
      } else {
        const priority = this.priorities[0]
        const bucket = this.tasksByPriority.get(priority)
        if (!bucket || !bucket.list.length) return
        task = bucket.list[bucket.inx]
        bucket.inx = (bucket.inx + 1) % bucket.list.length
        this.currentTask = task
      }
      if (this.debug) {
        console.log(`[TASK ${task.id}] resume`)
      }
      const r = task.gen.next()
      if (r.done) {
        if (this.debug) {
          console.log(`[TASK ${task.id}] completed`)
        }
        const bucket = this.tasksByPriority.get(task.priority)
        const last = bucket.list.pop()
        if (last !== task) {
          bucket.list[task.index] = last
          last.index = task.index
        }
        if (!bucket.list.length) {
          this.tasksByPriority.delete(task.priority)
          this.priorities.splice(this.priorities.indexOf(task.priority), 1)
        }
        this.currentTask = null
      } else if (this.debug) {
        console.log(`[TASK ${task.id}] yield`)
      }
      this.run.iters++
    } while (this.run.cont)
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
  *run(fn, ...params) {
    const gen = this.init(fn, ...params)
    let r = gen.next()
    while (!r.done) {
      yield
      r = gen.next()
    }
    return r.value
  }
  init(task, ...params) {
    if (task && typeof task.next === "function") return task
    if (typeof task === "function") {
      const r = task(...params)
      if (r && typeof r.next === "function") return r
      return (function* () { return r })()
    }
    return (function* () { return task })()
  }
  id() {
    if (!this.gen.currentTask) {
      throw new Error("TS.id() called outside task")
    }
    return this.gen.currentTask.id
  }
  del(id) {
    this.gen.delById(id)
  }
  keep() {
    this.gen.keep()
  }
  cont() {
    this.gen.cont()
  }
  iters() {
    return this.gen.iters()
  }
  stats() {
    return {
      priorities: [...this.gen.priorities],
      current: this.gen.currentTask?.id ?? null,
      nextId: this.gen.nextId
    }
  }
  tick() {
    this.gen.tick()
  }
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

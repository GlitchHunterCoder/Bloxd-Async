globalThis.GeneratorFunction = function*(){}.constructor;
globalThis.Generator = function*(){}().constructor;

function deepCloneMap(map) {
  const clone = new Map()
  for (const [key, bucket] of map) {
    const newBucket = {
      list: bucket.list.map(t => ({
        ...t,
        gen: t.gen
      })),
      inx: bucket.inx
    }
    clone.set(key, newBucket)
  }
  return clone
}

function deepClone(value, seen = new Map()) {
  if (value === null || typeof value !== "object") return value
  if (value instanceof Generator) return value
  if (seen.has(value)) return seen.get(value)
  let out
  if (Array.isArray(value)) {
    out = []
    seen.set(value, out)
    for (let i = 0; i < value.length; i++) {
      out[i] = deepClone(value[i], seen)
    }
    return out
  }
  if (value instanceof Map) {
    out = new Map()
    seen.set(value, out)
    for (const [k, v] of value.entries()) {
      out.set(k, deepClone(v, seen))
    }
    return out
  }
  out = {}
  seen.set(value, out)
  for (const k of Object.keys(value)) {
    if (k === "gen") {
      out[k] = value[k]
    } else {
      out[k] = deepClone(value[k], seen)
    }
  }
  return out
}

function withIdempotent(keys, fn) {
  const originals = {}
  const shadow = {}
  for (const k of keys) {
    originals[k] = globalThis[k]
    shadow[k] = deepClone(globalThis[k])
    globalThis[k] = shadow[k]
  }
  let result
  try {
    result = fn()
  } catch (e) {
    for (const k of keys) {
      globalThis[k] = originals[k]
    }
    throw e
  }
  for (const k of keys) {
    globalThis[k] = shadow[k]
  }
  return result
}

class TaskScheduler {
  constructor() {
    this.tasksByPriority = new Map()
    this.priorities = []
    this.currentTask = null
    this.nextId = 1
    this.debug = false
    this.run = {keep:false,cont:false,iters:0}
    this.tasksById = new Map()
  }
  add(gen, priority = 0) {
    let bucket = this.tasksByPriority.get(priority)
    if (!bucket) {
      bucket = { list: [], inx: 0 }
      this.tasksByPriority.set(priority, bucket)
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
    this.tasksById.set(task.id, task)
  
    return task.id
  }
  delById(id) {
    const task = this.tasksById.get(id)
    if (!task) return
    this._removeTask(task)
  }
  _removeTask(task) {
    const bucket = this.tasksByPriority.get(task.priority)
    if (!bucket) return
    const last = bucket.list.pop()
    if (last !== task) {
      bucket.list[task.index] = last
      last.index = task.index
    }
    this.tasksById.delete(task.id)
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
    // clone transactional state
    const snapshot = {
      tasksByPriority: deepCloneMap(this.tasksByPriority),
      priorities: [...this.priorities],
      currentTask: this.currentTask
    }
    let { tasksByPriority, priorities, currentTask } = snapshot
    const run = this.run // live shared state
    let iters = 0
    if (!priorities.length) {
      this.run.iters = 0
      return
    }
    try {
      do {
        run.cont = false
        let task
        let bucket
        let nextBucketInx
        if (run.keep && currentTask) {
          task = currentTask
          run.keep = false
        } else {
          const priority = priorities[0]
          bucket = tasksByPriority.get(priority)
          if (!bucket || !bucket.list.length) break
          task = bucket.list[bucket.inx]
          nextBucketInx = (bucket.inx + 1) % bucket.list.length
        }
        if (this.debug) console.log(`[TASK ${task.id}] resume`)
        const r = task.gen.next()
        if (r.done) {
          const b = tasksByPriority.get(task.priority)
          if (b) {
            const last = b.list.pop()
            if (last !== task) {
              b.list[task.index] = last
              last.index = task.index
            }
            if (!b.list.length) {
              tasksByPriority.delete(task.priority)
              priorities.splice(priorities.indexOf(task.priority), 1)
            }
          }
          if (currentTask === task) currentTask = null
        } else {
          currentTask = task
        }
        if (!run.keep && nextBucketInx !== undefined) {
          bucket.inx = nextBucketInx
        }
        iters++
      } while (run.cont)
    } finally {
      // commit transactional state safely
      this.tasksByPriority = tasksByPriority
      this.priorities = priorities
      this.currentTask = currentTask
      this.run.iters = iters
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
    return withIdempotentGlobals(
      ["TS"],
      () => this.gen.tick()
    )
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

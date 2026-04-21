globalThis.GeneratorFunction = function*(){}.constructor
globalThis.Generator = function*(){}().constructor
let ErrMsg = (e) => api.broadcastMessage(`${e.name}: ${e.message}\n${e.stack}`, { color: "red" })
let Try = (fn, ctx = null, ...args) => {
  try { fn.apply(ctx, args) }
  catch (e) { ErrMsg(e) }
}

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
    if (task && typeof task.next === "function") return task
    if (task instanceof GeneratorFunction) return task(...params)
    if (typeof task === "function") return (function* () { return task(...params) })()
    return (function* () { return task })()
  }
  *run(fn, ...params) {
    let gen = this.init(fn, ...params)
    let result = gen.next()
    while (!result.done) { yield; result = gen.next() }
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
    if (this.cursor >= this.tasks.length) this.cursor = 0
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
    catch (e) { this._removeTask(task); ErrMsg(e); return }
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
    tick() { Try(gen.tick(),gen) }
  }
})()

let PackageManager = class {
  constructor() {
    this.packs         = Object.create(null)
    this.overrideIndex = Object.create(null)
    this.flattenMap    = Object.create(null)
    this.init()
  }

  localAdd(name, data) {
    this.packs[name] = data
  }

  localDelete(name) {
    if (!this.packs[name]) return;
    delete this.packs[name]
  }

  _activateOverrides(name) {
    let data = this.packs[name]
    if (!data?.override) return;
    let keys = Object.keys(data.override)
    data._ovKeys = keys
    keys.forEach(k => { this.overrideIndex[k] = data.override[k] })
  }

  _deactivateOverrides(name) {
    let data = this.packs[name]
    data?._ovKeys?.forEach(k => delete this.overrideIndex[k])
  }

  run(name)         { return this.packs[name] }
  getOverride(name) { return this.overrideIndex[name] }

  wrap(target, prefix, getInstance) {
    for (let k of Object.getOwnPropertyNames(target)) {
      let orig = target[k]
      if (typeof orig !== "function") continue
      let path = `${prefix}.${k}`
      target[k] = (...args) => {
        let fn = this.overrideIndex[path]
        let ctx = getInstance ? getInstance() : target
        return fn ? fn(orig.bind(ctx), ...args) : orig.apply(ctx, args)
      }
    }
  }

  init() {
    this.wrap(TS, "TS")
    this.wrap(TaskScheduler.prototype, "TaskScheduler", () => TS.gen)
  }

  globalAdd(name, alias) {
    let pkg = this.run(name)
    if (!pkg) throw new Error(`Package "${name}" not found`)
    if (alias === "globalThis" && typeof pkg === "object" && pkg) {
      let keys = Object.keys(pkg)
      if (keys.includes("globalThis")) throw new Error('Cannot export a key named "globalThis"')
      keys.forEach(k => { globalThis[k] = pkg[k] })
      this.flattenMap[name] = keys
    } else if (alias && globalThis[alias] && typeof globalThis[alias] === "object"){
      let keys = Object.keys(pkg)
      keys.forEach(k => { globalThis[alias][k] = pkg[k] })
      this.flattenMap[name] = { target: alias, keys }
    } else {
      globalThis[alias ?? name] = pkg
    }
    this._activateOverrides(name)
    return pkg
  }

  globalDelete(name) {
    if (name === "globalThis") throw new Error("Cannot delete globalThis itself")
    this._deactivateOverrides(name)
    let flat = this.flattenMap[name]
    if (flat?.target) {
    flat.keys.forEach(k => { delete globalThis[flat.target][k] })
    } else {
      flat?.forEach(k => delete globalThis[k])
      delete globalThis[name]
    }
    delete this.flattenMap[name]
  }
}

globalThis.PM = (() => {
  let mod = new PackageManager()
  return {
    mod,
    add: (n, d, a) => (mod.localAdd(n, d), mod.globalAdd(n, a)),
    run: (n) => mod.run(n),
    delete: (n) => (mod.globalDelete(n), mod.localDelete(n)),
    override: (n) => mod.getOverride(n),
    localAdd: (n, d) => mod.localAdd(n, d),
    globalAdd: (n, a) => mod.globalAdd(n, a),
    localDelete: (n) => mod.localDelete(n),
    globalDelete: (n) => mod.globalDelete(n)
  }
})()

function tick() { TS.tick() }

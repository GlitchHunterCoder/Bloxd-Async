declare const api: {
  broadcastMessage: (msg: string, opts?: { color?: string }) => void
}
type TaskEntry = { id: number; gen: Generator; index: number }
const GeneratorFunction = function*(){}.constructor as GeneratorFunctionConstructor
const Generator = function*(){}().constructor
const ErrMsg = (err: unknown) => {
  const e = err as Error
  api.broadcastMessage(`${e.name}: ${e.message}\n${e.stack}`, { color: "red" })
}
const Try = (fn: Function, ctx: any = null, ...args: any[]) => {
  try { fn.apply(ctx, args) }
  catch (e) { ErrMsg(e) }
}

class TaskScheduler {
  tasks:       TaskEntry[]
  tasksById:   Record<number, TaskEntry>
  currentTask: TaskEntry | null
  nextId:      number
  cursor:      number
  tickCount:   number
  constructor() {
    this.tasks        = []
    this.tasksById   = {}
    this.currentTask = null
    this.nextId      = 1
    this.cursor      = 0
    this.tickCount   = 0
  }
  init(task: any, ...params: any[]): Generator {
    if (task && typeof task.next === "function") return task
    if (task instanceof GeneratorFunction)       return task(...params)
    if (typeof task === "function")              return (function* () { return task(...params) })()
    return (function* () { return task })()
  }
  *run(fn: Function, ...params: any[]): any {
    const gen = this.init(fn, ...params)
    let result = gen.next()
    while (!result.done) { yield; result = gen.next() }
    return result.value
  }
  add(gen: Generator): number {
    const task = { id: this.nextId++, gen, index: this.tasks.length }
    this.tasks.push(task)
    this.tasksById[task.id] = task
    return task.id
  }
  delById(id: number) {
    const task = this.tasksById[id]
    if (task) this._removeTask(task)
  }
  _removeTask(task: TaskEntry) {
    const last = this.tasks.pop()!
    if (last !== task) { this.tasks[task.index] = last; last.index = task.index }
    delete this.tasksById[task.id]
    if (this.cursor >= this.tasks.length) this.cursor = 0
    if (this.currentTask === task) this.currentTask = null
  }
  iters(): number { return this.tickCount }
  tick(): void {
    if (!this.tasks.length) return
    if (this.cursor >= this.tasks.length) this.cursor = 0
    const task = this.tasks[this.cursor]
    this.currentTask = task
    try {
      const res = task.gen.next()
      if (res.done) this._removeTask(task)
      else this.cursor = (task.index + 1) % this.tasks.length
    } catch (e) { this._removeTask(task); ErrMsg(e) }
    this.currentTask = null
    this.tickCount++
  }
}

type TSObject = {
  gen:    TaskScheduler
  init:   (task: any, ...params: any[]) => Generator
  add:    (task: any, ...params: any[]) => number
  del:    (id: number) => void
  run:    (fn: any, ...params: any[]) => Generator
  iters:  () => number
  id:     () => number | null
  stats:  () => { count: number; current: number | null; nextId: number }
  tick:   () => void
}

const TS: TSObject = (()=>{
  const gen = new TaskScheduler()
  return {
    gen,
    init(task: any, ...params: any[]) { return gen.init(task, ...params) },
    add(task: any, ...params: any[]) { return gen.add(this.init(task, ...params)) },
    del(id: number) { gen.delById(id) },
    *run(fn, ...params: any[]) { return yield* gen.run(fn, ...params) },
    iters() { return gen.iters() },
    id() { return gen.currentTask?.id ?? null },
    stats() {return { count: gen.tasks.length, current: this.id(), nextId: gen.nextId }},
    tick() { gen.tick() }
  }
})()

type FlatEntry = string[] | { target: string; keys: string[] }

class PackageManager {
  packs:         Record<string, any>
  overrideIndex: Record<string, any>
  flattenMap:    Record<string, FlatEntry>
  constructor() {
    this.packs            = Object.create(null)
    this.overrideIndex    = Object.create(null)
    this.flattenMap       = Object.create(null)
    this.init()
  }

  localAdd(name: string, data: object) {
    this.packs[name] = data
  }

  localDelete(name: string) {
    if (!this.packs[name]) return;
    delete this.packs[name]
  }

  _activateOverrides(name: string) {
    const data = this.packs[name]
    if (!data?.override) return;
    const keys = Object.keys(data.override)
    data._ovKeys = keys
    keys.forEach(k => { this.overrideIndex[k] = data.override[k] })
  }

  _deactivateOverrides(name: string) {
    const data = this.packs[name]
    data?._ovKeys?.forEach((k: string) => delete this.overrideIndex[k])
  }

  run(name: string)         { return this.packs[name] }
  getOverride(name: string) { return this.overrideIndex[name] }

  wrap(target: Record<string, any>, prefix: string, getInstance?: () => any) {
    for (const k of Object.getOwnPropertyNames(target)) {
      const orig = target[k]
      if (typeof orig !== "function") continue
      const path = `${prefix}.${k}`
      target[k] = (...args: any[]) => {
        const fn = this.overrideIndex[path]
        const ctx = getInstance ? getInstance() : target
        return fn ? fn(orig.bind(ctx), ...args) : orig.apply(ctx, args)
      }
    }
  }

  init() {
    this.wrap(TS as Record<string, any>, "TS")
    this.wrap(TaskScheduler.prototype as Record<string, any>, "TaskScheduler", () => TS.gen)
  }

  globalAdd(name: string, alias: string) {
    const pkg = this.run(name)
    if (!pkg) throw new Error(`Package "${name}" not found`)
    const g = globalThis as Record<string, any>
    if (alias === "globalThis" && typeof pkg === "object" && pkg) {
      const keys = Object.keys(pkg)
      if (keys.includes("globalThis")) throw new Error('Cannot export a key named "globalThis"')
      keys.forEach(k => { g[k] = pkg[k] })
      this.flattenMap[name] = keys
    } else if (alias && g[alias] && typeof g[alias] === "object"){
      const keys = Object.keys(pkg)
      keys.forEach(k => { g[alias][k] = pkg[k] })
      this.flattenMap[name] = { target: alias, keys }
    } else {
      g[alias ?? name] = pkg
    }
    this._activateOverrides(name)
    return pkg
  }

  globalDelete(name: string) {
    if (name === "globalThis") throw new Error("Cannot delete globalThis itself")
    this._deactivateOverrides(name)
    const flat = this.flattenMap[name] as any
    const g = globalThis as Record<string, any>
    if (flat?.target) {
      flat.keys.forEach((k: string) => { delete g[flat.target][k] })
    } else {
      flat?.forEach((k: string) => delete g[k])
      delete g[name]
    }
    delete this.flattenMap[name]
  }
}

const PM = (() => {
  const mod = new PackageManager()
  return {
    mod,
    add: (n: string, d: object, a: string) => (mod.localAdd(n, d), mod.globalAdd(n, a)),
    run: (n: string) => mod.run(n),
    delete: (n: string) => (mod.globalDelete(n), mod.localDelete(n)),
    override: (n: string) => mod.getOverride(n),
    localAdd: (n: string, d: object) => mod.localAdd(n, d),
    globalAdd: (n: string, a: string) => mod.globalAdd(n, a),
    localDelete: (n: string) => mod.localDelete(n),
    globalDelete: (n: string) => mod.globalDelete(n)
  }
})()

function tick() { Try(TS.tick, TS) }

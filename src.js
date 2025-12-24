globalThis.GeneratorFunction=function*(){}.constructor;
globalThis.Generator=function*(){}().constructor;

class TaskScheduler {
  constructor() {
    this.tasks = []
    this.inx = 0
    this.current = 0
    this.nextId = 1
    this.debug = false
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
  tick() {
    const highest = this.getHighestPriority()
    if (highest === null) return
    const task = this.next(highest)
    if (!task) return
  
    if (this.debug) {
      console.log(`[TASK ${task.id}] resume`)
    }
    const result = task.gen.next()
    if (result.done) {
      if (this.debug) {
        console.log(`[TASK ${task.id}] completed`)
      }
      this.del()
    } else if (this.debug) {
      console.log(`[TASK ${task.id}] yield`)
    }
  }
}
globalThis.TS = new (class {
  constructor() {
    this.gen = new TaskScheduler()
  }
  add(task, priority = 0, ...params) {
    return this.gen.add(this.init(task, ...params), priority)
  }
  debug(e){
    this.gen.debug = e
    return e
  }
  run = function* (fn, ...params) {
    const gen = this.init(fn, ...params)
    let result = gen.next()
    while (!result.done) {
      yield;
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
  tick() { this.gen.tick() }
})()
globalThis.setTimeout = (fn, delay, ...params) => {
  const gen = (function* () {
    const start = Date.now()
    while (Date.now() - start < delay) yield;
    yield* TS.run(fn, ...params)
  })()
  return TS.add(gen)
}
globalThis.sleep=(ms)=>{
  return ((function*(){
    const start = Date.now()
    while (Date.now() - start < ms) yield;
  })())
}
globalThis.setInterval = (fn, delay, ...params) => {
  const gen = (function* () {
    while (true) {
      const start = Date.now()
      while (Date.now() - start < delay) {
        yield;
      }
      const inner = TS.init(fn, ...params)
      let r = inner.next()
      while (!r.done) {
        yield;
        r = inner.next()
      }
    }
  })()
  return TS.add(gen)
}
globalThis.queueMicrotask = (fn, ...params) => {
  const gen = (function* () {
    yield* TS.run(fn, ...params)
  })()
  return TS.add(gen, 1)
}
globalThis.nextTick = (fn, ...params) => {
  const gen = (function* () {
    yield* TS.run(fn, ...params)
  })()
  return TS.add(gen, 2)
}
globalThis.override = (fn, ...params) => {
  const gen = (function* () {
    yield* TS.run(fn, ...params)
  })()
  return TS.add(gen, Infinity)
}
globalThis.idle = (fn, ...params) => {
  const gen = (function* () {
    yield* TS.run(fn, ...params)
  })()
  return TS.add(gen, -Infinity)
}
globalThis.clearTimeout = (id) => {
  TS.del(id)
}
globalThis.clearInterval = (id) => {
  TS.del(id)
}
globalThis.await = (fn, ...params) => {
  return TS.run(fn, ...params)
}
globalThis.Promise = new class {
  constructor(executor) {
    if (executor) {
      return this.create(executor)
    }
  }
  PromiseImpl = class {
    constructor(executor) {
      this.state = "pending"
      this.value = undefined
      this.handlers = []
      const resolve = (value) => {
        if (this.state !== "pending") return
        this.state = "fulfilled"
        this.value = value
        queueMicrotask(() => this.runHandlers())
      }
      const reject = (reason) => {
        if (this.state !== "pending") return
        this.state = "rejected"
        this.value = reason
        queueMicrotask(() => this.runHandlers())
      }
      try {
        executor(resolve, reject)
      } catch (err) {
        reject(err)
      }
    }
    *[Symbol.iterator]() {
      while (this.state === "pending") yield
      if (this.state === "fulfilled") return this.value
      throw this.value
    }
    runHandlers() {
      const handlers = this.handlers
      this.handlers = []
      for (const h of handlers) {
        try {
          if (this.state === "fulfilled") {
            const result = h.onFulfilled
              ? h.onFulfilled(this.value)
              : this.value
            h.resolveNext(result)
          } else {
            const result = h.onRejected
              ? h.onRejected(this.value)
              : undefined
            h.resolveNext(result)
          }
        } catch (err) {
          h.rejectNext(err)
        }
      }
    }
    then(onFulfilled, onRejected) {
      return new globalThis.Promise.PromiseImpl((resolve, reject) => {
        this.handlers.push({
          onFulfilled,
          onRejected,
          resolveNext: resolve,
          rejectNext: reject
        })
        if (this.state !== "pending") {
          queueMicrotask(() => this.runHandlers())
        }
      })
    }
    catch(onRejected) {
      return this.then(undefined, onRejected)
    }
    finally(onFinally) {
      return this.then(
        value => {
          onFinally?.()
          return value
        },
        error => {
          onFinally?.()
          throw error
        }
      )
    }
  }
  create(executor) {
    return new this.PromiseImpl(executor)
  }
  resolve(value) {
    return this.create(resolve => resolve(value))
  }
  reject(reason) {
    return this.create((_, reject) => reject(reason))
  }
  many(filterFn, ...promises) {
    const helpers = {
      continue() {
        return { __done: false }
      },
      resolve(value) {
        return { __done: true, ok: true, value }
      },
      reject(value) {
        return { __done: true, ok: false, value }
      },
      finish(ok, value) {
        return { __done: true, ok, value }
      }
    }
    return this.create((resolve, reject) => {
      const results = []
      let index = 0
      const runNext = () => {
        if (index >= promises.length) {
          try {
            const finalValue = filterFn(results, true, helpers)
            if (finalValue && finalValue.__done) {
                finalValue.ok ? resolve(finalValue.value) : reject(finalValue.value)
                return
            }
            resolve(finalValue)
          } catch (err) {
            reject(err)
          }
          return
        }
        const current = promises[index]
        const startTime = Date.now()
        const asPromise = (current instanceof this.PromiseImpl)
          ? current
          : this.resolve(current)
        asPromise.then(
          value => {
            results.push({
              time: Date.now() - startTime,
              state: "fulfilled",
              value
            })
            try {
              const decision = filterFn(results, false, helpers)
              if (decision && decision.__done) {
                decision.ok ? resolve(decision.value) : reject(decision.value)
                return
              }
            } catch (err) {
              reject(err)
              return
            }
            index++
            runNext()
          },
          error => {
            results.push({
              time: Date.now() - startTime,
              state: "rejected",
              value: error
            })
            try {
              const decision = filterFn(results, false, helpers)
              if (decision && decision.__done) {
                decision.ok ? resolve(decision.value) : reject(decision.value)
                return
              }
            } catch (err) {
              reject(err)
              return
            }
            index++
            runNext()
          }
        )
      }
      runNext()
    })
  }
  all(...promises) {
    return this.many((results, finished, m) => {
      const last = results.at(-1)
      if (!finished && last.state === "rejected") {
        return m.reject(last.value)
      }
      if (finished) {
        return results.map(r => r.value)
      }
      return m.continue()
    }, ...promises)
  }
  any(...promises) {
    return this.many((results, finished, m) => {
      const last = results.at(-1)
      if (!finished && last.state === "fulfilled") {
        return m.resolve(last.value)
      }
      if (finished) {
        return m.reject("All promises rejected")
      }
      return m.continue()
    }, ...promises)
  }
  race(...promises) {
    return this.many((results, _finished, m) => {
      const last = results.at(-1)
      return m.finish(last.state === "fulfilled", last.value)
    }, ...promises)
  }
  allSettled(...promises) {
    return this.many((results, finished, m) => {
      if (finished) return results
      return m.continue()
    }, ...promises)
  }
  or(...promises) {
    return this.many((results, finished, m) => {
      const last = results.at(-1)
      if (last.state === "fulfilled") {
        return m.resolve(last.value)
      }
      if (finished) {
        return m.reject("All rejected")
      }
      return m.continue()
    }, ...promises)
  }
  xor(...promises) {
    return this.many((results, finished, m) => {
      const fulfilled = results.filter(r => r.state === "fulfilled")
      if (!finished) return m.continue()
      if (fulfilled.length === 1) {
        return m.resolve(fulfilled[0].value)
      }
      return m.reject("Not exactly one fulfilled")
    }, ...promises)
  }
  and(...promises) {
    return this.many((results, finished, m) => {
      const last = results.at(-1)
      if (last.state === "rejected") {
        return m.reject(last.value)
      }
      if (finished) {
        return m.resolve(results.map(r => r.value))
      }
      return m.continue()
    }, ...promises)
  }
  timeout(ms, value) {
    return this.create(resolve => {
      const gen = (function* () {
        yield* sleep(ms)
        resolve(value)
      })()
      TS.add(gen)
    })
  }
}
globalThis.Channel = new class {
  constructor() {
    this.inbox = {}
  }
  open(taskId) {
    if (taskId === undefined) {
      taskId = TS.id()
    }
    if (!this.inbox[taskId]) {
      this.inbox[taskId] = []
    }
  }
  close(taskId) {
    if (taskId === undefined) {
      taskId = TS.id()
    }
    delete this.inbox[taskId]
  }
  send(msg, target) {
    if (target === undefined) {
      const me = TS.id()
      if (this.inbox[me]) {
        this.inbox[me].push(msg)
      }
      return
    }
    if (target === null) {
      for (const id in this.inbox) {
        this.inbox[id].push(msg)
      }
      return
    }
    if (Array.isArray(target)) {
      for (const id of target) {
        if (this.inbox[id]) {
          this.inbox[id].push(msg)
        }
      }
      return
    }
    if (this.inbox[target]) {
      this.inbox[target].push(msg)
    }
  }
  recv(target, number = 1) {
    if (target === undefined) {
      target = TS.id()
    }
    const takeFromInbox = (id, n) => {
      const box = this.inbox[id]
      if (!box) return []
      if (n === 1) {
        return box.length > 0 ? [box.shift()] : []
      }
      if (n === Infinity) {
        const all = box.slice()
        box.length = 0
        return all
      }
      const out = []
      while (n-- > 0 && box.length > 0) {
        out.push(box.shift())
      }
      return out
    }
    const finish = (items) => {
      if (number === 1) {
        return items.length > 0 ? items[0] : undefined
      }
      return items
    }
    if (target === null) {
      if (number === 1) {
        for (const id in this.inbox) {
          const box = this.inbox[id]
          if (box && box.length > 0) {
            return box.shift()
          }
        }
        return undefined
      }
      const out = []
      for (const id in this.inbox) {
        const remaining = number === Infinity ? Infinity : number - out.length
        if (remaining <= 0) break
        out.push(...takeFromInbox(id, remaining))
        if (number !== Infinity && out.length >= number) break
      }
      return finish(out)
    }
    if (Array.isArray(target)) {
      if (number === 1) {
        for (const id of target) {
          const box = this.inbox[id]
          if (box && box.length > 0) {
            return box.shift()
          }
        }
        return undefined
      }
      const out = []
      for (const id of target) {
        const remaining = number === Infinity ? Infinity : number - out.length
        if (remaining <= 0) break
        out.push(...takeFromInbox(id, remaining))
        if (number !== Infinity && out.length >= number) break
      }
      return finish(out)
    }
    if (!this.inbox[target]) {
      throw new Error(`Task ${target} is not open for messages`)
    }
    const out = takeFromInbox(target, number)
    return finish(out)
  }
}
globalThis.ThreadManager = new class {
  exec(fn) {
    return (function* () {
      const me = TS.id()
      Channel.open(me)
      TS.add(function* () {
        const result = yield* TS.run(fn)
        Channel.send(result, me)
      })
      let msg
      while ((msg = Channel.recv(me)) === undefined) {
        yield
      }
      Channel.close(me)
      return msg
    })()
  }
}
function tick() {
  TS.tick()
}

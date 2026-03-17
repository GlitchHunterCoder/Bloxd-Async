PM.localAdd("CustomPromise", (() => {
  class PromiseImpl {
    constructor(executor) {
      this.state    = "pending"
      this.value    = undefined
      this.handlers = []

      const resolve = (value) => {
        if (this.state !== "pending") return
        this.state = "fulfilled"
        this.value = value
        TS.add(() => this.runHandlers())
      }
      const reject = (reason) => {
        if (this.state !== "pending") return
        this.state = "rejected"
        this.value = reason
        TS.add(() => this.runHandlers())
      }

      try { executor(resolve, reject) }
      catch (e) { reject(e) }
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
            h.resolveNext(h.onFulfilled ? h.onFulfilled(this.value) : this.value)
          } else if (h.onRejected) {
            h.resolveNext(h.onRejected(this.value))
          } else {
            h.rejectNext(this.value)
          }
        } catch (e) { h.rejectNext(e) }
      }
    }

    then(onFulfilled, onRejected) {
      return new PromiseImpl((resolve, reject) => {
        this.handlers.push({
          onFulfilled,
          onRejected,
          resolveNext: resolve,
          rejectNext:  reject
        })
        if (this.state !== "pending") TS.add(() => this.runHandlers())
      })
    }

    catch(onRejected)  { return this.then(undefined, onRejected) }
    finally(onFinally) {
      return this.then(
        v => { onFinally?.(); return v },
        e => { onFinally?.(); throw e }
      )
    }

    static resolve(v)         { return new PromiseImpl(r => r(v)) }
    static reject(e)          { return new PromiseImpl((_, r) => r(e)) }
    static all(...promises) {
      return new PromiseImpl((resolve, reject) => {
        const results = []
        let remaining = promises.length
        if (!remaining) { resolve(results); return }
        promises.forEach((p, i) => {
          p.then(v => { results[i] = v; if (--remaining === 0) resolve(results) }, reject)
        })
      })
    }
    static race(...promises) {
      return new PromiseImpl((resolve, reject) => {
        promises.forEach(p => p.then(resolve, reject))
      })
    }
  }

  return { Promise: PromiseImpl }
})())

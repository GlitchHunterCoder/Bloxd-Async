PM.add("CustomPromise", {
  Promise: class {
    constructor(executor) {
      if (executor) return this.create(executor)
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
          TS.add(() => this.runHandlers(), 1)
        }

        const reject = (reason) => {
          if (this.state !== "pending") return
          this.state = "rejected"
          this.value = reason
          TS.add(() => this.runHandlers(), 1)
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
              const r = h.onFulfilled ? h.onFulfilled(this.value) : this.value
              h.resolveNext(r)
            } else {
              const r = h.onRejected ? h.onRejected(this.value) : undefined
              h.resolveNext(r)
            }
          } catch (e) {
            h.rejectNext(e)
          }
        }
      }

      then(onFulfilled, onRejected) {
        return new PM.run("CustomPromise").Promise((resolve, reject) => {
          this.handlers.push({
            onFulfilled,
            onRejected,
            resolveNext: resolve,
            rejectNext: reject
          })
          if (this.state !== "pending") {
            TS.add(() => this.runHandlers(), 1)
          }
        })
      }

      catch(onRejected) {
        return this.then(undefined, onRejected)
      }

      finally(onFinally) {
        return this.then(
          v => { onFinally?.(); return v },
          e => { onFinally?.(); throw e }
        )
      }
    }

    create(executor) {
      return new this.PromiseImpl(executor)
    }

    resolve(v) {
      return this.create(r => r(v))
    }

    reject(e) {
      return this.create((_, r) => r(e))
    }
  }
})

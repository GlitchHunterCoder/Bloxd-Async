PM.add("AsyncTiming", {
  sleep(ms) {
    return (function* () {
      const start = Date.now()
      while (Date.now() - start < ms) yield
    })()
  },

  setTimeout(fn, delay, ...params) {
    const sleep = this.sleep
    const gen = (function* () {
      yield* sleep(delay)
      yield* TS.exe(fn, ...params)
    })()
    return TS.add(gen)
  },

  setInterval(fn, delay, ...params) {
    const gen = (function* () {
      while (true) {
        const start = Date.now()
        while (Date.now() - start < delay) yield
        const inner = TS.init(fn, ...params)
        let r = inner.next()
        while (!r.done) {
          yield
          r = inner.next()
        }
      }
    })()
    return TS.add(gen)
  },

  clearTimeout(id) {
    TS.del(id)
  },

  clearInterval(id) {
    TS.del(id)
  }
})

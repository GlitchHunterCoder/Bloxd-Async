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
    const sleep = this.sleep
    const gen = (function* () {
      while (true) {
        yield* sleep(delay)
        yield* TS.exe(fn, ...params)
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

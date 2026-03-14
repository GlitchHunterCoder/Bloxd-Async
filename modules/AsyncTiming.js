PM.localAdd("AsyncTiming", {
  sleep(ms) {
    return (function* () {
      const start = Date.now()
      while (Date.now() - start < ms) yield
    })()
  },
  setTimeout(fn, delay, ...params) {
    const sleep = PM.run("AsyncTiming").sleep
    return TS.add((function* () {
      yield* sleep(delay)
      yield* TS.run(fn, ...params)
    })())
  },
  setInterval(fn, delay, ...params) {
    const sleep = PM.run("AsyncTiming").sleep
    return TS.add((function* () {
      while (true) {
        yield* sleep(delay)
        yield* TS.run(fn, ...params)
      }
    })())
  },
  clearTimeout(id)  { TS.del(id) },
  clearInterval(id) { TS.del(id) }
})

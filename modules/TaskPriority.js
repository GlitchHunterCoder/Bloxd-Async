PM.add("TaskPriority", {
  queueMicrotask(fn, ...params) {
    const gen = (function* () {
      yield* TS.exe(fn, ...params)
    })()
    return TS.add(gen, 1)
  },

  nextTick(fn, ...params) {
    const gen = (function* () {
      yield* TS.exe(fn, ...params)
    })()
    return TS.add(gen, 2)
  },

  override(fn, ...params) {
    const gen = (function* () {
      yield* TS.exe(fn, ...params)
    })()
    return TS.add(gen, Infinity)
  },

  idle(fn, ...params) {
    const gen = (function* () {
      yield* TS.exe(fn, ...params)
    })()
    return TS.add(gen, -Infinity)
  },

  await(fn, ...params) {
    return TS.exe(fn, ...params)
  }
})

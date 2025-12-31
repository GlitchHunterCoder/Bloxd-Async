PM.add("ChannelThread", {
  state: {
    inbox: Object.create(null)
  },

  // ===== Messaging API =====

  open(taskId) {
    if (taskId === undefined) taskId = TS.id()
    if (!this.state.inbox[taskId]) {
      this.state.inbox[taskId] = []
    }
  },

  close(taskId) {
    if (taskId === undefined) taskId = TS.id()
    delete this.state.inbox[taskId]
  },

  send(msg, target) {
    const inbox = this.state.inbox

    if (target === undefined) {
      const me = TS.id()
      if (inbox[me]) inbox[me].push(msg)
      return
    }

    if (target === null) {
      for (const id in inbox) inbox[id].push(msg)
      return
    }

    if (Array.isArray(target)) {
      for (const id of target) {
        if (inbox[id]) inbox[id].push(msg)
      }
      return
    }

    if (inbox[target]) inbox[target].push(msg)
  },

  recv(target, number = 1) {
    if (target === undefined) target = TS.id()
    const inbox = this.state.inbox

    const take = (id, n) => {
      const box = inbox[id]
      if (!box) return []

      if (n === 1) return box.length ? [box.shift()] : []
      if (n === Infinity) {
        const all = box.slice()
        box.length = 0
        return all
      }

      const out = []
      while (n-- > 0 && box.length) out.push(box.shift())
      return out
    }

    const finish = (items) =>
      number === 1 ? items[0] : items

    if (target === null) {
      if (number === 1) {
        for (const id in inbox) {
          if (inbox[id]?.length) return inbox[id].shift()
        }
        return undefined
      }

      const out = []
      for (const id in inbox) {
        const rem = number === Infinity ? Infinity : number - out.length
        if (rem <= 0) break
        out.push(...take(id, rem))
      }
      return finish(out)
    }

    if (Array.isArray(target)) {
      if (number === 1) {
        for (const id of target) {
          if (inbox[id]?.length) return inbox[id].shift()
        }
        return undefined
      }

      const out = []
      for (const id of target) {
        const rem = number === Infinity ? Infinity : number - out.length
        if (rem <= 0) break
        out.push(...take(id, rem))
      }
      return finish(out)
    }

    if (!inbox[target]) {
      throw new Error(`Task ${target} is not open for messages`)
    }

    return finish(take(target, number))
  },

  // ===== Thread / Join API =====

  exec(fn) {
    const self = this
    return (function* () {
      const me = TS.id()
      self.open(me)

      TS.add(function* () {
        const result = yield* TS.run(fn)
        self.send(result, me)
      })

      let msg
      while ((msg = self.recv(me)) === undefined) yield

      self.close(me)
      return msg
    })()
  },

  override: {
    "TaskScheduler.del"(orig, index) {
      const task = this.tasks[index]
      if (task) {
        delete PM.run("ChannelThread")?.state?.inbox[task.id]
      }
      return orig(index)
    }
  }
})

PM.localAdd("PrioritySystem", (() => {
  let buckets    = Object.create(null)
  let priorities = []
  const getBucket = (p) => {
    if (!buckets[p]) {
      buckets[p] = { list: [], inx: 0 }
      let i = 0
      while (i < priorities.length && priorities[i] > p) i++
      priorities.splice(i, 0, p)
    }
    return buckets[p]
  }
  const dropBucket = (p) => {
    delete buckets[p]
    let i = priorities.indexOf(p)
    if (i !== -1) priorities.splice(i, 1)
  }
  return {
    priorities() { return priorities.slice() },
    bucket(p)    { return buckets[p]?.list.length ?? 0 },
    override: {
      "TS.add"(orig, task, priority = 0, ...params) {
        let b   = getBucket(priority)
        let id  = orig(task, ...params)
        let raw = TS._byId()[id]
        raw.priority    = priority
        raw.bucketIndex = b.list.length
        b.list.push(raw)
        return id
      },
      "TS._removeTask"(orig, task) {
        let p = task.priority ?? 0
        let b = buckets[p]
        if (b) {
          let last = b.list.pop()
          if (last !== task) {
            b.list[task.bucketIndex] = last
            last.bucketIndex = task.bucketIndex
          }
          if (!b.list.length) dropBucket(p)
        }
        orig(task)
      },
      "TS.tick"(orig) {
        if (!TS._tasks().length) return
        let b
        for (let p of priorities) {
          if (buckets[p]?.list.length) { b = buckets[p]; break }
        }
        if (!b) return
        if (b.inx >= b.list.length) b.inx = 0
        let task   = b.list[b.inx]
        let tasks  = TS._tasks()
        let cur    = tasks[TS._tasks().indexOf(task)] // ensure cursor lines up
        let ci     = tasks.findIndex((_, i) => i === /* cursor */ TS._tasks().indexOf(task))
        // Swap chosen task to cursor so orig tick picks it up
        let cursor = tasks.length ? 0 : 0  // orig will use its own cursor
        orig()
        if (b.list.length) b.inx = (task.bucketIndex + 1) % b.list.length
      }
    }
  }
})())

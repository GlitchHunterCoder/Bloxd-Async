// ─── priority package ─────────────────────────────────────────────────────────
// Wraps TS.add so tasks carry a priority.
// Higher number = runs first.
// Tasks are stored in per-priority buckets; each tick the highest-priority
// non-empty bucket is round-robined as normal.

PM.localAdd("priority", (() => {
  // Internal priority state, separate from the flat tasks array
  let buckets    = Object.create(null)  // priority → { list, inx }
  let priorities = []                   // sorted descending

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
    // Expose priority info for stats/debugging
    priorities() { return priorities.slice() },
    bucket(p)    { return buckets[p]?.list.length ?? 0 },

    override: {
      // TS.add(task, priority, ...params)  ← priority arg injected here
      "TS.add"(orig, task, priority = 0, ...params) {
        let gen  = TS.init(task, ...params)
        let b    = getBucket(priority)
        // Store priority on the raw task object after it enters the flat list
        let id   = orig(gen)           // adds to TS.gen.tasks, gets an id
        let raw  = TS.gen.tasksById[id]
        raw.priority = priority
        b.list.push(raw)
        raw.bucketIndex = b.list.length - 1
        return id
      },

      // On removal, clean up the bucket entry too
      "TaskScheduler._removeTask"(orig, task) {
        let p = task.priority ?? 0
        let b = buckets[p]
        if (b) {
          let list = b.list
          let last = list.pop()
          if (last !== task) {
            list[task.bucketIndex] = last
            last.bucketIndex = task.bucketIndex
          }
          if (!list.length) dropBucket(p)
        }
        orig(task)
      },

      // Replace tick's task selection with priority-aware round-robin
      "TS.tick"(orig) {
        let tasks = TS.gen.tasks
        if (!tasks.length) return

        // Find the highest-priority non-empty bucket
        let b
        for (let p of priorities) {
          if (buckets[p]?.list.length) { b = buckets[p]; break }
        }
        if (!b) return

        // Round-robin within that bucket
        if (b.inx >= b.list.length) b.inx = 0
        let task = b.list[b.inx]

        // Temporarily swap it to cursor position in flat list so orig tick runs it
        let gen        = TS.gen
        let cur        = gen.tasks[gen.cursor]
        let ti         = task.index, ci = gen.cursor

        // Swap in flat list
        gen.tasks[ci] = task;  task.index  = ci
        gen.tasks[ti] = cur;   cur.index   = ti

        orig()   // runs gen.cursor task, advances cursor

        // Advance this bucket's own pointer
        if (b.list.length) b.inx = (task.bucketIndex + 1) % b.list.length
      }
    }
  }
})())

//require PrioritySystem.js

PM.localAdd("TaskPriority", (() => {
  const priorityHelper = (p) => (fn, ...params) => TS.add(TS.run(fn, ...params), p)
  return {
    queueMicrotask: priorityHelper(1),
    nextTick:       priorityHelper(2),
    override:       priorityHelper(Infinity),
    idle:           priorityHelper(-Infinity),
    await(fn, ...params) { return TS.run(fn, ...params) }
  }
})())

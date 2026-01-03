globalThis.GeneratorFunction = function*(){}.constructor;
globalThis.Generator = function*(){}().constructor;

ErrMsg = (e) => {
  api.broadcastMessage(
    `${e.name}: ${e.message}\n${e.stack}`,
    { color: "red" }
  );
};

class TaskScheduler {
  constructor() {
    this.tasksByPriority = new Map(); //change to be object, update all instances to work with object
    this.priorities = [];
    this.currentTask = null;
    this.nextId = 1;
    this.debug = false;
    this.run = { keep: false, cont: false, iters: 0 };
    this.tasksById = new Map(); //change to be object, update all instances to work with object
  }

  add(gen, priority = 0) {
    let bucket = this.tasksByPriority.get(priority);
    if (!bucket) {
      bucket = { list: [], inx: 0 };
      this.tasksByPriority.set(priority, bucket); //change L19

      let i = 0;
      while (i < this.priorities.length && this.priorities[i] > priority) i++;
      this.priorities.splice(i, 0, priority);
    }

    const task = {
      id: this.nextId++,
      gen,
      priority,
      index: bucket.list.length
    };

    bucket.list[bucket.list.length]=task
    this.tasksById.set(task.id, task); //change L19
    return task.id;
  }

  delById(id) {
    const task = this.tasksById.get(id);
    if (task) this._removeTask(task);
  }

  _removeTask(task) {
    const bucket = this.tasksByPriority.get(task.priority); //change L19... stopping mentioning every time
    if (!bucket) return;
    const last = bucket.list[bucket.list.length-1]
    bucket.list.length-=1
    if (last !== task) {
      bucket.list[task.index] = last;
      last.index = task.index;
    }

    this.tasksById.delete(task.id);

    if (!bucket.list.length) {
      this.tasksByPriority.delete(task.priority);
      this.priorities.splice(this.priorities.indexOf(task.priority), 1);
    }

    if (this.currentTask === task) this.currentTask = null;
  }

  keep(v) { this.run.keep = v; }
  cont(v) { this.run.cont = v; }
  iters() { return this.run.iters; }

  tick() {
    const { tasksByPriority, priorities, run } = this;
    if (!priorities.length) {
      run.iters = 0;
      return;
    }

    let currentTask = this.currentTask;
    let bucket, task, nextBucketInx;
    let iters = 0;

    // PICK TASK
    if (run.keep && currentTask) {
      task = currentTask;
      bucket = tasksByPriority.get(task.priority);
      nextBucketInx = bucket ? (bucket.inx + 1) % bucket.list.length : 0;
    } else {
      const priority = priorities[0];
      bucket = tasksByPriority.get(priority);
      if (!bucket || !bucket.list.length) return;

      task = bucket.list[bucket.inx];
      nextBucketInx = (bucket.inx + 1) % bucket.list.length;

      // Reset flags only when switching tasks
      if (task !== currentTask) {
        run.keep = false;
        run.cont = false;
      }
    }

    if (this.debug) console.log(`[TASK ${task.id}] resume`);

    // RUN TASK ONCE
    try {
      if (task.gen && typeof task.gen.next === "function") {
        const r = task.gen.next();
        if (r.done) this._removeTask(task);
      } else if (typeof task.gen === "function") {
        task.gen(); // plain function
        this._removeTask(task);
      }
    } catch (e) {
      this._removeTask(task);
      throw e;
    }

    currentTask = task;
    iters++;

    // ADVANCE bucket index if task was not removed
    if (bucket && bucket.list.includes(task)) {
      if (!run.keep && !run.cont) {
        bucket.inx = nextBucketInx;
      } else if (!run.keep && run.cont) {
        // cont=true → move to next task in same tick next time
        bucket.inx = nextBucketInx;
      }
      // keep=true → do not advance bucket.inx, run same task again
    }

    run.iters = iters;
    this.currentTask = currentTask;
  }
}


// TS wrapper
globalThis.TS = new class {
  constructor() {
    this.gen = new TaskScheduler();
  }

  add(task, priority = 0, ...params) {
    return this.gen.add(this.init(task, ...params), priority);
  }

  debug(e) { return (this.gen.debug = e); }

  init(task, ...params) {
    if (task && typeof task.next === "function") return task;
    if (typeof task === "function") {
      return (function*(){ return task(...params); })(); // wrap without calling yet
    }
    return (function*(){ return task; })();
  }

  id() {
    if (!this.gen.currentTask)
      throw new Error("TS.id() called outside task");
    return this.gen.currentTask.id;
  }

  del(id) { this.gen.delById(id); }
  keep(v = true) { this.gen.keep(v); }
  cont(v = true) { this.gen.cont(v); }
  iters() { return this.gen.iters(); }

  stats() {
    return {
      priorities: [...this.gen.priorities],
      current: this.gen.currentTask?.id ?? null,
      nextId: this.gen.nextId
    };
  }

  tick() {
    this.gen.tick();
  }
}

// safe global tick
function tick() {
  try { TS.tick(); } catch(e) { ErrMsg(e); }
}

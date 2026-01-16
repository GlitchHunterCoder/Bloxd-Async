globalThis.GeneratorFunction = function* () {}.constructor;
globalThis.Generator = function* () {}().constructor;

const ErrMsg = (e) => {
  api.broadcastMessage(
    `${e.name}: ${e.message}\n${e.stack}`,
    { color: "red" }
  );
};

const Try = (fn, ctx = null, ...params) => {
  try { fn.apply(ctx, params) }
  catch (e) { ErrMsg(e); }
}

class TaskScheduler {
  constructor() {
    this.tasksByPriority = {}
    this.priorities = [];
    this.tasksById = {}
    this.currentTask = null;
    this.nextId = 1;
    this.flag = {
      ctrl: [0, 0], // [permanent, temporary]
      next: 0,
      iters: [0, 0] // [TicksRan, withinTickRuns]
    };
  }
  init(task, ...params) {
    if (task && typeof task.next === "function") return task;
    if (typeof task === "function") {
      try {
        if (task.constructor === globalThis.GeneratorFunction) {
          return task(...params);
        }
      } catch (e) {}
      return (function* () { return task(...params); })();
    }
    return (function* () { return task; })();
  }
  *run(fn, ...params) {
    const gen = this.init(fn, ...params)
    let result = gen.next()
    while (!result.done) {
      yield;
      result = gen.next()
    }
    return result.value
  }
  add(gen, priority = 0) {
    let bucket = this.tasksByPriority[priority];
    if (!bucket) {
      bucket = { list: [], inx: 0 };
      this.tasksByPriority[priority] = bucket;
      const pr = this.priorities;
      let i = 0;
      while (i < pr.length && pr[i] > priority) i++;
      pr.splice(i, 0, priority);
    }
    const task = {
      id: this.nextId++,
      gen,
      priority,
      index: bucket.list.length
    };
    bucket.list.push(task);
    this.tasksById[task.id] = task;
    return task.id;
  }

  delById(id) {
    const task = this.tasksById[id];
    if (task) this._removeTask(task);
  }

  _removeTask(task) {
    const bucket = this.tasksByPriority[task.priority];
    if (!bucket) return;
    const list = bucket.list;
    const last = list.pop();
    if (last !== task) {
      list[task.index] = last;
      last.index = task.index;
    }
    delete this.tasksById[task.id];
    if (!list.length) {
      delete this.tasksByPriority[task.priority];
      const p = this.priorities;
      const i = p.indexOf(task.priority);
      if (i !== -1) p.splice(i, 1);
    }
    if (this.currentTask === task) {
      this.currentTask = null;
    }
  }
  norm(perm){ this.flag.ctrl[+!perm] = 0; }
  keep(perm){ this.flag.ctrl[+!perm] = 1; }
  jump(perm){ this.flag.ctrl[+!perm] = 2; }
  cont(perm){ this.flag.ctrl[+!perm] = 3; }
  ctrl(sameTask, sameTick, permanent = false) {
    const bits =  (sameTick ? 2 : 0) | (sameTask ? 1 : 0)
    this.flag.ctrl[permanent ? 0 : 1] = bits;
  }

  iters()  { return this.flag.iters; }

  tick() {
    const prios = this.priorities;
    const run = this.flag;
    run.iters[1] = 0;
    if (!prios.length) { this.norm(true); return; }
    let sameTick = true;
    while (sameTick) {
        let task = this.currentTask;
        let bucket, list, idx;
        const ctl = run.next;
        run.next = 0;
        if ((ctl & 1) && task) {
            bucket = this.tasksByPriority[task.priority];
            if (!bucket || !bucket.list.length) {
                this.currentTask = null;
                return;
            }
            list = bucket.list;
            idx = task.index;
            task = list[idx];
            if (!task) {
                this.currentTask = null;
                return;
            }
        } else {
            task = null;
            for (let pi = 0; pi < prios.length; pi++) {
                bucket = this.tasksByPriority[prios[pi]];
                list = bucket.list;
                if (!list.length) continue;
                idx = bucket.inx;
                task = list[idx];
                if (!task) {
                    bucket.inx = 0;
                    task = list[0];
                    if (!task) continue;
                    idx = 0;
                }
                break;
            }
            if (!task) {
                this.currentTask = null;
                return;
            }
        }
        this.currentTask = task;
        let res;
        try {
            res = task.gen.next();
        } catch (e) {
            this._removeTask(task);
            this.currentTask = null;
            ErrMsg(e);
            continue;
        }
        const done = res.done;
        const ctrl = run.ctrl;
        const req = ctrl[1] !== 0 ? ctrl[1] : ctrl[0];
        ctrl[1] = 0;
        if (done) {
            this._removeTask(task);
            this.currentTask = null;
        }
        if (!done) {
            bucket.inx = (task.index + 1) % list.length;
            this.currentTask = null;
        }
        run.next = req;
        sameTick = (req & 2) && prios.length > 0;
        run.iters[1]++;
    }
    run.iters[0]++;
  }
}

globalThis.TS = new class {
  constructor() {
    this.gen = new TaskScheduler();
    this.delete = (id) => this.del(id);
  }
  init(task, ...params) {
    return this.gen.init(task, ...params)
  }
  add(task, priority = 0, ...params) {
    return this.gen.add(this.init(task, ...params), priority);
  }
  del(id) { this.gen.delById(id); }
  *run(fn, ...params){ yield* this.gen.run(fn, ...params) }

  norm(perm=false){ this.gen.norm(perm) }
  keep(perm=false){ this.gen.keep(perm); }
  cont(perm=false){ this.gen.cont(perm); }
  jump(perm=false){ this.gen.jump(perm); }
  ctrl(sameTask, sameTick, permanent = false) { this.gen.ctrl(sameTask, sameTick, permanent); }
  iters()  { return this.gen.iters(); }

  id() {
    return this.gen.currentTask
      ? this.gen.currentTask.id
      : null;
  }

  stats() {
    return {
      priorities: this.gen.priorities.slice(),
      current: this.id(),
      nextId: this.gen.nextId
    };
  }

  tick() { this.gen.tick(); }
};

class PackageManager {
  constructor() {
    this.packs = Object.create(null);
    this.overrideIndex = Object.create(null);
    this.flattenMap = Object.create(null);
    this.init();
  }

  add(name, data) {
    this.packs[name] = data;
    if (data && data.override) {
      const keys = Object.keys(data.override);
      data._ovKeys = keys;
      for (let i = 0; i < keys.length; i++) {
        this.overrideIndex[keys[i]] = data.override[keys[i]];
      }
    }
  }

  delete(name) {
    const pack = this.packs[name];
    if (!pack) return;
    const keys = pack._ovKeys;
    if (keys) {
      for (let i = 0; i < keys.length; i++) {
        delete this.overrideIndex[keys[i]];
      }
    }
    const flatKeys = this.flattenMap[name];
    if (flatKeys) {
      for (let k of flatKeys) delete globalThis[k];
      delete this.flattenMap[name];
    }
    delete this.packs[name];
  }

  run(name) {
    return this.packs[name];
  }

  getOverride(name) {
    return this.overrideIndex[name];
  }

  wrap(target, prefix) {
    const keys = Object.getOwnPropertyNames(target);
    const idx = this.overrideIndex;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const orig = target[k];
      if (typeof orig !== "function") continue;
      const name = prefix + "." + k;
      target[k] = function (...args) {
        const fn = idx[name];
        return fn ? fn(orig.bind(this), ...args)
                  : orig.apply(this, args);
      };
    }
  }

  init() {
    this.wrap(TS, "TS");
    this.wrap(TaskScheduler.prototype, "TaskScheduler");
  }

  globalExport(name, alias) {
    const pkg = this.run(name);
    if (!pkg) throw new Error(`Package "${name}" not found`);
    const flatten = alias === "globalThis";
    if (flatten && typeof pkg === "object" && pkg !== null) {
      const keys = Object.keys(pkg);
      keys.forEach(k => {
        if (k === "globalThis") throw new Error('Cannot export a property called "globalThis"');
        globalThis[k] = pkg[k];
      });
      this.flattenMap[name] = keys;
      return keys;
    } else {
      globalThis[alias || name] = pkg;
      return pkg;
    }
  }

  globalDelete(name) {
    if (name === "globalThis") throw new Error('Cannot delete globalThis itself');
    const flatKeys = this.flattenMap[name];
    if (flatKeys) {
      for (let k of flatKeys) delete globalThis[k];
      delete this.flattenMap[name];
      return;
    }
    delete globalThis[name];
  }
}

globalThis.PM = (() => {
  const mod = new PackageManager();
  return {
    mod,
    add: (n, d) => mod.add(n, d),
    run: (n) => mod.run(n),
    delete: (n) => mod.delete(n),
    override: (n) => mod.getOverride(n),
    localExport: (name, value) => mod.add(name, value),
    globalExport: (name, alias) => mod.globalExport(name, alias),
    localDelete: (name) => mod.delete(name),
    globalDelete: (name) => mod.globalDelete(name)
  };
})();

function tick() {
  Try(TS.tick, TS)
}

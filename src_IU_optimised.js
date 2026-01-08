globalThis.GeneratorFunction = function*(){}.constructor;
globalThis.Generator = function*(){}().constructor;
ErrMsg = (e) => {
  api.broadcastMessage(`${e.name}: ${e.message}\n${e.stack}`, { color: "red" });
};
class TaskScheduler {
  constructor() {
    this.tasksByPriority = Object.create(null); // { priority: { list: [task,...], inx: 0 } }
    this.priorities = []; // sorted desc
    this.currentTask = null;
    this.nextId = 1;
    this.debug = false;
    this.run = { keep: false, cont: false, iters: 0 };
    this.tasksById = Object.create(null);
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
    bucket.list[task.index] = task;
    this.tasksById[task.id] = task;
    return task.id;
  }
  delById(id) {
    const t = this.tasksById[id];
    if (t) this._removeTask(t);
  }
  _removeTask(task) {
    const bucket = this.tasksByPriority[task.priority];
    if (!bucket) return;
    const list = bucket.list;
    const last = list[list.length - 1];
    list.length = list.length - 1;
    if (last !== task) {
      list[task.index] = last;
      last.index = task.index;
    }
    delete this.tasksById[task.id];
    if (!list.length) {
      delete this.tasksByPriority[task.priority];
      const ix = this.priorities.indexOf(task.priority);
      if (ix >= 0) this.priorities.splice(ix, 1);
    }
    if (this.currentTask === task) this.currentTask = null;
  }
  keep(v) { this.run.keep = !!v; }
  cont(v) { this.run.cont = !!v; }
  iters() { return this.run.iters; }
  tick() {
    const prios = this.priorities;
    const run = this.run;
    if (!prios.length) { run.iters = 0; return; }
  
    let task = this.currentTask;
    let bucket, list, idx;
  
    if (run.keep && task) {
      bucket = this.tasksByPriority[task.priority];
      if (!bucket) { run.iters = 0; this.currentTask = null; return; }
      list = bucket.list;
      idx = task.index;
    } else {
      bucket = this.tasksByPriority[prios[0]];
      list = bucket.list;
      idx = bucket.inx;
      task = list[idx];
      run.keep = run.cont = false;
    }
  
    let done = 0;
    if (task.gen && typeof task.gen.next === "function") {
      if (task.gen.next().done) done = 1;
    } else {
      task.gen();
      done = 1;
    }
  
    const len = list.length;
    if (!done && !run.keep) bucket.inx = idx + 1 < len ? idx + 1 : 0;
  
    if (done) this._removeTask(task);
    this.currentTask = done ? null : task;
    run.iters = 1;
  }
}
globalThis.TS = new class {
  constructor() {
    this.gen = new TaskScheduler();
    this.delete = (id) => this.del(id);
  }
  add(task, priority = 0, ...params) {
    return this.gen.add(this.init(task, ...params), priority);
  }
  debug(e) { this.gen.debug = !!e; return this.gen.debug; }
  init(task, ...params) {
    if (task && typeof task.next === "function") return task;
    if (typeof task === "function") {
      return (function* () { return task(...params); })();
    }
    return (function* () { return task; })();
  }
  id() {
    return this.gen.currentTask ? this.gen.currentTask.id : null;
  }
  del(id) { this.gen.delById(id); }
  delete(id) { this.gen.delById(id); } // instance alias
  keep(v = true) { this.gen.keep(v); }
  cont(v = true) { this.gen.cont(v); }
  iters() { return this.gen.iters(); }
  stats() {
    return {
      priorities: this.gen.priorities.slice(),
      current: this.gen.currentTask ? this.gen.currentTask.id : null,
      nextId: this.gen.nextId
    };
  }
  tick() { this.gen.tick(); }
};
class PackageManager {
  constructor() {
    this.packs = Object.create(null);
    this.overrideIndex = Object.create(null); // name -> fn
    this.init();
  }
  _indexOverrides(pack) {
    if (!pack || !pack.override) return;
    const keys = Object.keys(pack.override);
    pack._ovKeys = keys;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      this.overrideIndex[k] = pack.override[k];
    }
  }
  _removeOverrideIndex(pack) {
    const keys = pack && pack._ovKeys;
    if (!keys) return;
    for (let i = 0; i < keys.length; i++) delete this.overrideIndex[keys[i]];
    pack._ovKeys = undefined;
  }
  add(name, data) {
    this.packs[name] = data;
    this._indexOverrides(data);
  }
  run(name) {
    return this.packs[name];
  }
  delete(name) {
    const p = this.packs[name];
    if (p) {
      this._removeOverrideIndex(p);
      delete this.packs[name];
    }
  }
  getOverride(name) {
    const fn = this.overrideIndex[name];
    return typeof fn === "function" ? fn : undefined;
  }
  wrap(target, prefix) {
    const keys = Object.getOwnPropertyNames(target);
    const idx = this.overrideIndex;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const original = target[key];
      if (typeof original === "function") {
        const overrideName = prefix + "." + key;
        target[key] = function () {
          const fn = idx[overrideName];
          if (typeof fn === "function") {
            return fn(original.bind(this), ...arguments);
          }
          return original.apply(this, arguments);
        };
      }
    }
  }
  init() {
    this.wrap(TS, "TS");
    this.wrap(TaskScheduler.prototype, "TaskScheduler");
  }
}
globalThis.PM = (function () {
  const mod = new PackageManager();
  return {
    mod,
    add(name, data) { mod.add(name, data); },
    run(name) { return mod.run(name); },
    delete(name) { mod.delete(name); },
    override(name) { return mod.getOverride(name); }
  };
})();
function exportToPM(name, value) {
  PM.add(name, value);
  return value;
}
function exportToGlobal(name, alias) {
  const pkg = PM.run(name);
  if (!pkg) throw new Error('Package "' + name + '" not found');
  globalThis[alias || name] = pkg;
  return pkg;
}
function deleteFromPM(name) { PM.delete(name); }
function deleteFromGlobal(name) { if (globalThis[name] !== undefined) globalThis[name] = undefined; }
//function tick() { try { TS.tick(); } catch (e) { ErrMsg(e); } }

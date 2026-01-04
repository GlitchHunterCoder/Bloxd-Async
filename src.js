globalThis.GeneratorFunction = function*(){}.constructor;
globalThis.Generator = function*(){}().constructor;

ErrMsg = (e) => {
  api.broadcastMessage(`${e.name}: ${e.message}\n${e.stack}`, { color:"red" });
};

class TaskScheduler {
  constructor() {
    this.tasksByPriority = Object.create(null);
    this.priorities = [];
    this.currentTask = null;
    this.nextId = 1;
    this.debug = false;
    this.run = { keep:false, cont:false, iters:0 };
    this.tasksById = Object.create(null);
  }

  add(gen, priority=0) {
    let bucket = this.tasksByPriority[priority];
    if (!bucket) {
      bucket = this.tasksByPriority[priority] = { list:[], inx:0 };
      let i = 0;
      while (i < this.priorities.length && this.priorities[i] > priority) i++;
      this.priorities.splice(i, 0, priority);
    }
    const task = { id:this.nextId++, gen, priority, index:bucket.list.length };
    bucket.list[task.index] = task;
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
    const last = list[list.length-1];
    list.length--;
    if (last !== task) { list[task.index] = last; last.index = task.index; }
    delete this.tasksById[task.id];
    if (!list.length) {
      delete this.tasksByPriority[task.priority];
      const ix = this.priorities.indexOf(task.priority);
      if (ix >= 0) this.priorities.splice(ix,1);
    }
    if (this.currentTask === task) this.currentTask = null;
  }

  keep(v){ this.run.keep = v; }
  cont(v){ this.run.cont = v; }
  iters(){ return this.run.iters; }

  tick() {
    const run = this.run || {};
    const priorities = this.priorities || [];
    const tasksByPriority = this.tasksByPriority || {};
    if (!priorities.length) { run.iters = 0; return; }

    let currentTask = this.currentTask;
    let task, bucket;
    let iters = 0;

    if (run.keep && currentTask) {
      task = currentTask;
      bucket = tasksByPriority[task.priority];
    } else {
      const p = priorities[0];
      bucket = tasksByPriority[p];
      if (!bucket || !bucket.list || !bucket.list.length) return;
      task = bucket.list[bucket.inx];
      if (task !== currentTask) { run.keep = 0; run.cont = 0; }
    }

    if (this.debug) console.log(`[TASK ${task?.id}] resume`);

    let done = 0;
    if (task) {
      if (task.gen && task.gen.next) {
        try { done = task.gen.next().done ? 1 : 0; }
        catch(e){ done=1; }
      } else {
        try { task.gen(); } catch(e){}
        done=1;
      }
    }

    if (bucket && bucket.list && !done && !run.keep) {
      bucket.inx++;
      if (bucket.inx >= bucket.list.length) bucket.inx = 0;
    }

    if (done && task) this._removeTask(task);

    this.currentTask = task;
    run.iters = iters+1;
  }
}

globalThis.TS = new class {
  constructor() { this.gen = new TaskScheduler(); }
  add(task, priority=0, ...params) { return this.gen.add(this.init(task,...params), priority); }
  debug(e){ this.gen.debug = e; }
  init(task,...params){
    if (task && task.next) return task;
    if (typeof task==="function") return (function*(){ return task(...params); })();
    return (function*(){ return task; })();
  }
  id(){ if(!this.gen.currentTask) throw new Error("TS.id() called outside task"); return this.gen.currentTask.id; }
  delete(id){ this.gen.delById(id); }
  keep(v=true){ this.gen.keep(v); }
  cont(v=true){ this.gen.cont(v); }
  iters(){ return this.gen.iters(); }
  stats(){ return { priorities:this.gen.priorities.slice(), current:this.gen.currentTask?.id||null, nextId:this.gen.nextId }; }
  tick(){ this.gen.tick(); }
};

class PackageManager {
  constructor() {
    this.packs = Object.create(null);
    this.init();
  }

  getOverride(name){
    const packs = this.packs;
    const packNames = Object.keys(packs);
    for (let i=0;i<packNames.length;i++){
      const pack = packs[packNames[i]];
      if (pack.override){
        const fn = pack.override[name];
        if (typeof fn === "function") return fn;
      }
    }
    return undefined;
  }

  wrap(target, prefix){
    const keys = Object.getOwnPropertyNames(target);
    for (let i=0;i<keys.length;i++){
      const key = keys[i];
      const original = target[key];
      if (typeof original==="function"){
        const name = prefix+"."+key;
        target[key] = function(...args){
          const fn = PM.mod.getOverride(name);
          return fn ? fn(original.bind(this),...args) : original.apply(this,args);
        };
      }
    }
  }

  init(){
    this.wrap(TS,"TS");
    this.wrap(TaskScheduler.prototype,"TaskScheduler");
  }
}

globalThis.PM = new class{
  constructor(){ this.mod = new PackageManager(); }
  add(name,data){ this.mod.packs[name]=data; }
  run(name){ return this.mod.packs[name]; }
  delete(name){ delete this.mod.packs[name]; }
  override(name){ return this.mod.getOverride(name); }
};

function exportToPM(name,value){ PM.add(name,value); return value; }
function exportToGlobal(name,alias){
  const pkg = PM.run(name);
  if(!pkg) throw new Error("Package \""+name+"\" not found");
  globalThis[alias||name]=pkg;
  return pkg;
}
function deleteFromPM(name){ PM.delete(name); }
function deleteFromGlobal(name){ if(globalThis[name]!==undefined) globalThis[name]=undefined; }

function tick(){ try{ TS.tick(); } catch(e){ ErrMsg(e); } }

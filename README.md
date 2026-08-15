# Introduction
> [!NOTE]
> For a guide on Async API we have [`Docs.md`](https://github.com/GlitchHunterCoder/Bloxd-Async/blob/main/Docs.md)
## Why it was made
this project exists becuase i saw how under userused and overlooked generator functions were
and i saw that i could bring async back into bloxd by using them in tandem with a task scheduler
its main feature was its unique ability to pause (`yield`), resume (`.next()`), and pass over control (`yield*`)
a feature which very little functions possessed in a non async enviroment,
so i saw this as the perfect window to make this,
- a month of thinking how this could be used,
- 2 weeks of planning
- and 5 days of making it
and this was created
---
## Main Premise: `Generators`

the core idea is that all tasks are a generator
which makes all our tasks able to be created, paused, continued, and deleted when needed
this allows us to make multi threaded code and allows many functions to run at once,
- what sets this apart from other implementations
most implementations of code, setTimeout or even 1 async helper (i see you @WBSTP)
run 1 function at a time, before moving onto the next, checking if they can run, before doing another one
my implementations is different in the fact that many functions can run at once,
and can interact with one another, deciding how and when they run

a `GeneratorFunction` **is** the async function, theres no wrapper or normalisation step anymore
calling it gives you back a `Generator`, which is the equivilant of a promise/paused thread,
you call it yourself, then hand the running `Generator` to the scheduler

### Short Explanation of Generators

there is a really helpful resource i used throughout development of this
[Mozilla Generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_generators)
but ill briefly summarise,
 - `function*`: this defines a "GeneratorFunction" which can then be initialised by calling the function `gen = f()`
 - `yield, yield*`:
   - `yield` pauses the function,
   gives the output of yield to the .next() call,
   and allows values to be passed in `.next(value)`
   - `yield*` gives the control to an iterable
 - `.next(), .throw(), .return()`: they iterate the Generator along, throws an error at that location, or force returns the generator with a value respectively

Example:

```js
function* inner() {
  yield 1
  yield 2
  yield 3
}

function* outer() {
  yield "before"
  yield* inner() //gives control to inner
  return "after"
}

const gen = outer() //turns GeneratorFunction -> Generator
console.log(gen.next()) //{value:"before",done:false}
console.log(gen.next()) //{value:1,done:false}
console.log(gen.next()) //{value:2,done:false}
console.log(gen.next()) //{value:3,done:false}
console.log(gen.next()) //{value:"after",done:true}
```

---

# User Notes

## All User Features
 - TS functions
   - `TS.add`: adds an already-called `Generator` to the scheduler, returns a stable numeric ID
   - `TS.del`: removes a task by ID; returns `false` if the id didn't exist or was `0`
   - `TS.tick`: advances the scheduler by one task (used in the tick callback)

---

## Example User Programs

### Running Tasks

```js
function* myTask() {
  console.log("Task start")
  yield
  console.log("Task resumed")
}

TS.add(myTask()) //note: myTask() is called here — TS.add takes a Generator, not a GeneratorFunction
```

---

### Cancelling a Task

```js
const id = TS.add((function* () {
  while (true) {
    console.log("looping")
    yield
  }
})())

//later, from anywhere:
TS.del(id)
```

---

# Developer Notes

## All Developer Features

 - `TaskScheduler`
   - the backend functionality of `TS`
   - a doubly linked list of tasks, indexed by id, with a sentinel root node at `0`
   - O(1) `add`, O(1) `del`, O(1) single-step `tick`
   - stable IDs: `nextId` only ever increments, so an id always refers to the
     same task until it's deleted

```js
TS = new class {
    constructor() {
        this.tasks = {
            0: { data: null, next: 0, prev: 0 }
        }
        this.cursor = 0
        this.nextId = 1
    }

    add(gen) {
        let id = this.nextId++
        let next = this.tasks[this.cursor].next
        this.tasks[id] = { data: gen, next: next, prev: this.cursor }
        this.tasks[this.cursor].next = id
        this.tasks[next].prev = id
        return id
    }

    del(id) {
        if (id === 0) return false
        let task = this.tasks[id]
        if (!task) return false
        this.tasks[task.prev].next = task.next
        this.tasks[task.next].prev = task.prev
        if (this.cursor === id) this.cursor = task.next
        delete this.tasks[id]
        return true
    }

    tick() {
        let id = this.tasks[this.cursor].next
        this.cursor = id
        if (id === 0) return
        let task = this.tasks[id]
        let result = task.data.next()
        if (result.done) this.del(id)
    }
}
```

> [!NOTE]
> Because the sentinel node (`0`) sits in the ring itself, one tick per full
> lap is spent passing over it and does nothing — a queue of *N* tasks takes
> *N + 1* ticks to complete a full round-robin cycle.

---

# Removed / Not Yet Ported

  `sleep`, `setInterval`/`clearTimeout`/`clearInterval`,
  `queueMicrotask`/`nextTick`/`override`/`idle`, custom `Promise`
- `Mutex` / `Actor` / `debounce` addon examples (depended on `TS.id` and/or
  the package layer)
- `ErrMsg` / `Try` — error-reporting helpers
- `Bloxd_env.js` local testing shim (unless it's staying independent of the above)

If/when any of these get rebuilt on top of the new core, they'll need
examples written against the current `add`/`del`/`tick` call pattern
(`TS.add(gen())`, not `TS.add(function* () {...})`).

## Planned Higher-Level Abstractions

`setTimeout`, `Channel`, and `await` are gone as built-in package features,
but conceptually none of them need to live inside the scheduler itself —
they're all just generators that `yield` until some condition is met, built
on top of plain `add`/`del`/`tick`. They may come back in this form:

- **`setTimeout`-style delay**: a generator that tracks elapsed ticks (or
  real time, if you have a clock source) and keeps `yield`ing until the
  delay has passed, then runs the callback.
- **`Channel`-style messaging**: a generator that `yield`s until a value
  shows up in some shared mailbox it polls, letting two tasks hand data to
  each other without either one blocking the whole scheduler.
- **`ThreadManager`-style sub-execution**: a generator that owns another
  `TS.add`ed task, drives it via ticks, and `yield`s until that sub-task is
  done before handing the result back — essentially `yield*` across task
  boundaries instead of within one generator.
- **`await`**: a thin generator wrapper around any of the above (or a
  promise) that just `yield`s on a loop until the underlying thing resolves.

None of this needs privileged access to the scheduler internals — `add`,
`del`, and `tick` are the only primitives, and everything above is just
ordinary user code written as a generator. That's the point of the
rewrite: these become library code on top of `TS`, not special cases baked
into it.

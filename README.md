# Introduction
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
   - `TS.add`: adds a new task to the TaskScheduler
   - `TS.tick`: used in tick callback
 - small addons
   - `sleep`: makes code sleep for N milliseconds before continuing operation
   - `setTimeout, setInterval`: sets a Timeout (code which runs after N milliseconds) or Interval (code which runs at every N millisecond interval)
   - `clearTimeout, clearInterval`: clears a Timeout or Interval
   - `queueMicrotask, nextTick, override, idle`: executes code at a different priority level, namely: 1, 2, Infinity, and -Infinity respectively
   - `await`: pauses the current code and runs function until its finished before giving result back to main function
 - Packages added (can be removed)
   - Custom `Promise`: sets code which will either resolve or reject at a future point in time
   - `Channel`: allows code to communicate with each other across task instances
   - `ThreadManager`: allows code to be ran in a seperate task before being handed back to the main task
 - Bloxd_env.js
   - used to simulate bloxd tick enviroment outside bloxd for testing

---

## Example User Programs / Addons
> [!NOTE]
> These examples are used after the respective packages are installed
### Running Tasks

```js
TS.add(function* () {
  console.log("Task start")
  yield 
  console.log("Task resumed")
})
//simple Generator function
```

---

### Cooperative Waiting (`sleep`)

```js
TS.add(function* () {
  console.log("Sleeping...")
  yield* sleep(1000) //sleeps for 1 second
  console.log("Awake!")
})
```

---

### `setTimeout`

```js
setTimeout(() => {
  console.log("Timeout fired after 5 seconds")
}, 5000) //fires after 5 seconds
```

---

### `setInterval`

```js
let count = 0
const id = setInterval(() => {
  console.log("Tick", count++)
  if (count === 3) clearInterval(id) //clears itself after being executed 3 times
}, 300)
```

---

### Microtasks (`queueMicrotask`)

```js
queueMicrotask(() => {
  console.log("Microtask executed before normal tasks")
}) //it has a higher Priority
```

---

### Priority Scheduling (`nextTick`, `override`, `idle`)

```js
idle(() => console.log("Idle task")) //executes last
setTimeout(() => console.log("Normal task"), 0) //executes third
nextTick(() => console.log("Next tick")) //executes 2nd
override(() => console.log("Override task")) //executes first
```

---

### Awaiting a Generator (`await`)

```js
TS.add(function* () {
  const result = yield* await(function* () {
    yield* sleep(200)
    return 42
  }) //it awaits a result before continuing main function
  console.log("Result:", result)
})
```

---

### Promises (Custom Implementation)

```js
new Promise((resolve) => {
  setTimeout(() => resolve("Hello"), 300)
}).then(value => {
  console.log(value)
}) //resolves a promise
```

---

### Promise Utilities

```js
Promise.all(
  Promise.resolve(1),
  Promise.resolve(2)
).then(console.log) //promise operator
```

---

### Channels (Message Passing)

```js
TS.add(function* () {
  Channel.open()
  while (true) {
    const msg = Channel.recv()
    if (msg !== undefined) {
      console.log("Received:", msg)
      break
    }
    yield
  } //waits until it receives a message, then console logs it
})

TS.add(function* () {
  yield* sleep(100)
  Channel.send("Hello from another task")
}) //sending messages to another task
```

---

### ThreadManager (Worker-style Execution)

```js
TS.add(function* () {
  const result = yield* ThreadManager.exec(function* () {
    yield* sleep(200)
    return "Work done"
  })
  console.log(result)
}) //executes in a different task, before giving result back to main function
```

---

# Developer Notes

## All Developer Features

 - `TaskScheduler`
   - the backend functionality of TS
 - Priority-based round-robin scheduling
   - allows you to run code which is executed before less important code
 - Generator normalization (`TS.init`)
   - automatically turns any given task into a generator
 - Manual tick loop
   - allows you to easily put into tick as is or modify when ticks get executed
 - Custom Promise iterator protocol
   - part of the package allows promises to be interacted like a generator
 - Message routing via task IDs
   - allows ease of sending and receiving by remembering
 - Channel lifecycle management
   - automatically kills dead tasks (can be disabled in TS.tick)

---

## Example Developer Programs / Addons

### Debugging the Scheduler

```js
TS.debug(true) //allows debug info to show

TS.add(function* () {
  yield;
  console.log(TS.stats()) //shows current runtime stat at that moment
  yield
})
```

---

### Writing a Custom Async Abstraction

```js
function fetchLike(value, delay) {
  return new Promise(resolve => {
    setTimeout(() => resolve(value), delay)
  })
}

TS.add(function* () {
  const data = yield* fetchLike("data", 300) //resolves a value after some time
  console.log(data)
})
```

---

### Writing a Coroutine-Based State Machine

```js
function* stateMachine() {
  console.log("State A")
  yield
  console.log("State B")
  yield
  console.log("State C")
}

TS.add(stateMachine) //an easy state machine implementation
```
### More Async Addons
Mutex
```js
function Mutex() {
  let locked = false
  let queue = []
  return {
    *lock() {
      if (!locked) {
        locked = true
        return
      }
      const me = TS.id()
      queue.push(me)
      while (queue[0] !== me) yield
      queue.shift()
      locked = true
    },
    unlock() {
      locked = false
    }
  }
}
```
Actor Model
```js
function Actor(handler) {
  const id = TS.add(function* () {
    Channel.open(id)
    while (true) {
      const msg = Channel.recv(id)
      if (msg) handler(msg)
      yield
    }
  })
  return {
    send(msg) { Channel.send(msg, id) }
  }
}
```
Debounce
```js
function debounce(fn, ms) {
  let timer = null
  return (...args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
```
---

# Outro

## Use Cases

This Can Be Used to Make code Run whenever you like, and give coders alot more control over how and when code runs
---

## Full Example: Everything Together

```js
TS.debug(true)

TS.add(function* main() {
  console.log("Main start")

  setTimeout(() => console.log("Timeout task"), 200)

  queueMicrotask(() => console.log("Microtask"))

  const value = yield* await(function* () {
    yield* sleep(100)
    return 99
  })

  console.log("Awaited value:", value)

  const result = yield* ThreadManager.exec(function* () {
    yield* sleep(15000)
    return "Worker result"
  })

  console.log(result)

  Channel.open()
  Channel.send("Ping", null)

  yield* sleep(500)
  console.log("Main end")
})
```

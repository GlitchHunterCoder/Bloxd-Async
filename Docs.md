# Bloxd-Async Documentation

---

> [!NOTE]
> **Front End Section**
> This is made for user code — use this for your scripts

---

## `GeneratorFunction` / `Generator`

Exposes the hidden global constructor objects for generator functions and generator instances.
Useful for `instanceof` checks and advanced generator manipulation.
```js
fn instanceof GeneratorFunction // true if fn is a generator function
gen instanceof Generator        // true if gen is a running generator
```

---

## `ErrMsg`

Broadcasts a formatted error to the game chat in red.
```js
/**
 * @param {Error} e - The error object to display
 * @returns {void}
 */
ErrMsg(e)
```

---

## `Try`

Runs a function and catches any thrown errors, passing them to `ErrMsg`.
```js
/**
 * @param {Function} fn       - Function to run
 * @param {any}      ctx      - `this` context (default: null)
 * @param {...any}   ...args  - Arguments to pass to fn
 * @returns {void}
 */
Try(fn, ctx, ...args)
```

---

## `TS` — Task Scheduler

The main interface for managing async tasks.

---

### `TS.init`

Normalises anything into a generator. Accepts a running generator, a generator
function, a regular function, or a plain value.
```js
/**
 * @param {GeneratorFunction|Function|Generator|any} task
 * @param {...any} ...params - Arguments passed to task if it is a function
 * @returns {Generator}
 */
TS.init(task, ...params)
```

---

### `TS.add`

Adds a task to the scheduler. Returns the task ID which can be used to cancel it.
```js
/**
 * @param {GeneratorFunction|Function|Generator|any} task
 * @param {...any} ...params    - Arguments passed to task if it is a function
 * @returns {number} taskId
 */
TS.add(task, priority, ...params)
```
```js
// Examples
TS.add(function* () {
  console.log("start")
  yield
  console.log("resumed")
})

TS.add(myGeneratorFn, arg1, arg2)
```

---

### `TS.del`

Cancels and removes a task by its ID.
```js
/**
 * @param {number} id - Task ID returned from TS.add
 * @returns {void}
 */
TS.del(id)
```

---

### `TS.run`

A generator that runs another function to completion, yielding each tick until done.
Use with `yield*` to await a result inside another task.
```js
/**
 * @param {GeneratorFunction|Function} fn
 * @param {...any} ...params
 * @yields until fn is complete
 * @returns {any} return value of fn
 */
*TS.run(fn, ...params)

// Example
TS.add(function* () {
  const result = yield* TS.run(function* () {
    yield
    return 42
  })
  console.log(result) // 42
})
```

---

### `TS.id`

Returns the ID of the currently executing task, or `null` if called outside a task.
```js
/**
 * @returns {number|null}
 */
TS.id()
```

---

### `TS.iters`

Returns the total number of ticks that have been processed.
```js
/**
 * @returns {number}
 */
TS.iters()
```

---

### `TS.stats`

Returns a snapshot of the scheduler's current state.
```js
/**
 * @returns {{ count: number, current: number|null, nextId: number }}
 */
TS.stats()
```

---

### `TS.tick`

Advances every task by one step. Call this inside the Bloxd tick callback.
Normally you use the `tick()` helper instead of calling this directly.
```js
TS.tick()
```

---

## `tick`

Convenience wrapper around `TS.tick` with error handling via `Try`.
This is what you register with the Bloxd tick callback.
```js
function tick() { Try(TS.tick, TS) }
```

---

## `PM` — Package Manager

Manages optional packages that extend the scheduler.
Packages can add new features, override internal behaviour, and expose globals.

---

### `PM.localAdd`

Registers a package locally without exposing anything to `globalThis`.
If the package has an `override` map, those overrides are activated immediately.
```js
/**
 * @param {string} name - Package name
 * @param {object} data - Package object (may include an `override` map)
 * @returns {void}
 */
PM.localAdd(name, data)
```

---

### `PM.globalAdd`

Exposes a registered package to `globalThis`.
If `alias` is `"globalThis"`, all keys of the package are flattened onto `globalThis` directly.
```js
/**
 * @param {string} name  - Package name (must already be localAdd'd)
 * @param {string} alias - Global name, or "globalThis" to flatten
 * @returns {string[]|any}
 */
PM.globalAdd(name, alias)
```

---

### `PM.add`

Shorthand for `localAdd` + `globalAdd` in one call.
```js
/**
 * @param {string} name  - Package name
 * @param {object} data  - Package object
 * @param {string} alias - Global alias (see globalAdd)
 * @returns {void}
 */
PM.add(name, data, alias)
```

---

### `PM.localDelete` / `PM.globalDelete` / `PM.delete`

Removes a package. `localDelete` removes it from the registry and deactivates
its overrides. `globalDelete` removes its globals. `PM.delete` does both.
```js
PM.localDelete(name)
PM.globalDelete(name)
PM.delete(name)       // both at once
```

---

### `PM.run`

Returns the raw package object by name.
```js
/**
 * @param {string} name
 * @returns {object}
 */
PM.run(name)
```

---

### `PM.override`

Returns the currently active override function for a given path, if any.
```js
/**
 * @param {string} path - e.g. "TS.tick", "TS._removeTask"
 * @returns {Function|undefined}
 */
PM.override(path)
```

---

### Writing a Package

A package is a plain object. If it has an `override` key, each entry intercepts
a named method. Override functions receive `orig` (the original function, pre-bound)
as their first argument, followed by the normal call arguments.
`this` inside an override refers to the package itself.
```js
PM.localAdd("myPackage", {
  myHelper() { ... },

  override: {
    "TS.tick"(orig) {
      console.log("before tick")
      orig()
      console.log("after tick")
    },
    "TS._removeTask"(orig, task) {
      console.log("removing", task.id)
      orig(task)
    }
  }
})
```

**Overrideable paths:**

| Path | When it fires |
|---|---|
| `TS.tick` | Every scheduler tick |
| `TS.add` | When a task is added |
| `TS.del` | When a task is deleted by ID |
| `TS._removeTask` | When a task is internally removed (completion or deletion) |
| `TS.run` | When `TS.run` is called |
| `TS.init` | When a task is normalised into a generator |
| `TS.id` | When the current task ID is requested |
| `TS.stats` | When stats are requested |

---

> [!WARNING]
> **Back End Section**
> Do not edit unless you know what you are doing

---

## `TaskScheduler`

The internal class that drives all scheduling. Not accessed directly in user code —
interact with it through `TS` and packages.

| Property | Type | Description |
|---|---|---|
| `tasks` | `Task[]` | Flat list of all active tasks |
| `tasksById` | `object` | Map of id → task |
| `currentTask` | `Task\|null` | The task currently being stepped |
| `cursor` | `number` | Round-robin position in the task list |
| `nextId` | `number` | Next task ID to assign |
| `tickCount` | `number` | Total ticks processed |

---

## `PackageManager`

The internal class behind `PM`. Handles package registration, override injection,
and global namespace management.

The `wrap(target, prefix)` method replaces every function on `target` with a
proxy that checks `overrideIndex` before calling the original. This is called
once on `TS` during initialisation.

> [!IMPORTANT]
> `TaskScheduler.prototype` is **not** wrapped. All overrideable internal methods
> are exposed through the `TS` shell (`TS._removeTask`, `TS._tasks`, `TS._byId`,
> `TS._currentTask`) so that overrides always operate on the correct live instance.

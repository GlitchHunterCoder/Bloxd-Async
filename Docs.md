# Documentation

---

## `GeneratorFunction` / `Generator`

Exposes the hidden global constructor objects for generator functions and generator instances.
Useful for `instanceof` checks and manual generator handling.

```js
fn instanceof GeneratorFunction // true if fn is a generator function
gen instanceof Generator        // true if gen is a running (called) generator
```

> [!NOTE]
> A `GeneratorFunction` is your async function. Calling it (`fn()`) is the
> equivalent of an `async` function returning a promise — it hands you back a
> paused `Generator` that can be driven forward with `.next()`. There is no
> normalization step anymore: **you must call the generator function yourself**
> before handing it to `TS.add`.

---

## `TS` — Task Scheduler

The scheduler is a doubly linked list keyed by task ID, with a sentinel root
node at id `0`. This gives O(1) `add`, O(1) `del`, and O(1) single-step `tick`.

```js
TS = new class {
    constructor() {
        this.tasks = {
            0: { data: null, next: 0, prev: 0 }
        }
        this.cursor = 0
        this.nextId = 1
    }
    add(gen) { /* ... */ }
    del(id)  { /* ... */ }
    tick()   { /* ... */ }
}
```

---

### `TS.add`

Adds an already-running `Generator` to the scheduler. Returns a stable numeric
ID which can be used later to cancel it with `TS.del`.

```js
/**
 * @param {Generator} gen - A called generator function (NOT the function itself)
 * @returns {number} taskId
 */
TS.add(gen)
```

```js
// Example
function* task() {
  console.log("start")
  yield
  console.log("resumed")
}

TS.add(task()) // note: task() is called here, add() takes the Generator
```

> [!WARNING]
> Passing an uncalled `GeneratorFunction` (e.g. `TS.add(task)` instead of
> `TS.add(task())`) will throw the first time the scheduler ticks it, since
> a `GeneratorFunction` has no `.next()` method. There is no longer any
> normalization to catch this for you.

---

### `TS.del`

Removes a task by ID.

```js
/**
 * @param {number} id - Task ID returned from TS.add
 * @returns {boolean} true if a task was removed, false if the id didn't exist or was 0
 */
TS.del(id)
```

- `TS.del(0)` always returns `false` — the root/sentinel node can't be deleted.
- Deleting the currently-running task is safe: the scheduler advances its
  cursor past the deleted task before continuing.

---

### `TS.tick`

Advances the scheduler by exactly one task. Call this inside the Bloxd tick
callback.

```js
TS.tick()
```

Each call steps to the next task in the ring and calls `.next()` on its
generator. If the generator reports `done`, the task is removed automatically.

> [!NOTE]
> Because the sentinel node (`0`) lives in the ring alongside real tasks, one
> tick per full lap is spent passing over it and does nothing. A queue of
> *N* tasks takes *N + 1* ticks to complete one full round-robin cycle.

---

## `tick`

Register this with the Bloxd tick callback.

```js
function tick() { TS.tick() }
```

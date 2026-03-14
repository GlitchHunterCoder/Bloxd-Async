// ─── ctrl package ────────────────────────────────────────────────────────────
// Adds flow control: norm/keep/jump/cont/ctrl
// norm = next task, next tick  (default)
// keep = same task, next tick
// jump = next task, same tick
// cont = same task, same tick

PM.localAdd("ctrl", (() => {
  let _perm = 0, _temp = 0

  const setCtrl = (bits, perm) => { if (perm) _perm = bits; else _temp = bits }
  const consume = () => { let b = _temp || _perm; _temp = 0; return b }

  return {
    norm(perm = false) { setCtrl(0, perm) },
    keep(perm = false) { setCtrl(1, perm) },
    jump(perm = false) { setCtrl(2, perm) },
    cont(perm = false) { setCtrl(3, perm) },
    ctrl(sameTask, sameTick, perm = false) {
      setCtrl((sameTick ? 2 : 0) | (sameTask ? 1 : 0), perm)
    },

    override: {
      // Wraps TS.tick to honour ctrl flags after each step
      "TS.tick"(orig) {
        if (!TS.gen.tasks.length) return

        let ctrl = 0
        do {
          // If sameTask bit set, re-select the current task by id
          if ((ctrl & 1) && TS.gen.currentTask) {
            let t = TS.gen.tasksById[TS.gen.currentTask.id]
            if (!t) return
            TS.gen.currentTask = t
            // Step it manually
            let res
            try { res = t.gen.next() }
            catch (e) { TS.gen._removeTask(t); ErrMsg(e); ctrl = consume(); continue }
            ctrl = consume()
            if (res.done) TS.gen._removeTask(t)
            TS.gen.currentTask = null
            TS.gen.tickCount++
          } else {
            orig()        // normal tick
            ctrl = consume()
          }
        } while ((ctrl & 2) && TS.gen.tasks.length)
      }
    }
  }
})())

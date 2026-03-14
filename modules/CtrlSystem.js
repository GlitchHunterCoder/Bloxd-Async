PM.localAdd("CtrlSystem", (() => {
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
      "TS.tick"(orig) {
        if (!TS._tasks().length) return
        let ctrl = 0
        do {
          if ((ctrl & 1) && TS._currentTask()) {
            let t = TS._byId()[TS._currentTask().id]
            if (!t) return
            let res
            try { res = t.gen.next() }
            catch (e) { TS._removeTask(t); ErrMsg(e); ctrl = consume(); continue }
            ctrl = consume()
            if (res.done) TS._removeTask(t)
          } else {
            orig()
            ctrl = consume()
          }
        } while ((ctrl & 2) && TS._tasks().length)
      }
    }
  }
})())

function sleep(ms) {
    return (function* () {
        const start = Date.now()
        while (Date.now() - start < ms) yield
    })()
}

function setTimeout(fn, delay, ...params) {
    return TS.add((function* () {
        yield* sleep(delay)
        yield* TS.run(fn, ...params)
    })())
}

function setInterval(fn, delay, ...params) {
    return TS.add((function* () {
        while (true) {
            yield* sleep(delay)
            yield* TS.run(fn, ...params)
        }
    })())
}

function clearTimeout(id)  { TS.del(id) }

function clearInterval(id) { TS.del(id) }

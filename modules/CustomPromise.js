class Promise {
    constructor(callback){
        this.state = void 0
        /**
         * void  = Suspended
         * true  = fufilled
         * false = rejected
         */
        this.value = void 0
        this.handlers = []

        let runHandler =()=> {
            this.handlers.map(h=>{
                try{
                    if(this.state){
                        h.res( h.onRes ? h.onRes(this.value) : this.value )
                    }else{
                        h.rej( h.onRej ? h.onRej(this.value) : this.value )
                    }


                } catch (e) {h.rej(e)}
            })
            this.handlers = []
        }

        let resolve = (value)=>{
            if(this.state !== void 0){return}
            this.state = true
            this.value = value
            TS.add(()=>runHandler())
        }

        let reject = (value)=>{
            if(this.state !== void 0){return}
            this.state = false
            this.value = value
            TS.add(()=>runHandler())
        }
        
        try { callback(resolve, reject) }
        catch (e) { reject(e) }

        this.then=(onRes, onRej=((x)=>{throw x}))=>{
            return new Promise((res, rej)=>{ 
                this.handlers.push({
                    res,
                    rej,
                    onRes,
                    onRej
                })
                if(this.state !== void 0){ TS.add(()=>runHandler()) }
            })
        }
    }
    catch(onRej){
        return this.then(void 0, onRej)
    }
    finally(onFin){
        return this.then(
            v=>{onFin?.(); return v},
            v=>{onFin?.(); throw v}
        )
    }

    static resolve(v){ return new Promise((r, _) => r(v)) }
    static reject(v) { return new Promise((_, r) => r(v)) }
    static all(...promises){
        return new Promise((res, rej)=>{
            let results = []
            let pending = promises.length
            if (!pending) { return res(results) }
            promises.map((p,i)=>{
                p.then(v=>{ results[i] = v; if(--pending === 0){ res(results) } }, rej)
            })
        })
    }
    static any(...promises){
        return new Promise((res, rej)=>{
            let results = []
            let pending = promises.length
            if (!pending) { return rej(results) }
            promises.map((p,i)=>{
                p.then(res, v=>{ results[i] = v; if(--pending === 0){ rej(results) } })
            })
        })
    }
    static allKeyed(obj){
        return new Promise((res, rej)=>{
            let results = {}
            let keys = Object.keys(obj)
            let pending = keys.length
            if (!pending) { return resolve(results) }
            keys.map((key)=>{
                obj[key].then(v=>{ results[key] = v; if(--pending === 0){ resolve(results) } }, rej)
            })
        })
    }
    static race(...promises){
        return new Promise((res, rej)=>{
            promises.map(p=>p.then(res, rej))
        })
    }
    static withResolvers(){
        let resolve, reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return {resolve, reject, promise}
    }

    *[Symbol.iterator]() {
        while (this.state === void 0) yield
        if (this.state){return this.value}
        else{throw this.value}
    }
}

let _T=function*(){
  i=0
  while(1){
    console.log(`=== TICK ${i} ===`)
    tick()
    i++
    yield;
  }
}()

let T=()=>{_T.next()}

setInterval(T,50)
